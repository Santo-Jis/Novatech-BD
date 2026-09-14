// backend/src/services/videoMedia.service.js
// ✅ NEW (Redesign Phase ১.৬ — ভিডিও সাপোর্ট)
//
// chatMedia.service.js-এর uploadAudioToCloudinary-এর ঠিক একই মেকানিজম
// (Cloudinary-তে video/audio একই resource_type=video পাইপলাইন শেয়ার করে) —
// employee.service.js-এর uploadToCloudinary() এখানেও ইচ্ছাকৃতভাবে ধরিনি,
// সেই একই কারণে (image-only hardcoded, অনেক জায়গায় ব্যবহৃত, regression-ঝুঁকি)।
//
// ⚠️ গুরুত্বপূর্ণ সিদ্ধান্ত: ছবি/অডিওর মতোই পুরো ফাইল মেমরিতে বাফার করে
// base64-এ কনভার্ট করে পাঠানো হচ্ছে। এটা ছবির (≤৫MB) বা ভয়েস নোটের (≤৮MB)
// জন্য নিরাপদ, কিন্তু ভিডিওতে সহজেই সার্ভার মেমরিতে চাপ ফেলতে পারে — তাই
// এখানে ইচ্ছাকৃতভাবে কড়া সীমা (২০MB, ~২০-৩০ সেকেন্ড মোবাইল-কোয়ালিটি)।
// এর বেশি দরকার হলে backend প্রক্সি না করে ব্রাউজার থেকে সরাসরি Cloudinary-তে
// (unsigned preset দিয়ে) আপলোড করার আর্কিটেকচারে যেতে হবে।

const axios = require('axios')
const logger = require('../config/logger')

const MAX_VIDEO_BYTES = 20 * 1024 * 1024

async function uploadVideoToCloudinary(fileBuffer, folder, filename, mimetype = 'video/mp4') {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET

    if (!cloudName) {
      logger.warn('⚠️ Cloudinary config নেই। ভিডিও আপলোড হবে না।')
      return null
    }
    if (fileBuffer.length > MAX_VIDEO_BYTES) {
      throw new Error('ভিডিও খুব বড় (সর্বোচ্চ ২০MB)')
    }

    const safeType = mimetype && mimetype.startsWith('video/') ? mimetype : 'video/mp4'
    const base64 = fileBuffer.toString('base64')
    const dataUri = `data:${safeType};base64,${base64}`

    const formData = new FormData()
    formData.append('file', dataUri)
    formData.append('upload_preset', uploadPreset)
    formData.append('folder', `zovorix/${folder}`)
    formData.append('public_id', filename)
    formData.append('resource_type', 'video')

    // timeout ৬০s — audio/image-এর ৩০s থেকে বাড়ানো, ভিডিও ট্রান্সকোডিং বেশি সময় নিতে পারে
    const response = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, formData, { timeout: 60000 })

    if (response.data?.secure_url) {
      logger.info(`✅ ভিডিও Cloudinary আপলোড সফল: ${response.data.secure_url}`)
      return response.data.secure_url
    }
    throw new Error('Cloudinary URL পাওয়া যায়নি')
  } catch (error) {
    logger.error('❌ ভিডিও Cloudinary আপলোড ব্যর্থ:', error.message)
    return null
  }
}

module.exports = { uploadVideoToCloudinary, MAX_VIDEO_BYTES }
