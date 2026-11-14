// frontend/src/pages/manager/SettlementBreakdown.jsx
//
// ম্যানেজারের "হিসাবের বিস্তারিত" মডালের নিচের অংশ — একটি settlement-এর পুরো সময়সীমার
// (আগের জমার পর থেকে এই জমা পর্যন্ত) নগদের উৎস, দিনভিত্তিক ভাঙা, দোকানভিত্তিক বাকি/আদায়,
// পণ্যের প্রবাহ (মূল্যসহ), রিপ্লেসমেন্ট ও রিটার্ন রসিদ। শুধু দেখানোর জন্য।
// ডেটা আসে GET /settlements/:id → data.breakdown

const taka = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
const bnDate = (d) => {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
}

function Section({ title, badge, children, open = false }) {
  return (
    <details open={open} className="group border border-gray-100 rounded-xl overflow-hidden bg-white">
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer bg-gray-50 select-none">
        <span className="text-xs font-bold text-gray-700">{title}</span>
        <span className="flex items-center gap-2">
          {badge && <span className="text-[11px] font-semibold text-gray-500">{badge}</span>}
          <span className="text-gray-400 text-xs transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="p-3">{children}</div>
    </details>
  )
}

const Row = ({ label, value, strong, tone = 'text-gray-700' }) => (
  <div className={`flex justify-between text-xs py-0.5 ${strong ? 'font-bold' : ''}`}>
    <span className="text-gray-500">{label}</span>
    <span className={`font-semibold ${tone}`}>{value}</span>
  </div>
)

const RECEIPT_STATUS = {
  pending:     { label: 'গুদামে গোনা বাকি', cls: 'bg-amber-50 text-amber-700' },
  received:    { label: 'বুঝে পেয়েছে',      cls: 'bg-emerald-50 text-emerald-700' },
  discrepancy: { label: 'সংখ্যায় গরমিল',    cls: 'bg-red-50 text-red-700' },
}
const RESOLUTION = { charged: 'SR-এর বকেয়ায় যোগ', waived: 'মাফ' }

