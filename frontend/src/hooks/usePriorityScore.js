// hooks/usePriorityScore.js
//
// ⬇️ নতুন — Phase 4 (Route Intelligence)
//
// "কাকে আগে ভিজিট করা উচিত" — শুধু দূরত্ব না, বাকি টাকা আর কতদিন ভিজিট হয়নি
// সেটাও মেলানো একটা score। ⚠️ এটা manager-এর ঠিক করা `visit_order`-কে
// প্রতিস্থাপন করে না — সেটা এখনো ডিফল্ট sort (manager হয়তো efficient
// walking-path মাথায় রেখে সাজিয়েছেন, যেটা এই score জানে না)। এটা একটা
// বিকল্প lens — sortMode='priority' বেছে নিলে দেখা যায়।
import { useMemo } from 'react';

// ⚠️ এই weight-গুলো সম্পূর্ণ tunable — বাস্তব ব্যবহারের অভিজ্ঞতা অনুযায়ী
// পরে বদলানো যায়। যোগফল ১ হওয়ার দরকার নেই, তুলনামূলক গুরুত্বই আসল।
const WEIGHTS = { distance: 0.40, due: 0.35, staleness: 0.25 };
const NEVER_VISITED_SENTINEL_DAYS = 999; // কখনো visit হয়নি = সর্বোচ্চ staleness ধরা হচ্ছে

function daysSince(dateStr) {
  if (!dateStr) return NEVER_VISITED_SENTINEL_DAYS;
  return Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function normalize(value, min, max) {
  if (max === min) return 0.5; // সবার মান সমান হলে কাউকে আলাদা সুবিধা/অসুবিধা না দেওয়া
  return (value - min) / (max - min);
}

/**
 * @param {Array} customers - পুরো লিস্ট (ভিতরেই visited_today ফিল্টার হয়)
 * @param {Object} distanceMap - useLiveDistances থেকে { customerId: meters }
 * @returns {Object} { customerId: score } — score ০-১, বেশি = আগে যাওয়া উচিত
 */
export function usePriorityScore(customers, distanceMap) {
  return useMemo(() => {
    const unvisited = customers.filter(c => !c.visited_today);
    if (unvisited.length === 0) return {};

    const dues      = unvisited.map(c => parseFloat(c.current_credit || 0));
    const staleness = unvisited.map(c => daysSince(c.last_visited_at));
    const distances = unvisited.map(c => distanceMap[c.id]).filter(d => d != null);

    const dueRange   = [Math.min(...dues), Math.max(...dues)];
    const staleRange = [Math.min(...staleness), Math.max(...staleness)];
    const distRange  = distances.length > 0 ? [Math.min(...distances), Math.max(...distances)] : [0, 0];

    const scores = {};
    unvisited.forEach(c => {
      const due   = parseFloat(c.current_credit || 0);
      const stale = daysSince(c.last_visited_at);
      const dist  = distanceMap[c.id];

      const normDue   = normalize(due, dueRange[0], dueRange[1]);
      const normStale = normalize(stale, staleRange[0], staleRange[1]);
      // GPS/দূরত্ব এখনো না জানা থাকলে neutral (০.৫) — শাস্তি না দিয়ে
      const normDist  = dist != null ? normalize(dist, distRange[0], distRange[1]) : 0.5;

      scores[c.id] =
        WEIGHTS.distance  * (1 - normDist) +  // কাছে হলে score বাড়ে
        WEIGHTS.due       * normDue +
        WEIGHTS.staleness * normStale;
    });
    return scores;
  }, [customers, distanceMap]);
}
