## কী বদলেছে
<!-- What changed, in 1-3 sentences -->

## কেন
<!-- Why this change was needed — bug, feature, tech debt? Link the ticket/conversation if there is one. -->

## কীভাবে যাচাই করেছি
<!-- How you tested this. "npm test passed" is not enough for anything touching auth, payments, or RLS. -->

- [ ] `npm run test:unit` পাস করেছে
- [ ] `npm run test:integration` পাস করেছে (DB/auth/money ছুঁলে আবশ্যিক)
- [ ] Manually টেস্ট করা হয়েছে — কীভাবে, লিখুন:

## Risk level
- [ ] 🟢 Low — UI text, styling, non-critical bug fix
- [ ] 🟡 Medium — new feature, existing logic changed
- [ ] 🔴 High — touches auth, payments/credit, RLS/migrations, or multi-tenant isolation

High হলে review-এ অতিরিক্ত সময় দিন, একা merge করবেন না।

## AI agent-এর কাজ হলে
- [ ] কোন session/agent এই কাজ করেছে তা describe-এ উল্লেখ আছে
- [ ] agent যা assume করেছে তা এখানে explicit করে লেখা আছে (schema, existing behavior, ইত্যাদি সম্পর্কে)
