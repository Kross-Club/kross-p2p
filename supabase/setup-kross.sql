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
-- Retención Fase 3: ventanas de campaña (días desde la última entrega)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS restock_days       integer DEFAULT 30;  -- reponer consumible
ALTER TABLE stores ADD COLUMN IF NOT EXISTS winback_days       integer DEFAULT 60;  -- cliente inactivo

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
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS last_campaign_at timestamptz;            -- última campaña de retención (cooldown 7d)

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

-- Contienen PII (DNI/teléfono): solo las Edge Functions (service role) las tocan.
ALTER TABLE buyers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_actions ENABLE ROW LEVEL SECURITY;


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
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY; -- solo service role (Edge Functions)

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

-- Sin SELECT policy: el bucket es público (URL pública funciona igual) pero
-- nadie puede listar su contenido completo desde el cliente.
DROP POLICY IF EXISTS "avatars_read"   ON storage.objects;
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
  packs      jsonb       DEFAULT '[]',   -- [{ nombre, descripcion, precio, image? }]
  active     boolean     DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_read ON products;
CREATE POLICY products_read ON products FOR SELECT TO public USING (true);

-- Bucket para las imágenes de producto (lectura pública, sube el vendedor autenticado)
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS products_img_read   ON storage.objects; -- sin listado público del bucket
DROP POLICY IF EXISTS products_img_upload ON storage.objects;
CREATE POLICY products_img_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'products');
DROP POLICY IF EXISTS products_img_update ON storage.objects;
CREATE POLICY products_img_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'products');


-- ─── 5c. BRANDING (logos de cada marca — onboarding de tiendas) ─────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS branding_read   ON storage.objects; -- sin listado público del bucket
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

-- ─── COSTURAS DEL ESTADO CENTRAL (MerchantCustomerSession) ───────────────────
-- Columnas-costura para conectar los 3 módulos sin refactor. Aditivas y con default
-- seguro para el MVP (todo es COD / motorizado Lima / cierre directo hasta que exista
-- el pago integrado, provincia o el AI closer). Ver docs/00-CORE-ARCHITECTURE.md.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'CONTRAENTREGA'; -- YAPE_PLIN | CONTRAENTREGA | TARJETA
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS dispatch_type  text DEFAULT 'MOTORIZADO_LIMA'; -- MOTORIZADO_LIMA | MOTORIZADO_PROVINCIA | AGENCIA_PROVINCIA | AGENCIA_LIMA
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS agency_name    text;                          -- SHALOM | OLVA | OTRO (solo provincia)
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS delivery_reference text;                      -- referencia de la puerta
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS closed_by      text DEFAULT 'DIRECT_CHECKOUT'; -- AI_CLOSER | DIRECT_CHECKOUT


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


