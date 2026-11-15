export const PAYMENT_METHODS = [
  { value: 'cash',   label: 'নগদ টাকা' },
  { value: 'bank',   label: 'ব্যাংক' },
  { value: 'bkash',  label: 'bKash' },
  { value: 'nagad',  label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'card',   label: 'কার্ড' },
  { value: 'cheque', label: 'চেক' },
  { value: 'other',  label: 'অন্যান্য' },
]

export const paymentLabel = (v) => PAYMENT_METHODS.find(p => p.value === v)?.label || '—'

export const fmtMoney = (n) => '৳' + Number(n || 0).toLocaleString('bn-BD', { maximumFractionDigits: 2 })
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
// ঢাকার সময়ে আজকের তারিখ (UTC নয়, রাত ১২টা-ভোর ৬টায় তারিখ এক দিন পিছিয়ে যাওয়া ঠেকাতে)
export const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date())
