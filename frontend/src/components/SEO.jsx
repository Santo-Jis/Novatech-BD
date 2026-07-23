import { useEffect } from 'react'

// ============================================================
// SEO — পেজ-ভিত্তিক ডাইনামিক মেটাডেটা
// ============================================================
// এটি একটি SPA (Single Page App), তাই index.html-এর <title>/<meta>
// ট্যাগগুলো সব রুটের জন্য একই থাকে — যা সার্চ ইঞ্জিন ও সোশ্যাল শেয়ার
// প্রিভিউয়ের জন্য ভালো প্র্যাকটিস না (প্রতিটি পেজের নিজস্ব title/description
// থাকা দরকার)। এই কম্পোনেন্ট রুট পরিবর্তনের সাথে সাথে document.head-এর
// মেটা ট্যাগ, canonical link ও OG/Twitter ট্যাগ ডাইনামিকভাবে আপডেট করে।
//
// এক্সট্রা কোনো npm ডিপেন্ডেন্সি (react-helmet ইত্যাদি) লাগে না —
// সরাসরি DOM API ব্যবহার করা হয়েছে, তাই এটি যেকোনো Vite/React সেটআপে
// নির্দ্বিধায় কাজ করবে।
//
// ব্যবহার:
//   <SEO
//     title="আমাদের সম্পর্কে"
//     description="ZovoriX টিম ও মিশন সম্পর্কে জানুন।"
//     path="/about"
//   />
// ============================================================

const SITE_URL = 'https://zovorix.com'
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`
const DEFAULT_TITLE = 'ZovoriX — বিক্রয়, টিম ও কাস্টমার ব্যবস্থাপনা প্ল্যাটফর্ম'
const DEFAULT_DESCRIPTION =
  'ZovoriX একটি সম্পূর্ণ ব্যবসা ব্যবস্থাপনা প্ল্যাটফর্ম — বিক্রয়, ইনভয়েস, টিম অ্যাটেন্ডেন্স ও রিয়েল-টাইম রিপোর্ট এক জায়গায়। ডিস্ট্রিবিউটর, SR ও রিটেইল দোকান পরিচালনা করুন সহজে।'

function upsertMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export default function SEO({ title, description, path = '/', image, noindex = false }) {
  useEffect(() => {
    const fullTitle = title
      ? (title.includes('ZovoriX') ? title : `${title} | ZovoriX`)
      : DEFAULT_TITLE
    const desc = description || DEFAULT_DESCRIPTION
    const url = `${SITE_URL}${path}`
    const img = image || DEFAULT_IMAGE

    document.title = fullTitle

    upsertMeta('name', 'description', desc)
    upsertLink('canonical', url)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')

    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', img)

    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', desc)
    upsertMeta('name', 'twitter:image', img)

    // পরের পেজে নেভিগেট করার সময় পরের <SEO> কম্পোনেন্ট নিজেই ওভাররাইট করবে,
    // তাই আলাদা cleanup দরকার নেই — কিন্তু ট্যাব বন্ধ/আনমাউন্ট হলে সমস্যা নেই।
  }, [title, description, path, image, noindex])

  return null
}
