const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET /api/leaderboard/my-rank
// SR নিজের team-এ কত নম্বরে আছে দেখবে
// ============================================================

const getMyRank = async (req, res) => {
    try {
        const workerId = req.user.id;
        const now      = new Date();
        const month    = now.getMonth() + 1;
        const year     = now.getFullYear();

        // এই SR-এর team বের করো
        const teamRes = await query(
            `SELECT tm.team_id FROM team_members tm WHERE tm.worker_id = $1 LIMIT 1`,
            [workerId]
        );

        let leaderboard = [];

        if (teamRes.rows.length) {
            const teamId = teamRes.rows[0].team_id;

            // Team-এর সব member-এর এই মাসের sales
            const lbRes = await query(
                `SELECT
                    u.id,
                    u.name_bn                                       AS name,
                    u.profile_photo                                 AS avatar,
                    COALESCE(SUM(st.net_amount), 0)::NUMERIC        AS total_sales,
                    COUNT(DISTINCT st.id)                           AS total_invoices,
                    COUNT(DISTINCT v.id)                            AS total_visits,
                    COALESCE(u.monthly_target, 0)::NUMERIC          AS monthly_target
                 FROM team_members tm
                 JOIN users u  ON u.id = tm.worker_id
                 LEFT JOIN sales_transactions st
                    ON st.worker_id = u.id
                    AND EXTRACT(MONTH FROM st.created_at) = $2
                    AND EXTRACT(YEAR  FROM st.created_at) = $3
                    AND st.status = 'verified'
                 LEFT JOIN visits v
                    ON v.worker_id = u.id
                    AND EXTRACT(MONTH FROM v.created_at) = $2
                    AND EXTRACT(YEAR  FROM v.created_at) = $3
                 WHERE tm.team_id = $1
                 GROUP BY u.id, u.name_bn, u.profile_photo, u.monthly_target
                 ORDER BY total_sales DESC`,
                [teamId, month, year]
            );

            leaderboard = lbRes.rows.map((row, idx) => ({
                rank          : idx + 1,
                id            : row.id,
                name          : row.name,
                avatar        : row.avatar,
                total_sales   : parseFloat(row.total_sales),
                total_invoices: parseInt(row.total_invoices),
                total_visits  : parseInt(row.total_visits),
                monthly_target: parseFloat(row.monthly_target),
                is_me         : row.id === workerId,
            }));
        } else {
            // team নেই — শুধু নিজের data
            const selfRes = await query(
                `SELECT
                    u.id, u.name_bn AS name, u.profile_photo AS avatar,
                    COALESCE(u.monthly_target, 0)::NUMERIC AS monthly_target,
                    COALESCE(SUM(st.net_amount), 0)::NUMERIC AS total_sales,
                    COUNT(DISTINCT st.id) AS total_invoices,
                    COUNT(DISTINCT v.id) AS total_visits
                 FROM users u
                 LEFT JOIN sales_transactions st
                    ON st.worker_id = u.id
                    AND EXTRACT(MONTH FROM st.created_at) = $2
                    AND EXTRACT(YEAR  FROM st.created_at) = $3
                    AND st.status = 'verified'
                 LEFT JOIN visits v
                    ON v.worker_id = u.id
                    AND EXTRACT(MONTH FROM v.created_at) = $2
                    AND EXTRACT(YEAR  FROM v.created_at) = $3
                 WHERE u.id = $1
                 GROUP BY u.id, u.name_bn, u.profile_photo, u.monthly_target`,
                [workerId, month, year]
            );
            if (selfRes.rows.length) {
                const r = selfRes.rows[0];
                leaderboard = [{
                    rank: 1, id: r.id, name: r.name, avatar: r.avatar,
                    total_sales: parseFloat(r.total_sales),
                    total_invoices: parseInt(r.total_invoices),
                    total_visits: parseInt(r.total_visits),
                    monthly_target: parseFloat(r.monthly_target),
                    is_me: true,
                }];
            }
        }

        const me        = leaderboard.find(r => r.is_me) || {};
        const myTarget  = me.monthly_target || 0;
        const mySales   = me.total_sales    || 0;
        const salesPct  = myTarget > 0 ? Math.min(100, Math.round((mySales / myTarget) * 100)) : 0;

        return res.json({
            success: true,
            data: {
                my_rank        : me.rank           || 1,
                total_members  : leaderboard.length,
                my_sales       : mySales,
                my_target      : myTarget,
                my_sales_pct   : salesPct,
                my_visits      : me.total_visits   || 0,
                my_invoices    : me.total_invoices  || 0,
                month, year,
                leaderboard,
            }
        });

    } catch (err) {
        logger.error('[Leaderboard] getMyRank error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/leaderboard/team
// Manager তার পুরো team-এর leaderboard দেখবে
// ============================================================

const getTeamLeaderboard = async (req, res) => {
    try {
        const managerId = req.user.id;
        const now = new Date();
        const month = parseInt(req.query.month) || now.getMonth() + 1;
        const year  = parseInt(req.query.year)  || now.getFullYear();

        const teamRes = await query(
            `SELECT t.id FROM teams t WHERE t.manager_id = $1 LIMIT 1`,
            [managerId]
        );

        if (!teamRes.rows.length) {
            return res.json({ success: true, data: { leaderboard: [], month, year } });
        }

        const teamId = teamRes.rows[0].id;

        const lbRes = await query(
            `SELECT
                u.id, u.name_bn AS name, u.profile_photo AS avatar,
                u.phone,
                COALESCE(u.monthly_target, 0)::NUMERIC          AS monthly_target,
                COALESCE(SUM(st.net_amount), 0)::NUMERIC         AS total_sales,
                COUNT(DISTINCT st.id)                            AS total_invoices,
                COUNT(DISTINCT v.id)                             AS total_visits,
                COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.date END) AS present_days
             FROM team_members tm
             JOIN users u ON u.id = tm.worker_id
             LEFT JOIN sales_transactions st
                ON st.worker_id = u.id
                AND EXTRACT(MONTH FROM st.created_at) = $2
                AND EXTRACT(YEAR  FROM st.created_at) = $3
                AND st.status = 'verified'
             LEFT JOIN visits v
                ON v.worker_id = u.id
                AND EXTRACT(MONTH FROM v.created_at) = $2
                AND EXTRACT(YEAR  FROM v.created_at) = $3
             LEFT JOIN attendance a
                ON a.user_id = u.id
                AND EXTRACT(MONTH FROM a.date) = $2
                AND EXTRACT(YEAR  FROM a.date) = $3
             WHERE tm.team_id = $1
             GROUP BY u.id, u.name_bn, u.profile_photo, u.phone, u.monthly_target
             ORDER BY total_sales DESC`,
            [teamId, month, year]
        );

        const leaderboard = lbRes.rows.map((row, idx) => ({
            rank          : idx + 1,
            id            : row.id,
            name          : row.name,
            avatar        : row.avatar,
            phone         : row.phone,
            total_sales   : parseFloat(row.total_sales),
            total_invoices: parseInt(row.total_invoices),
            total_visits  : parseInt(row.total_visits),
            present_days  : parseInt(row.present_days),
            monthly_target: parseFloat(row.monthly_target),
            target_pct    : row.monthly_target > 0
                ? Math.min(100, Math.round(row.total_sales / row.monthly_target * 100))
                : 0,
        }));

        return res.json({ success: true, data: { leaderboard, month, year } });

    } catch (err) {
        logger.error('[Leaderboard] getTeamLeaderboard error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { getMyRank, getTeamLeaderboard };
