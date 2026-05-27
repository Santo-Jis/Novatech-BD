// components/InvoiceCard.jsx
// একটি Invoice-এর collapsible card

import { useState } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { PayBadge } from './Badges'

export default function InvoiceCard({ sale }) {
  const [open, setOpen] = useState(false)
  const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3 flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <div className="text-left">
          <p className="text-xs text-gray-400">{fmtDate(sale.created_at)}</p>
          <p className="font-semibold text-gray-800 text-sm">{sale.invoice_number}</p>
          <p className="text-xs text-gray-400">SR: {sale.sr_name}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-900">৳{fmt(sale.net_amount)}</p>
          <PayBadge method={sale.payment_method} />
          <p className="text-xs mt-1 text-gray-400">{open ? '▲ বন্ধ করুন' : '▼ বিস্তারিত'}</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.product_name} × {item.qty}</span>
                <span className="font-medium text-gray-900">৳{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>মোট</span><span>৳{fmt(sale.total_amount)}</span>
            </div>
            {parseFloat(sale.discount_amount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>ছাড়</span><span>- ৳{fmt(sale.discount_amount)}</span>
              </div>
            )}
            {parseFloat(sale.replacement_value) > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>রিপ্লেসমেন্ট</span><span>- ৳{fmt(sale.replacement_value)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
              <span>পরিশোধযোগ্য</span><span>৳{fmt(sale.net_amount)}</span>
            </div>
            {parseFloat(sale.cash_received) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>নগদ পেয়েছি</span><span>৳{fmt(sale.cash_received)}</span>
              </div>
            )}
            {parseFloat(sale.credit_used) > 0 && (
              <div className="flex justify-between text-red-500">
                <span>বাকি রাখা হয়েছে</span><span>৳{fmt(sale.credit_used)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
