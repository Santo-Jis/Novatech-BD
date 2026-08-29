// backend/src/services/chatMedia.service.js
//
// চ্যাট ভয়েস নোটের জন্য আলাদা আপলোড ফাংশন — employee.service.js-এর
// uploadToCloudinary() রিইউজ করা হয়নি ইচ্ছাকৃতভাবে, কারণ সেটা হার্ডকোড করা
// image-only (mimetype-এ 'image/' না থাকলে জোর করে 'image/jpeg' বসিয়ে দেয়,
// আর এন্ডপয়েন্টও সবসময় /image/upload)। সেই ফাংশনটা attendance/sales/
// employee/customer/recruitment/platformSupport-সহ অনেক জায়গায় ব্যবহৃত হয় —
// অডিও সাপোর্টের জন্য ওটা বদলাতে গেলে ওই সব জায়গায় regression-এর ঝুঁকি,
// তাই সম্পূর্ণ আলাদা, ছোট, চ্যাট-নির্দিষ্ট ফাংশন।
//
// Cloudinary-তে অডিও আপলোড হয় resource_type=video দিয়ে (video আর audio
// একই ট্রান্সকোডিং পাইপলাইন শেয়ার করে Cloudinary-র সিস্টেমে)।

const axios = require('axios')
const logger = require('../config/logger')

const MAX_AUDIO_BYTES = 8 * 1024 * 1024 // ~৮MB, কয়েক মিনিটের কম্প্রেসড ভয়েস নোটের জন্য যথেষ্ট

async function uploadAudioToCloudinary(fileBuffer, folder, filename, mimetype = 'audio/webm') {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET

    if (!cloudName) {
      logger.warn('⚠️ Cloudinary config নেই। ভয়েস নোট আপলোড হবে না।')
      return null
    }
    if (fileBuffer.length > MAX_AUDIO_BYTES) {
      throw new Error('ভয়েস নোট খুব বড় (সর্বোচ্চ ৮MB)')
    }

    const safeType = mimetype && mimetype.startsWith('audio/') ? mimetype : 'audio/webm'
    const base64 = fileBuffer.toString('base64')
    const dataUri = `data:${safeType};base64,${base64}`

    const formData = new FormData()
    formData.append('file', dataUri)
    formData.append('upload_preset', uploadPreset)
    formData.append('folder', `zovorix/${folder}`)
    formData.append('public_id', filename)
    formData.append('resource_type', 'video') // Cloudinary-তে audio = resource_type video

    const response = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, formData, { timeout: 30000 })

    if (response.data?.secure_url) {
      logger.info(`✅ ভয়েস নোট Cloudinary আপলোড সফল: ${response.data.secure_url}`)
      return response.data.secure_url
    }
    throw new Error('Cloudinary URL পাওয়া যায়নি')
  } catch (error) {
    logger.error('❌ ভয়েস নোট Cloudinary আপলোড ব্যর্থ:', error.message)
    return null
  }
}

module.exports = { uploadAudioToCloudinary }
