const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET ROUTES
// GET /api/routes
// ============================================================

const getRoutes = async (req, res) => {
    try {
        let conditions = ['r.is_active = true'];
        let params     = [];
        let paramCount = 0;

        // Manager শুধু নিজের রুট
        if (req.teamFilter) {
            paramCount++;
            conditions.push(`r.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        const result = await query(
            `SELECT r.*,
                    m.name_bn AS manager_name,
                    COUNT(DISTINCT ca.worker_id)   AS worker_count,
                    COUNT(DISTINCT c.id)            AS customer_count,
                    lv.last_visited_at,
                    lv.last_visited_by_name
             FROM routes r
             LEFT JOIN users m                  ON r.manager_id = m.id
             LEFT JOIN customer_assignments ca  ON r.id = ca.route_id AND ca.is_active = true
             LEFT JOIN customers c              ON c.route_id = r.id AND c.is_active = true
             LEFT JOIN LATERAL (
                 SELECT v.created_at AS last_visited_at,
                        u.name_bn   AS last_visited_by_name
                 FROM visits v
                 JOIN users u ON v.worker_id = u.id
                 WHERE v.route_id = r.id
                 ORDER BY v.created_at DESC
                 LIMIT 1
             ) lv ON true
             WHERE ${conditions.join(' AND ')}
             GROUP BY r.id, m.name_bn, lv.last_visited_at, lv.last_visited_by_name
             ORDER BY r.created_at DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get Routes Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE ROUTE
// POST /api/routes
// ============================================================

const createRoute = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'রুটের নাম দিন।'
            });
        }

        const managerId = req.user.role === 'admin'
            ? (req.body.manager_id || req.user.id)
            : req.user.id;

        const result = await query(
            `INSERT INTO routes (name, manager_id, description)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [name, managerId, description || null]
        );

        return res.status(201).json({
            success: true,
            message: 'রুট তৈরি সফল।',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Create Route Error:', error.message);
        return res.status(500).json({ success: false, message: 'রুট তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE ROUTE
// PUT /api/routes/:id
// ============================================================

const updateRoute = async (req, res) => {
    try {
        const { name, description, is_active, status } = req.body;

        const result = await query(
            `UPDATE routes
             SET name        = COALESCE($1, name),
                 description = COALESCE($2, description),
                 is_active   = COALESCE($3, is_active),
                 status      = COALESCE($4, status),
                 updated_at  = NOW()
             WHERE id = $5
             RETURNING *`,
            [name, description, is_active, status, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রুট পাওয়া যায়নি।' });
        }

        return res.status(200).json({
            success: true,
            message: 'রুট আপডেট সফল।',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Update Route Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE ROUTE
// DELETE /api/routes/:id
// ============================================================

const deleteRoute = async (req, res) => {
    try {
        await query(
            'UPDATE routes SET is_active = false, updated_at = NOW() WHERE id = $1',
            [req.params.id]
        );

        return res.status(200).json({ success: true, message: 'রুট মুছে দেওয়া হয়েছে।' });

    } catch (error) {
        logger.error('❌ Delete Route Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ASSIGN WORKER TO ROUTE
// POST /api/routes/:id/assign
// ============================================================

const assignWorkerToRoute = async (req, res) => {
    try {
        const { worker_id } = req.body;
        const routeId       = req.params.id;

        if (!worker_id) {
            return res.status(400).json({
                success: false,
                message: 'কর্মচারী নির্বাচন করুন।'
            });
        }

        const worker = await query(
            "SELECT id, name_bn FROM users WHERE id = $1 AND role = 'worker' AND status = 'active'",
            [worker_id]
        );

        if (worker.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'SR পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO customer_assignments (worker_id, route_id, assigned_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (worker_id, route_id) DO UPDATE
             SET is_active = true, assigned_at = NOW()`,
            [worker_id, routeId, req.user.id]
        );

        const customers = await query(
            'SELECT id FROM customers WHERE route_id = $1 AND is_active = true',
            [routeId]
        );

        for (const customer of customers.rows) {
            await query(
                `INSERT INTO customer_assignments (worker_id, customer_id, route_id, assigned_by)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (worker_id, customer_id) DO UPDATE
                 SET is_active = true, assigned_at = NOW()`,
                [worker_id, customer.id, routeId, req.user.id]
            );
        }

        return res.status(200).json({
            success: true,
            message: `${worker.rows[0].name_bn} কে রুটে অ্যাসাইন করা হয়েছে।`
        });

    } catch (error) {
        logger.error('❌ Assign Worker Error:', error.message);
        return res.status(500).json({ success: false, message: 'অ্যাসাইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ROUTE WORKERS
// GET /api/routes/:id/workers
// ============================================================

const getRouteWorkers = async (req, res) => {
    try {
        const result = await query(
            `SELECT u.id, u.name_bn, u.employee_code, u.phone, u.profile_photo,
                    ca.assigned_at
             FROM customer_assignments ca
             JOIN users u ON ca.worker_id = u.id
             WHERE ca.route_id = $1 AND ca.is_active = true
               AND ca.customer_id IS NULL
             ORDER BY ca.assigned_at DESC`,
            [req.params.id]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get Route Workers Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ROUTE CUSTOMERS (with visit_order)
// GET /api/routes/:id/customers
// Admin/Manager → route-র কাস্টমার তালিকা + তাদের visit_order
// ============================================================

const getRouteCustomers = async (req, res) => {
    try {
        const routeId = req.params.id;

        // Manager হলে নিজের route কিনা চেক
        if (req.teamFilter) {
            const routeCheck = await query(
                'SELECT id FROM routes WHERE id = $1 AND manager_id = $2 AND is_active = true',
                [routeId, req.teamFilter]
            );
            if (routeCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'এই রুটে অ্যাক্সেস নেই।' });
            }
        }

        const result = await query(
            `SELECT
                c.id,
                c.shop_name,
                c.owner_name,
                c.whatsapp,
                c.latitude,
                c.longitude,
                ca.visit_order
             FROM customers c
             LEFT JOIN customer_assignments ca
               ON ca.customer_id = c.id
               AND ca.route_id   = $1
               AND ca.is_active  = true
               AND ca.worker_id IS NULL
             WHERE c.route_id  = $1
               AND c.is_active = true
             ORDER BY ca.visit_order ASC NULLS LAST, c.shop_name ASC`,
            [routeId]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get Route Customers Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET LIVE ROUTE STATUS — আজকে কে কোন route-এ আছে
// GET /api/routes/live-status
// Manager: নিজের team-এর SR; Admin: সবাই
// ============================================================

const getLiveRouteStatus = async (req, res) => {
    try {
        let conditions = ['r.is_active = true'];
        let params     = [];
        let paramCount = 0;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`r.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        const result = await query(
            `SELECT
                r.id          AS route_id,
                r.name        AS route_name,
                u.id          AS worker_id,
                u.name_bn     AS worker_name,
                u.employee_code,
                u.profile_photo,
                -- আজকের visit সংখ্যা
                COUNT(DISTINCT v.id) FILTER (
                    WHERE v.created_at::date = CURRENT_DATE
                ) AS visits_today,
                -- রুটের মোট কাস্টমার
                COUNT(DISTINCT c.id)  AS total_customers,
                -- SR-এর সর্বশেষ GPS সময়
                MAX(gl.created_at)    AS last_seen_at
             FROM routes r
             JOIN customer_assignments ca_route
               ON ca_route.route_id   = r.id
               AND ca_route.is_active  = true
               AND ca_route.customer_id IS NULL
             JOIN users u ON ca_route.worker_id = u.id AND u.status = 'active'
             LEFT JOIN customers c
               ON c.route_id = r.id AND c.is_active = true
             LEFT JOIN visits v
               ON v.worker_id = u.id AND v.route_id = r.id
             LEFT JOIN gps_logs gl
               ON gl.user_id = u.id
             WHERE ${conditions.join(' AND ')}
             GROUP BY r.id, r.name, u.id, u.name_bn, u.employee_code, u.profile_photo
             ORDER BY r.name, u.name_bn`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Live Route Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    assignWorkerToRoute,
    getRouteWorkers,
    getRouteCustomers,
    getLiveRouteStatus,
};
