const { query, withTransaction } = require('../config/db');

// ============================================================
// GET ALL TEAMS (Admin)
// GET /api/teams
// ============================================================
const getTeams = async (req, res) => {
    try {
        const result = await query(`
            SELECT
                t.id,
                t.name,
                t.monthly_target,
                t.description,
                t.is_active,
                t.created_at,
                -- ম্যানেজারের তথ্য
                m.id            AS manager_id,
                m.name_bn       AS manager_name_bn,
                m.name_en       AS manager_name_en,
                m.employee_code AS manager_code,
                m.phone         AS manager_phone,
                -- SR সংখ্যা (active)
                COUNT(DISTINCT sr.id) FILTER (WHERE sr.role = 'worker' AND sr.status = 'active') AS sr_count
            FROM teams t
            LEFT JOIN users m  ON m.id = t.manager_id
            LEFT JOIN users sr ON sr.team_id = t.id
            GROUP BY t.id, m.id
            ORDER BY t.is_active DESC, t.name
        `);

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ getTeams Error:', error.message);
        return res.status(500).json({ success: false, message: 'টিম তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET SINGLE TEAM + SR LIST
// GET /api/teams/:id
// ============================================================
const getTeam = async (req, res) => {
    try {
        const { id } = req.params;

        // টিম তথ্য
        const teamResult = await query(`
            SELECT
                t.*,
                m.id            AS manager_id,
                m.name_bn       AS manager_name_bn,
                m.employee_code AS manager_code,
                m.phone         AS manager_phone
            FROM teams t
            LEFT JOIN users m ON m.id = t.manager_id
            WHERE t.id = $1
        `, [id]);

        if (teamResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'টিম পাওয়া যায়নি।' });
        }

        // SR তালিকা
        const srResult = await query(`
            SELECT
                id, name_bn, name_en, employee_code,
                phone, status, monthly_target,
                profile_photo, basic_salary
            FROM users
            WHERE team_id = $1 AND role = 'worker'
            ORDER BY name_bn
        `, [id]);

        return res.status(200).json({
            success: true,
            data: {
                team: teamResult.rows[0],
                members: srResult.rows
            }
        });
    } catch (error) {
        console.error('❌ getTeam Error:', error.message);
        return res.status(500).json({ success: false, message: 'টিম তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE TEAM (Admin)
// POST /api/teams
// ============================================================
const createTeam = async (req, res) => {
    try {
        const { name, manager_id, monthly_target = 0, description } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ success: false, message: 'টিমের নাম দিন।' });
        }

        // একজন ম্যানেজার শুধু একটি টিমে থাকতে পারবে
        if (manager_id) {
            const existCheck = await query(
                'SELECT id FROM teams WHERE manager_id = $1',
                [manager_id]
            );
            if (existCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'এই ম্যানেজার ইতিমধ্যে অন্য একটি টিমে আছেন।'
                });
            }
        }

        const result = await query(`
            INSERT INTO teams (name, manager_id, monthly_target, description, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [name.trim(), manager_id || null, monthly_target, description || null, req.user.id]);

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value)
             VALUES ($1, 'CREATE_TEAM', 'teams', $2)`,
            [req.user.id, JSON.stringify({ name, manager_id, monthly_target })]
        );

        return res.status(201).json({
            success: true,
            message: 'টিম তৈরি হয়েছে।',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ createTeam Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই টিমের নাম বা ম্যানেজার ইতিমধ্যে বিদ্যমান।' });
        }
        return res.status(500).json({ success: false, message: 'টিম তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE TEAM (Admin) — নাম, ম্যানেজার, টার্গেট
// PUT /api/teams/:id
// ============================================================
const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, manager_id, monthly_target, description, is_active } = req.body;

        // টিম আছে কিনা চেক
        const existing = await query('SELECT * FROM teams WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'টিম পাওয়া যায়নি।' });
        }

        // ম্যানেজার অন্য টিমে আছে কিনা চেক
        if (manager_id && manager_id !== existing.rows[0].manager_id) {
            const conflict = await query(
                'SELECT id FROM teams WHERE manager_id = $1 AND id != $2',
                [manager_id, id]
            );
            if (conflict.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'এই ম্যানেজার ইতিমধ্যে অন্য টিমে আছেন।'
                });
            }
        }

        const result = await query(`
            UPDATE teams SET
                name           = COALESCE($1, name),
                manager_id     = COALESCE($2, manager_id),
                monthly_target = COALESCE($3, monthly_target),
                description    = COALESCE($4, description),
                is_active      = COALESCE($5, is_active)
            WHERE id = $6
            RETURNING *
        `, [
            name?.trim() || null,
            manager_id || null,
            monthly_target !== undefined ? monthly_target : null,
            description !== undefined ? description : null,
            is_active !== undefined ? is_active : null,
            id
        ]);

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'UPDATE_TEAM', 'teams', $2, $3)`,
            [req.user.id, id, JSON.stringify(req.body)]
        );

        return res.status(200).json({
            success: true,
            message: 'টিম আপডেট হয়েছে।',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ updateTeam Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SET TEAM TARGET (Admin) — শুধু টার্গেট আপডেট
// PATCH /api/teams/:id/target
// ============================================================
const setTeamTarget = async (req, res) => {
    try {
        const { id } = req.params;
        const { monthly_target } = req.body;

        if (monthly_target === undefined || isNaN(monthly_target) || monthly_target < 0) {
            return res.status(400).json({ success: false, message: 'বৈধ টার্গেট পরিমাণ দিন।' });
        }

        const result = await query(`
            UPDATE teams SET monthly_target = $1
            WHERE id = $2
            RETURNING id, name, monthly_target
        `, [monthly_target, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'টিম পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'SET_TEAM_TARGET', 'teams', $2, $3)`,
            [req.user.id, id, JSON.stringify({ monthly_target })]
        );

        return res.status(200).json({
            success: true,
            message: 'টিমের টার্গেট সেট হয়েছে।',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ setTeamTarget Error:', error.message);
        return res.status(500).json({ success: false, message: 'টার্গেট সেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ASSIGN SR TO TEAM (Admin)
// PUT /api/teams/:id/members
// body: { sr_ids: [...] }  — SR-দের এই টিমে যোগ করো
// ============================================================
const assignSRToTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { sr_ids } = req.body;

        if (!Array.isArray(sr_ids) || sr_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'sr_ids array দিন।' });
        }

        // টিম আছে কিনা চেক
        const teamCheck = await query('SELECT id, manager_id FROM teams WHERE id = $1', [id]);
        if (teamCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'টিম পাওয়া যায়নি।' });
        }

        const team = teamCheck.rows[0];

        // SR-দের team_id ও manager_id আপডেট করো
        await query(`
            UPDATE users
            SET team_id = $1, manager_id = $2
            WHERE id = ANY($3::uuid[]) AND role = 'worker'
        `, [id, team.manager_id, sr_ids]);

        return res.status(200).json({
            success: true,
            message: `${sr_ids.length} জন SR টিমে যোগ করা হয়েছে।`
        });
    } catch (error) {
        console.error('❌ assignSRToTeam Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY TEAM (Manager) — নিজের টিম ও SR তালিকা
// GET /api/teams/my
// ============================================================
const getMyTeam = async (req, res) => {
    try {
        const managerId = req.user.id;

        const teamResult = await query(`
            SELECT t.*,
                   m.name_bn AS manager_name_bn, m.employee_code AS manager_code
            FROM teams t
            LEFT JOIN users m ON m.id = t.manager_id
            WHERE t.manager_id = $1 AND t.is_active = true
        `, [managerId]);

        if (teamResult.rows.length === 0) {
            return res.status(200).json({
                success: true,
                data: { team: null, members: [] }
            });
        }

        const team = teamResult.rows[0];

        const srResult = await query(`
            SELECT
                id, name_bn, name_en, employee_code,
                phone, status, monthly_target,
                profile_photo, basic_salary, outstanding_dues
            FROM users
            WHERE team_id = $1 AND role = 'worker'
            ORDER BY name_bn
        `, [team.id]);

        return res.status(200).json({
            success: true,
            data: { team, members: srResult.rows }
        });
    } catch (error) {
        console.error('❌ getMyTeam Error:', error.message);
        return res.status(500).json({ success: false, message: 'টিম তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SET SR TARGET (Manager) — নিজের টিমের SR-এর টার্গেট সেট
// PATCH /api/teams/sr/:srId/target
// ============================================================
const setSRTarget = async (req, res) => {
    try {
        const { srId } = req.params;
        const { monthly_target } = req.body;
        const managerId = req.user.id;

        if (monthly_target === undefined || isNaN(monthly_target) || monthly_target < 0) {
            return res.status(400).json({ success: false, message: 'বৈধ টার্গেট পরিমাণ দিন।' });
        }

        // SR ম্যানেজারের টিমে আছে কিনা চেক
        const srCheck = await query(`
            SELECT u.id, u.name_bn, u.team_id
            FROM users u
            JOIN teams t ON t.id = u.team_id
            WHERE u.id = $1 AND u.role = 'worker' AND t.manager_id = $2
        `, [srId, managerId]);

        if (srCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'এই SR আপনার টিমে নেই।'
            });
        }

        const result = await query(`
            UPDATE users SET monthly_target = $1
            WHERE id = $2
            RETURNING id, name_bn, employee_code, monthly_target
        `, [monthly_target, srId]);

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'SET_SR_TARGET', 'users', $2, $3)`,
            [managerId, srId, JSON.stringify({ monthly_target })]
        );

        return res.status(200).json({
            success: true,
            message: `${result.rows[0].name_bn}-এর টার্গেট সেট হয়েছে।`,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ setSRTarget Error:', error.message);
        return res.status(500).json({ success: false, message: 'টার্গেট সেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MANAGERS WITHOUT TEAM (Admin) — টিমহীন ম্যানেজার তালিকা
// GET /api/teams/available-managers
// ============================================================
const getAvailableManagers = async (req, res) => {
    try {
        const result = await query(`
            SELECT u.id, u.name_bn, u.name_en, u.employee_code, u.phone
            FROM users u
            LEFT JOIN teams t ON t.manager_id = u.id
            WHERE u.role = 'manager'
              AND u.status = 'active'
              AND t.id IS NULL
            ORDER BY u.name_bn
        `);

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ getAvailableManagers Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET UNASSIGNED SRs (Admin) — টিমহীন SR তালিকা
// GET /api/teams/unassigned-srs
// ============================================================
const getUnassignedSRs = async (req, res) => {
    try {
        const result = await query(`
            SELECT id, name_bn, employee_code, phone
            FROM users
            WHERE role = 'worker'
              AND status = 'active'
              AND (team_id IS NULL)
            ORDER BY name_bn
        `);

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ getUnassignedSRs Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getTeams,
    getTeam,
    createTeam,
    updateTeam,
    setTeamTarget,
    assignSRToTeam,
    getMyTeam,
    setSRTarget,
    getAvailableManagers,
    getUnassignedSRs
};
