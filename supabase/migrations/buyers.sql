-- Run this entire block in Supabase SQL Editor

-- 1. Create buyers table (document_number as unique identifier)
CREATE TABLE IF NOT EXISTS buyers (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type   text    NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI','CE','PASAPORTE')),
  document_number text    UNIQUE,          -- unique when provided
  phone           text    UNIQUE,          -- fallback unique identifier
  nombre          text,
  address         text,
  score           integer DEFAULT 50,
  puntos          integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- 2. Add buyer-related columns to order_sessions
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS buyer_id   uuid REFERENCES buyers(id);
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address    text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_role text;

-- 3. Add buyer_id to push_subscriptions
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES buyers(id);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_order_sessions_buyer_id  ON order_sessions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyers_phone             ON buyers(phone);
CREATE INDEX IF NOT EXISTS idx_push_subs_buyer_id       ON push_subscriptions(buyer_id, sub_role);

-- 5. Sellers table
CREATE TABLE IF NOT EXISTS sellers (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id  uuid    UNIQUE,
  store_id      text    NOT NULL,
  nombre        text    NOT NULL,
  role_label    text    NOT NULL DEFAULT 'Ventas',
  avatar_url    text,
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sellers_auth  ON sellers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_store ON sellers(store_id);
