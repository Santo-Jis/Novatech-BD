const axios         = require('axios');
const PDFDocument   = require('pdfkit');
const bcrypt        = require('bcryptjs');
const { query }     = require('../config/db');
const { sendLoginCredentials } = require('./sms.service');

// ============================================================
// Employee Code জেনারেশন
// DB Function ব্যবহার করে: NTB-W-26-48293-15
// ============================================================

const generateEmployeeCode = async (role, joinDate) => {
    const result = await query(
        'SELECT generate_employee_code($1::user_role, $2::date) AS code',
        [role, joinDate]
    );
    return result.rows[0].code;
};

// ============================================================
// Customer Code জেনারেশন
// ============================================================

const generateCustomerCode = async (date) => {
    const result = await query(
        'SELECT generate_customer_code($1::date) AS code',
        [date]
    );
    return result.rows[0].code;
};

// ============================================================
// Cloudinary তে ছবি আপলোড
// ============================================================

const uploadToCloudinary = async (fileBuffer, folder, filename, mimetype = 'image/jpeg') => {
    try {
        const cloudName   = process.env.CLOUDINARY_CLOUD_NAME;
        const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

        if (!cloudName) {
            console.warn('⚠️ Cloudinary config নেই। ছবি আপলোড হবে না।');
            return null;
        }

        // Buffer থেকে base64
        const base64 = fileBuffer.toString('base64');
        // সঠিক mimetype ব্যবহার করো (jpeg/png/webp সব সাপোর্ট)
        const safeType = (mimetype && mimetype.startsWith('image/')) ? mimetype : 'image/jpeg';
        const dataUri = `data:${safeType};base64,${base64}`;

        const formData = new FormData();
        formData.append('file',           dataUri);
        formData.append('upload_preset',  uploadPreset);
        formData.append('folder',         `novatech/${folder}`);
        formData.append('public_id',      filename);

        const response = await axios.post(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            formData,
            { timeout: 30000 }
        );

        if (response.data?.secure_url) {
            console.log(`✅ Cloudinary আপলোড সফল: ${response.data.secure_url}`);
            return response.data.secure_url;
        }

        throw new Error('Cloudinary URL পাওয়া যায়নি।');

    } catch (error) {
        console.error('❌ Cloudinary Error:', error.message);
        return null;
    }
};

// ============================================================
// Google Drive তে ডকুমেন্ট আপলোড
// ============================================================

const uploadToDrive = async (fileBuffer, fileName, mimeType) => {
    try {
        const driveUrl = process.env.GOOGLE_DRIVE_SCRIPT_URL;

        if (!driveUrl) {
            console.warn('⚠️ Drive Script URL নেই।');
            return null;
        }

        const base64 = fileBuffer.toString('base64');

        const response = await axios.post(
            driveUrl,
            { file: base64, mimeType, fileName },
            { timeout: 30000 }
        );

        if (response.data?.success) {
            console.log(`✅ Drive আপলোড সফল: ${response.data.url}`);
            return {
                url:    response.data.url,
                fileId: response.data.fileId || null
            };
        }

        throw new Error('Drive URL পাওয়া যায়নি।');

    } catch (error) {
        console.error('❌ Drive Upload Error:', error.message);
        return null;
    }
};

// ============================================================
// র‍্যান্ডম পাসওয়ার্ড তৈরি
// নতুন কর্মচারীর জন্য
// ============================================================

const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

// ============================================================
// Welcome SMS পাঠানো
// ============================================================

const sendWelcomeSMS = async (employee, employeeCode, tempPassword) => {
    const phone = employee.phone || employee.phone2;
    if (!phone) return;

    await sendLoginCredentials(
        phone,
        employeeCode,
        tempPassword,
        employee.name_bn
    );
};

// ============================================================
// কর্মচারী PDF প্রোফাইল তৈরি
// ============================================================

