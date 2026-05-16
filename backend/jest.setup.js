/**
 * jest.setup.js
 * সব টেস্টের আগে এই env variables আপনাআপনি set হবে
 * ফলে .env ফাইল ছাড়াও টেস্ট চলবে
 */

process.env.NODE_ENV = 'test';

// JWT secrets — validateEnv minimum 32 char চায়
process.env.JWT_ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'test_access_secret_must_be_32chars_long!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_must_be_32chars_long!';
process.env.JWT_PORTAL_SECRET  = process.env.JWT_PORTAL_SECRET  || 'test_portal_secret_must_be_32chars_long!!';

// ENCRYPTION_KEY — validateEnv minimum 64 char চায় (32 bytes hex)
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ||
    'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

// DB — integration test-এ real DB লাগে, unit test-এ লাগে না
process.env.DB_HOST     = process.env.DB_HOST     || 'localhost';
process.env.DB_NAME     = process.env.DB_NAME     || 'postgres';
process.env.DB_USER     = process.env.DB_USER     || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
