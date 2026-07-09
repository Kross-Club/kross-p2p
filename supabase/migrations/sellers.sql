-- Sellers table: maps Supabase Auth users to seller profiles
CREATE TABLE IF NOT EXISTS sellers (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id  uuid    UNIQUE,           -- Supabase auth.users.id
  store_id      text    NOT NULL,
  nombre        text    NOT NULL,
  role_label    text    NOT NULL DEFAULT 'Ventas',  -- e.g. Ventas, Despacho, Motorizado, Postventa
  avatar_url    text,
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- Add seller info columns to order_sessions
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_role text;

-- When seller is assigned, denormalize their name/role into the session
-- (updated by register-buyer and reassignment logic)

CREATE INDEX IF NOT EXISTS idx_sellers_auth ON sellers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_store ON sellers(store_id);
