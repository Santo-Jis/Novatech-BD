// ============================================================
// Role-Based Access Control Middleware
// NovaTechBD Management System
// ============================================================

// ============================================================
// ১. BASIC ROLE CHECK
// নির্দিষ্ট রোলগুলো অ্যাক্সেস করতে পারবে
// ============================================================

const allowRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'লগইন করুন।'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `এই কাজের অনুমতি নেই। প্রয়োজনীয় রোল: ${roles.join(', ')}`
            });
        }

        next();
    };
};

// ============================================================
// ২. রোল গ্রুপ (সুবিধার জন্য)
// ============================================================

const ROLES = {
    ADMIN:       'admin',
    MANAGER:     'manager',
    SUPERVISOR:  'supervisor',
    ASM:         'asm',
    RSM:         'rsm',
    ACCOUNTANT:  'accountant',
    WORKER:      'worker'
};

// রোল গ্রুপ
const ROLE_GROUPS = {
    // সব ম্যানেজমেন্ট রোল
    MANAGEMENT: ['admin', 'manager', 'supervisor', 'asm', 'rsm'],

    // অর্ডার অনুমোদন করতে পারে
    CAN_APPROVE_ORDER: ['admin', 'manager', 'supervisor'],

    // Settlement অনুমোদন করতে পারে
    CAN_APPROVE_SETTLEMENT: ['admin', 'manager', 'supervisor'],

    // কর্মচারী তৈরি করতে পারে
    CAN_CREATE_EMPLOYEE: ['admin', 'manager'],

    // রুট তৈরি করতে পারে
    CAN_CREATE_ROUTE: ['admin', 'manager'],

    // কাস্টমার তৈরি করতে পারে
    CAN_CREATE_CUSTOMER: ['admin', 'manager', 'supervisor', 'worker'],

    // আর্থিক রিপোর্ট দেখতে পারে
    CAN_VIEW_FINANCE: ['admin', 'manager', 'asm', 'rsm', 'accountant'],

    // সব টিমের ডাটা দেখতে পারে
    CAN_VIEW_ALL_TEAMS: ['admin', 'asm', 'rsm', 'accountant'],

    // শুধু Admin
    ADMIN_ONLY: ['admin']
};

// ============================================================
// ৩. TEAM ACCESS CHECK
// Manager/Supervisor শুধু নিজের টিম দেখতে পারবে
// Admin, ASM, RSM সব দেখতে পারবে
// ============================================================

const checkTeamAccess = async (req, res, next) => {
    const user = req.user;

    // Admin, ASM, RSM, Accountant সব দেখতে পারবে
    if (ROLE_GROUPS.CAN_VIEW_ALL_TEAMS.includes(user.role)) {
        req.teamFilter = null; // কোনো ফিল্টার নেই
        return next();
    }

    // Manager, Supervisor শুধু নিজের টিম
    if (['manager', 'supervisor'].includes(user.role)) {
        req.teamFilter = user.id; // manager_id = নিজের id
        return next();
    }

    // Worker শুধু নিজের ডাটা
    if (user.role === 'worker') {
        req.teamFilter = null; // worker সব routes দেখবে
        return next();
    }

    next();
};

// ============================================================
// ৪. SELF OR ADMIN CHECK
// নিজের ডাটা দেখতে পারবে, Admin সব দেখতে পারবে
// ============================================================

const selfOrAdmin = (req, res, next) => {
    const user      = req.user;
    const targetId  = req.params.id;

    // Admin সব দেখতে পারবে
    if (user.role === 'admin') return next();

    // নিজের ডাটা দেখতে পারবে
    if (user.id === targetId) return next();

    // Manager নিজের টিমের ডাটা দেখতে পারবে
    if (['manager', 'supervisor'].includes(user.role)) return next();

    return res.status(403).json({
        success: false,
        message: 'শুধু নিজের তথ্য দেখার অনুমতি আছে।'
    });
};

// ============================================================
// ৫. SPECIFIC PERMISSION MIDDLEWARES
// ============================================================

// কর্মচারী তৈরি
const canCreateEmployee = allowRoles(...ROLE_GROUPS.CAN_CREATE_EMPLOYEE);

// কর্মচারী অনুমোদন (শুধু Admin)
const canApproveEmployee = allowRoles(...ROLE_GROUPS.ADMIN_ONLY);

// কর্মচারী বরখাস্ত (শুধু Admin)
const canSuspendEmployee = allowRoles(...ROLE_GROUPS.ADMIN_ONLY);

// অর্ডার অনুমোদন
const canApproveOrder = allowRoles(...ROLE_GROUPS.CAN_APPROVE_ORDER);

// Settlement অনুমোদন
const canApproveSettlement = allowRoles(...ROLE_GROUPS.CAN_APPROVE_SETTLEMENT);

// রুট তৈরি
const canCreateRoute = allowRoles(...ROLE_GROUPS.CAN_CREATE_ROUTE);

// কাস্টমার তৈরি
const canCreateCustomer = allowRoles(...ROLE_GROUPS.CAN_CREATE_CUSTOMER);

// আর্থিক রিপোর্ট
const canViewFinance = allowRoles(...ROLE_GROUPS.CAN_VIEW_FINANCE);

// সিস্টেম সেটিংস (শুধু Admin)
const canManageSettings = allowRoles(...ROLE_GROUPS.ADMIN_ONLY);

// AI কনফিগ (শুধু Admin)
const canManageAI = allowRoles(...ROLE_GROUPS.ADMIN_ONLY);

// কমিশন সেটিংস (শুধু Admin)
const canManageCommission = allowRoles(...ROLE_GROUPS.ADMIN_ONLY);

// ম্যানেজমেন্ট রোল
const isManagement = allowRoles(...ROLE_GROUPS.MANAGEMENT);

// Worker (SR) রোল
const isWorker = allowRoles(ROLES.WORKER);

// Admin রোল
const isAdmin = allowRoles(ROLES.ADMIN);

// ============================================================
// ৬. WORKER SELF DATA CHECK
// Worker শুধু নিজের বিক্রয়, কমিশন, হাজিরা দেখতে পারবে
// অন্য Worker এর ডাটা দেখতে পারবে না
// ============================================================

const workerSelfOnly = (req, res, next) => {
    const user = req.user;

    // Admin, Manager সব দেখতে পারবে
    if (['admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'].includes(user.role)) {
        return next();
    }

    // Worker শুধু নিজের ডাটা
    if (user.role === 'worker') {
        // Query তে worker_id অটো সেট হবে
        req.workerId = user.id;
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'অ্যাক্সেস নেই।'
    });
};

module.exports = {
    // Basic
    allowRoles,
    ROLES,
    ROLE_GROUPS,

    // Team & Self
    checkTeamAccess,
    selfOrAdmin,
    workerSelfOnly,

    // Specific permissions
    canCreateEmployee,
    canApproveEmployee,
    canSuspendEmployee,
    canApproveOrder,
    canApproveSettlement,
    canCreateRoute,
    canCreateCustomer,
    canViewFinance,
    canManageSettings,
    canManageAI,
    canManageCommission,
    isManagement,
    isWorker,
    isAdmin
};
