// ============================================================
// Customer AI Chat Controller  (updated)
// File: backend/src/controllers/customerAiChat.controller.js
//
// পরিবর্তন:
//   • response-এ tokens_remaining, refill_in_seconds যোগ হয়েছে
//     (aiTokenBucket middleware req.aiTokens set করে)
//   • বাকি সব আগের মতোই
// ============================================================

const { query }          = require('../config/db');
const { callAI }         = require('../services/ai.service');
const { writeAiChatLog, getDB } = require('../config/firebase');
const {
    CUSTOMER_TOOLS,
    executeTool,
    buildSystemPrompt,
    parseToolCall,
} = require('../services/customerAiChat.service');

// ── Save to Firebase (non-critical) ─────────────────────────
const saveToLog = async (customerId, message, reply) => {
    try {
        await writeAiChatLog(customerId, message, reply);
    } catch { /* non-critical */ }
};

// ── Constants ────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH  = 500;
const MAX_HISTORY_TURNS   = 6;
const MAX_HISTORY_CONTENT = 300;

const customerAiChat = async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        // ── Validation ────────────────────────────────────────
        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'বার্তা দিন।' });
        }

        if (message.trim().length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                success:     false,
                message:     `বার্তা সর্বোচ্চ ${MAX_MESSAGE_LENGTH} অক্ষরের মধ্যে রাখুন।`,
                error_code:  'MESSAGE_TOO_LONG',
                max_length:  MAX_MESSAGE_LENGTH,
                sent_length: message.trim().length,
            });
        }

        // ⚠️ SECURITY: customerId সবসময় JWT থেকে
        const customerId = req.portalUser.customer_id;

        const customerResult = await query(
            `SELECT shop_name, owner_name, customer_code FROM customers WHERE id = $1`,
            [customerId]
        );
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer তথ্য পাওয়া যায়নি।' });
        }

        const customerInfo = customerResult.rows[0];
        const systemPrompt = buildSystemPrompt(customerInfo);

        // ── Pass 1: Tool Detection ────────────────────────────
        const toolListText = CUSTOMER_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n');
        const intentPrompt =
            `User message: "${message.trim()}"\n\n` +
            `Available tools:\n${toolListText}\n\n` +
            `Respond ONLY in JSON (no other text):\n` +
            `{"tool": "<tool_name_or_none>", "reason": "<brief reason>"}\n` +
            `If no tool needed: {"tool": "none", "reason": "general"}`;

        let toolName = null;
        let toolData = null;

        try {
            const intentResponse = await callAI(intentPrompt, 'daily', null, []);
            toolName = parseToolCall(intentResponse);
        } catch (err) {
            console.warn('⚠️ Intent detection failed:', err.message);
        }

        // ── Tool Execution ────────────────────────────────────
        if (toolName) {
            try {
                toolData = await executeTool(toolName, customerId);
            } catch (err) {
                console.error(`❌ Tool "${toolName}" error:`, err.message);
                toolData = { error: 'তথ্য আনতে সমস্যা।' };
            }
        }

        // ── Pass 2: Final Answer ──────────────────────────────
        const chatHistory = history
            .slice(-MAX_HISTORY_TURNS)
            .map(h => ({
                role:    h.role,
                content: typeof h.content === 'string'
                    ? h.content.slice(0, MAX_HISTORY_CONTENT)
                    : '',
            }))
            .filter(h => h.content.length > 0);

        let finalPrompt = message.trim();
        if (toolData && !toolData.error) {
            finalPrompt =
                `User question: "${message.trim()}"\n\n` +
                `Data from database (${toolName}):\n${JSON.stringify(toolData, null, 2)}\n\n` +
                `Answer the user's question using this data. ` +
                `Format numbers nicely with ৳ symbol. ` +
                `Reply in the same language the user wrote in (Bangla or English).`;
        } else if (toolData?.error) {
            finalPrompt =
                `User question: "${message.trim()}"\n\n` +
                `Data unavailable. Tell user to contact their SR.`;
        }

        const reply = await callAI(finalPrompt, 'daily', systemPrompt, chatHistory);
        await saveToLog(customerId, message.trim(), reply);

        // ── Token Info (aiTokenBucket middleware থেকে) ───────
        // req.aiTokens না থাকলে (middleware bypass হলে) gracefully handle
        const tokenInfo = req.aiTokens || null;

        return res.status(200).json({
            success: true,
            data: {
                reply,
                tool_used: toolName || null,
                // কাস্টমারকে দেখাতে পারবেন: "আপনার ১৬টি টোকেন বাকি"
                ...(tokenInfo && {
                    tokens_remaining:  tokenInfo.remaining,
                    tokens_max:        tokenInfo.max,
                    cost_this_request: tokenInfo.cost,
                    refill_in_seconds: tokenInfo.refill_in_seconds,
                }),
            },
        });

    } catch (error) {
        console.error('❌ Customer AI Chat Error:', error.message);
        const status = error.response?.status;
        const msg = status === 429 ? 'একটু পরে আবার চেষ্টা করুন।' : 'AI চ্যাটে সমস্যা হয়েছে।';
        return res.status(500).json({ success: false, message: msg });
    }
};

// ── Chat History (অপরিবর্তিত) ────────────────────────────────
const getCustomerChatHistory = async (req, res) => {
    try {
        const customerId = req.portalUser.customer_id;
        const limit = Math.min(50, parseInt(req.query.limit) || 20);

        const snapshot = await getDB()
            .ref(`aiChatLogs/${customerId}`)
            .orderByKey()
            .limitToLast(limit)
            .once('value');

        const data = snapshot.val();

        if (!data) {
            return res.status(200).json({ success: true, data: [] });
        }

        const history = Object.entries(data)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([ts, entry]) => ({
                message: entry.message,
                reply:   entry.reply,
                time:    new Date(Number(ts)).toLocaleString('bn-BD', {
                    timeZone: 'Asia/Dhaka',
                    day:      '2-digit',
                    month:    'short',
                    hour:     '2-digit',
                    minute:   '2-digit',
                }),
            }));

        return res.status(200).json({ success: true, data: history });

    } catch (error) {
        console.error('❌ Chat History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { customerAiChat, getCustomerChatHistory };
