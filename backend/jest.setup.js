/**
 * jest.setup.js
 * সব টেস্টের আগে এই env variables আপনাআপনি set হবে
 * ফলে .env ফাইল ছাড়াও টেস্ট চলবে
 */

process.env.JWT_ACCESS_SECRET  = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.NODE_ENV           = 'test';

// DB mock-এর জন্য dummy URL (real connection হবে না)
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
