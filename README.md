# NovaTechBD Management System

React + Node.js + PostgreSQL (Supabase) ভিত্তিক সেলস ম্যানেজমেন্ট সিস্টেম।

## সেটআপ

### ১. ডেটাবেজ
Supabase SQL Editor-এ `schema.sql` রান করুন।

### ২. Backend
```bash
cd backend
cp .env.example .env
# .env ফাইলে আপনার credentials বসান
npm install
npm run dev
```

### ৩. Frontend
```bash
cd frontend
# .env ফাইল তৈরি করুন:
# VITE_API_URL=http://localhost:5000/api
# VITE_FIREBASE_API_KEY=your_key
# VITE_FIREBASE_PROJECT_ID=your_project
# VITE_FIREBASE_DATABASE_URL=your_url
# VITE_FIREBASE_APP_ID=your_app_id
npm install
npm run dev
```

## টেকনোলজি
- **Frontend**: React 18, Vite, Tailwind CSS, Zustand, Firebase
- **Backend**: Node.js, Express, PostgreSQL (Supabase)
- **AI**: Claude API (Anthropic)
- **SMS**: SSL Wireless
