// ============================================================
// REPORT EXPORT HELPERS
// Excel ও PDF generation functions — report.controller.js থেকে আলাদা করা হয়েছে
// ============================================================

const PDFDocument = require('pdfkit');
const ExcelJS     = require('exceljs');

// ── SALES EXCEL ──────────────────────────────────────────────
const exportSalesExcel = async (res, data, from, to) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('বিক্রয় রিপোর্ট');

    ws.mergeCells('A1:I1');
    ws.getCell('A1').value     = `NovaTech BD — বিক্রয় রিপোর্ট (${from} থেকে ${to})`;
    ws.getCell('A1').font      = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([]);
    ws.addRow(['তারিখ', 'Invoice', 'SR নাম', 'দোকান', 'রুট', 'মোট', 'নেট', 'পেমেন্ট', 'OTP']);

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

// ── ATTENDANCE EXCEL ─────────────────────────────────────────
const exportAttendanceExcel = async (res, data, year, month) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('হাজিরা রিপোর্ট');

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value     = `NovaTech BD — হাজিরা রিপোর্ট (${year}-${String(month).padStart(2, '0')})`;
    ws.getCell('A1').font      = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([]);
    ws.addRow(['নাম', 'কোড', 'উপস্থিত', 'দেরি', 'অনুপস্থিত', 'ছুটি', 'মোট দেরি (মিনিট)', 'কর্তন (৳)']);
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

// ── COMMISSION EXCEL ─────────────────────────────────────────
const exportCommissionExcel = async (res, data, year, month) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('কমিশন রিপোর্ট');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value     = `NovaTech BD — কমিশন রিপোর্ট (${year}-${String(month).padStart(2, '0')})`;
    ws.getCell('A1').font      = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([]);
    ws.addRow(['নাম', 'কোড', 'মূল বেতন', 'মোট বিক্রয়', 'কমিশন', 'বোনাস', 'বকেয়া', 'নেট বেতন']);
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

// ── CREDIT EXCEL ─────────────────────────────────────────────
const exportCreditExcel = async (res, data, totalOutstanding) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ক্রেডিট রিপোর্ট');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value     = `NovaTech BD — ক্রেডিট রিকভারি রিপোর্ট`;
    ws.getCell('A1').font      = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.addRow([`মোট বকেয়া: ৳${totalOutstanding.toLocaleString('bn-BD')}`]);
    ws.addRow([]);
    ws.addRow(['দোকান', 'মালিক', 'রুট', 'ফোন', 'লিমিট (৳)', 'বকেয়া (৳)', 'ব্যবহার %']);
    ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    ws.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    data.forEach(row => {
        const excelRow = ws.addRow([
            row.shop_name, row.owner_name, row.route_name,
            row.sms_phone || row.whatsapp,
            row.credit_limit, row.current_credit, `${row.usage_pct}%`
        ]);
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

// ── SALES PDF ────────────────────────────────────────────────
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
       .text(`${from} থেকে ${to} | মোট: ${data.length} টি invoice`, { align: 'center' });
    doc.moveDown();

    const cols    = [60, 120, 100, 120, 80, 80, 80, 70];
    const headers = ['তারিখ', 'Invoice', 'SR নাম', 'দোকান', 'মোট', 'নেট', 'পেমেন্ট', 'OTP'];
    const tableW  = cols.reduce((a, b) => a + b, 0);
    const ROW_H   = 18;
    const MARGIN  = 40;
    const PAGE_H  = doc.page.height - MARGIN * 2;

    const drawTableHeader = (yPos) => {
        let x = MARGIN;
        headers.forEach((h, i) => {
            doc.rect(x, yPos, cols[i], ROW_H).fill('#1E3A8A');
            doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
               .text(h, x + 3, yPos + 4, { width: cols[i] - 6 });
            x += cols[i];
        });
        return yPos + ROW_H;
    };

    let currentY = drawTableHeader(doc.y);

    data.forEach((row, idx) => {
        if (currentY + ROW_H > PAGE_H) {
            doc.addPage();
            currentY = drawTableHeader(MARGIN);
        }

        const bg = idx % 2 === 0 ? '#F8FAFC' : 'white';
        doc.rect(MARGIN, currentY, tableW, ROW_H).fill(bg);

        const vals = [
            row.date, row.invoice_number, row.worker_name,
            row.shop_name, `৳${row.total_amount}`, `৳${row.net_amount}`,
            row.payment_method, row.otp_verified ? 'Yes' : 'No'
        ];

        let x = MARGIN;
        vals.forEach((v, i) => {
            doc.fillColor('#1a202c').fontSize(8).font('Helvetica')
               .text(String(v || ''), x + 3, currentY + 4, { width: cols[i] - 6, ellipsis: true });
            x += cols[i];
        });

        currentY += ROW_H;
    });

    doc.end();
};

module.exports = {
    exportSalesExcel,
    exportAttendanceExcel,
    exportCommissionExcel,
    exportCreditExcel,
    exportSalesPDF,
};
