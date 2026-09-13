// backend/src/config/logger.js
// ─────────────────────────────────────────────────────────────
// Zero-dependency structured logger.
//
// Development  → human-readable রঙিন output (console এর মতো)
// Production   → JSON lines — Render / Datadog / CloudWatch সব
//               log aggregator parse করতে পারে।
//
// Usage:
//   const logger = require('../config/logger')
//   logger.info('Settlement approved', { settlementId: 42, workerId: 7 })
//   logger.error('DB query failed', { err, query: 'SELECT ...' })
//
// controller-এ:
//   catch (error) {
//     logger.error('❌ Settlement Error', { err: error, workerId: req.user?.id })
//     res.status(500).json({ success: false, message: '...' })
//   }
// ─────────────────────────────────────────────────────────────

'use strict';

const { Sentry, isEnabled } = require('./sentry');

const IS_PROD = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────
// logger.error(...) কল হওয়া মানেই এখানে Sentry-তে পাঠানো — কারণ
// controller-গুলো error next(err) দিয়ে propagate করে না, নিজেই
// catch করে এখানে লগ করে (দেখুন উপরের usage কমেন্ট)। তাই এটাই
// আসল, সম্পূর্ণ capture point — Express middleware না।
// SENTRY_DSN সেট না থাকলে isEnabled() false, তখন এটা no-op।
// ─────────────────────────────────────────────────────────────
function reportToSentry(msg, meta) {
  if (!isEnabled()) return;
  try {
    Sentry.withScope((scope) => {
      // multi-tenant SaaS — কোন tenant/user-এ error হচ্ছে সেটা filter করার জন্য
      if (meta?.tenantId)  scope.setTag('tenant_id', String(meta.tenantId));
      if (meta?.workerId)  scope.setTag('worker_id', String(meta.workerId));
      if (meta?.userId)    scope.setTag('user_id', String(meta.userId));
      scope.setExtra('log_message', msg);

      if (meta?.err instanceof Error) {
        Sentry.captureException(meta.err);
      } else {
        Sentry.captureMessage(msg, 'error');
      }
    });
  } catch (_sentryErr) {
    // Sentry নিজে fail করলেও যেন মূল app-এর error response আটকে না যায়
  }
}

// ANSI color codes — dev only
const C = {
  reset:  '\x1b[0m',
  grey:   '\x1b[90m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  bold:   '\x1b[1m',
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

// Render / cloud platforms inject a request ID header.
// Pass it in meta as { reqId } for correlation.
function serialize(err) {
  if (!err) return undefined;
  return {
    message: err.message,
    name:    err.name,
    code:    err.code,       // PostgreSQL error codes (23505 etc.)
    stack:   IS_PROD ? undefined : err.stack,  // stack শুধু dev-এ
  };
}

function write(level, msg, meta = {}) {
  const { err, ...rest } = meta;
  const ts = new Date().toISOString();

  if (IS_PROD) {
    // ── JSON line ──────────────────────────────────────────
    const line = JSON.stringify({
      ts,
      level,
      msg,
      ...(err ? { err: serialize(err) } : {}),
      ...rest,
    });
    // error → stderr, বাকি → stdout
    if (level === 'error') process.stderr.write(line + '\n');
    else                   process.stdout.write(line + '\n');
  } else {
    // ── Human-readable (dev) ───────────────────────────────
    const color = level === 'error' ? C.red
                : level === 'warn'  ? C.yellow
                : level === 'info'  ? C.green
                : C.grey;

    const metaStr = Object.keys(rest).length
      ? ' ' + C.grey + JSON.stringify(rest) + C.reset
      : '';
    const errStr = err
      ? '\n  ' + C.red + err.stack + C.reset
      : '';

    process.stdout.write(
      `${C.grey}${ts}${C.reset} ${color}${C.bold}${level.toUpperCase().padEnd(5)}${C.reset} ${msg}${metaStr}${errStr}\n`
    );
  }
}

const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info:  (msg, meta) => write('info',  msg, meta),
  warn:  (msg, meta) => write('warn',  msg, meta),
  error: (msg, meta) => {
    write('error', msg, meta);
    reportToSentry(msg, meta);
  },

  // Express morgan-compatible stream — morgan('combined', { stream: logger.stream })
  stream: {
    write: (message) => write('info', message.trim()),
  },
};

module.exports = logger;
