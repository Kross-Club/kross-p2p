-- Buyers table: one account per phone number
CREATE TABLE IF NOT EXISTS buyers (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  phone      text    UNIQUE NOT NULL,
  nombre     text,
  address    text,
  score      integer DEFAULT 50,
  puntos     integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Link order sessions to buyer accounts
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES buyers(id);
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address  text;

-- Index for fast lookup of orders by buyer
CREATE INDEX IF NOT EXISTS idx_order_sessions_buyer_id ON order_sessions(buyer_id);

-- Also support buyer_id in push_subscriptions for notifications
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES buyers(id);
CREATE INDEX IF NOT EXISTS idx_push_subs_buyer_id ON push_subscriptions(buyer_id, sub_role);
