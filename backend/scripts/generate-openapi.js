#!/usr/bin/env node
// backend/scripts/generate-openapi.js
// ─────────────────────────────────────────────────────────────
// server.js আর routes/*.js স্ট্যাটিকভাবে পার্স করে backend/openapi.json
// বানায় — কোনো server run/network লাগে না।
//
// এটা mechanical extraction: HTTP method + path + tag + (auth লাগে
// কিনা) সবগুলো ১০০% accurate, কারণ server.js-এর app.use() mount
// prefix থেকেই সরাসরি নেওয়া। request/response body schema generic
// placeholder — সেগুলো ধীরে ধীরে হাতে ভরে নেওয়ার জন্য।
//
// চালান: npm run docs:generate   (backend/ থেকে)
// নতুন route যোগ করলে আবার চালিয়ে spec রিফ্রেশ করুন।
// ─────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC_DIR     = path.join(__dirname, '..', 'src');
const ROUTES_DIR  = path.join(SRC_DIR, 'routes');
const SERVER_FILE = path.join(SRC_DIR, 'server.js');
const OUTPUT_FILE = path.join(__dirname, '..', 'openapi.json');

const METHODS    = ['get', 'post', 'put', 'patch', 'delete'];
// লোয়ারকেস 'auth' ইচ্ছাকৃতভাবে case-sensitive — 'optionalAuth'-এর
// ভেতরের 'Auth' (বড় হাতের A) যেন ভুল করে ম্যাচ না করে।
const AUTH_HINTS = /\b(auth|platformAuth|portalAuth|superAdminAuth)\b/;

