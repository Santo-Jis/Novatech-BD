// pages/customer/CustomerEmailVerify.jsx
// রেজিস্ট্রেশনে দেওয়া ইমেইলের magic-link ভেরিফিকেশন পেজ।
// ইমেইলে পাঠানো লিংকে ক্লিক করলে এখানে আসে (?token=xxx), এই পেজ
// লোড হওয়ার সাথে সাথে POST /portal/verify-email কল করে টোকেন
// যাচাই করে এবং ফলাফল দেখায়। কোনো OTP টাইপ করতে হয় না — এক ক্লিকেই কাজ।

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FiShoppingBag, FiCheckCircle, FiAlertTriangle, FiLoader } from 'react-icons/fi'
import CpButton from './components/ui/CpButton'
import { portalFetch } from './utils/api'

export default function CustomerEmailVerify() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus]   = useState(token ? 'verifying' : 'missing') // verifying | success | already | error | missing
  const [message, setMessage] = useState('')
  const [shopName, setShopName] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false

    portalFetch('/portal/verify-email', {
      method: 'POST',
      body:   JSON.stringify({ token }),
    }).then((data) => {
      if (cancelled) return
      setStatus(data.already_verified ? 'already' : 'success')
      setMessage(data.message || '')
      setShopName(data.shop_name || '')
    }).catch((err) => {
      if (cancelled) return
      setStatus('error')
      setMessage(err.message || 'লিংকের মেয়াদ শেষ হয়ে গেছে অথবা এটা অবৈধ।')
    })

    return () => { cancelled = true }
  }, [token])

  const content = {
    verifying: {
      icon: <FiLoader className="animate-spin text-cp-trust-500" size={32} />,
      iconBg: 'bg-cp-trust-100',
      title: 'ইমেইল যাচাই করা হচ্ছে…',
      desc: 'একটু অপেক্ষা করুন।',
    },
    success: {
      icon: <FiCheckCircle className="text-cp-confidence-600" size={32} />,
      iconBg: 'bg-cp-confidence-100',
      title: 'ইমেইল ভেরিফাই হয়েছে! ✅',
      desc: shopName
        ? `"${shopName}" দোকানের জন্য আপনার ইমেইল ঠিকানা সফলভাবে নিশ্চিত হয়েছে।`
        : 'আপনার ইমেইল ঠিকানা সফলভাবে নিশ্চিত হয়েছে।',
    },
    already: {
      icon: <FiCheckCircle className="text-cp-confidence-600" size={32} />,
      iconBg: 'bg-cp-confidence-100',
      title: 'ইমেইল আগেই ভেরিফাই করা আছে',
      desc: shopName
        ? `"${shopName}" দোকানের জন্য — কোনো নতুন পদক্ষেপ নেওয়ার দরকার নেই।`
        : 'কোনো নতুন পদক্ষেপ নেওয়ার দরকার নেই — সব ঠিক আছে।',
    },
    error: {
      icon: <FiAlertTriangle className="text-cp-error" size={32} />,
      iconBg: 'bg-cp-error-bg',
      title: 'লিংকটি কাজ করছে না',
      desc: message || 'লিংকের মেয়াদ শেষ হয়ে গেছে অথবা এটা অবৈধ।',
    },
    missing: {
      icon: <FiAlertTriangle className="text-cp-error" size={32} />,
      iconBg: 'bg-cp-error-bg',
      title: 'লিংকটি অসম্পূর্ণ',
      desc: 'এই লিংকে ভেরিফিকেশন টোকেন পাওয়া যায়নি। ইমেইলের বাটন/লিংকে সরাসরি ক্লিক করুন।',
    },
  }[status]

  return (
    <div className="min-h-screen bg-cp-bg-base flex flex-col font-cp-body">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[360px] flex flex-col items-center text-center">

          {/* Logo */}
          <div className="w-[72px] h-[72px] rounded-2xl bg-cp-trust-900 flex items-center justify-center mb-5 shadow-lg shadow-cp-trust-900/20">
            <FiShoppingBag className="text-cp-trust-300" size={32} />
          </div>
          <h1 className="text-2xl font-semibold text-cp-trust-700 font-cp-head mb-7">ZovoriX</h1>

          <div className={`w-16 h-16 rounded-full ${content.iconBg} flex items-center justify-center mb-4`}>
            {content.icon}
          </div>
          <p className="text-cp-text-primary text-[16px] font-medium mb-1.5">{content.title}</p>
          <p className="text-cp-text-muted text-[13px] leading-relaxed mb-7">{content.desc}</p>

          {status !== 'verifying' && (
            <CpButton variant="primary" size="lg" fullWidth onClick={() => navigate('/customer-login')}>
              লগইন পেজে যান
            </CpButton>
          )}
        </div>
      </div>

      <p className="text-center text-cp-text-muted text-[11px] py-4 tracking-wide">
        © {new Date().getFullYear()} ZovoriX Ltd.
      </p>
    </div>
  )
}
