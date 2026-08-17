// chat/components/TypingDots.jsx
//
// CustomerAIChat.jsx-এ ঠিক এই bouncing-dots প্যাটার্নটাই ছিল, শুধু "AI ভাবছে"
// দেখানোর জন্য — dark গ্লাসমরফিক থিমে। এখানে cp- থিমে সাধারণীকরণ করা হলো,
// যাতে মানুষে-মানুষে চ্যাটেও "ও এখন টাইপ করছে" এর জন্য একই ভিজ্যুয়াল ভাষা ব্যবহার করা যায়।

import clsx from 'clsx'

export default function TypingDots({ accent = 'trust' }) {
  const dotClass = accent === 'warmth' ? 'bg-cp-warmth-500' : 'bg-cp-trust-500'
  return (
    <div className="flex items-center gap-1 px-3.5 py-2.5 bg-white rounded-2xl rounded-bl-md border border-cp-border w-fit mb-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={clsx('w-1.5 h-1.5 rounded-full animate-typing-dot', dotClass)}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <style>{`
        @keyframes typing-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-3px); opacity: 1; } }
        .animate-typing-dot { animation: typing-dot 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .animate-typing-dot { animation: none !important; opacity: 0.8; } }
      `}</style>
    </div>
  )
}
