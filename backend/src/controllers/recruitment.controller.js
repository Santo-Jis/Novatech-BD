const { getDB } = require('../config/firebase');
const { uploadToCloudinary } = require('../services/employee.service');

// Application ID generator: SR-YYYYMMDD-XXXX
const generateAppId = () => {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `SR-${date}-${rand}`;
};

// ── POST /api/recruitment/apply (Public — no auth) ────────────
exports.submitApplication = async (req, res) => {
    try {
        const db = getDB();
        const d  = req.body;

        // Duplicate check by phone
        const snap = await db.ref('sr_applications')
            .orderByChild('phone')
            .equalTo(d.phone)
            .once('value');

        if (snap.exists()) {
            return res.status(409).json({
                success: false,
                message: 'এই ফোন নম্বরে আগেই আবেদন করা হয়েছে।',
            });
        }

        // Upload photo to Cloudinary
        let photo_url = null;
        if (req.file) {
            const filename = `sr_${Date.now()}`;
            photo_url = await uploadToCloudinary(req.file.buffer, 'recruitment', filename);
            if (!photo_url) {
                console.warn('⚠️ ছবি আপলোড হয়নি। CLOUDINARY_CLOUD_NAME ও CLOUDINARY_UPLOAD_PRESET .env এ সেট আছে কিনা দেখুন।');
            }
        }

        const application_id = generateAppId();
        const now = Date.now();

        const appData = {
            application_id,
            name_bn:          d.name_bn        || null,
            name_en:          d.name_en        || null,
            father_name:      d.father_name    || null,
            mother_name:      d.mother_name    || null,
            dob:              d.dob            || null,
            gender:           d.gender         || null,
            marital_status:   d.marital_status || null,
            nid:              d.nid            || null,
            phone:            d.phone          || null,
            email:            d.email          || null,
            permanent_address: d.permanent_address || null,
            current_address:   d.current_address   || null,
            district:          d.district          || null,
            thana:             d.thana             || null,
            edu_ssc_board:      d.edu_ssc_board      || null,
            edu_ssc_year:       d.edu_ssc_year       || null,
            edu_ssc_gpa:        d.edu_ssc_gpa        || null,
            edu_hsc_board:      d.edu_hsc_board      || null,
            edu_hsc_year:       d.edu_hsc_year       || null,
            edu_hsc_gpa:        d.edu_hsc_gpa        || null,
            edu_degree_board:   d.edu_degree_board   || null,
            edu_degree_year:    d.edu_degree_year    || null,
            edu_degree_gpa:     d.edu_degree_gpa     || null,
            edu_other_edu_board: d.edu_other_edu_board || null,
            edu_other_edu_year:  d.edu_other_edu_year  || null,
            edu_other_edu_gpa:   d.edu_other_edu_gpa   || null,
            exp_0_company:  d.exp_0_company  || null,
            exp_0_position: d.exp_0_position || null,
            exp_0_duration: d.exp_0_duration || null,
            exp_0_duties:   d.exp_0_duties   || null,
            exp_1_company:  d.exp_1_company  || null,
            exp_1_position: d.exp_1_position || null,
            exp_1_duration: d.exp_1_duration || null,
            exp_1_duties:   d.exp_1_duties   || null,
            exp_2_company:  d.exp_2_company  || null,
            exp_2_position: d.exp_2_position || null,
            exp_2_duration: d.exp_2_duration || null,
            exp_2_duties:   d.exp_2_duties   || null,
            total_exp_years:  d.total_exp_years  || null,
            total_exp_months: d.total_exp_months || null,
            skill_bangla:     d.skill_bangla     || null,
            skill_english:    d.skill_english    || null,
            skill_smartphone: d.skill_smartphone || null,
            skill_computer:   d.skill_computer   || null,
            has_bike:         d.has_bike         || null,
            emergency_name:     d.emergency_name     || null,
            emergency_relation: d.emergency_relation || null,
            emergency_phone:    d.emergency_phone    || null,
            emergency_address:  d.emergency_address  || null,
            ref1_name:       d.ref1_name       || null,
            ref1_profession: d.ref1_profession || null,
            ref1_phone:      d.ref1_phone      || null,
            ref1_address:    d.ref1_address    || null,
            ref2_name:       d.ref2_name       || null,
            ref2_profession: d.ref2_profession || null,
            ref2_phone:      d.ref2_phone      || null,
            ref2_address:    d.ref2_address    || null,
            photo_url:      photo_url || null,
            status:         'pending',
            admin_comment:  null,
            interview_date: null,
            created_at:     now,
            updated_at:     now,
        };

        await db.ref(`sr_applications/${application_id}`).set(appData);

        res.status(201).json({
            success: true,
            message: 'আবেদন সফলভাবে জমা হয়েছে।',
            data: { application_id },
        });
    } catch (err) {
        console.error('Recruitment apply error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment (Admin) ──────────────────────────────
exports.getApplications = async (req, res) => {
    try {
        const db = getDB();
        const { search = '', status = '', page = 1, limit = 20 } = req.query;

        const snap = await db.ref('sr_applications')
            .orderByChild('created_at')
            .once('value');

        let apps = [];
        snap.forEach(child => apps.push({ _id: child.key, ...child.val() }));
        apps.reverse();

        if (status) apps = apps.filter(a => a.status === status);

        if (search) {
            const s = search.toLowerCase();
            apps = apps.filter(a =>
                (a.name_bn         || '').toLowerCase().includes(s) ||
                (a.name_en         || '').toLowerCase().includes(s) ||
                (a.phone           || '').includes(s) ||
                (a.nid             || '').includes(s) ||
                (a.application_id  || '').toLowerCase().includes(s)
            );
        }

        const allSnap = await db.ref('sr_applications').once('value');
        let allApps = [];
        allSnap.forEach(c => allApps.push(c.val()));

        const stats = {
            total:    allApps.length,
            pending:  allApps.filter(a => a.status === 'pending').length,
            reviewed: allApps.filter(a => a.status === 'reviewed').length,
            selected: allApps.filter(a => a.status === 'selected').length,
            rejected: allApps.filter(a => a.status === 'rejected').length,
        };

        const total     = apps.length;
        const startIdx  = (Number(page) - 1) * Number(limit);
        const paginated = apps.slice(startIdx, startIdx + Number(limit));

        res.json({
            success: true,
            data: { applications: paginated, total, stats },
        });
    } catch (err) {
        console.error('Get applications error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/:id (Admin) ─────────────────────────
exports.getApplication = async (req, res) => {
    try {
        const db   = getDB();
        const snap = await db.ref(`sr_applications/${req.params.id}`).once('value');
        if (!snap.exists()) {
            return res.status(404).json({ success: false, message: 'আবেদন পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: { _id: snap.key, ...snap.val() } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── PUT /api/recruitment/:id/status (Admin) ───────────────────
exports.updateStatus = async (req, res) => {
    try {
        const db = getDB();
        const { status, admin_comment, interview_date } = req.body;
        const ref = db.ref(`sr_applications/${req.params.id}`);

        const snap = await ref.once('value');
        if (!snap.exists()) {
            return res.status(404).json({ success: false, message: 'আবেদন পাওয়া যায়নি।' });
        }

        const existing = snap.val();

        // Firebase undefined value দিলে crash করে — সব null/string নিশ্চিত করতে হবে
        const updateData = {
            status: (status !== undefined && status !== null && status !== '')
                        ? String(status)
                        : existing.status,
            admin_comment: (admin_comment !== undefined && admin_comment !== null)
                        ? String(admin_comment)
                        : (existing.admin_comment || null),
            interview_date: (interview_date !== undefined && interview_date !== null && interview_date !== '')
                        ? String(interview_date)
                        : (existing.interview_date || null),
            updated_at: Date.now(),
        };

        await ref.update(updateData);

        const updated = await ref.once('value');
        res.json({
            success: true,
            message: 'স্ট্যাটাস আপডেট হয়েছে।',
            data: { _id: updated.key, ...updated.val() },
        });
    } catch (err) {
        console.error('updateStatus error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/export (Admin — CSV) ─────────────────
exports.exportCSV = async (req, res) => {
    try {
        const db   = getDB();
        const snap = await db.ref('sr_applications').orderByChild('created_at').once('value');

        let apps = [];
        snap.forEach(c => apps.push(c.val()));
        apps.reverse();

        const headers = [
            'আবেদন নং','আবেদনের তারিখ','বাংলায় নাম','ইংরেজিতে নাম',
            'পিতার নাম','মাতার নাম','জন্ম তারিখ','লিঙ্গ','বৈবাহিক অবস্থা',
            'NID','মোবাইল','ইমেইল','জেলা','থানা',
            'SSC বোর্ড','SSC বছর','SSC জিপিএ',
            'HSC বোর্ড','HSC বছর','HSC জিপিএ',
            'স্নাতক বোর্ড','স্নাতক বছর','স্নাতক জিপিএ',
            'অভিজ্ঞতা (বছর)','মোটরসাইকেল',
            'বাংলা দক্ষতা','ইংরেজি দক্ষতা','স্মার্টফোন','কম্পিউটার',
            'জরুরি যোগাযোগ','জরুরি ফোন',
            'স্ট্যাটাস','মন্তব্য',
        ];

        const rows = apps.map(a => [
            a.application_id,
            a.created_at ? new Date(a.created_at).toLocaleDateString('bn-BD') : '',
            a.name_bn, a.name_en, a.father_name, a.mother_name,
            a.dob, a.gender, a.marital_status, a.nid, a.phone, a.email || '',
            a.district, a.thana,
            a.edu_ssc_board||'', a.edu_ssc_year||'', a.edu_ssc_gpa||'',
            a.edu_hsc_board||'', a.edu_hsc_year||'', a.edu_hsc_gpa||'',
            a.edu_degree_board||'', a.edu_degree_year||'', a.edu_degree_gpa||'',
            a.total_exp_years || '০',
            a.has_bike === 'yes' ? 'হ্যাঁ' : 'না',
            a.skill_bangla||'', a.skill_english||'', a.skill_smartphone||'', a.skill_computer||'',
            a.emergency_name||'', a.emergency_phone||'',
            a.status, a.admin_comment || '',
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

        const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="SR_Applications_${Date.now()}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Export করতে সমস্যা হয়েছে।' });
    }
};
