// chat/cards/CardMessage.jsx
//
// MessageBubble msg.kind === 'card' হলে এটা রেন্ডার হয় (টেক্সট বাবলের বদলে)।
// নতুন cardType যোগ করতে হলে শুধু এখানে একটা entry বাড়ালেই হবে।

import DueCard from './DueCard'
import DeliveryCard from './DeliveryCard'

const REGISTRY = {
  due: DueCard,
  delivery: DeliveryCard,
}

export default function CardMessage({ msg }) {
  const Card = REGISTRY[msg.cardType]
  if (!Card || !msg.cardPayload) {
    // অজানা/ভবিষ্যতের cardType — অন্তত preview টেক্সট দেখাও, ভাঙা UI না
    return <p className="text-[13px] text-cp-text-secondary italic">{msg.text || 'কার্ড লোড করা যায়নি'}</p>
  }
  return <Card payload={msg.cardPayload} />
}
