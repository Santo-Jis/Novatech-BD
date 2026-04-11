import { FiDownload, FiShare2, FiCheck, FiX } from 'react-icons/fi'
import Badge from './ui/Badge'

// ============================================================
// Invoice Card Component
// ============================================================

export default function InvoiceCard({ sale, customer, worker, onShare, onDownload }) {
  if (!sale) return null

  const paymentLabels = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' }
  const paymentColors = { cash: 'secondary', credit: 'primary', replacement: 'accent' }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden max-w-sm mx-auto border border-gray-100">

      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary-light p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-lg">NovaTech BD</p>
            <p className="text-white/70 text-xs">জানকি সিংহ রোড, বরিশাল</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">Invoice</p>
            <p className="font-mono text-sm font-bold">{sale.invoice_number}</p>
          </div>
        </div>
      </div>

      {/* Customer Info */}
      <div className="px-5 py-4 border-b border-dashed border-gray-200 bg-gray-50">
        <div className="flex justify-between text-sm">
          <div>
            <p className="text-gray-500 text-xs">দোকান</p>
            <p className="font-semibold text-gray-800">{customer?.shop_name}</p>
            <p className="text-gray-500 text-xs mt-0.5">{customer?.owner_name}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-xs">SR</p>
            <p className="font-semibold text-gray-800 text-sm">{worker?.name_bn}</p>
            <p className="text-gray-500 text-xs">{new Date().toLocaleDateString('bn-BD')}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="px-5 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-2">পণ্য তালিকা</p>
        <div className="space-y-2">
          {sale.items?.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <div className="flex-1">
                <p className="font-medium text-gray-800">{item.product_name}</p>
                <p className="text-xs text-gray-400">{item.qty} × ৳{item.price}</p>
              </div>
              <p className="font-semibold text-gray-700">৳{item.subtotal?.toLocaleString()}</p>
            </div>
          ))}

          {/* Replacement items */}
          {sale.replacement_items?.length > 0 && (
            <>
              <div className="border-t border-dashed border-gray-200 my-2" />
              <p className="text-xs font-semibold text-gray-500">রিপ্লেসমেন্ট (বিয়োগ)</p>
              {sale.replacement_items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-orange-600">
                  <p>{item.product_name} × {item.qty}</p>
                  <p>-৳{item.total?.toLocaleString()}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="px-5 py-3 bg-gray-50 border-t border-dashed border-gray-200">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>মোট</span>
            <span>৳{sale.total_amount?.toLocaleString()}</span>
          </div>
          {sale.discount_amount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>ব্যালেন্স ছাড়</span>
              <span>-৳{sale.discount_amount?.toLocaleString()}</span>
            </div>
          )}
          {sale.replacement_value > 0 && (
            <div className="flex justify-between text-orange-600">
              <span>রিপ্লেসমেন্ট</span>
              <span>-৳{sale.replacement_value?.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base text-gray-900 pt-1.5 border-t border-gray-200">
            <span>পরিশোধযোগ্য</span>
            <span>৳{sale.net_amount?.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Payment & OTP */}
      <div className="px-5 py-3 flex items-center justify-between">
        <Badge variant={paymentColors[sale.payment_method] || 'gray'}>
          {paymentLabels[sale.payment_method] || sale.payment_method}
        </Badge>
        <div className={`flex items-center gap-1 text-xs font-medium ${sale.otp_verified ? 'text-emerald-600' : 'text-gray-400'}`}>
          {sale.otp_verified ? <FiCheck /> : <FiX />}
          OTP {sale.otp_verified ? 'যাচাইকৃত' : 'অযাচাই'}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-5 flex gap-2">
        {onShare && (
          <button
            onClick={onShare}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold"
          >
            <FiShare2 /> WhatsApp
          </button>
        )}
        {onDownload && (
          <button
            onClick={onDownload}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold"
          >
            <FiDownload /> PDF
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-5 py-3 text-center border-t border-gray-100">
        <p className="text-xs text-gray-400">আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ</p>
      </div>
    </div>
  )
}