const generateEmployeePDF = async (employee) => {
    return new Promise((resolve, reject) => {
        try {
            // JSON fields safe parse করি
            const parseJ = (val, fallback) => {
                if (!val) return fallback;
                if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
                return val;
            };
            employee.education         = parseJ(employee.education, []);
            employee.experience        = parseJ(employee.experience, []);
            employee.emergency_contact = parseJ(employee.emergency_contact, {});

            const doc    = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end',  ()    => resolve(Buffer.concat(chunks)));
            doc.on('error', err  => reject(err));

            // ── Header ──
            doc.fontSize(18)
               .font('Helvetica-Bold')
               .text('NovaTech BD (Ltd.)', { align: 'center' });

            doc.fontSize(10)
               .font('Helvetica')
               .text('জানকি সিংহ রোড, বরিশাল সদর, বরিশাল – ১২০০', { align: 'center' })
               .text('inf.novatechbd@gmail.com | +880 1309 540 282', { align: 'center' });

            doc.moveDown(0.5);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(0.5);

            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('Employee Profile', { align: 'center' });

            doc.moveDown(1);

            // ── কর্মচারী তথ্য ──
            const addRow = (label, value) => {
                doc.fontSize(10)
                   .font('Helvetica-Bold')
                   .text(`${label}: `, { continued: true })
                   .font('Helvetica')
                   .text(value || 'N/A');
                doc.moveDown(0.3);
            };

            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Personal Information');
            doc.moveDown(0.5);

            addRow('Employee Code', employee.employee_code);
            addRow('Name (Bengali)', employee.name_bn);
            addRow('Name (English)', employee.name_en);
            addRow('Role',          employee.role?.toUpperCase());
            addRow('Father Name',   employee.father_name);
            addRow('Mother Name',   employee.mother_name);
            addRow('Date of Birth', employee.dob);
            addRow('Gender',        employee.gender);
            addRow('Marital Status',employee.marital_status);
            addRow('NID',           employee.nid);
            addRow('Phone',         employee.phone);
            addRow('Phone 2',       employee.phone2);
            addRow('Email',         employee.email);
            addRow('Join Date',     employee.join_date);
            addRow('Basic Salary',  employee.basic_salary ? `৳${employee.basic_salary}` : 'N/A');

            doc.moveDown(0.5);
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Address');
            doc.moveDown(0.3);

            addRow('Permanent Address', employee.permanent_address);
            addRow('Current Address',   employee.current_address);
            addRow('District',          employee.district);
            addRow('Thana',             employee.thana);

            // শিক্ষা
            if (employee.education?.length > 0) {
                doc.moveDown(0.5);
                doc.fontSize(12).font('Helvetica-Bold').text('Education');
                doc.moveDown(0.3);
                employee.education.forEach(edu => {
                    addRow(edu.exam, `${edu.board || ''} | ${edu.year || ''} | GPA: ${edu.gpa || ''}`);
                });
            }

            // অভিজ্ঞতা
            if (employee.experience?.length > 0) {
                doc.moveDown(0.5);
                doc.fontSize(12).font('Helvetica-Bold').text('Experience');
                doc.moveDown(0.3);
                employee.experience.forEach(exp => {
                    addRow(exp.company, `${exp.position || ''} | ${exp.duration || ''}`);
                });
            }

            // জরুরি যোগাযোগ
            if (employee.emergency_contact?.name) {
                doc.moveDown(0.5);
                doc.fontSize(12).font('Helvetica-Bold').text('Emergency Contact');
                doc.moveDown(0.3);
                addRow('Name',     employee.emergency_contact.name);
                addRow('Relation', employee.emergency_contact.relation);
                addRow('Phone',    employee.emergency_contact.phone);
            }

            // Footer
            doc.moveDown(1);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(0.5);
            doc.fontSize(9)
               .font('Helvetica')
               .text(
                   `Generated: ${new Date().toLocaleString('en-BD')} | NovaTech BD (Ltd.)`,
                   { align: 'center', color: 'grey' }
               );

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
};

module.exports = {
    generateEmployeeCode,
    generateCustomerCode,
    uploadToCloudinary,
    uploadToDrive,
    generateTempPassword,
    sendWelcomeSMS,
    generateEmployeePDF
};