export default function SettlementBreakdown({ breakdown }) {
  if (!breakdown) return null
  const { window: win, cash, days, shops, replacements, stock, return_receipts } = breakdown

  const mismatch = Math.abs((cash.sales_cash + cash.collections_cash) - cash.recorded_system_cash) >= 1
  const fromLabel = days?.length ? `${bnDate(days[0].date)} – ${bnDate(days[days.length - 1].date)}` : ''

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pt-1">
        বিস্তারিত হিসাব {win?.days > 1 && `· ${win.days} দিনের একসাথে`}
      </p>

      {/* ১. নগদ মেলানো */}
      <Section title="💵 নগদ মেলানো" badge={taka(cash.recorded_system_cash)} open>
        <Row label="বিক্রির নগদ" value={taka(cash.sales_cash)} />
        <Row label="বাকি আদায় (নগদ)" value={taka(cash.collections_cash)} />
        <Row label="সিস্টেম নগদ (জমার সময়)" value={taka(cash.recorded_system_cash)} strong />
        <Row label="SR জমা দিয়েছে" value={taka(cash.sr_cash)} strong tone="text-primary" />
        <Row
          label="পার্থক্য"
          value={`${cash.difference > 0 ? '+' : ''}${taka(cash.difference)}`}
          strong
          tone={cash.difference < 0 ? 'text-red-600' : cash.difference > 0 ? 'text-emerald-600' : 'text-gray-700'}
        />
        {cash.non_cash_collected > 0 && (
          <p className="text-[11px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100">
            চেক/বিকাশ/নগদে আদায় {taka(cash.non_cash_collected)} — হাতের নগদে ধরা হয়নি
          </p>
        )}
        {mismatch && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            ⚠️ নিচের দিনভিত্তিক যোগফল ও জমার সময়ের সিস্টেম নগদে পার্থক্য আছে — হিসাব পরে সংশোধন বা আগের নিয়মে জমা হয়ে থাকতে পারে।
          </p>
        )}
      </Section>

      {/* ২. দিনভিত্তিক */}
      <Section title="📅 দিনভিত্তিক ভাঙা" badge={fromLabel}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                {['তারিখ', 'বিক্রয়', 'নগদ', 'বাকি', 'আদায়'].map(h => (
                  <th key={h} className="px-1.5 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(d => (
                <tr key={d.date} className="border-t border-gray-50">
                  <td className="px-1.5 py-1.5 text-gray-600">{bnDate(d.date)}</td>
                  <td className="px-1.5 py-1.5">{taka(d.sales_total)}</td>
                  <td className="px-1.5 py-1.5 text-primary">{taka(d.sales_cash)}</td>
                  <td className="px-1.5 py-1.5 text-amber-600">{taka(d.credit_given)}</td>
                  <td className="px-1.5 py-1.5 text-emerald-600">{taka(d.collections_cash)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-bold">
                <td className="px-1.5 py-1.5">মোট</td>
                <td className="px-1.5 py-1.5">{taka(cash.sales_total)}</td>
                <td className="px-1.5 py-1.5 text-primary">{taka(cash.sales_cash)}</td>
                <td className="px-1.5 py-1.5 text-amber-600">{taka(cash.credit_given)}</td>
                <td className="px-1.5 py-1.5 text-emerald-600">{taka(cash.collections_cash)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ৩. দোকানভিত্তিক */}
      <Section title="🏪 দোকানভিত্তিক বাকি ও আদায়" badge={`${shops.length}টি দোকান`}>
        <div className="max-h-64 overflow-y-auto overflow-x-auto -mx-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                {['দোকান', 'বিক্রয়', 'বাকি দিয়েছে', 'আদায়'].map(h => (
                  <th key={h} className="px-1.5 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shops.map((s, i) => (
                <tr key={s.customer_id || i} className="border-t border-gray-50">
                  <td className="px-1.5 py-1.5 font-medium text-gray-700">{s.shop_name}</td>
                  <td className="px-1.5 py-1.5">{taka(s.sales_total)}</td>
                  <td className="px-1.5 py-1.5 text-amber-600">{s.credit_given > 0 ? taka(s.credit_given) : '—'}</td>
                  <td className="px-1.5 py-1.5 text-emerald-600">
                    {s.collected_cash + s.collected_non_cash > 0
                      ? <>
                          {taka(s.collected_cash + s.collected_non_cash)}
                          {s.collected_non_cash > 0 && <span className="text-[10px] text-gray-400"> (চেক/অন্য {taka(s.collected_non_cash)})</span>}
                        </>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ৪. পণ্যের প্রবাহ */}
      {stock && (
        <Section title="📦 পণ্যের প্রবাহ (মূল্যসহ)" badge={`হাতে ছিল ${taka(stock.in_hand.value)}`}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                <th className="px-1.5 py-1 text-left font-semibold">বিবরণ</th>
                <th className="px-1.5 py-1 text-right font-semibold">পিস</th>
                <th className="px-1.5 py-1 text-right font-semibold">মূল্য</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['আগের হাতে ছিল',            stock.opening,     '',  stock.opening.qty !== 0],
                ['নেওয়া হয়েছে',             stock.taken,       '+', true],
                ['রিপ্লেস/রিটার্নে পাওয়া',    stock.customer_in, '+', stock.customer_in.qty !== 0],
                ['বিক্রি হয়েছে',             stock.sold,        '−', true],
                ['অন্য বাদ',                 stock.out,         '−', stock.out.qty !== 0],
              ].filter(r => r[3]).map(([label, d, sign]) => (
                <tr key={label} className="border-t border-gray-50">
                  <td className="px-1.5 py-1.5 text-gray-600">{label}</td>
                  <td className="px-1.5 py-1.5 text-right">{sign}{d.qty}</td>
                  <td className="px-1.5 py-1.5 text-right">{sign}{taka(d.value)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 bg-primary/5 font-bold text-primary">
                <td className="px-1.5 py-1.5">জমার সময় হাতে ছিল</td>
                <td className="px-1.5 py-1.5 text-right">{stock.in_hand.qty}</td>
                <td className="px-1.5 py-1.5 text-right">{taka(stock.in_hand.value)}</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-1.5 py-1.5 text-blue-600">→ গুদামে ফেরত</td>
                <td className="px-1.5 py-1.5 text-right">{stock.returned.qty}</td>
                <td className="px-1.5 py-1.5 text-right">{taka(stock.returned.value)}</td>
              </tr>
              <tr className="border-t border-gray-50">
                <td className="px-1.5 py-1.5 text-purple-600">→ কাল রাখছে</td>
                <td className="px-1.5 py-1.5 text-right">{stock.carry.qty}</td>
                <td className="px-1.5 py-1.5 text-right">{taka(stock.carry.value)}</td>
              </tr>
              <tr className="border-t border-gray-50 font-bold">
                <td className={`px-1.5 py-1.5 ${stock.shortage.qty > 0 ? 'text-red-600' : 'text-emerald-600'}`}>→ ঘাটতি</td>
                <td className="px-1.5 py-1.5 text-right">{stock.shortage.qty}</td>
                <td className={`px-1.5 py-1.5 text-right ${stock.shortage.qty > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{taka(stock.shortage.value)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-gray-400 mt-1.5">
            দাম: SR-এর সর্বশেষ approved অর্ডারের দাম (না থাকলে পণ্যের বর্তমান মূল্য)। "আগের হাতে ছিল" হিসাব করে বের করা।
          </p>
        </Section>
      )}

      {/* ৫. রিপ্লেসমেন্ট */}
      <Section title="🔁 রিপ্লেসমেন্ট" badge={replacements.length ? `${replacements.length}টি · ${taka(cash.replacement_value)}` : 'নেই'}>
        {replacements.length === 0
          ? <p className="text-xs text-gray-400">এই সময়ে কোনো রিপ্লেসমেন্ট হয়নি।</p>
          : (
            <div className="space-y-2">
              {replacements.map((r, i) => (
                <div key={i} className="border border-purple-100 bg-purple-50/40 rounded-lg px-2.5 py-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-700">{r.shop_name}</span>
                    <span className="font-bold text-purple-700">{taka(r.value)}</span>
                  </div>
                  <p className="text-[10px] text-gray-400">{bnDate(r.date)}{r.invoice_number ? ` · ${r.invoice_number}` : ''}</p>
                  {r.items.length > 0 && (
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {r.items.map(it => `${it.name} × ${it.qty}`).join(', ')}
                    </p>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-gray-400">রিপ্লেসমেন্টের মূল্য বিল থেকে আগেই বাদ — নগদ হিসাবে আলাদা কাটা হয় না।</p>
            </div>
          )}
      </Section>

      {/* ৬. রিটার্ন রসিদ */}
      <Section title="📋 গুদামে ফেরতের রসিদ" badge={return_receipts.length ? `${return_receipts.length}টি` : 'নেই'}>
        {return_receipts.length === 0
          ? <p className="text-xs text-gray-400">এই জমায় SR কোনো পণ্য ফেরত দেয়নি।</p>
          : (
            <div className="space-y-2">
              {return_receipts.map((r, i) => {
                const st = RECEIPT_STATUS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={i} className="border border-gray-100 rounded-lg px-2.5 py-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-semibold text-gray-700">{r.product_name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      SR দিয়েছে {r.qty_claimed} পিস
                      {r.qty_received != null && <> · গুদাম পেয়েছে <b>{r.qty_received}</b> পিস</>}
                      {' · '}{taka(r.value)}
                    </p>
                    {r.status === 'discrepancy' && (
                      <p className="text-[11px] mt-0.5 text-red-600">
                        কম: {r.qty_claimed - (r.qty_received || 0)} পিস
                        {r.resolution ? ` — ${RESOLUTION[r.resolution] || r.resolution}` : ' — সিদ্ধান্ত বাকি'}
                      </p>
                    )}
                    {r.discrepancy_note && <p className="text-[10px] text-gray-400 mt-0.5">{r.discrepancy_note}</p>}
                  </div>
                )
              })}
            </div>
          )}
      </Section>
    </div>
  )
}
