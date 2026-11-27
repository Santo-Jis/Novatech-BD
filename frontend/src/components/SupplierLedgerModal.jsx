// SupplierLedgerModal.jsx
// সাপ্লায়ার লেজার স্টেটমেন্ট — তারিখ অনুযায়ী মাল গ্রহণ (দেনা) ও পেমেন্ট (পরিশোধ) এবং চলতি ব্যালেন্স।
// ব্যালেন্স ধনাত্মক = আমরা দেব, ঋণাত্মক = অগ্রিম দেওয়া আছে। CSV ডাউনলোড করা যায়।
// Usage: <SupplierLedgerModal isOpen={bool} supplierId={id} supplierName={s} onClose={fn} />

import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import toast from 'react-hot-toast'
import { FiDownload } from 'react-icons/fi'

const fmt = (n) => `৳${Math.abs(parseFloat(n || 0)).toLocaleString()}`
const fmtDate = (d) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const isoDaysAgo = (days) => new Date(Date.now() + 6 * 3600 * 1000 - days * 86400000).toISOString().slice(0, 10)

const RANGES = [
  { key: 'all',  label: 'সব',        days: null },
  { key: '30',   label: '৩০ দিন',    days: 30 },
  { key: '90',   label: '৩ মাস',     days: 90 },
  { key: '180',  label: '৬ মাস',     days: 180 },
]

const balanceLabel = (b) => b > 0 ? 'দেব' : b < 0 ? 'অগ্রিম' : ''

export default function SupplierLedgerModal({ isOpen, supplierId, supplierName, onClose }) {
  const [range,   setRange]   = useState('90')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supplierId) return
    setLoading(true)
    try {
      const days = RANGES.find(r => r.key === range)?.days
      const qs = days ? `?from=${isoDaysAgo(days)}` : ''
      const res = await api.get(`/suppliers/${supplierId}/ledger${qs}`)
      setData(res.data.data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'লেজার আনতে সমস্যা হয়েছে।')
    } finally { setLoading(false) }
  }, [supplierId, range])

  useEffect(() => { if (isOpen) load() }, [isOpen, load])
  useEffect(() => { if (!isOpen) setData(null) }, [isOpen])

  const downloadCsv = () => {
    if (!data) return
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['সাপ্লায়ার', data.supplier.name].map(esc).join(','),
      ['শুরুর ব্যালেন্স', data.opening_balance].map(esc).join(','),
      [],
      ['তারিখ', 'রেফারেন্স', 'বিবরণ', 'দেনা (+)', 'পরিশোধ (−)', 'ব্যালেন্স'].map(esc).join(','),
      ...data.entries.map(e => [e.date, e.ref, e.description, e.debit || '', e.credit || '', e.balance].map(esc).join(',')),
      [],
      ['', '', 'সর্বমোট', data.total_debit, data.total_credit, data.closing_balance].map(esc).join(','),
    ]
    // BOM — Excel-এ বাংলা ঠিকভাবে দেখাতে
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${(data.supplier.name || 'supplier').replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const closing = data ? parseFloat(data.closing_balance) : 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`📒 লেজার — ${supplierName || ''}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {RANGES.map(r => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`px-3 py-1 rounded-lg text-xs border ${range === r.key
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-300'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" icon={<FiDownload />} onClick={downloadCsv} disabled={!data}>CSV</Button>
        </div>

        {loading || !data ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg py-2">
                <p className="text-[11px] text-gray-400">শুরুর ব্যালেন্স</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{fmt(data.opening_balance)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg py-2">
                <p className="text-[11px] text-gray-400">দেনা / পরিশোধ</p>
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{fmt(data.total_debit)} / {fmt(data.total_credit)}</p>
              </div>
              <div className={`${closing > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'} rounded-lg py-2`}>
                <p className={`text-[11px] ${closing > 0 ? 'text-red-500' : 'text-emerald-600'}`}>শেষ ব্যালেন্স {balanceLabel(closing) && `(${balanceLabel(closing)})`}</p>
                <p className={`text-sm font-bold ${closing > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(closing)}</p>
              </div>
            </div>

            {data.entries.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">এই সময়ে কোনো লেনদেন নেই।</p>
            ) : (
              <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-700/50 text-xs text-gray-500 dark:text-gray-400">
                      <th className="text-left px-3 py-2">তারিখ / বিবরণ</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">দেনা (+)</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">পরিশোধ (−)</th>
                      <th className="text-right px-3 py-2">ব্যালেন্স</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-slate-700 align-top">
                        <td className="px-3 py-2">
                          <p className="text-xs text-gray-400">{fmtDate(e.date)}{e.ref && ` · ${e.ref}`}</p>
                          <p className="text-gray-700 dark:text-gray-200">{e.description}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-red-500 whitespace-nowrap">{e.debit ? fmt(e.debit) : ''}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 whitespace-nowrap">{e.credit ? fmt(e.credit) : ''}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                          {e.balance < 0 ? `(${fmt(e.balance)})` : fmt(e.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-400">ব্যালেন্স ধনাত্মক = আমরা দেব; বন্ধনীতে = অগ্রিম দেওয়া আছে। বাতিল পেমেন্ট ধরা হয়নি।</p>
          </>
        )}
      </div>
    </Modal>
  )
}
