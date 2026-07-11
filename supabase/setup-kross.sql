-- ============================================================================
--  KROSS — SETUP COMPLETO
--  Pega TODO esto en Supabase → SQL Editor → RUN.
--  Es idempotente: puedes correrlo las veces que quieras, no rompe nada.
-- ============================================================================

-- ─── 1. COMPRADORES (identificados por DNI) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS buyers (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type   text        NOT NULL DEFAULT 'DNI'
                              CHECK (document_type IN ('DNI','CE','PASAPORTE')),
  document_number text,        -- DNI: llave permanente del comprador
  phone           text,        -- respaldo (puede cambiar)
  nombre          text,
  address         text,
  score           integer     DEFAULT 50,
  puntos          integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Por si la tabla ya existía de una versión anterior sin estas columnas:
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS document_type   text NOT NULL DEFAULT 'DNI';
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS phone           text;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS nombre          text;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS address         text;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS score           integer DEFAULT 50;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS puntos          integer DEFAULT 0;
-- Llamadas salientes del comprador: solo para clientes TOP (se activa a mano)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS can_call        boolean DEFAULT false;

-- Acciones de gamificación completadas (para subir el score)
CREATE TABLE IF NOT EXISTS buyer_actions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id   uuid REFERENCES buyers(id),
  action_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (buyer_id, action_key)
);

-- Únicos COMPLETOS (permiten varios NULL, pero no duplican DNI ni teléfono).
-- Deben ser índices únicos completos — NO parciales — para que el upsert
-- "onConflict: document_number / phone" de las Edge Functions funcione.
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_document_number ON buyers(document_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_phone           ON buyers(phone);


-- ─── 2. VENDEDORES (ligados a usuarios de Supabase Auth) ────────────────────
CREATE TABLE IF NOT EXISTS sellers (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id  uuid        UNIQUE,        -- = auth.users.id
  store_id      text        NOT NULL,
  nombre        text        NOT NULL,
  role_label    text        NOT NULL DEFAULT 'Ventas',
  avatar_url    text,
  active        boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS active     boolean DEFAULT true;
-- Turno on/off: si está en false, no recibe pedidos nuevos ni de sus clientes recurrentes
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS available  boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_sellers_auth  ON sellers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_store ON sellers(store_id);


-- ─── 3. PEDIDOS (order_sessions) — columnas nuevas ──────────────────────────
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS buyer_id      uuid REFERENCES buyers(id);
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address       text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_name   text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_role   text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS seller_avatar text;

CREATE INDEX IF NOT EXISTS idx_order_sessions_buyer_id ON order_sessions(buyer_id);


-- ─── 4. NOTIFICACIONES push por cuenta de comprador ─────────────────────────
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES buyers(id);
CREATE INDEX IF NOT EXISTS idx_push_subs_buyer_id ON push_subscriptions(buyer_id, sub_role);


-- ─── 5. FOTOS DE PERFIL de vendedores (Storage) ─────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_read"   ON storage.objects;
CREATE POLICY "avatars_read"   ON storage.objects
  FOR SELECT TO public        USING       (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK  (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated USING       (bucket_id = 'avatars');


-- ─── 5a. PRODUCTOS (landing por imágenes que sube el admin) ─────────────────
CREATE TABLE IF NOT EXISTS products (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   text,
  nombre     text        NOT NULL,
  precio     numeric     DEFAULT 0,
  images     text[]      DEFAULT '{}',   -- imágenes de la landing (full-bleed, en orden)
  packs      jsonb       DEFAULT '[]',   -- [{ nombre, descripcion, precio }]
  active     boolean     DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_read ON products;
CREATE POLICY products_read ON products FOR SELECT TO public USING (true);

-- Bucket para las imágenes de producto (lectura pública, sube el vendedor autenticado)
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS products_img_read   ON storage.objects;
CREATE POLICY products_img_read   ON storage.objects FOR SELECT TO public        USING (bucket_id = 'products');
DROP POLICY IF EXISTS products_img_upload ON storage.objects;
CREATE POLICY products_img_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'products');
DROP POLICY IF EXISTS products_img_update ON storage.objects;
CREATE POLICY products_img_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'products');


-- ─── 5b. CADENA DE VALOR: participación en el chat ──────────────────────────
-- involved_seller_ids: todos los agentes que han estado en el pedido (ven el chat)
-- writer_seller_ids:   quiénes pueden escribir/llamar ahora (dueño actual + invitados)
-- sender_role_label:   rol del que envió cada mensaje (para el distintivo en el chat)
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS involved_seller_ids uuid[] DEFAULT '{}';
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS writer_seller_ids   uuid[] DEFAULT '{}';
-- Invitados EXPLÍCITOS (para el chip bar) + quién invitó a cada uno (para expulsar)
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS invited_seller_ids  uuid[] DEFAULT '{}';
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS invited_by          jsonb  DEFAULT '{}';
ALTER TABLE chat_messages  ADD COLUMN IF NOT EXISTS sender_role_label   text;
-- Visibilidad del mensaje de sistema: 'all' (comprador y vendedores) o 'sellers'
ALTER TABLE chat_messages  ADD COLUMN IF NOT EXISTS visibility          text DEFAULT 'all';

-- Producto del pedido (para ver sus imágenes de la landing en el detalle)
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS product_id uuid;

-- Dirección de entrega + validación por GPS del comprador
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address_lat      double precision;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address_lng      double precision;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS address_verified boolean DEFAULT false;


-- ─── 6. PERMISOS (RLS) sobre sellers ────────────────────────────────────────
-- Los compradores nunca leen 'sellers' directo (van por Edge Functions con
-- service role, que ignora RLS). Aquí solo permitimos que la app de vendedor
-- lea nombres y que cada vendedor edite su propia fila (para su foto).
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sellers_read" ON sellers;
CREATE POLICY "sellers_read" ON sellers
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "sellers_self_update" ON sellers;
CREATE POLICY "sellers_self_update" ON sellers
  FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());


-- ─── 8. ADMIN / DUEÑO (uxbriel) ─────────────────────────────────────────────
-- Columna que marca quién es administrador (ve a TODO el equipo y puede
-- "entrar como" cualquier miembro). Los admin NO reciben pedidos nuevos.
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Crea (o actualiza) la fila de vendedor para el admin uxbriel@gmail.com,
-- ligándola a su usuario de Supabase Auth y usando el mismo store_id del equipo.
INSERT INTO sellers (auth_user_id, store_id, nombre, role_label, is_admin, active)
SELECT u.id,
       COALESCE((SELECT store_id FROM sellers WHERE store_id IS NOT NULL LIMIT 1), 't1'),
       'Uxbriel', 'Admin', true, true
FROM auth.users u
WHERE lower(u.email) = 'uxbriel@gmail.com'
ON CONFLICT (auth_user_id)
DO UPDATE SET is_admin = true, role_label = 'Admin';


-- ============================================================================
--  9. DATOS DE PRUEBA
-- ============================================================================

-- Ligar el DNI 48296862 al comprador con teléfono 925951393 (para tu prueba).
UPDATE buyers
SET document_number = '48296862', document_type = 'DNI'
WHERE (phone = '925951393' OR phone = '51925951393')
  AND document_number IS NULL;

-- (Opcional) Ver cómo quedaron los compradores:
-- SELECT nombre, phone, document_type, document_number, score FROM buyers;

-- (Opcional) Ver tus vendedores y su store_id (debe existir al menos uno activo):
-- SELECT nombre, role_label, store_id, auth_user_id, active FROM sellers;