-- ─── 12. LEADS PARCIALES DEL CHECKOUT ───────────────────────────────────────
-- Pedido a medio llenar, guardado apenas el WhatsApp es válido. Es lo que
-- permite recuperar abandonos. NO va en order_sessions a propósito: ahí
-- contaminaría el CRM y el round-robin le asignaría un vendedor a cada lead que
-- nunca compró. Ver docs/01-SALES-ENGINE.md.
CREATE TABLE IF NOT EXISTS checkout_drafts (
  order_id        uuid        PRIMARY KEY,   -- mismo uuid que usará el pedido
  store_id        text        NOT NULL,
  phone           text        NOT NULL,      -- con prefijo país (51XXXXXXXXX)
  buyer_name      text,
  document_number text,
  product_id      text,
  pack_name       text,
  location_type   text,                      -- LIMA | PROVINCIA
  district        text,
  last_step       integer     DEFAULT 1,     -- hasta dónde llegó
  -- Se marca cuando el lead termina convirtiendo, para no perseguir a quien ya compró.
  converted_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Contiene PII (teléfono/DNI): solo las Edge Functions con service role la tocan.
ALTER TABLE checkout_drafts ENABLE ROW LEVEL SECURITY;

-- Recuperación de abandonos: los más recientes de la tienda que aún no compraron.
CREATE INDEX IF NOT EXISTS idx_checkout_drafts_recovery
  ON checkout_drafts(store_id, updated_at DESC)
  WHERE converted_at IS NULL;


-- ─── 13. ADELANTO POR YAPE (Fase 3 del checkout) ────────────────────────────
-- Provincia adelanta el flete por Yape. El comprador sube su comprobante; en
-- paralelo entra el pago real por `yape-ingest` y el backend los cruza.
-- Ver docs/01-SALES-ENGINE.md §3.

-- 13.a Datos de cobro POR TIENDA. Kross es multi-tenant: cada marca cobra a su
-- propio Yape. Nunca en código ni en config del front.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS yape_number  text;   -- 9 dígitos
ALTER TABLE stores ADD COLUMN IF NOT EXISTS yape_holder  text;   -- titular, tal como lo muestra Yape
ALTER TABLE stores ADD COLUMN IF NOT EXISTS yape_qr_url  text;   -- QR en bucket público (desktop)
-- ¿Un match automático pasa el pedido a confirmado, o siempre lo confirma una
-- persona? Arranca en false a propósito: primero se mide cuánto acierta.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS yape_autoconfirm boolean DEFAULT false;

-- 13.a-ter ¿Esta marca ofrece entrega a DOMICILIO, o solo recojo en agencia?
--
-- El recojo en agencia SIEMPRE está disponible: es la salida que nunca se cierra.
-- Lo que esta columna prende o apaga es la otra rama —el motorizado en Lima, el
-- courier a domicilio en provincia—, que es la que depende de tener operación de
-- última milla contratada.
--
-- OJO con el default: es `true` para que al correr este script las marcas que HOY
-- reparten a domicilio no se queden sin esa opción de un día para otro. Las marcas
-- NUEVAS nacen en `false` porque `manage-store` (acción `create`) lo escribe
-- explícito. Un default `false` aquí habría apagado el domicilio de todos, y
-- backfillear con un UPDATE rompería la idempotencia del script: al re-correrlo
-- volvería a prender lo que el admin apagó a mano.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS home_delivery_enabled boolean DEFAULT false;
-- El default es FALSE, y es una decisión de riesgo, no de gusto: prometer
-- entrega a la puerta y no cumplirla cuesta más que no ofrecerla. Una marca
-- nueva no debe nacer prometiéndola — la enciende cuando tiene última milla
-- contratada. El ADD COLUMN de arriba no toca tiendas existentes, así que el
-- ALTER separado es el que mueve el default en bases ya creadas.
ALTER TABLE stores ALTER COLUMN home_delivery_enabled SET DEFAULT false;

-- ⚠️ Estas tres columnas son PÚBLICAS a propósito: el checkout se las muestra al
-- comprador para que yapee. `stores` tiene SELECT público (política
-- `stores_read`), y RLS es por FILA, no por columna: cualquier cosa que se
-- agregue a esta tabla queda legible con la anon key. Por eso el token del
-- ingestor NO vive aquí sino en `store_secrets` (13.a-bis).

-- 13.a-bis Secretos por tienda. Tabla aparte justamente porque `stores` se lee
-- en público. Sin políticas: solo el service role de las Edge Functions entra.
CREATE TABLE IF NOT EXISTS store_secrets (
  store_id             text PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  -- Lo lleva el celular que lee las notificaciones de Yape. Si se filtra, se
  -- rota esta fila y el lector vuelve a configurarse; nada más cambia.
  payment_ingest_token text NOT NULL,
  created_at           timestamptz DEFAULT now()
);
ALTER TABLE store_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_secrets FROM anon, authenticated;

-- 13.b Columnas de pago del pedido.
-- `checkout_id` es el uuid que nace al abrir el modal: hace el alta IDEMPOTENTE.
-- Sin esto, un doble tap en "Terminar pedido" con 4G lenta crea dos pedidos.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS checkout_id          uuid;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_amount       numeric DEFAULT 0;
-- Mitad (mínimo) o total. El adelanto dejó de ser una tabla por destino y pasó a
-- ser un porcentaje del pedido, así que `culqi-charge` necesita saber cuál de
-- las dos eligió el comprador para volver a derivar el mismo monto y cobrarlo.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_choice       text DEFAULT 'HALF'; -- HALF | FULL
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_voucher_url  text;
-- Código de seguridad que TECLEA el comprador. Es la llave fuerte del cruce.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_yape_code    text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_verification text DEFAULT 'NOT_REQUIRED'; -- NOT_REQUIRED | PENDING | MATCHED | UNMATCHED
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_matched_at   timestamptz;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_reason       text;  -- por qué NO cuadró; para quien revisa, jamás para el comprador
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_event_id     uuid;  -- el pago que lo cuadró

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_sessions_checkout_id
  ON order_sessions(checkout_id) WHERE checkout_id IS NOT NULL;
-- Cola de revisión: los adelantos que esperan veredicto, primero los más viejos.
CREATE INDEX IF NOT EXISTS idx_order_sessions_payment_pending
  ON order_sessions(store_id, created_at)
  WHERE payment_verification = 'PENDING';

-- 13.c Pagos leídos del celular del dueño. Se guardan TODOS, cuadren o no:
-- un pago sin pedido hoy puede ser el de un pedido que entra en 30 segundos, y
-- `raw` permite reprocesar si el parser resultó corto.
CREATE TABLE IF NOT EXISTS payment_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      text        NOT NULL,
  source        text        NOT NULL,          -- ANDROID_LISTENER | AUTOMATION | MANUAL
  raw           text        NOT NULL,          -- texto crudo de la notificación
  amount_pen    numeric,
  sender_name   text,
  security_code text,
  operation_number text,
  -- Llave anti-duplicado: la misma notificación llega dos veces con frecuencia.
  dedupe_key    text        NOT NULL,
  -- Pedido que consumió este pago. NULL = todavía no cuadró con ninguno.
  matched_order_id uuid,
  matched_at    timestamptz,
  received_at   timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

-- Un pago entra UNA vez por tienda, y cuadra UN solo pedido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_dedupe
  ON payment_events(store_id, dedupe_key);
-- Búsqueda del cruce: pagos de la tienda aún sin consumir, por monto.
CREATE INDEX IF NOT EXISTS idx_payment_events_unmatched
  ON payment_events(store_id, amount_pen, received_at DESC)
  WHERE matched_order_id IS NULL;

-- Contiene el nombre de quien paga (PII) y el token de cobro: solo service role.
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- 13.d Bucket de comprobantes. PRIVADO: una captura de Yape lleva nombre y
-- teléfono. El equipo la ve por URL firmada desde la Edge Function.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vouchers', 'vouchers', false)
ON CONFLICT (id) DO NOTHING;

-- 13.e El comprador sube su comprobante con la anon key (no tiene sesión). Se
-- le permite ESCRIBIR en el bucket, nunca leer: el bucket es privado y el
-- equipo abre las capturas con URL firmada desde una Edge Function.
DROP POLICY IF EXISTS vouchers_public_insert ON storage.objects;
CREATE POLICY vouchers_public_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'vouchers');

