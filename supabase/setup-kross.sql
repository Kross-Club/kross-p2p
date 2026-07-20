-- ============================================================================
--  KROSS — SETUP COMPLETO
--  Pega TODO esto en Supabase → SQL Editor → RUN.
--  Es idempotente: puedes correrlo las veces que quieras, no rompe nada.
-- ============================================================================

-- ─── 0. TIENDAS (multi-tenant / white-label) ────────────────────────────────
-- Cada marca es una tienda con su subdominio (marca.kross.app), logo y colores.
CREATE TABLE IF NOT EXISTS stores (
  id            text        PRIMARY KEY,          -- = order_sessions.store_id / sellers.store_id
  slug          text        UNIQUE NOT NULL,      -- subdominio: <slug>.kross.app
  nombre        text        NOT NULL,
  logo_url      text,
  color_primary text        DEFAULT '#55C8F5',
  color_dark    text        DEFAULT '#060C1A',
  active        boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stores_read ON stores;
CREATE POLICY stores_read ON stores FOR SELECT TO public USING (true);

-- Fallback por WhatsApp (Cloud API). Un token global (WHATSAPP_TOKEN, secret) +
-- el phone_number_id de cada marca → cada tienda envía desde su propio número.
-- Mientras wa_enabled sea false o falte el token, el fallback es no-op (no envía).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wa_enabled         boolean DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wa_phone_number_id text;   -- ID del número en WhatsApp Cloud API
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wa_display_phone   text;   -- número visible de la marca (informativo)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wa_business_account_id text; -- WABA ID (para listar plantillas)

-- Ícono de notificación (PNG transparente/circular). Se muestra en los push como
-- el ícono de la tienda. Si falta, cae al logo.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS notif_icon_url     text;

-- Retención: recompensa de bienvenida al reclamar (puntos) + mensaje.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS welcome_points     integer DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS welcome_msg        text;
-- Canje de puntos: cuánto vale 1 punto en soles (0 = canje desactivado).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS points_rate        numeric DEFAULT 0;

-- Compradores pasan a ser por tienda (un cliente de una marca no es de otra)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS store_id text;
-- El mismo DNI puede existir en varias marcas → unicidad POR TIENDA, no global
DROP INDEX IF EXISTS idx_buyers_document_number;
DROP INDEX IF EXISTS idx_buyers_phone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_store_doc   ON buyers(store_id, document_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_store_phone ON buyers(store_id, phone);

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
-- Retención: de dónde vino el comprador y si ya reclamó su recompensa de bienvenida
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS source          text DEFAULT 'order';   -- 'order' | 'import'
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS welcome_granted boolean DEFAULT false;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS activated_at    timestamptz;            -- primer login del cliente
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS invited_at      timestamptz;            -- última invitación masiva enviada

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

-- Bitácora de notificaciones: qué se intentó por push y si cayó a WhatsApp.
-- Sirve para medir cobertura de push vs. costo de WhatsApp por tienda.
CREATE TABLE IF NOT EXISTS notifications_log (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   text,
  buyer_id   uuid,
  session_id text,
  kind       text,       -- 'message' | 'call' | 'status'
  push_count integer     DEFAULT 0,
  whatsapp   text,       -- 'sent' | 'skipped' | 'failed' | 'not_needed'
  detail     text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY; -- solo service role (Edge Functions)
CREATE INDEX IF NOT EXISTS idx_notiflog_store ON notifications_log(store_id, created_at DESC);

-- Grabaciones de llamadas (LiveKit Egress → Storage privado). El admin las escucha
-- desde el panel vía URLs firmadas que genera una Edge Function.
CREATE TABLE IF NOT EXISTS call_recordings (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id     text,
  session_id   text,
  egress_id    text,
  room_name    text,
  caller_role  text,       -- 'seller' | 'buyer'
  caller_name  text,
  buyer_name   text,
  file_path    text,       -- ruta dentro del bucket call-recordings
  duration_sec integer,
  status       text        DEFAULT 'recording',  -- 'recording' | 'done' | 'failed'
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY; -- solo service role
CREATE INDEX IF NOT EXISTS idx_callrec_store   ON call_recordings(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_callrec_session ON call_recordings(session_id);

-- Bucket PRIVADO para los audios (acceso solo por URL firmada del admin)
INSERT INTO storage.buckets (id, name, public) VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;


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


-- ─── 5c. BRANDING (logos de cada marca — onboarding de tiendas) ─────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS branding_read   ON storage.objects;
CREATE POLICY branding_read   ON storage.objects FOR SELECT TO public        USING (bucket_id = 'branding');
DROP POLICY IF EXISTS branding_upload ON storage.objects;
CREATE POLICY branding_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding');
DROP POLICY IF EXISTS branding_update ON storage.objects;
CREATE POLICY branding_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding');


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
-- Carrito multi-producto: [{ product_id, nombre, precio, pack_name }]. product_price = total del pedido
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]';

-- Dirección verificada a nivel de comprador (aplica a todos sus pedidos)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS address_lat      double precision;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS address_lng      double precision;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS address_verified boolean DEFAULT false;
-- Nota/sub-tag del CRM: cancelado, no_contesta, recuperado, anulado…
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS nota text;
-- Oferta de upsell adjunta a un mensaje del chat
ALTER TABLE chat_messages  ADD COLUMN IF NOT EXISTS offer jsonb;

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
-- Super admin = dueño de la PLATAFORMA (Kross). Puede dar de alta marcas nuevas
-- (crear tienda + su primer admin) y editar el branding de cualquier tienda.
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- Tienda de la PLATAFORMA (Kross HQ). NO es una marca visible: es la "casa" del
-- super admin, separada de las marcas de clientes. Id dedicado 'platform'.
INSERT INTO stores (id, slug, nombre, color_primary, color_dark, active)
VALUES ('platform', 'kross', 'Kross', '#55C8F5', '#060C1A', true)
ON CONFLICT (id) DO NOTHING;

-- Crea (o actualiza) la fila de vendedor para el admin uxbriel@gmail.com.
-- El super admin SIEMPRE pertenece a la tienda plataforma 'platform' (Kross HQ),
-- separada de cualquier marca de cliente/demo.
INSERT INTO sellers (auth_user_id, store_id, nombre, role_label, is_admin, is_super_admin, active)
SELECT u.id, 'platform', 'Uxbriel', 'Admin', true, true, true
FROM auth.users u
WHERE lower(u.email) = 'uxbriel@gmail.com'
ON CONFLICT (auth_user_id)
DO UPDATE SET is_admin = true, is_super_admin = true, role_label = 'Admin', store_id = 'platform';


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
