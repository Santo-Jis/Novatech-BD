// backend/src/middlewares/chatRateLimit.js
//
// চ্যাট ধাপ ২ (Foundation) — চ্যাট-সেন্ড এন্ডপয়েন্টে rate limiting।
//
// package.json-এ express-rate-limit + rate-limit-redis + redis — তিনটাই আগে
// থেকেই dependency ছিল, কিন্তু কোথাও wire করা ছিল না (শুধু চ্যাটে না, পুরো
// অ্যাপেই কোনো রুটে rate-limit বসানো নেই)।
//
// config/redis.js-এর getRedisClient() রিইউজ করা হচ্ছে — কিন্তু ওটা REDIS_URL
// না থাকলে একটা ছোট্ট {set,get,del} in-memory fallback অবজেক্ট ফেরত দেয়
// (isMemoryFallback: true), যেটাতে rate-limit-redis-এর দরকারি sendCommand()
// নেই। তাই real Redis detect করে তখনই RedisStore ব্যবহার করা হচ্ছে, নাহলে
// express-rate-limit-এর নিজস্ব ডিফল্ট in-memory store-এই পড়ে থাকছে (single-
// instance-এ সেটাও কাজ চালানোর মতো)।
//
// fail-open: rate-limiter বসাতে গিয়ে কোনো এরর হলে request পাস করে দেওয়া হয় —
// রেট-লিমিট ভাঙা কাস্টমার-স্টাফ মেসেজিং বন্ধ করে দেওয়ার চেয়ে অনেক কম ক্ষতিকর।
//
// ⚠️ এটা শুধু আমাদের নিজস্ব notify()/voice-upload এন্ডপয়েন্টে সুরক্ষা দেয়।
// আসল মেসেজ ডেলিভারি ফ্রন্টএন্ড থেকে সরাসরি Firebase RTDB-তে যায় (এই
// ব্যাকএন্ডকে বাইপাস করে) — সেটার নিজস্ব abuse-protection দরকার হলে সেটা
// Firebase Security Rules/App Check দিয়ে আলাদাভাবে করতে হবে, এই মিডলওয়্যার
// সেই স্তর পর্যন্ত পৌঁছায় না।

const rateLimit = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const { getRedisClient } = require('../config/redis')
const logger = require('../config/logger')

let limiterPromise = null

const buildLimiter = async () => {
  const client = await getRedisClient()
  const hasRealRedis = client && !client.isMemoryFallback && typeof client.sendCommand === 'function'

  return rateLimit({
    windowMs: 60 * 1000, // ১ মিনিট
    max: 20,             // প্রতি ইউজার/মিনিটে ২০টা — স্বাভাবিক ব্যবহারে যথেষ্ট, স্ক্রিপ্টেড স্প্যাম ঠেকাতে যথেষ্ট কম
    standardHeaders: true,
    legacyHeaders: false,
    // staff → req.user.id, customer portal → req.portalUser.person_id, দুটোই না থাকলে IP
    keyGenerator: (req) => String(req.user?.id || req.portalUser?.person_id || req.ip),
    message: { success: false, message: '⚠️ অনেক বেশি মেসেজ পাঠানো হয়েছে, একটু অপেক্ষা করে আবার চেষ্টা করুন।' },
    ...(hasRealRedis
      ? { store: new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }) }
      : {}),
  })
}

// একবারই তৈরি হবে (module-level cache) — প্রতি রিকোয়েস্টে নতুন limiter/store বানানো হচ্ছে না
const chatSendRateLimit = async (req, res, next) => {
  try {
    if (!limiterPromise) limiterPromise = buildLimiter()
    const limiter = await limiterPromise
    return limiter(req, res, next)
  } catch (e) {
    logger.error('[chatRateLimit] init/apply ব্যর্থ, request পাস করে দেওয়া হলো:', e.message)
    return next()
  }
}

module.exports = { chatSendRateLimit }
