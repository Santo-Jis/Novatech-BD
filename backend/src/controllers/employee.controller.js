const { sendEmail } = require('../services/email.service');
const bcrypt            = require('bcryptjs');
const { query, withTransaction } = require('../config/db');
const {
    generateEmployeeCode,
    uploadToCloudinary,
    uploadToDrive,
    generateTempPassword,   // একটিমাত্র পাসওয়ার্ড জেনারেটর — service থেকে import
    sendWelcomeSMS,
    generateEmployeePDF
} = require('../services/employee.service');

// ============================================================
// GET ALL EMPLOYEES
// GET /api/employees
// Admin → সব, Manager → নিজের টিম
// ============================================================

const getEmployees = async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let conditions = ['u.status != $1'];
        let params     = ['archived'];
        let paramCount = 1;

        // Team filter (Manager শুধু নিজের টিম)
        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        // Worker নিজের ডাটা
        if (req.user.role === 'worker') {
            paramCount++;
            conditions.push(`u.id = $${paramCount}`);
            params.push(req.user.id);
        }

        if (role) {
            paramCount++;
            conditions.push(`u.role = $${paramCount}`);
            params.push(role);
        }

        if (status) {
            paramCount++;
            conditions.push(`u.status = $${paramCount}`);
            params.push(status);
        }

        if (search) {
            paramCount++;
            conditions.push(
                `(u.name_bn ILIKE $${paramCount} OR u.name_en ILIKE $${paramCount} 
                  OR u.phone ILIKE $${paramCount} OR u.employee_code ILIKE $${paramCount})`
            );
            params.push(`%${search}%`);
        }

        const whereClause = conditions.join(' AND ');

        // মোট সংখ্যা
        const countResult = await query(
            `SELECT COUNT(*) FROM users u WHERE ${whereClause}`,
            params
        );

        // ডাটা
        paramCount++;
        params.push(limit);
        paramCount++;
        params.push(offset);

        const result = await query(
            `SELECT u.id, u.role, u.employee_code, u.name_bn, u.name_en,
                    u.email, u.phone, u.status, u.join_date, u.profile_photo,
                    u.basic_salary, u.outstanding_dues,
                    m.name_bn AS manager_name
             FROM users u
             LEFT JOIN users m ON u.manager_id = m.id
             WHERE ${whereClause}
             ORDER BY u.created_at DESC
             LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
            params
        );

        return res.status(200).json({
            success: true,
            data: {
                employees:  result.rows,
                total:      parseInt(countResult.rows[0].count),
                page:       parseInt(page),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });

    } catch (error) {
        console.error('❌ Get Employees Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE EMPLOYEE
// GET /api/employees/:id
// ============================================================

const getEmployee = async (req, res) => {
    try {
        const result = await query(
            `SELECT u.*, m.name_bn AS manager_name, m.employee_code AS manager_code
             FROM users u
             LEFT JOIN users m ON u.manager_id = m.id
             WHERE u.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
        }

        const { password_hash, ...employee } = result.rows[0];

        return res.status(200).json({ success: true, data: employee });

    } catch (error) {
        console.error('❌ Get Employee Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE EMPLOYEE
// POST /api/employees
// Admin/Manager → pending status এ সেভ হবে
// ============================================================

const createEmployee = async (req, res) => {
    try {
        const {
            role, name_bn, name_en, father_name, mother_name,
            email, phone, phone2, dob, gender, marital_status, nid,
            permanent_address, current_address, district, thana,
            skills, education, experience, emergency_contact,
            basic_salary, manager_id
        } = req.body;

        // প্রয়োজনীয় তথ্য যাচাই
        if (!name_bn || !name_en || !phone || !role) {
            return res.status(400).json({
                success: false,
                message: 'নাম (বাংলা/ইংরেজি), ফোন এবং পদবী আবশ্যক।'
            });
        }

        // ফোন নম্বর আগে থেকে আছে কিনা
        const existing = await query(
            'SELECT id, status FROM users WHERE phone = $1 OR (email IS NOT NULL AND email = $2)',
            [phone, email || null]
        );

        if (existing.rows.length > 0) {
            const found = existing.rows[0];
            // যদি archived হয় → reactivate করার সুযোগ দাও
            if (found.status === 'archived') {
                return res.status(409).json({
                    success: false,
                    code: 'ARCHIVED_EXISTS',
                    message: 'এই কর্মচারী আগে বরখাস্ত হয়েছিলেন। পুনরায় যুক্ত করবেন?',
                    data: { existing_id: found.id }
                });
            }
            // active/pending/suspended → সত্যিকারের duplicate
            return res.status(400).json({
                success: false,
                message: 'এই ফোন নম্বর বা ইমেইল আগে থেকেই নিবন্ধিত।'
            });
        }

        // প্রোফাইল ছবি Cloudinary তে আপলোড
        let profilePhotoUrl = null;
        if (req.files?.profile_photo?.[0]) {
            profilePhotoUrl = await uploadToCloudinary(
                req.files.profile_photo[0].buffer,
                'profiles',
                `emp_${phone}_${Date.now()}`
            );
        }

        // ডকুমেন্ট Drive তে আপলোড
        let documentUrls = [];
        if (req.files?.documents) {
            for (const doc of req.files.documents) {
                const uploaded = await uploadToDrive(
                    doc.buffer,
                    doc.originalname,
                    doc.mimetype
                );
                if (uploaded) documentUrls.push(uploaded);
            }
        }

        // অস্থায়ী পাসওয়ার্ড তৈরি
        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10) // 12→10: Render free CPU অপ্টিমাইজড;

        // DB তে সেভ (pending status)
        const result = await query(
            `INSERT INTO users (
                role, name_bn, name_en, father_name, mother_name,
                email, phone, phone2, dob, gender, marital_status, nid,
                permanent_address, current_address, district, thana,
                skills, education, experience, emergency_contact,
                profile_photo, basic_salary, manager_id,
                password_hash, status, join_date
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, 'pending', CURRENT_DATE
             ) RETURNING id, name_bn, phone, role, status`,
            [
                role, name_bn, name_en, father_name || null, mother_name || null,
                email || null, phone, phone2 || null,
                dob || null, gender || null, marital_status || null, nid || null,
                permanent_address || null, current_address || null,
                district || null, thana || null,
                skills ? JSON.stringify(skills) : '{}',
                education ? JSON.stringify(education) : '[]',
                experience ? JSON.stringify(experience) : '[]',
                // emergency_contact সবসময় plain string/phone হিসেবে store করো
                typeof emergency_contact === 'object'
                    ? (emergency_contact?.number || emergency_contact?.phone || emergency_contact?.value || null)
                    : (emergency_contact ? String(emergency_contact).trim() : null),
                profilePhotoUrl,
                basic_salary || 0,
                manager_id || req.user.manager_id || null,
                passwordHash
            ]
        );

        const newEmployee = result.rows[0];

        // temp password সাময়িক সংরক্ষণ (approval এর পরে SMS যাবে)
        // এখন শুধু response এ দেখাচ্ছি (Admin দেখবে)
        return res.status(201).json({
            success: true,
            message: `কর্মচারী তৈরি হয়েছে। Admin এর অনুমোদনের অপেক্ষায়।`,
            data: {
                ...newEmployee,
                temp_password: tempPassword, // Admin দেখবে, approval এর পরে SMS যাবে
                documents: documentUrls
            }
        });

    } catch (error) {
        console.error('❌ Create Employee Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই তথ্য আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'কর্মচারী তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PENDING EMPLOYEES
// GET /api/employees/pending
// ============================================================

const getPendingEmployees = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, role, name_bn, name_en, email, phone,
                    join_date, profile_photo, created_at
             FROM users
             WHERE status = 'pending'
             ORDER BY created_at DESC`
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Get Pending Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// APPROVE EMPLOYEE
// PUT /api/employees/:id/approve
// ============================================================

const approveEmployee = async (req, res) => {
    try {
        const { id }         = req.params;
        const temp_password = generateTempPassword(); // auto-generate
        const passwordHash  = await bcrypt.hash(temp_password, 10); // ✅ DB তে save করার জন্য hash

        // Employee তথ্য নাও
        const empResult = await query(
            'SELECT * FROM users WHERE id = $1 AND status = $2',
            [id, 'pending']
        );

        if (empResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'পেন্ডিং কর্মচারী পাওয়া যায়নি।'
            });
        }

        const employee = empResult.rows[0];

        // Employee Code জেনারেট
        const employeeCode = await generateEmployeeCode(
            employee.role,
            employee.join_date
        );

        // Status আপডেট + নতুন password_hash ✅ save করো
        await query(
            `UPDATE users 
             SET status = 'active', employee_code = $1, password_hash = $2, updated_at = NOW()
             WHERE id = $3`,
            [employeeCode, passwordHash, id]
        );

        // Audit Log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'APPROVE_EMPLOYEE', 'users', $2, $3)`,
            [req.user.id, id, JSON.stringify({ employee_code: employeeCode, status: 'active' })]
        );

        // SMS পাঠাও
        if (temp_password) {
            await sendWelcomeSMS(employee, employeeCode, temp_password);
            if (employee.email) {
              const html = `<div style="font-family:Arial;max-width:500px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
                <div style="background:#1e3a8a;padding:20px;text-align:center">
                  <h2 style="color:white;margin:0">NovaTech BD</h2>
                </div>
                <div style="padding:24px">
                  <p>আস্সালামু আলাইকুম <strong>${employee.name_bn}</strong>,</p>
                  <p>আপনার অ্যাকাউন্ট অনুমোদিত হয়েছে। ✅</p>
                  <div style="background:#f0f4ff;border-radius:8px;padding:16px;margin:16px 0">
                    <p style="margin:4px 0">🪪 কর্মচারী কোড: <strong>${employeeCode}</strong></p>
                    <p style="margin:4px 0">🔑 অস্থায়ী পাসওয়ার্ড: <strong>${temp_password}</strong></p>
                  </div>
                  <p style="color:#e74c3c">প্রথম লগইনের পর পাসওয়ার্ড পরিবর্তন করুন।</p>
                  <div style="text-align:center;margin:20px 0">
                    <a href="https://novatech-bd-kqrn.vercel.app" style="background:#1e3a8a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">🚀 অ্যাপে লগইন করুন</a>
                  </div>
                  <p style="font-size:13px;color:#666;text-align:center">অথবা এই লিংকে যান: <a href="https://novatech-bd-kqrn.vercel.app" style="color:#1e3a8a">https://novatech-bd-kqrn.vercel.app</a></p>
                  <p>ধন্যবাদ,<br><strong>NovaTech BD টিম</strong></p>
                </div>
              </div>`;
              await sendEmail(employee.email, 'NovaTech BD - অ্যাকাউন্ট অনুমোদিত ✅', html);
            }
        }

        return res.status(200).json({
            success: true,
            message: `কর্মচারী অনুমোদন সফল। কোড: ${employeeCode}`,
            data: { employee_code: employeeCode }
        });

    } catch (error) {
        console.error('❌ Approve Employee Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুমোদনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// REJECT EMPLOYEE
// PUT /api/employees/:id/reject
// ============================================================

const rejectEmployee = async (req, res) => {
    try {
        const { id }     = req.params;
        const { reason } = req.body;

        await query(
            `UPDATE users SET status = 'archived', updated_at = NOW() WHERE id = $1`,
            [id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'REJECT_EMPLOYEE', 'users', $2, $3)`,
            [req.user.id, id, JSON.stringify({ reason })]
        );

        return res.status(200).json({ success: true, message: 'কর্মচারীর আবেদন বাতিল করা হয়েছে।' });

    } catch (error) {
        console.error('❌ Reject Employee Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিলে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SUSPEND EMPLOYEE
// PUT /api/employees/:id/suspend
// শুধু Admin
// ============================================================

const suspendEmployee = async (req, res) => {
    try {
        const { id }     = req.params;
        const { reason } = req.body;

        const result = await query(
            `UPDATE users 
             SET status = 'suspended', updated_at = NOW()
             WHERE id = $1 AND role != 'admin'
             RETURNING name_bn`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'SUSPEND_EMPLOYEE', 'users', $2, $3)`,
            [req.user.id, id, JSON.stringify({ reason, status: 'suspended' })]
        );

        return res.status(200).json({
            success: true,
            message: `${result.rows[0].name_bn} কে বরখাস্ত করা হয়েছে।`
        });

    } catch (error) {
        console.error('❌ Suspend Error:', error.message);
        return res.status(500).json({ success: false, message: 'বরখাস্তে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// EDIT EMPLOYEE
// PUT /api/employees/:id
// Worker/Manager এডিট করলে audit তৈরি হবে
// Admin সরাসরি এডিট করতে পারবে
// ============================================================

const editEmployee = async (req, res) => {
    try {
        const { id }   = req.params;
        const isAdmin  = req.user.role === 'admin';
        const isSelf   = req.user.id === id;

        // বর্তমান তথ্য নাও
        const current = await query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );

        if (current.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
        }

        const currentData = current.rows[0];

        // নতুন ছবি আপলোড
        let profilePhotoUrl = currentData.profile_photo;
        if (req.files?.profile_photo?.[0]) {
            profilePhotoUrl = await uploadToCloudinary(
                req.files.profile_photo[0].buffer,
                'profiles',
                `emp_${currentData.phone}_${Date.now()}`
            );
        }

        // পরিবর্তনের তথ্য তৈরি
        const changes = {};
        const allowedFields = [
            'name_bn', 'name_en', 'father_name', 'mother_name',
            'email', 'phone2', 'dob', 'gender', 'marital_status',
            'permanent_address', 'current_address', 'district', 'thana',
            'skills', 'education', 'experience', 'emergency_contact'
        ];

        // Admin অতিরিক্ত ফিল্ড এডিট করতে পারবে
        if (isAdmin) {
            allowedFields.push('basic_salary', 'manager_id', 'role');
        }

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                changes[field] = req.body[field];
            }
        });

        if (profilePhotoUrl !== currentData.profile_photo) {
            changes.profile_photo = profilePhotoUrl;
        }

        if (Object.keys(changes).length === 0) {
            return res.status(400).json({ success: false, message: 'কোনো পরিবর্তন নেই।' });
        }

        if (isAdmin) {
            // Admin → সরাসরি আপডেট
            const setClause = Object.keys(changes)
                .map((key, i) => `${key} = $${i + 2}`)
                .join(', ');

            await query(
                `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1`,
                [id, ...Object.values(changes)]
            );

            await query(
                `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value)
                 VALUES ($1, 'EDIT_EMPLOYEE', 'users', $2, $3, $4)`,
                [req.user.id, id, JSON.stringify(currentData), JSON.stringify(changes)]
            );

            return res.status(200).json({ success: true, message: 'তথ্য আপডেট হয়েছে।' });

        } else {
            // Worker/Manager → audit তৈরি + সাথে সাথে দেখাবে (pending)
            // আগের মান সংরক্ষণ
            const previousValues = {};
            Object.keys(changes).forEach(key => {
                previousValues[key] = currentData[key];
            });

            // Audit তৈরি
            const auditResult = await query(
                `INSERT INTO employees_audit 
                 (user_id, changes, previous_values, status, requested_by)
                 VALUES ($1, $2, $3, 'pending', $4)
                 RETURNING id`,
                [id, JSON.stringify(changes), JSON.stringify(previousValues), req.user.id]
            );

            // সাথে সাথে User এ আপডেট (কিন্তু pending অবস্থায়)
            const setClause = Object.keys(changes)
                .map((key, i) => `${key} = $${i + 2}`)
                .join(', ');

            await query(
                `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1`,
                [id, ...Object.values(changes)]
            );

            return res.status(200).json({
                success: true,
                message: 'তথ্য আপডেট হয়েছে। Admin/Manager অনুমোদনের অপেক্ষায়।',
                data: { audit_id: auditResult.rows[0].id }
            });
        }

    } catch (error) {
        console.error('❌ Edit Employee Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PENDING EDITS
// GET /api/employees/audit
// ============================================================

const getPendingEdits = async (req, res) => {
    try {
        const result = await query(
            `SELECT ea.*, 
                    u.name_bn, u.name_en, u.employee_code, u.role,
                    r.name_bn AS requested_by_name
             FROM employees_audit ea
             JOIN users u  ON ea.user_id = u.id
             JOIN users r  ON ea.requested_by = r.id
             WHERE ea.status = 'pending'
             ORDER BY ea.created_at DESC`
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Get Pending Edits Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// APPROVE EDIT
// PUT /api/employees/audit/:id/approve
// ============================================================

const approveEdit = async (req, res) => {
    try {
        await query(
            `UPDATE employees_audit 
             SET status = 'approved', approved_by = $1, updated_at = NOW()
             WHERE id = $2`,
            [req.user.id, req.params.id]
        );

        return res.status(200).json({ success: true, message: 'এডিট অনুমোদন সফল।' });

    } catch (error) {
        console.error('❌ Approve Edit Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুমোদনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// REJECT EDIT
// PUT /api/employees/audit/:id/reject
// রিজেক্ট হলে আগের তথ্যে ফিরে যাবে
// ============================================================

const rejectEdit = async (req, res) => {
    try {
        const { reason } = req.body;

        // Audit তথ্য নাও
        const auditResult = await query(
            'SELECT * FROM employees_audit WHERE id = $1',
            [req.params.id]
        );

        if (auditResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'এডিট রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        const audit = auditResult.rows[0];

        // আগের তথ্যে ফিরিয়ে দাও
        const previousValues = audit.previous_values;
        if (Object.keys(previousValues).length > 0) {
            const setClause = Object.keys(previousValues)
                .map((key, i) => `${key} = $${i + 2}`)
                .join(', ');

            await query(
                `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1`,
                [audit.user_id, ...Object.values(previousValues)]
            );
        }

        // Audit status আপডেট
        await query(
            `UPDATE employees_audit 
             SET status = 'rejected', approved_by = $1, 
                 reject_reason = $2, updated_at = NOW()
             WHERE id = $3`,
            [req.user.id, reason || null, req.params.id]
        );

        return res.status(200).json({
            success: true,
            message: 'এডিট বাতিল করা হয়েছে। আগের তথ্যে ফিরে গেছে।'
        });

    } catch (error) {
        console.error('❌ Reject Edit Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিলে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET EMPLOYEE PDF
// GET /api/employees/:id/pdf
// ============================================================

const getEmployeePDF = async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM users WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
        }

        const { password_hash, ...employee } = result.rows[0];
        const pdfBuffer = await generateEmployeePDF(employee);

        res.setHeader('Content-Type',        'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="employee_${employee.employee_code}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ PDF Error:', error.message);
        return res.status(500).json({ success: false, message: 'PDF তৈরিতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// UPDATE OWN PROFILE
// PUT /api/employees/profile
// Worker নিজের তথ্য আপডেট করবে
// ============================================================

const updateOwnProfile = async (req, res) => {
    try {
        const { name_bn, name_en, phone, current_address, emergency_contact } = req.body;
        const userId = req.user.id;

        // emergency_contact সবসময় plain string হিসেবে store করো
        // যদি object আসে (data inconsistency) তাহলে number/phone বের করো
        let emergencyContactStr = null;
        if (emergency_contact !== undefined && emergency_contact !== null) {
            if (typeof emergency_contact === 'object') {
                emergencyContactStr = emergency_contact?.number
                    || emergency_contact?.phone
                    || emergency_contact?.value
                    || '';
            } else {
                emergencyContactStr = String(emergency_contact).trim();
            }
        }

        await query(
            `UPDATE users SET
                name_bn           = COALESCE($1, name_bn),
                name_en           = COALESCE($2, name_en),
                phone             = COALESCE($3, phone),
                current_address   = COALESCE($4, current_address),
                emergency_contact = COALESCE($5::text, emergency_contact),
                updated_at        = NOW()
             WHERE id = $6`,
            [name_bn, name_en, phone, current_address, emergencyContactStr, userId]
        );

        return res.status(200).json({
            success: true,
            message: 'প্রোফাইল আপডেট হয়েছে।'
        });

    } catch (error) {
        console.error('❌ Update Profile Error:', error.message);
        return res.status(500).json({ success: false, message: 'প্রোফাইল আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPLOAD PROFILE PHOTO
// POST /api/employees/profile-photo
// Worker নিজের ছবি আপলোড করবে
// ============================================================

const uploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'ছবি দিন।' });
        }

        const photoUrl = await uploadToCloudinary(
            req.file.buffer,
            'profiles',
            `profile_${req.user.id}`
        );

        if (!photoUrl) {
            return res.status(500).json({ success: false, message: 'ছবি আপলোড হয়নি। Cloudinary config চেক করুন।' });
        }

        await query(
            'UPDATE users SET profile_photo = $1, updated_at = NOW() WHERE id = $2',
            [photoUrl, req.user.id]
        );

        return res.status(200).json({
            success: true,
            message: 'ছবি আপলোড হয়েছে।',
            data: { profile_photo: photoUrl }
        });

    } catch (error) {
        console.error('❌ Profile Photo Error:', error.message);
        return res.status(500).json({ success: false, message: 'ছবি আপলোডে সমস্যা হয়েছে।' });
    }
};

// POST /api/employees/broadcast-email
const broadcastEmail = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ success: false, message: 'Subject ও message দিন।' });

    const result = await query(`SELECT name_bn, email FROM users WHERE status = 'active' AND email IS NOT NULL AND email != ''`);
    const employees = result.rows;

    if (employees.length === 0) return res.status(200).json({ success: false, message: 'কোনো email পাওয়া যায়নি।' });

    const { sendEmail } = require('../services/email.service');
    let sent = 0;
    for (const emp of employees) {
      const html = `<div style="font-family:Arial;max-width:500px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
        <div style="background:#1e3a8a;padding:20px;text-align:center">
          <h2 style="color:white;margin:0">NovaTech BD</h2>
        </div>
        <div style="padding:24px">
          <p>আস্সালামু আলাইকুম <strong>${emp.name_bn}</strong>,</p>
          <div style="background:#f0f4ff;border-radius:8px;padding:16px;margin:16px 0">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <div style="text-align:center;margin:20px 0">
            <a href="https://novatech-bd-kqrn.vercel.app" style="background:#1e3a8a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">🚀 অ্যাপে যান</a>
          </div>
          <p style="font-size:13px;color:#666;text-align:center">অথবা এই লিংকে যান: <a href="https://novatech-bd-kqrn.vercel.app" style="color:#1e3a8a">https://novatech-bd-kqrn.vercel.app</a></p>
          <p>ধন্যবাদ,<br><strong>NovaTech BD টিম</strong></p>
        </div>
      </div>`;
      await sendEmail(emp.email, subject, html);
      sent++;
    }
    res.status(200).json({ success: true, message: `${sent} জনকে email পাঠানো হয়েছে।` });
  } catch (err) {
    console.error('Broadcast Email Error:', err.message);
    res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
  }
};

// POST /api/employees/:id/reset-password
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { send_email } = req.body;
    const bcrypt = require('bcryptjs');
    const newPass = generateTempPassword();
    const hashed = await bcrypt.hash(newPass, 10);
    const emp = await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING name_bn, email`, [hashed, id]);
    if (emp.rows.length === 0) return res.status(404).json({ success: false, message: 'কর্মচারী পাওয়া যায়নি।' });
    if (send_email && emp.rows[0].email) {
      const { sendEmail } = require('../services/email.service');
      const html = `<div style="font-family:Arial;max-width:500px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden"><div style="background:#1e3a8a;padding:20px;text-align:center"><h2 style="color:white;margin:0">NovaTech BD</h2></div><div style="padding:24px"><p>আস্সালামু আলাইকুম <strong>${emp.rows[0].name_bn}</strong>,</p><p>আপনার পাসওয়ার্ড রিসেট করা হয়েছে।</p><div style="background:#f0f4ff;border-radius:8px;padding:16px"><p>🔑 নতুন পাসওয়ার্ড: <strong>${newPass}</strong></p></div><p style="color:red">প্রথম লগইনের পর পাসওয়ার্ড পরিবর্তন করুন।</p><div style="text-align:center;margin:20px 0"><a href="https://novatech-bd-kqrn.vercel.app" style="background:#1e3a8a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">🚀 অ্যাপে লগইন করুন</a></div><p style="font-size:13px;color:#666;text-align:center">অথবা এই লিংকে যান: <a href="https://novatech-bd-kqrn.vercel.app" style="color:#1e3a8a">https://novatech-bd-kqrn.vercel.app</a></p><p>ধন্যবাদ,<br><strong>NovaTech BD টিম</strong></p></div></div>`;
      await sendEmail(emp.rows[0].email, 'NovaTech BD - পাসওয়ার্ড রিসেট 🔑', html);
    }
    res.status(200).json({ success: true, message: 'পাসওয়ার্ড রিসেট সফল।', data: { new_password: newPass, name_bn: emp.rows[0].name_bn } });
  } catch (err) {
    console.error('Reset Password Error:', err.message);
    res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
  }
};

// ============================================================
// REACTIVATE ARCHIVED EMPLOYEE
// PUT /api/employees/:id/reactivate
// ============================================================

const reactivateEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        const empResult = await query(
            'SELECT * FROM users WHERE id = $1 AND status = $2',
            [id, 'archived']
        );

        if (empResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'আর্কাইভ কর্মচারী পাওয়া যায়নি।' });
        }

        const employee = empResult.rows[0];

        // নতুন পাসওয়ার্ড তৈরি
        const newPassword  = generateTempPassword();
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // নতুন employee code তৈরি
        const { generateEmployeeCode } = require('../services/employee.service');
        const newCode = await generateEmployeeCode(employee.role, new Date());

        // reactivate
        await query(
            `UPDATE users
             SET status = 'active', employee_code = $1, password_hash = $2,
                 join_date = CURRENT_DATE, updated_at = NOW()
             WHERE id = $3`,
            [newCode, passwordHash, id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'REACTIVATE_EMPLOYEE', 'users', $2, $3)`,
            [req.user.id, id, JSON.stringify({ employee_code: newCode, status: 'active' })]
        );

        // Email পাঠাও
        if (employee.email) {
            const { sendEmail } = require('../services/email.service');
            const html = `<div style="font-family:Arial;max-width:500px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
                <div style="background:#1e3a8a;padding:20px;text-align:center">
                  <h2 style="color:white;margin:0">NovaTech BD</h2>
                </div>
                <div style="padding:24px">
                  <p>আস্সালামু আলাইকুম <strong>${employee.name_bn}</strong>,</p>
                  <p>আপনাকে পুনরায় যুক্ত করা হয়েছে। ✅</p>
                  <div style="background:#f0f4ff;border-radius:8px;padding:16px;margin:16px 0">
                    <p style="margin:4px 0">🪪 নতুন কর্মচারী কোড: <strong>${newCode}</strong></p>
                    <p style="margin:4px 0">🔑 অস্থায়ী পাসওয়ার্ড: <strong>${newPassword}</strong></p>
                  </div>
                  <p style="color:#e74c3c">প্রথম লগইনের পর পাসওয়ার্ড পরিবর্তন করুন।</p>
                  <div style="text-align:center;margin:20px 0">
                    <a href="https://novatech-bd-kqrn.vercel.app" style="background:#1e3a8a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">🚀 অ্যাপে লগইন করুন</a>
                  </div>
                  <p style="font-size:13px;color:#666;text-align:center">অথবা এই লিংকে যান: <a href="https://novatech-bd-kqrn.vercel.app" style="color:#1e3a8a">https://novatech-bd-kqrn.vercel.app</a></p>
                  <p>ধন্যবাদ,<br><strong>NovaTech BD টিম</strong></p>
                </div>
              </div>`;
            await sendEmail(employee.email, 'NovaTech BD - পুনরায় যুক্ত হয়েছেন ✅', html);
        }

        return res.status(200).json({
            success: true,
            message: `${employee.name_bn} কে পুনরায় যুক্ত করা হয়েছে। নতুন কোড: ${newCode}`,
            data: { employee_code: newCode, new_password: newPassword }
        });

    } catch (error) {
        console.error('❌ Reactivate Error:', error.message);
        return res.status(500).json({ success: false, message: 'পুনরায় যুক্ত করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    resetPassword,
    broadcastEmail,
    getEmployees,
    getEmployee,
    createEmployee,
    getPendingEmployees,
    approveEmployee,
    broadcastEmail,
    rejectEmployee,
    suspendEmployee,
    editEmployee,
    getPendingEdits,
    approveEdit,
    rejectEdit,
    getEmployeePDF,
    updateOwnProfile,
    uploadProfilePhoto,
    reactivateEmployee
};



