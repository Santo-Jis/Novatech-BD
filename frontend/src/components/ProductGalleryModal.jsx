// ProductGalleryModal.jsx
// ✅ NEW (ফেজ ২ — মাল্টি-ইমেজ গ্যালারি)
// Products/:id/images — গ্যালারি ছবি যোগ/মুছার modal
// Usage: <ProductGalleryModal productId={id} productName={name} coverUrl={url} isOpen={open} onClose={fn} />
//
// StockMovementsModal.jsx-এর ঠিক একই কাঠামো অনুসরণ করে (Modal + api +
// loading/empty state) — এই অ্যাডমিন অ্যাপের established প্যাটার্ন।

import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import { FiImage, FiTrash2, FiPlus, FiX } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function ProductGalleryModal({ productId, productName, coverUrl, isOpen, onClose }) {
  const [images,  setImages]  = useState([])
  const [loading, setLoading] = useState(false)
  const [adding,  setAdding]  = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const inputRef = useRef()

  const load = () => {
    if (!productId) return
    setLoading(true)
    api.get(`/products/${productId}/images`)
      .then(res => setImages(res.data.data || []))
      .catch(() => setImages([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (isOpen && productId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, productId])

  const addByFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('শুধু ছবি ফাইল আপলোড করুন।'); return }
    const reader = new FileReader()
    reader.onloadend = () => addImage(reader.result)
    reader.readAsDataURL(file)
  }

  const addImage = async (image_url) => {
    if (images.length >= 6) { toast.error('সর্বোচ্চ ৬টা ছবি যোগ করা যাবে।'); return }
    setAdding(true)
    try {
      await api.post(`/products/${productId}/images`, { image_url })
      setUrlInput('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'ছবি যোগ করতে সমস্যা হয়েছে।')
    } finally { setAdding(false) }
  }

  const removeImage = async (imageId) => {
    try {
      await api.delete(`/products/${productId}/images/${imageId}`)
      setImages(prev => prev.filter(i => i.id !== imageId))
    } catch {
      toast.error('ছবি সরাতে সমস্যা হয়েছে।')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`ছবির গ্যালারি — ${productName || ''}`} size="lg">
      <p className="text-xs text-gray-400 mb-4">
        কভার ছবি (প্রথম ছবি) প্রোডাক্ট এডিট থেকে বদলাতে হবে। এখানে অতিরিক্ত ছবি (সর্বোচ্চ ৬টা) যোগ করলে কাস্টমার পোর্টালের প্রোডাক্ট পেজে সোয়াইপ-গ্যালারি হিসেবে দেখা যাবে।
      </p>

      {/* কভার ছবি প্রিভিউ */}
      {coverUrl && (
        <div className="flex items-center gap-2 mb-4">
          <img src={coverUrl} alt="cover" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
          <span className="text-xs text-gray-400">কভার ছবি (এখানে পরিবর্তন হয় না)</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {images.map(img => (
            <div key={img.id} className="relative group h-24 rounded-xl overflow-hidden border border-gray-200">
              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-90 hover:bg-red-600"
                title="সরান"
              >
                <FiTrash2 size={11} />
              </button>
            </div>
          ))}

          {images.length < 6 && (
            <button
              onClick={() => inputRef.current.click()}
              disabled={adding}
              className="h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors"
            >
              <FiPlus size={18} />
              <span className="text-[10px] mt-1">যোগ করুন</span>
            </button>
          )}
        </div>
      )}

      {images.length < 6 && (
        <div className="flex gap-2">
          <input
            placeholder="অথবা ছবির URL পেস্ট করুন (https://...)"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={() => urlInput && addImage(urlInput)}
            disabled={adding || !urlInput}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            যোগ
          </button>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={addByFile} />
    </Modal>
  )
}