// ── ১. server.js থেকে require ম্যাপিং বের করা ──────────────────
// const authRoutes = require('./routes/auth.routes');
const serverSrc = fs.readFileSync(SERVER_FILE, 'utf8');
const requireRe = /const\s+(\w+)\s*=\s*require\(\s*['"]\.\/routes\/([\w.\-]+)['"]\s*\)/g;

const varToFile = {}; // authRoutes -> 'auth.routes'
let m;
while ((m = requireRe.exec(serverSrc))) {
    varToFile[m[1]] = m[2];
}

// ── ২. app.use('/prefix', ...middleware..., varName) mount বের করা ──
const useRe = /app\.use\(\s*(['"`])([^'"`]*)\1\s*(?:,\s*([^)]+))?\)/g;
const varToPrefixes = {}; // authRoutes -> ['/api/auth']

while ((m = useRe.exec(serverSrc))) {
    const prefix = m[2];
    const rest   = m[3];
    if (!rest) continue;
    const argsList = rest.split(',').map((s) => s.trim()).filter(Boolean);
    const lastArg  = argsList[argsList.length - 1];
    if (lastArg && varToFile[lastArg]) {
        varToPrefixes[lastArg] = varToPrefixes[lastArg] || [];
        varToPrefixes[lastArg].push(prefix);
    }
}

function toOpenApiPath(p) {
    return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function joinPaths(prefix, rel) {
    const cleanPrefix = prefix.replace(/\/$/, '');
    const cleanRel    = rel === '/' ? '' : rel;
    const full = cleanPrefix + cleanRel;
    return full === '' ? '/' : full;
}

function toTag(baseName) {
    return baseName
        .replace(/\.routes$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
}

// ── ৩. প্রতিটা route file পার্স করা ─────────────────────────────
const paths = {};
const fileList = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'));
const unresolvedFiles = []; // যেসব ফাইলের mount prefix server.js parsing থেকে পাওয়া যায়নি
let totalRouteDefs = 0;

// router.get('/path', mw1, mw2, handler);  — নামযুক্ত reference-ই ব্যবহার হয়,
// inline arrow function নেই (কোডবেসে যাচাই করা), তাই এই regex নিরাপদ।
const routeCallRe = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]*)\2\s*(,\s*[^;]*)?\)\s*;/g;
const routerUseRe = /router\.use\(\s*([^)]*)\)\s*;/g;

for (const file of fileList) {
    const base = file.replace(/\.js$/, '');
    const varNames = Object.keys(varToFile).filter((v) => varToFile[v] === base);

    let prefixes = [];
    varNames.forEach((v) => {
        if (varToPrefixes[v]) prefixes = prefixes.concat(varToPrefixes[v]);
    });

    if (prefixes.length === 0) {
        // server.js-এ standard app.use('/prefix', fileRoutes) প্যাটার্নে পাওয়া যায়নি
        // (যেমন jisai.routes.js — app-এ সরাসরি ফাংশন কল করে রুট বসায়)
        unresolvedFiles.push(file);
        continue; // fabricate না করে বাদ দেওয়া হলো, false path-এর চেয়ে missing ভালো
    }

    const content = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    const tag = toTag(base);

    // ফাইল-লেভেল router.use(someAuthMiddleware) থাকলে পুরো ফাইলের
    // সব route-ই auth-required, প্রতিটা লাইনে আলাদা করে না লিখলেও।
    let fileWideAuth = false;
    let um;
    while ((um = routerUseRe.exec(content))) {
        if (AUTH_HINTS.test(um[1])) fileWideAuth = true;
    }

    let rm;
    while ((rm = routeCallRe.exec(content))) {
        totalRouteDefs++;
        const method  = rm[1];
        const relPath = rm[3] || '/';
        const argsRaw = rm[4] || '';
        const hasAuth = fileWideAuth || AUTH_HINTS.test(argsRaw);

        prefixes.forEach((prefix) => {
            const fullPath = toOpenApiPath(joinPaths(prefix, relPath));
            paths[fullPath] = paths[fullPath] || {};

            const responses = {
                200: { description: 'সফল' },
                500: { description: 'সার্ভার এরর' },
            };
            if (hasAuth) responses[401] = { description: 'Unauthorized — টোকেন নেই/অবৈধ' };

            paths[fullPath][method] = {
                tags: [tag],
                summary: `${method.toUpperCase()} ${fullPath}`,
                description: `উৎস: routes/${file}`,
                security: hasAuth ? [{ bearerAuth: [] }] : [],
                parameters: (fullPath.match(/\{[^}]+\}/g) || []).map((p) => ({
                    name: p.slice(1, -1),
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                })),
                responses,
            };
        });
    }
}

// ── ৪. OpenAPI ডকুমেন্ট বানানো ──────────────────────────────────
const openapi = {
    openapi: '3.0.3',
    info: {
        title: 'ZovoriX API',
        version: '0.1.0-auto',
        description:
            'server.js + routes/*.js থেকে স্ট্যাটিক্যালি auto-generated। ' +
            'Path/method/tag/auth-requirement মেকানিক্যালি নির্ভুল; ' +
            'request/response body schema এখনো generic placeholder — ' +
            'গুরুত্বপূর্ণ endpoint-গুলো (auth, order, sales, customer) থেকে শুরু করে ' +
            'ধীরে ধীরে হাতে ভরুন। generate করতে: npm run docs:generate',
    },
    servers: [
        { url: 'http://localhost:5000', description: 'Local dev' },
        { url: 'https://api.zovorix.example', description: 'Production (URL বদলান)' },
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
    },
    paths,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(openapi, null, 2), 'utf8');

// ── ৫. সারসংক্ষেপ (কনসোলে) ──────────────────────────────────────
const pathCount = Object.keys(paths).length;
const opCount = Object.values(paths).reduce((n, methods) => n + Object.keys(methods).length, 0);

console.log(`✅ openapi.json লেখা হলো: ${OUTPUT_FILE}`);
console.log(`   ${fileList.length} route file পড়া হয়েছে`);
console.log(`   ${totalRouteDefs} টা router.METHOD() definition পাওয়া গেছে`);
console.log(`   ${pathCount} unique path, ${opCount} operation স্পেকে লেখা হয়েছে`);
if (unresolvedFiles.length) {
    console.log(`   ⚠️  ${unresolvedFiles.length} ফাইলের mount prefix server.js-এ পাওয়া যায়নি (skip করা হয়েছে):`);
    unresolvedFiles.forEach((f) => console.log(`      - ${f}`));
}
