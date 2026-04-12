import { useState } from 'react'
import api from '../api/axios'
import axios from 'axios'
import toast from 'react-hot-toast'
import Modal from './ui/Modal'
import { FiMail, FiSend } from 'react-icons/fi'

export default function BroadcastEmailModal({ isOpen, onClose }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!subject || !message) return toast.error('Subject ও message দিন।')
    setLoading(true)
    try {
      const res = await api.post('/employees/broadcast-email', { subject, message }, { timeout: 60000 })
      toast.success(res.data.message)
      setSubject('')
      setMessage('')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="সবাইকে Email পাঠান">
      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-600 font-medium">বিষয় (Subject)</label>
          <input
            type="text"
            className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="যেমন: গুরুত্বপূর্ণ ঘোষণা"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-gray-600 font-medium">বার্তা</label>
          <textarea
            rows={5}
            className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            placeholder="এখানে বার্তা লিখুন..."
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading
            ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <><FiSend /> সকল কর্মচারীকে পাঠান</>
          }
        </button>
      </div>
    </Modal>
  )
}
