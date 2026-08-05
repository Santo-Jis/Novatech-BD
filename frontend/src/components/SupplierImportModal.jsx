// SupplierImportModal.jsx
// সাপ্লায়ারের বাল্ক CSV ইম্পোর্ট — ধাপ ২
// ফ্লো ও UI গঠন ProductImportModal.jsx থেকে হুবহু নেওয়া:
// ফাইল বাছাই → preview (validate, কিছু সেভ হয় না) → commit (আসল create/update)
// Usage: <SupplierImportModal isOpen={open} onClose={fn} onImported={refreshFn} />

import { useState, useRef } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import toast from 'react-hot-toast'
import { FiUploadCloud, FiDownload } from 'react-icons/fi'

function SummaryBox({ label, value, color = 'text-gray-700 dark:text-gray-200' }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-2.5 text-center">
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  )
}

export default function SupplierImportModal({ isOpen, onClose, onImported }) {
  const [step,       setStep]       = useState('select') // 'select' | 'preview' | 'result'
  const [uploading,  setUploading]  = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview,    setPreview]    = useState(null) // { summary, rows }
  const [result,     setResult]     = useState(null) // { created, updated, failed }
  const fileRef = useRef()

  const reset = () => {
    setStep('select'); setPreview(null); setResult(null)
    setUploading(false); setCommitting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/suppliers/import/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url
      a.download = 'supplier_import_template.csv'
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('টেমপ্লেট ডাউনলোড করতে সমস্যা হয়েছে।') }
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('শুধু .csv ফাইল আপলোড করা যাবে।')
      return
    }
    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)
    try {
      const res = await api.post('/suppliers/import/preview', formData, {
        headers: { 'Content-Type': undefined }
      })
      setPreview(res.data.data)
      setStep('preview')
    } catch (err) {
      toast.error(err.response?.data?.message || 'ফাইল প্রসেস করতে সমস্যা হয়েছে।')
    } finally {
      setUploading(false)
    }
  }

  const okRows = preview?.rows?.filter(r => r.status === 'ok') || []

  const handleCommit = async () => {
    if (okRows.length === 0) return
    setCommitting(true)
    try {
      const res = await api.post('/suppliers/import/commit', { rows: okRows })
      setResult(res.data.data)
      setStep('result')
      onImported?.()
      toast.success(res.data.message || 'আমদানি সম্পন্ন হয়েছে।')
    } catch (err) {
      toast.error(err.response?.data?.message || 'আমদানিতে সমস্যা হয়েছে।')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="📥 সাপ্লায়ার বাল্ক CSV ইম্পোর্ট" size="lg">

      {/* ── ধাপ ১: ফাইল বাছাই ── */}
      {step === 'select' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-700 dark:text-blue-300 space-y-1.5">
            <p>• CSV দিয়ে একসাথে অনেক সাপ্লায়ার যোগ বা আপডেট করুন।</p>
            <p>• <b>নাম+ফোন</b> মিললে <b>আপডেট</b>, না মিললে <b>নতুন</b> সাপ্লায়ার তৈরি হবে।</p>
            <p>• TIN/BIN/ব্যাংক তথ্য ঐচ্ছিক — খালি রাখলে বিদ্যমান মান অপরিবর্তিত থাকবে।</p>
          </div>

          <button
            type="button"
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors"
          >
            <FiDownload size={15} /> নমুনা CSV টেমপ্লেট ডাউনলোড করুন
          </button>

          <div
            onClick={() => !uploading && fileRef.current.click()}
            className="w-full h-40 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          >
            {uploading ? (
              <>
                <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                <p className="text-sm text-gray-400">ফাইল প্রসেস হচ্ছে...</p>
              </>
            ) : (
              <>
                <FiUploadCloud className="text-gray-400 mb-2" size={28} />
                <p className="text-sm text-gray-500 dark:text-gray-300 font-medium">ক্লিক করে CSV ফাইল বেছে নিন</p>
                <p className="text-xs text-gray-400 mt-1">সর্বোচ্চ ৫MB, ১০০০ সারি</p>
              </>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={handleFile} disabled={uploading}
          />
        </div>
      )}

      {/* ── ধাপ ২: প্রিভিউ ── */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <SummaryBox label="মোট সারি"  value={preview.summary.totalRows} />
            <SummaryBox label="নতুন হবে"  value={preview.summary.toCreate} color="text-blue-600" />
            <SummaryBox label="আপডেট হবে" value={preview.summary.toUpdate} color="text-amber-600" />
            <SummaryBox label="ভুল আছে"   value={preview.summary.errorRows} color="text-red-500" />
          </div>

          {preview.summary.errorRows > 0 && (
            <div className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-xl p-3">
              ⚠️ {preview.summary.errorRows}টি সারিতে ভুল আছে — সেগুলো বাদ দিয়ে বাকি {okRows.length}টি import করা যাবে,
              অথবা CSV-তে ভুল ঠিক করে আবার আপলোড করুন।
            </div>
          )}

          <div className="max-h-[42vh] overflow-y-auto border border-gray-100 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-700">
            {preview.rows.map((r) => (
              <div key={r.row} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="text-xs text-gray-400 w-8 flex-shrink-0 mt-0.5">#{r.row}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                      {r.name || '—'}
                      {r.phone && <span className="text-gray-400 font-normal"> · {r.phone}</span>}
                    </span>
                    <Badge
                      size="xs"
                      variant={r.status === 'error' ? 'rejected' : (r.action === 'create' ? 'info' : 'warning')}
                      label={r.status === 'error' ? 'ভুল' : (r.action === 'create' ? 'নতুন' : 'আপডেট')}
                    />
                  </div>
                  {r.errors?.length   > 0 && <p className="text-xs text-red-500 mt-0.5">{r.errors.join(' ')}</p>}
                  {r.warnings?.length > 0 && <p className="text-xs text-amber-600 mt-0.5">{r.warnings.join(' ')}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ধাপ ৩: ফলাফল ── */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryBox label="নতুন তৈরি" value={result.created}       color="text-emerald-600" />
            <SummaryBox label="আপডেট"    value={result.updated}       color="text-blue-600" />
            <SummaryBox label="ব্যর্থ"    value={result.failed.length} color="text-red-500" />
          </div>
          {result.failed.length > 0 && (
            <div className="max-h-[35vh] overflow-y-auto border border-red-100 dark:border-red-900/40 rounded-xl divide-y divide-red-50 dark:divide-red-900/30">
              {result.failed.map((f, i) => (
                <div key={i} className="px-4 py-2 text-xs text-red-600 dark:text-red-300">
                  #{f.row} · {f.name || '—'} — {f.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
        {step === 'select' && <Button variant="ghost" onClick={handleClose}>বাতিল</Button>}
        {step === 'preview' && (
          <>
            <Button variant="ghost" onClick={reset}>আবার আপলোড করুন</Button>
            <Button onClick={handleCommit} loading={committing} disabled={okRows.length === 0}>
              সঠিক {okRows.length}টি সারি ইম্পোর্ট করুন
            </Button>
          </>
        )}
        {step === 'result' && (
          <>
            <Button variant="outline" onClick={reset}>আরেকটি ফাইল ইম্পোর্ট করুন</Button>
            <Button onClick={handleClose}>বন্ধ করুন</Button>
          </>
        )}
      </div>
    </Modal>
  )
}
