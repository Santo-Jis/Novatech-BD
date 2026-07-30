/**
 * csv.utils.js
 * ─────────────────────────────────────────────────────────────
 * CSV পড়া ও লেখার জন্য একটাই জায়গা।
 * RFC 4180-ঘেঁষা simple parser — quoted field, escaped quote (""),
 * CRLF/LF দুটোই সামলায়। কোনো npm dependency লাগে না।
 * ─────────────────────────────────────────────────────────────
 */

/**
 * CSV টেক্সট (বা Buffer) কে সারি-ভিত্তিক 2D array-তে ভাঙে।
 * প্রতিটা সারি নিজেই একটা array of string field।
 *
 * @param {Buffer|string} input
 * @returns {string[][]}
 */
const parseCSV = (input) => {
    let text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);

    // UTF-8 BOM বাদ দাও (Excel প্রায়ই BOM সহ CSV সেভ করে)
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { // escaped quote ("")
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\r') {
            // \r\n এর \r — পরের \n এ সামলানো হবে, এখানে কিছু করার নেই
        } else if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }

    // শেষ সারি (trailing newline না থাকলে)
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    // পুরোপুরি খালি সারি (ফাইলের শেষে blank line) বাদ দাও
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
};

/**
 * Header normalize করে: trim, lowercase, স্পেস/হাইফেন → underscore।
 * "Cost Price" এবং "cost-price" দুটোই "cost_price" হয়ে যাবে।
 *
 * @param {string} h
 * @returns {string}
 */
const normalizeHeader = (h) =>
    String(h || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');

/**
 * পার্স করা 2D array কে header-key ভিত্তিক object array-তে রূপান্তর করে।
 * প্রথম সারিকে header ধরা হয়।
 *
 * @param {string[][]} rows
 * @returns {{ headers: string[], records: Array<{__row:number, [key:string]:string}> }}
 */
const rowsToObjects = (rows) => {
    if (rows.length === 0) return { headers: [], records: [] };

    const headers = rows[0].map(normalizeHeader);
    const records = [];

    for (let i = 1; i < rows.length; i++) {
        const raw = rows[i];
        // পুরো সারি খালি হলে বাদ দাও
        if (raw.every(v => String(v || '').trim() === '')) continue;

        const obj = { __row: i + 1 }; // স্প্রেডশিটে যেভাবে দেখা যায় (header = ১, প্রথম ডেটা = ২)
        headers.forEach((h, idx) => {
            obj[h] = raw[idx] !== undefined ? String(raw[idx]).trim() : '';
        });
        records.push(obj);
    }

    return { headers, records };
};

/**
 * একটা মান CSV-এর জন্য নিরাপদভাবে quote করে (দরকার হলে)।
 * @param {*} value
 * @returns {string}
 */
const toCSVField = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * headers + সারি (array of array) থেকে CSV স্ট্রিং বানায়।
 * সামনে BOM যোগ করা হয় — Excel-এ Bengali ঠিকভাবে দেখানোর জন্য।
 *
 * @param {string[]} headers
 * @param {Array<Array<*>>} rows
 * @returns {string}
 */
const buildCSV = (headers, rows) => {
    const lines = [headers.map(toCSVField).join(',')];
    rows.forEach(r => lines.push(r.map(toCSVField).join(',')));
    return '\uFEFF' + lines.join('\r\n');
};

module.exports = { parseCSV, rowsToObjects, normalizeHeader, toCSVField, buildCSV };
