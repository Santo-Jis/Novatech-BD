const { query }     = require('../config/db');
const PDFDocument   = require('pdfkit');
const ExcelJS       = require('exceljs');
const { generateEmployeePDF } = require('../services/employee.service');

// ============================================================
// DASHBOARD KPI
// GET /api/reports/kpi
// ============================================================

const getDashboardKPI = async (req, res) => {
    try {
        const { from, to } = req.query;
        const today        = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];

        const fromDate = from || firstOfMonth;
        const toDate   = to   || today;

        let workerFilter   = '';
        let workerParams   = [fromDate, toDate];
        let paramCount     = 2;

        if (req.teamFilter) {
            paramCount++;
            workerFilter = `AND u.manager_id = $${paramCount}`;
            workerParams.push(req.teamFilter);
        }

        // বিক্রয় KPI
        const salesKPI = await query(
            `SELECT
                COUNT(DISTINCT st.worker_id)           AS active_workers,
                COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                COALESCE(SUM(st.cash_received), 0)     AS cash_collected,
                COALESCE(SUM(st.credit_used), 0)       AS credit_given,
                COALESCE(SUM(st.replacement_value), 0) AS replacement_value,
                COUNT(st.id)                           AS total_invoices
             FROM sales_transactions st
             JOIN users u ON st.worker_id = u.id
             WHERE st.date BETWEEN $1 AND $2 ${workerFilter}`,
            workerParams
        );

        // হাজিরা KPI (আজকে)
        const attendanceKPI = await query(
            `SELECT
                COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS present,
                COUNT(CASE WHEN a.status = 'absent' THEN 1 END)            AS absent,
                COUNT(CASE WHEN a.status = 'late' THEN 1 END)              AS late,
                COUNT(u.id)                                                 AS total_workers
             FROM users u
             LEFT JOIN attendance a ON u.id = a.user_id AND a.date = $1
             WHERE u.role = 'worker' AND u.status = 'active' ${req.teamFilter ? `AND u.manager_id = $2` : ''}`,
            req.teamFilter ? [today, req.teamFilter] : [today]
        );

        // ক্রেডিট KPI
        const creditKPI = await query(
            `SELECT
                COUNT(c.id)                          AS total_customers,
                COALESCE(SUM(c.current_credit), 0)   AS total_outstanding,
                COUNT(CASE WHEN c.current_credit > 0 THEN 1 END) AS customers_with_dues
             FROM customers c
             JOIN routes r ON c.route_id = r.id
             WHERE c.is_active = true ${req.teamFilter ? `AND r.manager_id = $1` : ''}`,
            req.teamFilter ? [req.teamFilter] : []
        );

        // Pending Settlement
        const pendingSettlements = await query(
            `SELECT COUNT(*) AS count
             FROM daily_settlements ds
             JOIN users u ON ds.worker_id = u.id
             WHERE ds.status = 'pending'
               ${req.teamFilter ? `AND u.manager_id = $1` : ''}`,
            req.teamFilter ? [req.teamFilter] : []
        );

        return res.status(200).json({
            success: true,
            data: {
                period:      { from: fromDate, to: toDate },
                sales:       salesKPI.rows[0],
                attendance:  attendanceKPI.rows[0],
                credit:      creditKPI.rows[0],
                pending_settlements: parseInt(pendingSettlements.rows[0].count)
            }
        });

    } catch (error) {
        console.error('❌ KPI Error:', error.message);
        return res.status(500).json({ success: false, message: 'KPI আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SALES REPORT
// GET /api/reports/sales
// ============================================================

const getSalesReport = async (req, res) => {
    try {
        const {
            from, to, worker_id, route_id,
            group_by, // 'day', 'worker', 'product', 'route'
            export: exportType // 'pdf', 'excel'
        } = req.query;

        const today        = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];
        const fromDate = from || firstOfMonth;
        const toDate   = to   || today;

        let conditions = ['st.date BETWEEN $1 AND $2'];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        if (worker_id) {
            paramCount++;
            conditions.push(`st.worker_id = $${paramCount}`);
            params.push(worker_id);
        }

        if (route_id) {
            paramCount++;
            conditions.push(`c.route_id = $${paramCount}`);
            params.push(route_id);
        }

        const whereClause = conditions.join(' AND ');

        let data = [];

        if (group_by === 'worker') {
            const result = await query(
                `SELECT u.name_bn AS worker_name, u.employee_code,
                        COUNT(st.id)                           AS total_invoices,
                        COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                        COALESCE(SUM(st.cash_received), 0)     AS cash,
                        COALESCE(SUM(st.credit_used), 0)       AS credit,
                        COALESCE(SUM(st.replacement_value), 0) AS replacement
                 FROM sales_transactions st
                 JOIN users u     ON st.worker_id   = u.id
                 JOIN customers c ON st.customer_id = c.id
                 WHERE ${whereClause}
                 GROUP BY u.id, u.name_bn, u.employee_code
                 ORDER BY total_sales DESC`,
                params
            );
            data = result.rows;

        } else if (group_by === 'day') {
            const result = await query(
                `SELECT st.date,
                        COUNT(st.id)                           AS total_invoices,
                        COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                        COALESCE(SUM(st.cash_received), 0)     AS cash,
                        COALESCE(SUM(st.credit_used), 0)       AS credit
                 FROM sales_transactions st
                 JOIN users u     ON st.worker_id   = u.id
                 JOIN customers c ON st.customer_id = c.id
                 WHERE ${whereClause}
                 GROUP BY st.date
                 ORDER BY st.date DESC`,
                params
            );
            data = result.rows;

        } else {
            // Default: বিস্তারিত তালিকা
            const result = await query(
                `SELECT st.date, st.invoice_number,
                        u.name_bn AS worker_name,
                        c.shop_name,
                        r.name AS route_name,
                        st.total_amount, st.net_amount,
                        st.payment_method, st.otp_verified,
                        st.cash_received, st.credit_used,
                        st.replacement_value, st.created_at
                 FROM sales_transactions st
                 JOIN users u     ON st.worker_id   = u.id
                 JOIN customers c ON st.customer_id = c.id
                 LEFT JOIN routes r ON c.route_id = r.id
                 WHERE ${whereClause}
                 ORDER BY st.date DESC, st.created_at DESC`,
                params
            );
            data = result.rows;
        }

        // Export
        if (exportType === 'excel') {
            return await exportSalesExcel(res, data, fromDate, toDate);
        }

        if (exportType === 'pdf') {
            return await exportSalesPDF(res, data, fromDate, toDate);
        }

        // সারসংক্ষেপ
        const summary = await query(
            `SELECT
                COALESCE(SUM(st.total_amount), 0)      AS total_sales,
                COALESCE(SUM(st.cash_received), 0)     AS total_cash,
                COALESCE(SUM(st.credit_used), 0)       AS total_credit,
                COALESCE(SUM(st.replacement_value), 0) AS total_replacement,
                COUNT(st.id)                           AS total_invoices,
                COUNT(DISTINCT st.worker_id)           AS total_workers,
                COUNT(DISTINCT st.customer_id)         AS total_customers
             FROM sales_transactions st
             JOIN users u     ON st.worker_id   = u.id
             JOIN customers c ON st.customer_id = c.id
             WHERE ${whereClause}`,
            params
        );

        return res.status(200).json({
            success: true,
            data: {
                period:  { from: fromDate, to: toDate },
                summary: summary.rows[0],
                records: data
            }
        });

    } catch (error) {
        console.error('❌ Sales Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ATTENDANCE REPORT
// GET /api/reports/attendance
// ============================================================

const getAttendanceReport = async (req, res) => {
    try {
        const { month, year, worker_id, export: exportType } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        let conditions = [
            "u.role = 'worker'",
            "u.status = 'active'",
            'EXTRACT(YEAR FROM a.date) = $1',
            'EXTRACT(MONTH FROM a.date) = $2'
        ];
        let params     = [currentYear, currentMonth];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        if (worker_id) {
            paramCount++;
            conditions.push(`u.id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT u.name_bn, u.employee_code,
                    COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present,
                    COUNT(CASE WHEN a.status = 'late'    THEN 1 END) AS late,
                    COUNT(CASE WHEN a.status = 'absent'  THEN 1 END) AS absent,
                    COUNT(CASE WHEN a.status = 'leave'   THEN 1 END) AS leave,
                    COALESCE(SUM(a.late_minutes), 0)                  AS total_late_min,
                    COALESCE(SUM(a.salary_deduction), 0)              AS total_deduction
             FROM users u
             LEFT JOIN attendance a ON u.id = a.user_id
             WHERE ${conditions.join(' AND ')}
             GROUP BY u.id, u.name_bn, u.employee_code
             ORDER BY u.name_bn`,
            params
        );

        if (exportType === 'excel') {
            return await exportAttendanceExcel(res, result.rows, currentYear, currentMonth);
        }

        return res.status(200).json({
            success: true,
            data: {
                month: currentMonth,
                year:  currentYear,
                workers: result.rows
            }
        });

    } catch (error) {
        console.error('❌ Attendance Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// COMMISSION REPORT
// GET /api/reports/commission
// ============================================================

const getCommissionReport = async (req, res) => {
    try {
        const { month, year, worker_id, export: exportType } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        let conditions = [
            'EXTRACT(YEAR FROM c.date) = $1',
            'EXTRACT(MONTH FROM c.date) = $2',
            "u.role = 'worker'"
        ];
        let params     = [currentYear, currentMonth];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        if (worker_id) {
            paramCount++;
            conditions.push(`c.user_id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT u.name_bn, u.employee_code, u.basic_salary,
                    COALESCE(SUM(c.sales_amount), 0)  AS total_sales,
                    COALESCE(SUM(CASE WHEN c.type='daily' THEN c.commission_amount END), 0) AS commission,
                    COALESCE(SUM(CASE WHEN c.type='attendance_bonus' THEN c.commission_amount END), 0) AS bonus,
                    u.outstanding_dues
             FROM users u
             LEFT JOIN commission c ON u.id = c.user_id
                AND EXTRACT(YEAR FROM c.date) = $1
                AND EXTRACT(MONTH FROM c.date) = $2
             WHERE ${conditions.join(' AND ')}
             GROUP BY u.id, u.name_bn, u.employee_code, u.basic_salary, u.outstanding_dues
             ORDER BY total_sales DESC`,
            params
        );

        // নেট বেতন হিসাব
        const enriched = result.rows.map(row => ({
            ...row,
            net_payable: Math.max(0,
                parseFloat(row.basic_salary || 0) +
                parseFloat(row.commission   || 0) +
                parseFloat(row.bonus        || 0) -
                parseFloat(row.outstanding_dues || 0)
            )
        }));

        if (exportType === 'excel') {
            return await exportCommissionExcel(res, enriched, currentYear, currentMonth);
        }

        return res.status(200).json({
            success: true,
            data: {
                month:   currentMonth,
                year:    currentYear,
                workers: enriched
            }
        });

    } catch (error) {
        console.error('❌ Commission Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREDIT RECOVERY REPORT
// GET /api/reports/credit
// ============================================================

const getCreditReport = async (req, res) => {
    try {
        const { route_id, export: exportType } = req.query;

        let conditions = ['c.is_active = true', 'c.current_credit > 0'];
        let params     = [];
        let paramCount = 0;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(
                `c.route_id IN (SELECT id FROM routes WHERE manager_id = $${paramCount})`
            );
            params.push(req.teamFilter);
        }

        if (route_id) {
            paramCount++;
            conditions.push(`c.route_id = $${paramCount}`);
            params.push(route_id);
        }

        const result = await query(
            `SELECT c.customer_code, c.shop_name, c.owner_name,
                    c.whatsapp, c.sms_phone,
                    c.credit_limit, c.current_credit,
                    r.name AS route_name,
                    ROUND((c.current_credit / NULLIF(c.credit_limit, 0) * 100)::numeric, 1) AS usage_pct,
                    MAX(st.date) AS last_sale_date
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN sales_transactions st ON c.id = st.customer_id
             WHERE ${conditions.join(' AND ')}
             GROUP BY c.id, c.customer_code, c.shop_name, c.owner_name,
                      c.whatsapp, c.sms_phone, c.credit_limit, c.current_credit,
                      r.name
             ORDER BY c.current_credit DESC`,
            params
        );

        const totalOutstanding = result.rows.reduce(
            (sum, r) => sum + parseFloat(r.current_credit || 0), 0
        );

        if (exportType === 'excel') {
            return await exportCreditExcel(res, result.rows, totalOutstanding);
        }

        return res.status(200).json({
            success: true,
            data: {
                customers:        result.rows,
                total_outstanding: totalOutstanding
            }
        });

    } catch (error) {
        console.error('❌ Credit Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// EMPLOYEE PDF REPORT
// GET /api/reports/employee/:id/pdf
// ============================================================

const getEmployeePDFReport = async (req, res) => {
    try {
        const result = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
        }
        const { password_hash, ...employee } = result.rows[0];
        const pdfBuffer = await generateEmployeePDF(employee);

        res.setHeader('Content-Type',        'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="employee_${employee.employee_code || employee.id}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ Employee PDF Error:', error.message);
        return res.status(500).json({ success: false, message: 'PDF তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// EXCEL EXPORT HELPERS
// ============================================================

const exportSalesExcel = async (res, data, from, to) => {
    const wb  = new ExcelJS.Workbook();
    const ws  = wb.addWorksheet('বিক্রয় রিপোর্ট');

    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = `NovaTech BD — বিক্রয় রিপোর্ট (${from} থেকে ${to})`;
    ws.getCell('A1').font  = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([]);
    ws.addRow(['তারিখ', 'Invoice', 'SR নাম', 'দোকান', 'রুট', 'মোট', 'নেট', 'পেমেন্ট', 'OTP']);

    ws.getRow(3).font = { bold: true };
    ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    data.forEach(row => {
        ws.addRow([
            row.date, row.invoice_number, row.worker_name,
            row.shop_name, row.route_name,
            row.total_amount, row.net_amount,
            row.payment_method, row.otp_verified ? '✅' : '❌'
        ]);
    });

    ws.columns.forEach(col => { col.width = 18; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sales_${from}_${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
};

const exportAttendanceExcel = async (res, data, year, month) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('হাজিরা রিপোর্ট');

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `NovaTech BD — হাজিরা রিপোর্ট (${year}-${String(month).padStart(2,'0')})`;
    ws.getCell('A1').font  = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([]);
    ws.addRow(['নাম', 'কোড', 'উপস্থিত', 'দেরি', 'অনুপস্থিত', 'ছুটি', 'মোট দেরি (মিনিট)', 'কর্তন (৳)']);
    ws.getRow(3).font = { bold: true };
    ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    data.forEach(row => {
        ws.addRow([
            row.name_bn, row.employee_code,
            row.present, row.late, row.absent, row.leave,
            row.total_late_min, row.total_deduction
        ]);
    });

    ws.columns.forEach(col => { col.width = 16; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${year}_${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
};

const exportCommissionExcel = async (res, data, year, month) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('কমিশন রিপোর্ট');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `NovaTech BD — কমিশন রিপোর্ট (${year}-${String(month).padStart(2,'0')})`;
    ws.getCell('A1').font  = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([]);
    ws.addRow(['নাম', 'কোড', 'মূল বেতন', 'মোট বিক্রয়', 'কমিশন', 'বোনাস', 'বকেয়া', 'নেট বেতন']);
    ws.getRow(3).font = { bold: true };
    ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    data.forEach(row => {
        ws.addRow([
            row.name_bn, row.employee_code,
            row.basic_salary, row.total_sales,
            row.commission, row.bonus,
            row.outstanding_dues, row.net_payable
        ]);
    });

    ws.columns.forEach(col => { col.width = 16; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="commission_${year}_${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
};

const exportCreditExcel = async (res, data, totalOutstanding) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ক্রেডিট রিপোর্ট');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `NovaTech BD — ক্রেডিট রিকভারি রিপোর্ট`;
    ws.getCell('A1').font  = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([`মোট বকেয়া: ৳${totalOutstanding.toLocaleString('bn-BD')}`]);
    ws.addRow([]);
    ws.addRow(['দোকান', 'মালিক', 'রুট', 'ফোন', 'লিমিট (৳)', 'বকেয়া (৳)', 'ব্যবহার %']);
    ws.getRow(4).font = { bold: true };
    ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    ws.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    data.forEach(row => {
        const excelRow = ws.addRow([
            row.shop_name, row.owner_name, row.route_name,
            row.sms_phone || row.whatsapp,
            row.credit_limit, row.current_credit, `${row.usage_pct}%`
        ]);
        // বেশি বকেয়া হলে লাল রং
        if (parseFloat(row.usage_pct) >= 80) {
            excelRow.getCell(6).fill = {
                type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' }
            };
        }
    });

    ws.columns.forEach(col => { col.width = 18; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="credit_report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
};

const exportSalesPDF = async (res, data, from, to) => {
    const doc    = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="sales_${from}_${to}.pdf"`);
        res.send(buffer);
    });

    doc.fontSize(16).font('Helvetica-Bold')
       .text('NovaTech BD (Ltd.) — বিক্রয় রিপোর্ট', { align: 'center' });
    doc.fontSize(10).font('Helvetica')
       .text(`${from} থেকে ${to}`, { align: 'center' });
    doc.moveDown();

    // Table header
    const cols = [60, 120, 100, 120, 80, 80, 80, 70];
    const headers = ['তারিখ', 'Invoice', 'SR নাম', 'দোকান', 'মোট', 'নেট', 'পেমেন্ট', 'OTP'];

    let x = 40;
    headers.forEach((h, i) => {
        doc.rect(x, doc.y, cols[i], 20).fill('#1E3A8A');
        doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
           .text(h, x + 3, doc.y - 17, { width: cols[i] - 6 });
        x += cols[i];
    });
    doc.fillColor('black').moveDown(1.2);

    data.slice(0, 50).forEach((row, idx) => {
        x = 40;
        const y    = doc.y;
        const bg   = idx % 2 === 0 ? '#F8FAFC' : 'white';
        const rowH = 18;

        doc.rect(40, y, cols.reduce((a, b) => a + b, 0), rowH).fill(bg);

        const vals = [
            row.date, row.invoice_number, row.worker_name,
            row.shop_name, `৳${row.total_amount}`, `৳${row.net_amount}`,
            row.payment_method, row.otp_verified ? '✅' : '❌'
        ];
        vals.forEach((v, i) => {
            doc.fillColor('#1a202c').fontSize(8).font('Helvetica')
               .text(String(v || ''), x + 3, y + 4, { width: cols[i] - 6, ellipsis: true });
            x += cols[i];
        });
        doc.y = y + rowH;
    });

    doc.end();
};

// ============================================================
// P&L STATEMENT
// GET /api/reports/pl
// ============================================================
const getPLStatement = async (req, res) => {
    try {
        const today        = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];
        const from = req.query.from || firstOfMonth;
        const to   = req.query.to   || today;

        let teamCond  = '';
        let teamParam = [];
        if (req.teamFilter) {
            teamCond  = 'AND u.manager_id = $3';
            teamParam = [req.teamFilter];
        }

        const [salesData, expenseData, salaryData, commissionData] = await Promise.all([
            // মোট বিক্রয়
            query(
                `SELECT
                    COALESCE(SUM(total_amount), 0)          AS gross_sales,
                    COALESCE(SUM(cash_received), 0)         AS cash_collected,
                    COALESCE(SUM(credit_used), 0)           AS credit_given,
                    COALESCE(SUM(replacement_value), 0)     AS replacement_value,
                    COALESCE(SUM(vat_amount), 0)            AS total_vat,
                    COALESCE(SUM(discount_amount), 0)       AS total_discount,
                    COALESCE(SUM(net_amount), 0)            AS net_sales,
                    COUNT(st.id) AS invoice_count
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE st.date BETWEEN $1 AND $2 ${teamCond}`,
                [from, to, ...teamParam]
            ),
            // খরচ (Worker expenses)
            query(
                `SELECT
                    COALESCE(SUM(e.amount), 0)              AS total_expenses,
                    expense_type,
                    COALESCE(SUM(e.amount), 0)              AS amount
                 FROM expenses e
                 JOIN users u ON e.user_id = u.id
                 WHERE e.date BETWEEN $1 AND $2 ${teamCond}
                 GROUP BY expense_type`,
                [from, to, ...teamParam]
            ),
            // মাসিক বেতন
            query(
                `SELECT COALESCE(SUM(net_payable), 0) AS total_salary
                 FROM monthly_commissions mc
                 JOIN users u ON mc.worker_id = u.id
                 WHERE mc.year = EXTRACT(YEAR FROM $1::date)
                   AND mc.month = EXTRACT(MONTH FROM $1::date)
                   ${teamCond.replace('$3','$3')}`,
                [from, ...teamParam]
            ),
            // মোট কমিশন
            query(
                `SELECT COALESCE(SUM(commission_amount), 0) AS total_commission
                 FROM monthly_commissions mc
                 JOIN users u ON mc.worker_id = u.id
                 WHERE mc.year = EXTRACT(YEAR FROM $1::date)
                   AND mc.month = EXTRACT(MONTH FROM $1::date)
                   ${teamCond.replace('$3','$3')}`,
                [from, ...teamParam]
            )
        ]);

        const sales    = salesData.rows[0];
        const expRows  = expenseData.rows;
        const salary   = salaryData.rows[0];
        const comm     = commissionData.rows[0];

        const totalExpenses = expRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const grossProfit   = parseFloat(sales.net_sales) - totalExpenses - parseFloat(salary.total_salary || 0);

        return res.status(200).json({
            success: true,
            data: {
                period: { from, to },
                revenue: {
                    gross_sales:       parseFloat(sales.gross_sales),
                    discount:          parseFloat(sales.total_discount),
                    vat:               parseFloat(sales.total_vat),
                    net_sales:         parseFloat(sales.net_sales),
                    cash_collected:    parseFloat(sales.cash_collected),
                    credit_given:      parseFloat(sales.credit_given),
                    replacement_value: parseFloat(sales.replacement_value),
                    invoice_count:     parseInt(sales.invoice_count)
                },
                expenses: {
                    breakdown:      expRows,
                    total_expenses: totalExpenses
                },
                payroll: {
                    total_salary:     parseFloat(salary.total_salary || 0),
                    total_commission: parseFloat(comm.total_commission || 0)
                },
                summary: {
                    gross_profit: grossProfit,
                    net_profit:   grossProfit,
                    profit_margin: parseFloat(sales.net_sales) > 0
                        ? ((grossProfit / parseFloat(sales.net_sales)) * 100).toFixed(2)
                        : 0
                }
            }
        });
    } catch (error) {
        console.error('❌ P&L Error:', error.message);
        return res.status(500).json({ success: false, message: 'P&L আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// LEDGER (সম্পূর্ণ লেনদেন ইতিহাস)
// GET /api/reports/ledger
// ============================================================
const getLedger = async (req, res) => {
    try {
        const { from, to, type, worker_id, page = 1, limit = 50 } = req.query;
        const today = new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const toDate   = to   || today;
        const offset   = (page - 1) * limit;

        const entries = [];

        // বিক্রয় লেনদেন
        if (!type || type === 'sale') {
            const sales = await query(
                `SELECT
                    st.id, 'বিক্রয়' AS type, st.date,
                    st.total_amount AS amount,
                    st.payment_method,
                    c.shop_name AS party,
                    u.name_bn AS worker_name,
                    st.invoice_number AS ref
                 FROM sales_transactions st
                 JOIN customers c ON st.customer_id = c.id
                 JOIN users u ON st.worker_id = u.id
                 WHERE st.date BETWEEN $1 AND $2
                   ${worker_id ? 'AND st.worker_id = $3' : ''}
                 ORDER BY st.date DESC, st.created_at DESC`,
                worker_id ? [fromDate, toDate, worker_id] : [fromDate, toDate]
            );
            entries.push(...sales.rows.map(r => ({ ...r, entry_type: 'income' })));
        }

        // পেমেন্ট গ্রহণ
        if (!type || type === 'payment') {
            const payments = await query(
                `SELECT
                    cp.id, 'পেমেন্ট গ্রহণ' AS type, cp.payment_date AS date,
                    cp.amount,
                    'নগদ' AS payment_method,
                    c.shop_name AS party,
                    u.name_bn AS worker_name,
                    CONCAT('PAY-', cp.id) AS ref
                 FROM credit_payments cp
                 JOIN customers c ON cp.customer_id = c.id
                 JOIN users u ON cp.collected_by = u.id
                 WHERE cp.payment_date BETWEEN $1 AND $2
                   ${worker_id ? 'AND cp.collected_by = $3' : ''}`,
                worker_id ? [fromDate, toDate, worker_id] : [fromDate, toDate]
            );
            entries.push(...payments.rows.map(r => ({ ...r, entry_type: 'income' })));
        }

        // খরচ
        if (!type || type === 'expense') {
            const expenses = await query(
                `SELECT
                    e.id, CONCAT('খরচ — ', e.expense_type) AS type,
                    e.date, e.amount,
                    '-' AS payment_method,
                    e.note AS party,
                    u.name_bn AS worker_name,
                    CONCAT('EXP-', e.id) AS ref
                 FROM expenses e
                 JOIN users u ON e.user_id = u.id
                 WHERE e.date BETWEEN $1 AND $2
                   ${worker_id ? 'AND e.user_id = $3' : ''}`,
                worker_id ? [fromDate, toDate, worker_id] : [fromDate, toDate]
            );
            entries.push(...expenses.rows.map(r => ({ ...r, entry_type: 'expense' })));
        }

        // তারিখ অনুযায়ী সাজাও
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total        = entries.length;
        const paginated    = entries.slice(offset, offset + parseInt(limit));
        const totalIncome  = entries.filter(e => e.entry_type === 'income').reduce((s, e) => s + parseFloat(e.amount || 0), 0);
        const totalExpense = entries.filter(e => e.entry_type === 'expense').reduce((s, e) => s + parseFloat(e.amount || 0), 0);

        return res.status(200).json({
            success: true,
            data: {
                entries: paginated,
                summary: {
                    total_income:  totalIncome,
                    total_expense: totalExpense,
                    net:           totalIncome - totalExpense
                },
                total,
                page:       parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('❌ Ledger Error:', error.message);
        return res.status(500).json({ success: false, message: 'লেজার আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MONTHLY ARCHIVE
// GET /api/reports/archive?year=2026&month=3
// ============================================================
const getMonthlyArchive = async (req, res) => {
    try {
        const { year, month } = req.query;
        if (!year || !month) {
            return res.status(400).json({ success: false, message: 'year ও month দিন।' });
        }

        const [salesSum, attendanceSum, commissionSum, topWorkers] = await Promise.all([
            query(
                `SELECT
                    COUNT(st.id) AS invoice_count,
                    COALESCE(SUM(total_amount), 0)          AS gross_sales,
                    COALESCE(SUM(net_amount), 0)            AS net_sales,
                    COALESCE(SUM(cash_received), 0)         AS cash_collected,
                    COALESCE(SUM(credit_used), 0)           AS credit_given,
                    COALESCE(SUM(replacement_value), 0)     AS replacement,
                    COALESCE(SUM(vat_amount), 0)            AS total_vat
                 FROM sales_transactions
                 WHERE EXTRACT(YEAR FROM date) = $1
                   AND EXTRACT(MONTH FROM date) = $2`,
                [year, month]
            ),
            query(
                `SELECT
                    COUNT(CASE WHEN status = 'present' THEN 1 END) AS present,
                    COUNT(CASE WHEN status = 'late' THEN 1 END)    AS late,
                    COUNT(CASE WHEN status = 'absent' THEN 1 END)  AS absent,
                    COALESCE(SUM(salary_deduction), 0)             AS total_deduction
                 FROM attendance
                 WHERE EXTRACT(YEAR FROM date) = $1
                   AND EXTRACT(MONTH FROM date) = $2`,
                [year, month]
            ),
            query(
                `SELECT
                    COALESCE(SUM(commission_amount), 0) AS total_commission,
                    COALESCE(SUM(net_payable), 0)       AS total_payable
                 FROM monthly_commissions
                 WHERE year = $1 AND month = $2`,
                [year, month]
            ),
            query(
                `SELECT u.name_bn, u.employee_code,
                    COALESCE(SUM(st.total_amount), 0) AS total_sales,
                    COUNT(st.id) AS invoice_count
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE EXTRACT(YEAR FROM st.date) = $1
                   AND EXTRACT(MONTH FROM st.date) = $2
                 GROUP BY u.id, u.name_bn, u.employee_code
                 ORDER BY total_sales DESC
                 LIMIT 5`,
                [year, month]
            )
        ]);

        return res.status(200).json({
            success: true,
            data: {
                period:     { year: parseInt(year), month: parseInt(month) },
                sales:      salesSum.rows[0],
                attendance: attendanceSum.rows[0],
                payroll:    commissionSum.rows[0],
                top_workers: topWorkers.rows
            }
        });
    } catch (error) {
        console.error('❌ Archive Error:', error.message);
        return res.status(500).json({ success: false, message: 'Archive আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TOP PRODUCTS
// GET /api/reports/top-products
// ============================================================
const getTopProducts = async (req, res) => {
    try {
        const { from, to, limit = 10 } = req.query;
        const today = new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const toDate   = to   || today;

        const result = await query(
            `SELECT
                p.name AS product_name,
                p.sku,
                SUM(si.quantity)               AS total_qty,
                SUM(si.subtotal)               AS total_revenue,
                COUNT(DISTINCT si.sale_id)     AS order_count,
                AVG(si.unit_price)             AS avg_price
             FROM sale_items si
             JOIN products p ON si.product_id = p.id
             JOIN sales_transactions st ON si.sale_id = st.id
             WHERE st.date BETWEEN $1 AND $2
             GROUP BY p.id, p.name, p.sku
             ORDER BY total_revenue DESC
             LIMIT $3`,
            [fromDate, toDate, limit]
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Top Products Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TOP SHOPS
// GET /api/reports/top-shops
// ============================================================
const getTopShops = async (req, res) => {
    try {
        const { from, to, limit = 10 } = req.query;
        const today = new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const toDate   = to   || today;

        const result = await query(
            `SELECT
                c.shop_name,
                c.owner_name,
                r.name AS route_name,
                c.current_credit,
                COUNT(st.id)                       AS order_count,
                COALESCE(SUM(st.total_amount), 0)  AS total_purchase
             FROM customers c
             LEFT JOIN sales_transactions st ON st.customer_id = c.id
               AND st.date BETWEEN $1 AND $2
             LEFT JOIN routes r ON c.route_id = r.id
             WHERE c.is_active = true
             GROUP BY c.id, c.shop_name, c.owner_name, r.name, c.current_credit
             ORDER BY total_purchase DESC
             LIMIT $3`,
            [fromDate, toDate, limit]
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Top Shops Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};



module.exports = {
    getDashboardKPI,
    getSalesReport,
    getAttendanceReport,
    getCommissionReport,
    getCreditReport,
    getEmployeePDFReport,
    getPLStatement,
    getLedger,
    getMonthlyArchive,
    getTopProducts,
    getTopShops
};