-- 13.f Motivo por el que un pago entrante NO se procesó (texto ilegible, pago
-- saliente, variable del automatizador sin expandir…). Antes esos casos
-- respondían 200 y no dejaban rastro: la fila no existía y no había forma de
-- saber por qué. Un pago que no se ve es un pago perdido.
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS ignored_reason text;
-- El índice de cruce solo debe mirar pagos utilizables.
DROP INDEX IF EXISTS idx_payment_events_unmatched;
CREATE INDEX IF NOT EXISTS idx_payment_events_unmatched
  ON payment_events(store_id, amount_pen, received_at DESC)
  WHERE matched_order_id IS NULL AND ignored_reason IS NULL;

-- ─── 14. Etapa `validando` ───────────────────────────────────────────────────
-- Un pedido con adelanto quedaba en "Pedido" desde que el comprador pagaba
-- hasta que alguien lo confirmaba: pagó y su barra no se movía. Sin señal de
-- avance, su siguiente paso es escribir "¿llegó mi pago?" — justo el mensaje
-- que el checkout existe para evitar.
--
-- Va ENTRE `nuevo` y `confirmado`. Los pedidos sin adelanto no la usan: en Lima
-- no hay nada que validar y el pedido nace confirmado.
ALTER TABLE order_sessions DROP CONSTRAINT IF EXISTS order_sessions_stage_check;
ALTER TABLE order_sessions ADD CONSTRAINT order_sessions_stage_check
  CHECK (stage = ANY (ARRAY[
    'nuevo'::text, 'validando'::text, 'confirmado'::text,
    'preparando'::text, 'en_camino'::text, 'entregado'::text
  ]));

