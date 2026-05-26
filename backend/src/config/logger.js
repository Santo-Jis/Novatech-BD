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

const IS_PROD = process.env.NODE_ENV === 'production';

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
  error: (msg, meta) => write('error', msg, meta),

  // Express morgan-compatible stream — morgan('combined', { stream: logger.stream })
  stream: {
    write: (message) => write('info', message.trim()),
  },
};

module.exports = logger;
