/**
 * jest.config.js
 * NovaTechBD Backend Test Configuration
 */

module.exports = {
    // টেস্ট environment
    testEnvironment: 'node',

    // কোন ফাইলগুলো টেস্ট ফাইল
    testMatch: [
        '**/src/tests/**/*.test.js'
    ],

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

    // টেস্ট timeout (milliseconds)
    testTimeout: 10000,

    // বাংলা output সঠিক দেখাতে
    verbose: true,

    // .env ছাড়াই টেস্ট চালানোর জন্য env setup
    setupFiles: ['./jest.setup.js']
};
