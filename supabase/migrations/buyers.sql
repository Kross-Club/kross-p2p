-- Buyers table: DNI/CE as primary unique identifier
CREATE TABLE IF NOT EXISTS buyers (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type   text    NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI','CE','PASAPORTE')),
  document_number text    UNIQUE NOT NULL,
  phone           text,
  nombre          text,
  address         text,
  score           integer DEFAULT 50,
  puntos          integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Link order sessions to buyer accounts
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES buyers(id);
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address  text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_sessions_buyer_id  ON order_sessions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyers_phone             ON buyers(phone);

-- Support buyer_id in push_subscriptions
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES buyers(id);
CREATE INDEX IF NOT EXISTS idx_push_subs_buyer_id ON push_subscriptions(buyer_id, sub_role);
