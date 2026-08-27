// utils/streamChat.js
// ✅ ধাপ ১ (স্ট্রিমিং, frontend অংশ)
//
// বিশুদ্ধ JS, কোনো React dependency নেই — তাই সরাসরি Node দিয়ে টেস্ট
// করা যায় (real fetch + ReadableStream, real local HTTP server-এর
// বিপরীতে), যা এই কোডবেসের বাকি সবকিছুর চেয়ে অনেক বেশি বাস্তব
// verification দেয়। useChat/CustomerAIChat শুধু callback-গুলো state
// আপডেটের সাথে জোড়া দেয়।
//
// onError(err, networkLevel):
//   networkLevel=true  → এখনো customer-কে কিছুই দেখানো হয়নি (validation
//     error, network failure, অথবা connect-ই হয়নি) — caller নিরাপদে
//     non-streaming endpoint-এ fallback করতে পারে, customer কিছু টেরও পাবে না
//   networkLevel=false → কিছু chunk ইতিমধ্যে দেখানো হয়ে গেছে, মাঝপথে
//     error এসেছে — fallback করা যাবে না (duplicate/confusing হবে),
//     এটাকেই চূড়ান্ত error ধরে দেখাতে হবে

// ✅ ফিক্স: history প্যারামিটার বাদ (server-side memory চালু হওয়ার পর
// backend আর client-history পড়েই না) — newThread flag যোগ, "নতুন চ্যাট"
// চাপলে backend-কেও fresh থ্রেড শুরু করতে বলার জন্য
export async function streamAIChat({ backend, jwt, message, newThread, onChunk, onDone, onError, signal }) {
  let response;
  try {
    response = await fetch(`${backend}/portal/ai-chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ message, new_thread: !!newThread }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return; // ইচ্ছাকৃত cancel — error না
    await onError(err, true);
    return;
  }

  if (!response.ok) {
    // ২০০ না মানে SSE শুরুই হয়নি (validation/৪০৩/৪২৯ ইত্যাদি) — এটা
    // normal JSON body, নিরাপদে fallback করা যায়
    let msg = 'সমস্যা হয়েছে।';
    try {
      const data = await response.json();
      msg = data.message || msg;
    } catch { /* body পার্স করা না গেলে ডিফল্ট বার্তা */ }
    await onError(new Error(msg), true);
    return;
  }

  if (!response.body) {
    await onError(new Error('আপনার ব্রাউজার স্ট্রিমিং সাপোর্ট করে না।'), true);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let gotAnyChunk = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // শেষ অংশ অসম্পূর্ণ হতে পারে

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }

        if (evt.type === 'chunk') {
          gotAnyChunk = true;
          onChunk(evt.text);
        } else if (evt.type === 'done') {
          onDone(evt);
          return;
        } else if (evt.type === 'error') {
          await onError(new Error(evt.message || 'কিছু একটা সমস্যা হয়েছে।'), false);
          return;
        }
      }
    }
    // লুপ শেষ হয়ে গেলো কিন্তু 'done' ইভেন্ট পাওয়া যায়নি — সংযোগ অস্বাভাবিকভাবে কাটলে হতে পারে
    await onError(new Error('সংযোগ অসম্পূর্ণভাবে শেষ হয়েছে।'), !gotAnyChunk);
  } catch (err) {
    if (err.name === 'AbortError') return;
    await onError(err, !gotAnyChunk);
  }
}
