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
        // Manager শুধু নিজের (manager_id = নিজের id) route delete করতে পারবে
        const isManager = req.user.role === 'manager';
        const params    = [req.params.id];
        let whereExtra  = '';

        if (isManager) {
            whereExtra = ' AND manager_id = $2';
            params.push(req.user.id);
        }

        const result = await query(
            `UPDATE routes SET is_active = false, updated_at = NOW()
             WHERE id = $1${whereExtra}
             RETURNING id`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'এই রুট মুছতে পারবেন না। এটি আপনার তৈরি নয় বা পাওয়া যায়নি।'
            });
        }

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

// ============================================================
// GET PENDING ROUTES
// GET /api/routes/pending/list
// Admin: pending অনুমোদনের অপেক্ষায় থাকা রুট তালিকা
// ============================================================

const getPendingRoutes = async (req, res) => {
    try {
        const result = await query(
            `SELECT r.id, r.name, r.description, r.status,
                    r.created_at  AS requested_at,
                    u.name_bn     AS requested_by_name
             FROM routes r
             LEFT JOIN users u ON u.id = r.manager_id
             WHERE (r.status = 'pending' OR r.status IS NULL)
               AND r.is_active = true
             ORDER BY r.created_at DESC`
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get Pending Routes Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// REQUEST A NEW ROUTE (Worker/SR)
// POST /api/routes/request
// SR নতুন রুটের জন্য Manager-এর কাছে request পাঠাবে
// ============================================================

const requestRoute = async (req, res) => {
    try {
        const { route_name, description } = req.body;

        if (!route_name || !route_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'রুটের নাম দিন।'
            });
        }

        const result = await query(
            `INSERT INTO route_requests (route_name, description, requested_by, status)
             VALUES ($1, $2, $3, 'pending')
             RETURNING *`,
            [route_name.trim(), description?.trim() || null, req.user.id]
        );

        return res.status(201).json({
            success: true,
            message: 'রুট request পাঠানো হয়েছে। Manager অনুমোদন করলে দেখা যাবে।',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Request Route Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY ROUTE REQUESTS (Worker/SR)
// GET /api/routes/my-requests
// SR নিজের সব route request-এর status দেখবে
// ============================================================

const getMyRouteRequests = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, route_name AS name, description, status,
                    reviewed_by_name, review_note, created_at AS requested_at
             FROM route_requests
             WHERE requested_by = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get My Route Requests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ROUTES FOR WORKER (SR)
// GET /api/routes/worker-list
// SR-এর assigned রুটগুলো দেখাবে (canManage bypass)
// ============================================================

const getWorkerRoutes = async (req, res) => {
    try {
        // Worker/SR এর manager_id বের করো
        const workerInfo = await query(
            `SELECT manager_id, team_id FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (!workerInfo.rows.length || !workerInfo.rows[0].manager_id) {
            return res.status(200).json({
                success: true,
                data: [],
                message: 'আপনাকে এখনো কোনো টিমে assign করা হয়নি।'
            });
        }

        const managerId = workerInfo.rows[0].manager_id;

        // শুধু নিজের Manager-এর routes দেখাবে
        const result = await query(
            `SELECT r.*,
                    m.name_bn AS manager_name,
                    COUNT(DISTINCT c.id) AS customer_count,
                    lv.last_visited_at,
                    lv.last_visited_by_name
             FROM routes r
             LEFT JOIN users m ON r.manager_id = m.id
             LEFT JOIN customers c ON c.route_id = r.id AND c.is_active = true
             LEFT JOIN LATERAL (
                 SELECT v.created_at AS last_visited_at,
                        u.name_bn   AS last_visited_by_name
                 FROM visits v
                 JOIN users u ON v.worker_id = u.id
                 WHERE v.route_id = r.id
                 ORDER BY v.created_at DESC
                 LIMIT 1
             ) lv ON true
             WHERE r.is_active = true
               AND r.manager_id = $1
             GROUP BY r.id, m.name_bn, lv.last_visited_at, lv.last_visited_by_name
             ORDER BY r.created_at DESC`,
            [managerId]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Get Worker Routes Error:', error.message);
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
    getPendingRoutes,
    requestRoute,
    getMyRouteRequests,
    getWorkerRoutes,
};