-- ─── Variante del checkout (experimento A/B) ─────────────────────────────────
-- Con cuál de las dos versiones se cerró el pedido. Sin esta columna el
-- experimento no se puede leer: se sabe cuánta gente vio cada una (analítica de
-- front) pero no cuál terminó vendiendo, que es la única pregunta que importa.
alter table public.order_sessions
  add column if not exists checkout_variant text
  check (checkout_variant is null or checkout_variant in ('A', 'B'));

create index if not exists order_sessions_checkout_variant_idx
  on public.order_sessions (checkout_variant) where checkout_variant is not null;

-- ─── 15. WEB PÚBLICA (krossclub.app) ─────────────────────────────────────────
-- Lo que necesita la web pública de la plataforma para cumplir con los
-- requisitos de la pasarela de pago (Culqi) y con INDECOPI:
--   · `web_orders`  → pedidos hechos desde el carrito de krossclub.app
--   · `complaints`  → Libro de Reclamaciones virtual
-- Ninguna de las dos se lee desde el navegador: contienen datos personales y
-- ambas se escriben solo desde Edge Functions con service role.

-- 15.a Pedidos de la web pública -------------------------------------------
-- Correlativo visible para el cliente: KR-2026-000123.
CREATE SEQUENCE IF NOT EXISTS web_orders_numero_seq;

