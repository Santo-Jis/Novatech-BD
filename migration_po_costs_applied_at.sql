-- landed cost (আমদানি/পরিবহন খরচ) cost_price-এ প্রয়োগ হয়েছে কিনা ট্র্যাক করার জন্য।
-- NULL = এখনো প্রয়োগ হয়নি → P&L-এ "unapplied_landed_cost" সতর্কতা দেখায়।
ALTER TABLE purchase_order_costs ADD COLUMN IF NOT EXISTS applied_at timestamptz;
