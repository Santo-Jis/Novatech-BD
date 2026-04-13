import { useState } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import Modal from './ui/Modal'
import { FiKey, FiMail } from 'react-icons/fi'

export default function ResetPasswordModal({ isOpen, onClose, employee }) {
  const [sendEmail, setSendEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newPass, setNewPass] = useState(null)

  const handleReset = async () => {
    setLoading(true)
    try {
      const res = await api.post(`/employees/${employee.id}/reset-password`, { send_email: sendEmail })
      setNewPass(res.data.data.new_password)
      toast.success('পাসওয়ার্ড রিসেট সফল!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setLoading(false) }
  }

  const handleClose = () => { setNewPass(null); setSendEmail(false); onClose(); }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="পাসওয়ার্ড রিসেট">
      <div className="space-y-4">
        <p className="text-gray-600 text-sm"><strong>{employee?.name_bn}</strong> এর পাসওয়ার্ড রিসেট করবেন?</p>
        {newPass ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">নতুন পাসওয়ার্ড</p>
            <p className="text-2xl font-bold text-green-700 tracking-widest">{newPass}</p>
            {sendEmail && <p className="text-xs text-gray-400 mt-2">✅ Email পাঠানো হয়েছে</p>}
          </div>
        ) : (
          <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-gray-600 flex items-center gap-1"><FiMail /> Email এ পাঠান</span>
            </label>
            <button onClick={handleReset} disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><FiKey /> রিসেট করুন</>}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
