/**
 * jest.config.js
 * NovaTechBD Backend Test Configuration
 *
 * দুটো আলাদা project:
 *   unit        — DB ছাড়া, mock দিয়ে, সবসময় দ্রুত চলে
 *   integration — Real DB দরকার, CI-তে secrets লাগে
 */

module.exports = {
    // টেস্ট environment
    testEnvironment: 'node',

    // Coverage কোন ফাইলগুলো থেকে নেবে
    collectCoverageFrom: [
        'src/services/**/*.js',
        'src/middlewares/**/*.js',
        'src/controllers/**/*.js',
        '!src/**/*.test.js'
    ],

    // Coverage report format
    coverageReporters: ['text', 'lcov', 'html'],

    // প্রতিটি টেস্টের আগে mock reset
    clearMocks: true,
    resetMocks: false,
    restoreMocks: false,

    // টেস্ট timeout — integration test-এ DB round-trip আছে তাই ২০s
    testTimeout: 20000,

    // বাংলা output সঠিক দেখাতে
    verbose: true,

    // .env ছাড়াই টেস্ট চালানোর জন্য env setup
    setupFiles: ['./jest.setup.js'],

    // ─── Test path patterns ───────────────────────────────────
    // npm run test:unit       → integration folder বাদ দেয়
    // npm run test:integration → শুধু integration folder
    // npm test                → সব চালায়
    testMatch: [
        '**/src/tests/**/*.test.js'
    ],

    // integration test-এ server.js-এর DB pool (auth.integration → testSetup → server → db.js)
    // pool.end() না করায় TCPWRAP open handle থেকে যায়।
    // forceExit: true — সব test শেষে Jest process জোর করে বন্ধ করে।
    forceExit: true,
    detectOpenHandles: true,

    // integration test গুলো sequential চালাও — Supabase free tier-এ
    // একসাথে অনেক connection হলে "max clients reached" error আসে।
    runInBand: true,
};
