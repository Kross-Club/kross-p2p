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

-- 6. If buyers table already existed without these columns:
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS document_type   text NOT NULL DEFAULT 'DNI';
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_doc ON buyers(document_number) WHERE document_number IS NOT NULL;

-- 7. Seller photo cached on the order session
ALTER TABLE sellers        ADD COLUMN IF NOT EXISTS avatar_url    text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_avatar text;

-- 8. Storage bucket for seller profile photos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow logged-in sellers to upload/replace their own photo
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

-- Allow sellers to update their own profile row (avatar, nombre)
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sellers_read" ON sellers;
CREATE POLICY "sellers_read" ON sellers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sellers_self_update" ON sellers;
CREATE POLICY "sellers_self_update" ON sellers
  FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());