CREATE TABLE IF NOT EXISTS web_orders (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  numero       bigint      NOT NULL DEFAULT nextval('web_orders_numero_seq'),
  codigo       text        UNIQUE,               -- KR-AAAA-NNNNNN (lo pone el trigger)
  tipo_cliente text        NOT NULL CHECK (tipo_cliente IN ('natural','empresa')),
  nombre       text        NOT NULL,             -- nombre completo o razón social
  documento    text        NOT NULL,             -- DNI (8) o RUC (11)
  email        text        NOT NULL,
  telefono     text        NOT NULL,
  nota         text,
  items        jsonb       NOT NULL DEFAULT '[]',
  -- Total que se le MOSTRÓ al cliente en el navegador. No es el importe a
  -- cobrar: cuando se conecte la pasarela, el cobro se calcula en el servidor.
  total_mostrado numeric   NOT NULL DEFAULT 0,
  estado       text        NOT NULL DEFAULT 'nuevo'
                           CHECK (estado IN ('nuevo','contactado','pagado','anulado')),
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE web_orders ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo service role
CREATE INDEX IF NOT EXISTS idx_web_orders_created ON web_orders(created_at DESC);

-- 15.b Libro de Reclamaciones (D.S. 011-2011-PCM y modificatorias) ----------
-- Campos obligatorios de la Hoja de Reclamación: correlativo, fecha,
-- identificación del consumidor, del bien contratado y el detalle, más el
-- espacio para la respuesta del proveedor (plazo: 15 días hábiles).
CREATE SEQUENCE IF NOT EXISTS complaints_numero_seq;

CREATE TABLE IF NOT EXISTS complaints (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  numero          bigint      NOT NULL DEFAULT nextval('complaints_numero_seq'),
  codigo          text        UNIQUE,            -- LR-AAAA-NNNNNN (lo pone el trigger)
  -- Marca sobre la que se reclama. NULL = la plataforma (krossclub.app).
  store_id        text,
  store_nombre    text,
  tipo            text        NOT NULL CHECK (tipo IN ('RECLAMO','QUEJA')),
  -- Consumidor
  consumidor_nombre    text   NOT NULL,
  consumidor_doc_tipo  text   NOT NULL CHECK (consumidor_doc_tipo IN ('DNI','CE','PASAPORTE','RUC')),
  consumidor_doc_num   text   NOT NULL,
  consumidor_domicilio text   NOT NULL,
  consumidor_telefono  text   NOT NULL,
  consumidor_email     text   NOT NULL,
  es_menor        boolean     NOT NULL DEFAULT false,
  apoderado_nombre   text,                       -- obligatorio si es_menor
  apoderado_doc_num  text,
  apoderado_contacto text,
  -- Bien contratado
  bien_tipo       text        NOT NULL CHECK (bien_tipo IN ('PRODUCTO','SERVICIO')),
  bien_desc       text        NOT NULL,
  monto_reclamado numeric,
  pedido_ref      text,                          -- código de pedido, si lo hay
  -- Detalle
  detalle         text        NOT NULL,
  pedido_consumidor text      NOT NULL,          -- qué solicita el consumidor
  -- Respuesta del proveedor
  estado          text        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente','respondido','cerrado')),
  respuesta       text,
  respondido_at   timestamptz,
  -- Rastro de la presentación
  copia_email_enviada boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo service role
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_store   ON complaints(store_id, created_at DESC);
-- Los pendientes son los que corren contra el plazo legal: se listan primero.
CREATE INDEX IF NOT EXISTS idx_complaints_pendientes
  ON complaints(created_at) WHERE estado = 'pendiente';

-- 15.c Correlativo legible ---------------------------------------------------
-- El número correlativo es obligatorio en la Hoja de Reclamación y es lo que
-- cita el consumidor. Se arma con la hora de Lima: en UTC, un reclamo del 31 de
-- diciembre por la noche caería en el año siguiente.
CREATE OR REPLACE FUNCTION set_codigo_correlativo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := TG_ARGV[0] || '-'
      || to_char(now() AT TIME ZONE 'America/Lima', 'YYYY') || '-'
      || lpad(NEW.numero::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_web_orders_codigo ON web_orders;
CREATE TRIGGER trg_web_orders_codigo BEFORE INSERT ON web_orders
  FOR EACH ROW EXECUTE FUNCTION set_codigo_correlativo('KR');

DROP TRIGGER IF EXISTS trg_complaints_codigo ON complaints;
CREATE TRIGGER trg_complaints_codigo BEFORE INSERT ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_codigo_correlativo('LR');

-- ─── 16. COBRO CON CULQI (Yape con código de aprobación) ─────────────────────
-- La tienda que conecta su cuenta Culqi cobra el adelanto EN el checkout: el
-- comprador genera su código de aprobación en Yape (6 dígitos, vence en 2 min),
-- lo pega, y Kross hace el cargo server-side con las llaves de ESA tienda. El
-- dinero entra directo a la cuenta Culqi de la marca. El flujo manual (caja con
-- número + código de 3 dígitos + cruce por `yape-ingest`) queda intacto para
-- las tiendas sin Culqi. Ver docs/01-SALES-ENGINE.md §3.3.

-- 16.a Flags PÚBLICOS en stores. Solo lo que el checkout necesita para decidir
-- qué UI pintar — `stores` tiene SELECT público (política `stores_read`), así
-- que aquí no puede vivir ninguna llave. El scope acota DÓNDE cobra Culqi:
-- 'PROVINCIA' deja Lima en manual; 'ALL' cobra en todo el país. Es la retirada
-- operativa: si la conversión limeña sufre, se repliega desde el panel sin
-- tocar código.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS culqi_enabled boolean DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS culqi_scope   text    DEFAULT 'PROVINCIA';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_culqi_scope_check;
ALTER TABLE stores ADD CONSTRAINT stores_culqi_scope_check
  CHECK (culqi_scope IN ('PROVINCIA', 'ALL'));

-- 16.b Llaves por tienda, en `store_secrets` (service role only, sin políticas
-- — ver 13.a-bis). Van AMBAS aquí, también la pública: la tokenización es
-- server-to-server (secure.culqi.com/v2/tokens/yape acepta la pk desde un
-- backend), el navegador nunca la necesita, y una pk expuesta permite generar
-- tokens contra la cuenta de la marca sin motivo.
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS culqi_public_key      text; -- pk_test_/pk_live_
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS culqi_secret_key      text; -- sk_test_/sk_live_
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS culqi_keys_updated_at timestamptz;
-- Una tienda puede usar Culqi sin haber configurado nunca el lector de Yape:
-- su fila en store_secrets nace sin token de ingesta. `yape-ingest` ya trata
-- el NULL como "ingesta apagada" (responde 401), así que soltar el NOT NULL
-- no abre nada.
ALTER TABLE store_secrets ALTER COLUMN payment_ingest_token DROP NOT NULL;

-- 16.c El cargo de Culqi entra a `payment_events` como un pago más: misma
-- trazabilidad, misma tabla que audita cuánto cobró cada marca. `provider`
-- distingue la fuente del dinero; `provider_charge_id` es el chr_... de Culqi
-- y `provider_fee_pen` la comisión en soles (para que la marca vea lo que de
-- verdad recibe). El anti-duplicado NO necesita índice nuevo:
-- dedupe_key = 'culqi:' || charge_id reutiliza el índice único
-- (store_id, dedupe_key) del 13.c — si el webhook y `culqi-charge` graban el
-- mismo cargo, el segundo choca en 23505 y es no-op. El mismo índice sostiene
-- el claim-lock 'culqi:lock:' || session_id con el que `culqi-charge` se
-- asegura de que dos toques concurrentes no generen dos cargos reales.
-- `source` gana el valor 'CULQI' (la columna es texto libre, sin constraint).
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider           text;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider_charge_id text;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider_fee_pen   numeric;

-- 16.d Marca de procedencia del pedido. NULL = flujo manual; 'CULQI' = el
-- adelanto se cobra en línea. Es la línea que separa las dos piscinas de
-- cruce: un pedido Culqi NO puede ser consumido por el cruce manual (un yape
-- ajeno de igual monto lo daría por pagado y `culqi-charge` respondería
-- "ya pagado" sin haber cobrado un sol). `register-buyer` la escribe al alta
-- y tanto su reverse-match como `yape-ingest` excluyen estos pedidos.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_provider text;

-- 16.e Tienda de ORIGEN del pedido (la del producto). `register-buyer` puede
-- asignar la sesión a la tienda de un vendedor de OTRA marca cuando no hay
-- Ventas disponible en la propia (round-robin cross-store), y las llaves de
-- Culqi se tienen que resolver por la marca que VENDE, jamás por la del
-- vendedor asignado — cobrar a la cuenta de otra marca es el peor bug posible.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS origin_store_id text;

-- 16.f Contador de intentos de cobro. Con un order_token válido (el propio) se
-- podrían lanzar intentos ilimitados contra la pk de la marca — quemar su
-- antifraude o probar OTPs de terceros. Corte duro en `culqi-charge`.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_charge_attempts int DEFAULT 0;

-- ─── 17. ETAPA TERMINAL `no_entregado` ───────────────────────────────────────
-- Hasta aquí la máquina de etapas solo avanzaba: un pedido rechazado en puerta
-- era indistinguible de uno en camino, y la TASA DE ENTREGA — la métrica que
-- define un negocio COD — no se podía calcular. `no_entregado` es terminal y
-- lo marca una persona de Ventas/Logística, nunca el sistema.
-- tasa de entrega = entregado / (entregado + no_entregado).
ALTER TABLE order_sessions DROP CONSTRAINT IF EXISTS order_sessions_stage_check;
ALTER TABLE order_sessions ADD CONSTRAINT order_sessions_stage_check
  CHECK (stage = ANY (ARRAY[
    'nuevo'::text, 'validando'::text, 'confirmado'::text,
    'preparando'::text, 'en_camino'::text, 'entregado'::text,
    'no_entregado'::text
  ]));

-- ─── 18. UNICIDAD DE BUYERS: POR TIENDA DE VERDAD ────────────────────────────
-- Los DROP del bloque 0 (idx_buyers_document_number / idx_buyers_phone) creían
-- limpiar la unicidad GLOBAL de la era pre-multi-tenant, pero producción tenía
-- además una CONSTRAINT (`buyers_phone_key`) y dos índices con otros nombres
-- que sobrevivieron. El efecto real: un cliente no podía existir en dos
-- marcas, y un comprador pre-DNI que volvía CON DNI moría en 500 al chocar
-- consigo mismo por teléfono. Verificado contra pg_constraint/pg_indexes de
-- producción el 11-ago-2026 (el 500 exacto: "duplicate key value violates
-- unique constraint buyers_phone_key"). Quedan vivas SOLO las per-tienda:
-- idx_buyers_store_doc e idx_buyers_store_phone, que son las que el código
-- usa como onConflict.
ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_phone_key;
DROP INDEX IF EXISTS idx_buyers_phone;
DROP INDEX IF EXISTS idx_buyers_document_number;
DROP INDEX IF EXISTS idx_buyers_doc_number;
DROP INDEX IF EXISTS idx_buyers_doc;

-- ─── 19. EXPERIMENTO A/B DEL CHECKOUT, OPERABLE DESDE EL PANEL ───────────────
-- La variante (`checkout_variant`, más arriba) se sorteaba 50/50 en el
-- navegador y no había forma de tocarlo sin un deploy: ni de mandar todo el
-- tráfico a la ganadora cuando el experimento terminaba, ni de medir cuál
-- ganaba. Este bloque pone las dos piezas que faltaban.

-- 19.a El mando, en `stores`. Va aquí y no en `store_secrets` porque la landing
-- necesita leerlo ANTES de que el comprador toque nada, y `stores` ya tiene
-- SELECT público (política `stores_read`). No es un secreto: es del mismo tipo
-- que `culqi_scope`. 'SPLIT' = el sorteo de siempre; 'A'/'B' = todo el tráfico
-- a esa variante (para cuando ya sabes cuál gana).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS checkout_ab_mode text DEFAULT 'SPLIT';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_checkout_ab_mode_check;
ALTER TABLE stores ADD CONSTRAINT stores_checkout_ab_mode_check
  CHECK (checkout_ab_mode IS NULL OR checkout_ab_mode = ANY (ARRAY['SPLIT'::text, 'A'::text, 'B'::text]));

-- 19.b El DENOMINADOR. `order_sessions.checkout_variant` dice cuántos pedidos
-- hizo cada variante, pero sin contra qué dividir eso no es una tasa: una
-- variante puede tener más pedidos solo porque le tocó más gente. El lead
-- parcial ya se guarda apenas el WhatsApp es válido, así que marcarlo con su
-- variante da "empezó a llenar → compró" — justo el tramo donde A y B se
-- diferencian, y sin pedir un solo dato más al comprador.
--
-- Ojo al leer los números: la variante SOLO cambia el flujo en provincia con
-- cobertura del courier (en B el comprador elige domicilio o agencia; en A lo
-- decide la cobertura). En Lima las dos son idénticas, así que el total global
-- mezcla tráfico sin experimento. El corte que vale es el de provincia.
ALTER TABLE checkout_drafts ADD COLUMN IF NOT EXISTS checkout_variant text;
ALTER TABLE checkout_drafts DROP CONSTRAINT IF EXISTS checkout_drafts_variant_check;
ALTER TABLE checkout_drafts ADD CONSTRAINT checkout_drafts_variant_check
  CHECK (checkout_variant IS NULL OR checkout_variant = ANY (ARRAY['A'::text, 'B'::text]));

-- Las dos consultas del contador filtran por tienda y variante.
CREATE INDEX IF NOT EXISTS idx_checkout_drafts_variant
  ON checkout_drafts(store_id, checkout_variant)
  WHERE checkout_variant IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_sessions_variant
  ON order_sessions(store_id, checkout_variant)
  WHERE checkout_variant IS NOT NULL;

-- ─── 20. COBRO CON 360PAY (cupón + deep link de Yape) ────────────────────────
-- Segundo motor de cobro en línea, y el primero que NO depende de acreditación
-- PCI: nunca tocamos credenciales de pago. Kross es PARTNER de 360pay y cada
-- marca es un "business" creado bajo esa cuenta — al revés que Culqi, donde
-- cada marca pega SUS llaves. Ver docs/06-360PAY.md.
--
-- El flujo: se emite un CUPÓN por el adelanto → el comprador lo paga con el
-- deep link de pago de servicios de Yape (que abre pre-llenado) → 360pay avisa
-- por webhook firmado. El cruce es determinístico por `external_ref`, no la
-- heurística de monto + código de 3 dígitos del flujo manual.

-- 20.a Identificadores del negocio en 360pay. NO son secretos: `business_id` y
-- los GUID de Yape solo sirven para armar el enlace, y el enlace es público por
-- definición (se le da al comprador). Por eso viven en `stores`, que ya tiene
-- SELECT público, igual que `culqi_scope`.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pay360_enabled        boolean DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pay360_business_id    text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pay360_payment_prefix text;   -- 3 chars, prefijo del código de pago
-- Los identificadores de Yape (companyId/serviceId) NO se guardan por tienda:
-- 360pay los declara INTERNOS suyos y pidió no mapearlos. Son los mismos para
-- todos sus comercios —quien distingue a la marca es el prefijo del código de
-- pago—, así que viven como secreto de plataforma en las Edge Functions, y solo
-- como respaldo: si el cupón trae su propio enlace de pago, ese gana.
-- Ambiente por tienda: una marca puede quedar en sandbox mientras otra ya cobra
-- de verdad. Sin esto, probar obligaría a un deploy para volver a producción.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pay360_env            text DEFAULT 'sandbox';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_pay360_env_check;
ALTER TABLE stores ADD CONSTRAINT stores_pay360_env_check
  CHECK (pay360_env IS NULL OR pay360_env = ANY (ARRAY['sandbox'::text, 'live'::text]));

-- 20.b Secretos, en `store_secrets` (service role only). El `hook_signing_secret`
-- 360pay lo muestra UNA SOLA VEZ, en la respuesta de crear el negocio: si no se
-- captura ahí, la única salida es rotarlo. `hook_id` sirve para saber con qué
-- secreto verificar cuando llegue un evento (viene en X-360Pay-Hook-Id).
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS pay360_hook_id          text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS pay360_hook_secret      text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS pay360_secrets_updated_at timestamptz;
-- La llave de PARTNER no va aquí: es de la plataforma, no de una tienda, y vive
-- en el secreto de entorno PAY360_PARTNER_KEY de las Edge Functions.

-- 20.c El cupón vivo del pedido. `pay360_coupon_id` es el `_id` que devuelve
-- 360pay y con el que se re-consulta el estado; `pay360_consumer_code` es el
-- código del COMPRADOR (no del cupón) que va en el deep link.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pay360_coupon_id     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pay360_consumer_code text;

-- 20.d Buscar el pedido por el cupón que avisa el webhook. El evento trae
-- `external_ref` (= id de la sesión) pero también puede llegar identificando
-- solo el cupón; con este índice las dos rutas son baratas.
CREATE INDEX IF NOT EXISTS idx_order_sessions_pay360_coupon
  ON order_sessions(pay360_coupon_id)
  WHERE pay360_coupon_id IS NOT NULL;

-- 20.e `payment_provider` gana el valor '360PAY'. Sigue siendo la línea que
-- separa las piscinas de cruce: `yape-ingest` solo consume pedidos con
-- `payment_provider IS NULL`, así que un pedido de 360pay no puede ser dado por
-- pagado por un yape ajeno del mismo monto.
--
-- El anti-duplicado del webhook reutiliza el índice único (store_id, dedupe_key)
-- del 13.c con `dedupe_key = '360pay:' || X-360Pay-Event-Id`. Se deduplica por
-- **Event-Id** y no por Delivery-Id: el segundo cambia en cada reintento, así
-- que deduplicar por él dejaría entrar el mismo pago una vez por intento.
