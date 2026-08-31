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

-- La unicidad del comprador es **POR TIENDA**, no global: la crea el bloque 0
-- (`idx_buyers_store_doc` / `idx_buyers_store_phone`) y es lo que hace posible
-- el multi-tenant — el mismo DNI puede comprarle a dos marcas distintas, y de
-- hecho pasa: `12345678` existe en Gadicaf y en Kross Shop.
--
-- Aquí vivían los dos únicos GLOBALES, de cuando `buyers` no tenía `store_id`.
-- El bloque 0 ya los dropea, y estas dos líneas los volvían a crear tres
-- párrafos después: el script se contradecía a sí mismo y el resultado dependía
-- del orden. Con datos reales dejó de ser sutil y pasó a reventar el script
-- entero con `23505: Key (document_number)=(12345678) is duplicated`.
--
-- Las Edge Functions ya no los necesitan: todas hacen `onConflict` sobre
-- `store_id,document_number` o `store_id,phone`. La limpieza de los restos que
-- quedaron en producción con otros nombres vive en el bloque 18.

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

-- Preferencias POR DISPOSITIVO (una fila = un navegador suscrito). El equipo puede
-- silenciar cada tipo de aviso desde el panel sin perder la suscripción: el filtro
-- se aplica en el servidor al enviar, no borrando la fila.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS notify_new_client  boolean NOT NULL DEFAULT true;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS notify_new_message boolean NOT NULL DEFAULT true;

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

-- La llamada es un EVENTO DEL PEDIDO, no una sección aparte (11-RELACIONES).
-- El mensaje `call_log` que la registra apunta acá a su grabación, para que el
-- audio se escuche en el hilo donde ocurrió la llamada y no en otra pantalla.
-- El enlace es explícito a propósito: emparejar por cercanía de fecha se rompe
-- en cuanto hay dos llamadas seguidas en el mismo pedido.
ALTER TABLE chat_messages  ADD COLUMN IF NOT EXISTS call_recording_id uuid REFERENCES call_recordings(id);

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


-- ─── 13. ADELANTO DEL PEDIDO (Fase 3 del checkout) ──────────────────────────
-- El comprador adelanta parte del pedido (la mitad, o el total si lo elige) y
-- paga el resto al recibir. Quién lo cobra: 360pay (§20) si la marca lo tiene
-- conectado; si no, un asesor por el chat. Ver docs/01-SALES-ENGINE.md §3.
--
-- Aquí vivió el flujo MANUAL de Yape: el número de la marca, el QR, el código
-- de seguridad de 3 dígitos y el cruce contra las notificaciones que leía un
-- celular con `yape-ingest`. Se eliminó entero cuando 360pay pasó a producción
-- —era el único punto del checkout donde el comprador tenía que aprender algo
-- nuevo, y ninguna marca lo tenía configurado—. Las columnas se DROPEAN en
-- 13.g; las de `payment_events` se quedan, porque guardan pagos históricos.

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

-- ⚠️ `stores` tiene SELECT público (política `stores_read`), y RLS es por FILA,
-- no por columna: cualquier cosa que se agregue a esta tabla queda legible con
-- la anon key. Por eso ningún secreto vive aquí, sino en `store_secrets`.

-- 13.a-bis Secretos por tienda. Tabla aparte justamente porque `stores` se lee
-- en público. Sin políticas: solo el service role de las Edge Functions entra.
CREATE TABLE IF NOT EXISTS store_secrets (
  store_id             text PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  -- Semilla HMAC del código de pago del comprador (ver §20). Nació como el
  -- token del lector de notificaciones de Yape y se renombró en 13.g: el valor
  -- se conserva tal cual, porque cambiarlo cambiaría los códigos ya emitidos.
  payment_code_secret  text,
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
-- ser un porcentaje del pedido, así que el emisor del cobro necesita saber cuál
-- de las dos eligió el comprador para volver a derivar el mismo monto.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_choice       text DEFAULT 'HALF'; -- HALF | FULL
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

-- 13.c Todo pago que entra, cuadre o no. Hoy los escribe `pay360-webhook`; la
-- tabla nació para los pagos que leía un celular del flujo manual, y por eso
-- conserva columnas que aquel usaba (`security_code`, `operation_number`).
-- No se dropean: guardan pagos históricos, y auditar cuánto cobró cada marca es
-- justamente para lo que existe esta tabla.
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

-- 13.f Motivo por el que un pago entrante NO se procesó (texto ilegible, pago
-- saliente, variable del automatizador sin expandir…). Antes esos casos
-- respondían 200 y no dejaban rastro: la fila no existía y no había forma de
-- saber por qué. Un pago que no se ve es un pago perdido.
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS ignored_reason text;

-- 13.g Baja del flujo manual de Yape. El `payment_ingest_token` se RENOMBRA en
-- vez de dropearse: su valor es la semilla HMAC del código de pago (§20), y
-- borrarlo cambiaría los códigos ya emitidos — o sea, dejaría cupones vivos
-- apuntando a un cliente que 360pay ya no resolvería. Idempotente: el rename
-- solo corre si la columna vieja sigue ahí.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'store_secrets'
               AND column_name = 'payment_ingest_token') THEN
    ALTER TABLE store_secrets RENAME COLUMN payment_ingest_token TO payment_code_secret;
  END IF;
END $$;
ALTER TABLE store_secrets ALTER COLUMN payment_code_secret DROP NOT NULL;

ALTER TABLE stores DROP COLUMN IF EXISTS yape_number;
ALTER TABLE stores DROP COLUMN IF EXISTS yape_holder;
ALTER TABLE stores DROP COLUMN IF EXISTS yape_qr_url;
ALTER TABLE stores DROP COLUMN IF EXISTS yape_autoconfirm;
ALTER TABLE order_sessions DROP COLUMN IF EXISTS advance_yape_code;
ALTER TABLE order_sessions DROP COLUMN IF EXISTS advance_voucher_url;
DROP INDEX IF EXISTS idx_payment_events_unmatched;
DROP POLICY IF EXISTS vouchers_public_insert ON storage.objects;

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
-- requisitos de la pasarela de pago y con INDECOPI:
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

-- ─── 16. INFRAESTRUCTURA DEL COBRO EN LÍNEA ──────────────────────────────────
-- Columnas compartidas por cualquier motor de cobro que emita o cobre el
-- adelanto DENTRO del checkout, en vez del flujo manual (caja con número de
-- Yape + código de 3 dígitos + cruce por `yape-ingest`, eliminado en 13.g). Hoy
-- el único motor es 360pay (§20); una marca sin conectar cierra el pedido igual
-- y coordina el adelanto por el chat. Ver docs/06-360PAY.md.
--
-- Aquí vivió también el cobro con Culqi, con sus llaves por tienda en
-- `store_secrets`. Se eliminó entero: nunca llegó a cobrar un sol —seguía
-- esperando la acreditación PCI— y tener dos motores encendidos a la vez
-- confundía la configuración de cada marca. Las columnas se DROPEAN abajo para
-- que no queden llaves guardadas de un motor que ya no existe.

-- 16.a El cobro en línea entra a `payment_events` como un pago más: misma
-- trazabilidad, misma tabla que audita cuánto cobró cada marca. `provider`
-- distingue la fuente del dinero, `provider_charge_id` el identificador del
-- cobro en el proveedor, y `provider_fee_pen` la comisión en soles (para que la
-- marca vea lo que de verdad recibe). El anti-duplicado NO necesita índice
-- nuevo: el `dedupe_key` prefijado por proveedor reutiliza el índice único
-- (store_id, dedupe_key) del 13.c, así que un evento repetido choca en 23505 y
-- es no-op.
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider           text;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider_charge_id text;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider_fee_pen   numeric;

-- 16.b Marca de procedencia del pedido. NULL = flujo manual; '360PAY' = el
-- adelanto se cobra en línea. Es la línea que separa las dos piscinas de cruce:
-- un pedido con cobro en línea solo lo puede dar por pagado su propio webhook.
-- `register-buyer` la escribe al alta.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS payment_provider text;

-- 16.c Tienda de ORIGEN del pedido (la del producto). `register-buyer` puede
-- asignar la sesión a la tienda de un vendedor de OTRA marca cuando no hay
-- Ventas disponible en la propia (round-robin cross-store), y la config de
-- cobro se tiene que resolver por la marca que VENDE, jamás por la del vendedor
-- asignado — cobrar a la cuenta de otra marca es el peor bug posible.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS origin_store_id text;

-- 16.d Contador de intentos de cobro. Con un order_token válido (el propio) se
-- podrían lanzar intentos ilimitados contra la cuenta de la marca. Corte duro
-- en el emisor.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS advance_charge_attempts int DEFAULT 0;

-- 16.e Baja de Culqi. Las llaves se van PRIMERO: una credencial guardada de un
-- motor que ya nadie ejecuta es superficie de ataque sin contraparte de valor.
-- Idempotente y seguro de correr dos veces.
ALTER TABLE store_secrets DROP COLUMN IF EXISTS culqi_public_key;
ALTER TABLE store_secrets DROP COLUMN IF EXISTS culqi_secret_key;
ALTER TABLE store_secrets DROP COLUMN IF EXISTS culqi_keys_updated_at;
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_culqi_scope_check;
ALTER TABLE stores DROP COLUMN IF EXISTS culqi_enabled;
ALTER TABLE stores DROP COLUMN IF EXISTS culqi_scope;

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
-- que `pay360_enabled`. 'SPLIT' = el sorteo de siempre; 'A'/'B' = todo el tráfico
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
-- El motor de cobro en línea, y no depende de acreditación PCI: nunca tocamos
-- credenciales de pago. Kross es PARTNER de 360pay y cada marca es un
-- "business" creado bajo esa cuenta, así que ninguna marca pega llaves suyas.
-- Ver docs/06-360PAY.md y docs/07-CONTRATO-360PAY.md.
--
-- El flujo: se emite un CUPÓN por el adelanto → el comprador lo paga con el
-- deep link de pago de servicios de Yape (que abre pre-llenado) → 360pay avisa
-- por webhook firmado. El cruce es determinístico por `external_ref`, no la
-- heurística de monto + código de 3 dígitos del flujo manual.

-- 20.a Identificadores del negocio en 360pay. NO son secretos: `business_id` y
-- los GUID de Yape solo sirven para armar el enlace, y el enlace es público por
-- definición (se le da al comprador). Por eso viven en `stores`, que ya tiene
-- SELECT público.
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

-- 20.e `payment_provider` gana el valor '360PAY'.
--
-- El anti-duplicado del webhook reutiliza el índice único (store_id, dedupe_key)
-- del 13.c con `dedupe_key = '360pay:' || X-360Pay-Event-Id`. Se deduplica por
-- **Event-Id** y no por Delivery-Id: el segundo cambia en cada reintento, así
-- que deduplicar por él dejaría entrar el mismo pago una vez por intento.

-- ─── 21. OLVA API PERÚ (tracking de guías) ──────────────────────────────────
-- La Edge Function `olva-tracking` consulta guías de Olva vía Olva API Perú
-- (proveedor independiente, no oficial). Su key NO va en el repo: se lee del
-- secret de entorno OLVA_API_KEY y, si no existe, del Vault del proyecto por
-- este RPC. Solo service_role puede ejecutarlo — el frontend jamás ve la key.
--
-- Alta de la key en Vault (correr aparte, con la key real, NUNCA pegarla aquí):
--   SELECT vault.create_secret('<la-key>', 'OLVA_API_KEY', 'Olva API Perú');
CREATE OR REPLACE FUNCTION public.olva_api_key() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'OLVA_API_KEY' LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.olva_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.olva_api_key() TO service_role;

-- ─── 22. SHALOM API PERÚ (tracking de envíos) ───────────────────────────────
-- Misma familia de proveedor que Olva API Perú (sección 21): independiente,
-- NO la API oficial de Shalom. Su key NO va en el repo: la Edge Function la
-- lee del secret de entorno SHALOM_API_KEY y, si no existe, del Vault del
-- proyecto por este RPC. Solo service_role puede ejecutarlo — el frontend
-- jamás ve la key.
--
-- Alta de la key en Vault (correr aparte, con la key real, NUNCA pegarla aquí):
--   SELECT vault.create_secret('<la-key>', 'SHALOM_API_KEY', 'Shalom API Perú');
CREATE OR REPLACE FUNCTION public.shalom_api_key() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'SHALOM_API_KEY' LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.shalom_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shalom_api_key() TO service_role;

-- ─── 23. TRACKING DE ENVÍOS EN EL PEDIDO (contrato `shipment`) ──────────────
-- Bloque `shipment` de MerchantCustomerSession (00-CORE-ARCHITECTURE):
-- Logistics registra los identificadores del comprobante (order-manage,
-- acción `set_tracking`) y el job `shalom-tracking-sync` (23.c) consulta la
-- API del courier y refleja la fase. La fase dispara la cobranza del saldo al
-- llegar a EN_DESTINO, pero NUNCA mueve `stage` sola: el pipeline lo avanza
-- una persona.

-- 23.a Identificadores del comprobante + fase reflejada.
--   tracking_courier: 'SHALOM' | 'OLVA'.
--   Shalom: numero (guía 8–10 dígitos) + codigo (4 alfanum) van juntos; ose_id
--   es su id interno (handle de eventos/comprobante/GRT).
--   Olva: numero (típicamente 8 dígitos) + tracking_year (año de emisión, YY):
--   su API rastrea por numero+año, sin código.
--   tracking_phase: EN_ORIGEN | EN_TRANSITO | EN_DESTINO | ENTREGADO.
--     NULL con guía escrita = REGISTRADO: la guía existe y el courier todavía
--     no la reporta, o sea el paquete sigue en el almacén. No es un valor de
--     la columna a propósito — es la ausencia de reporte.
--   tracking_demora_at: alerta de demora del courier — NO es una fase.
--   Sin CHECK a propósito, como stage/dispatch_type: la lista blanca vive en
--   el código que escribe (order-manage / shalom-tracking-sync).
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_courier    text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_numero     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_codigo     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_ose_id     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_year       text;  -- YY, solo Olva
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_phase      text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_phase_at   timestamptz;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_demora_at  timestamptz;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS tracking_checked_at timestamptz;

-- 23.a-bis  Cuándo se dio por RESPONDIDA la última pregunta del comprador.
--
-- La bandeja llama "sin responder" a un pedido cuyo último mensaje es del
-- comprador. Casi siempre eso se resuelve escribiéndole; pero a veces se le
-- llamó, se le contestó por WhatsApp, o la pregunta no necesitaba respuesta.
-- Sin una forma de cerrarlo a mano, esos pedidos se quedan arriba para siempre
-- y la lista deja de significar algo.
--
-- Es del PEDIDO y no de quien lo marca: si Andrea lo cierra, Kevin no tiene que
-- volver a mirarlo. Y no borra nada: un mensaje posterior del comprador vuelve
-- a dejarlo sin responder, porque la comparación es contra esta marca de tiempo
-- (ver `esperaRespuesta` en src/lib/bandeja.ts).
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS answered_at         timestamptz;

-- 23.b Los envíos VIVOS que el job va a barrer: con guía y sin entregar.
CREATE INDEX IF NOT EXISTS idx_order_sessions_tracking_active
  ON order_sessions(tracking_checked_at)
  WHERE tracking_courier IS NOT NULL
    AND (tracking_phase IS NULL OR tracking_phase <> 'ENTREGADO');

-- 23.c Plantilla WhatsApp de recojo/cobro por tienda. Si está configurada (y
-- `wa_enabled`), el sync la dispara vía `send-wa-template` cuando el envío
-- llega a EN_DESTINO. NULL = esa marca no auto-envía WhatsApp; el mensaje del
-- chat del pedido sale igual. El nombre debe ser el de una plantilla APROBADA
-- en Meta (variables: name, product, link — el mapping por defecto).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wa_recojo_template text;

-- 23.d El job periódico. pg_cron + pg_net invocan la Edge Function
-- `shalom-tracking-sync` cada 30 min. La key que viaja es la ANON pública (la
-- misma del bundle del frontend): la función no recibe parámetros, no expone
-- datos (solo conteos) y es idempotente, así que un tercero invocándola solo
-- consigue refrescar el tracking. 60 req/min del proveedor ÷ lotes de 50 =
-- miles de envíos activos por barrida sin acercarse al límite.
--   cron.schedule con el mismo nombre ACTUALIZA el job: correr esto dos veces
--   no duplica nada.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'shalom-tracking-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/shalom-tracking-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mZGpnaG50dm1yZGZqaGF6ZnZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MTM4NDcsImV4cCI6MjA5OTA4OTg0N30.DSgcjvYZUWLqUyQ9aFTOjkAISt7hOwpLUhwFTniBQsI'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 23.e El barrido de Olva, intercalado a los :15/:45 con el de Shalom (:00/:30)
-- para no juntar las corridas. A diferencia de Shalom, aquí el barrido es LA
-- entrada del reflejo: Olva API Perú no tiene webhook ni batch — la Edge
-- Function `olva-tracking-sync` consulta guía por guía (hasta 50 por corrida,
-- los menos chequeados primero; su límite es 60 req/min).
SELECT cron.schedule(
  'olva-tracking-sync',
  '15,45 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/olva-tracking-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mZGpnaG50dm1yZGZqaGF6ZnZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MTM4NDcsImV4cCI6MjA5OTA4OTg0N30.DSgcjvYZUWLqUyQ9aFTOjkAISt7hOwpLUhwFTniBQsI'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- ─── 24. WEBHOOK DE TRACKING SHALOM (push del proveedor) ────────────────────
-- La Edge Function `shalom-webhook` (deploy con --no-verify-jwt) recibe el
-- POST firmado que Shalom API Perú manda en cada cambio de estado de un envío
-- suscrito (la suscripción la hace order-manage al registrar la guía). Es la
-- entrada rápida del reflejo; el barrido 23.d queda de respaldo. La
-- autenticación es la firma HMAC del proveedor; su signing_secret lo emite
-- PUT /v1/webhooks UNA sola vez y NO va en el repo: se lee del secret de
-- entorno SHALOM_WEBHOOK_SECRET y, si no existe, del Vault por este RPC.
--
-- El registro es AUTÓNOMO: `shalom-tracking-sync` (ensureWebhook, en
-- `_shared/shalom.ts`) detecta que no hay secret local ni webhook en el
-- proveedor, hace el PUT con la URL de `shalom-webhook` (el ping de
-- verificación lo responde esa función sola — deployarla antes) y guarda el
-- signing_secret DIRECTO en Vault vía el RPC de abajo. El secret nunca se
-- imprime ni pasa por chats. Si el proveedor ya tiene webhook de otra URL, NO
-- se pisa: rotar con POST /v1/webhooks/rotate y guardar el nuevo a mano.
CREATE OR REPLACE FUNCTION public.shalom_webhook_secret() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'SHALOM_WEBHOOK_SECRET' LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.shalom_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shalom_webhook_secret() TO service_role;

-- 24.b Guardar/rotar el signing_secret desde la Edge Function (service role),
-- sin exponer el Vault entero: upsert de UN nombre fijo, nada más.
CREATE OR REPLACE FUNCTION public.store_shalom_webhook_secret(secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE sid uuid;
BEGIN
  IF secret IS NULL OR length(secret) < 16 THEN
    RAISE EXCEPTION 'secret inválido';
  END IF;
  SELECT id INTO sid FROM vault.secrets WHERE name = 'SHALOM_WEBHOOK_SECRET' LIMIT 1;
  IF sid IS NULL THEN
    PERFORM vault.create_secret(secret, 'SHALOM_WEBHOOK_SECRET', 'Firma del webhook de Shalom API Perú');
  ELSE
    PERFORM vault.update_secret(sid, secret);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.store_shalom_webhook_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_shalom_webhook_secret(text) TO service_role;

-- ─── 25. CUENTA SHALOM PRO POR MARCA ────────────────────────────────────────
-- Credenciales de la cuenta del cliente en pro.shalom.pe, para los endpoints
-- que operan SU cuenta (crear guías, cotizar tarifas, tracking detallado 🔮).
-- El rastreo de fases NO las necesita (modo estado, solo X-API-Key).
--
-- Van en `store_secrets` — TAMBIÉN el email — porque `stores` tiene SELECT
-- público y RLS es por fila: cualquier columna nueva ahí queda legible con la
-- anon key. Las escribe manage-store SOLO por JWT verificado (mismo trato que
-- los campos de cobro); el password jamás vuelve en ninguna respuesta.
--
-- shalom_pro_status: veredicto de la verificación real contra pro.shalom.pe
-- (POST /v1/shalom/sessions, en segundo plano — el login tarda ~90 s):
--   PENDING (verificando) · CONNECTED · FAILED (credenciales rechazadas) ·
--   UNVERIFIED (proveedor caído: ni sí ni no; reintentar guardando de nuevo).
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS shalom_pro_email      text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS shalom_pro_password   text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS shalom_pro_status     text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS shalom_pro_checked_at timestamptz;

-- ─── 26. PIXEL DE META + TIKTOK Y CAPI (por marca) ──────────────────────────
-- Cada marca corre sus propios anuncios con su propio pixel y su propia cuenta.
-- El objetivo: que el cliente vea en SU Events Manager si su publicidad es
-- rentable —llegan a la landing → se registran → en qué etapa se quedaron— y,
-- vía CAPI (server-side), que Meta/TikTok reciban a los que SÍ adelantaron el
-- pago para armar el público "de los que pagan" y traer más de esos.
-- Ver docs/09-PIXELS-CAPI.md.

-- 26.a Los IDs de pixel son PÚBLICOS por definición: viajan al navegador dentro
-- del snippet de `fbq`/`ttq`. Por eso viven en `stores`, que ya tiene SELECT
-- público (igual que `pay360_business_id`). Presencia = pixel encendido; vaciar
-- el campo lo pausa sin borrar la configuración de CAPI.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS meta_pixel_id   text;   -- Meta/Facebook Pixel ID
ALTER TABLE stores ADD COLUMN IF NOT EXISTS tiktok_pixel_id text;   -- TikTok Pixel ID

-- 26.b Los tokens de CAPI SÍ son secretos (dan de alta eventos server-side en
-- nombre de la marca): van en `store_secrets`, que es service-role only. Los
-- escribe manage-store SOLO por JWT verificado (mismo trato que Shalom Pro y los
-- campos de cobro) y jamás vuelven en ninguna respuesta —el panel solo sabe si
-- están presentes—. Los `*_test_event_code` son opcionales: sirven para ver los
-- eventos en Test Events (Meta) / test_event_code (TikTok) sin ensuciar la data.
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS meta_capi_token         text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS tiktok_capi_token       text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS meta_test_event_code    text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS tiktok_test_event_code  text;
ALTER TABLE store_secrets ADD COLUMN IF NOT EXISTS ads_secrets_updated_at  timestamptz;

-- 26.c Atribución del clic, en la orden. El Purchase de CAPI lo dispara
-- `pay360-webhook` cuando 360pay confirma el pago —de forma ASÍNCRONA, con el
-- navegador del comprador ya cerrado—, así que los identificadores del clic que
-- Meta/TikTok necesitan para atar la venta al anuncio tienen que quedar
-- guardados en el pedido desde el registro:
--   · ad_fbp / ad_fbc  — cookies `_fbp` / `_fbc` de Meta
--   · ad_ttp / ad_ttclid — cookie `_ttp` y click id de TikTok
--   · ad_client_ua / ad_client_ip — user-agent e IP, capturados SERVER-SIDE en
--       register-buyer (de los headers, NO del body: el IP es spoofeable). Solo
--       para el match de CAPI; nunca se exponen por get-session.
--   · ad_source_url — la URL de la landing (`event_source_url`)
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_fbp        text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_fbc        text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_ttp        text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_ttclid     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_client_ua  text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_client_ip  text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS ad_source_url text;

-- ─── 27. GENERADOR DE GUÍAS SHALOM (pendiente #3 de 02-SMART-LOGISTICS) ──────
-- Hasta aquí la guía nacía en el mostrador y alguien la escribía a mano en el
-- pedido (`order-manage` · set_tracking). Con esto, un pedido de agencia SHALOM
-- con el adelanto verificado pide su guía solo contra la cuenta Shalom Pro de
-- la marca (`POST /v1/orders`), y desde ahí sigue el ciclo de siempre: aviso al
-- comprador, suscripción al webhook, fases y cobranza.
--
-- ⚠️ Esas guías son REALES y COBRABLES: el proveedor no tiene sandbox ni
-- idempotencia. De ahí las tres defensas de este bloque.

-- 27.a Config de envío POR PRODUCTO. Es del producto y no de la tienda porque
-- lo que decide el tamaño y de qué sede sale es la mercadería, no la marca:
-- dos productos de la misma tienda pueden despacharse de almacenes distintos.
--   shalom_origin_branch_id: id de sede (`ter_id`) — el MISMO que guarda
--     src/data/agencies/shalom.json, que es la lista que ve el comprador y sale
--     del CSV de sedes de Shalom. Viaja como `origin_terminal_id`.
--   package_size: SOBRE | XXS | XS | S | M | L | OTRA_MEDIDA. NO es un texto
--     libre ni una escala nuestra: son los productos del catálogo de la cuenta
--     Shalom Pro, y de cuál se elija sale la tarifa. El `product_id` real se
--     resuelve al emitir contra GET /v1/products, porque los ids son POR CUENTA.
--   declared_content: docs | ropa | art | electro. Shalom lo exige en toda
--     orden (`declaracion_jurada`) y lo imprime en la guía.
-- Los tres sin default a propósito: un envío mal declarado es una tarifa
-- equivocada o un 400 con el paquete ya empacado. Un producto sin configurar NO
-- genera guía — avisa a Logística y se hace a mano.
ALTER TABLE products ADD COLUMN IF NOT EXISTS shalom_origin_branch_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS package_size            text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS declared_content        text;

-- 27.b El destino, ESTRUCTURADO. Hasta ahora la sede elegida por el comprador
-- viajaba dentro de `delivery_reference` (texto libre, junto con referencias de
-- puerta): servía para que una persona la leyera, no para armar un envío. Los
-- pedidos viejos siguen teniendo su id ahí y el generador lo usa de respaldo.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS agency_branch_id text;

-- 27.c El expediente del pedido contra el proveedor. `shalom_order_status` es
-- además el CANDADO de idempotencia: la función lo reclama con un UPDATE
-- condicional (… WHERE shalom_order_status IS NULL) antes de llamar a nadie, y
-- solo la llamada que gana la carrera sigue. Sin esto, dos webhooks del mismo
-- pago emiten dos guías cobrables para un solo paquete.
--   PENDING   reclamado, llamada en curso
--   CREATED   guía emitida (numero/codigo ya viven en las columnas tracking_*)
--   SIMULADO  se armó el payload y NO se llamó al proveedor (ver 27.e)
--   SKIPPED   no aplica o falta config (motivo en shalom_order_reason)
--   FAILED    el proveedor rechazó o no respondió — Logística la hace a mano
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS shalom_order_status text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS shalom_order_id     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS shalom_order_at     timestamptz;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS shalom_order_reason text;

-- 27.d ⚠️ LA CLAVE DE RETIRO. La elige Kross al crear la orden (`pickup_code`)
-- y con ella el destinatario se lleva el paquete de la agencia. O sea: quien la
-- tiene, tiene el pedido.
--
-- Por eso esta columna NO se expone por `get-session` ni viaja a ningún mensaje
-- del chat, ni siquiera a los de `visibility: 'sellers'`: el viewer de vendedor
-- se resuelve con el token del comprador (`?viewer=seller`), así que un mensaje
-- "solo vendedores" con la clave adentro se la estaría regalando —y en Kross la
-- clave se entrega recién contra el saldo pagado (02 §El saldo de agencia)—.
-- Hasta entonces vive solo acá, al alcance del service role.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS shalom_pickup_code text;

-- 27.e El interruptor POR MARCA, apagado por defecto. Emitir guías reales no
-- puede ser algo que le empiece a pasar a una tienda porque se desplegó una
-- función: con esto en false el generador corre entero —valida, arma el payload
-- y lo deja en los logs y en el chat de vendedores— pero NO llama al proveedor
-- (status SIMULADO). Es el ensayo con el pedido real antes de gastar plata.
-- Vive en `stores` (no en store_secrets) porque no es un secreto y el panel lo
-- lee para pintar el switch.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS shalom_auto_guide_enabled boolean DEFAULT false;


-- ─── 28. `anulado`: el pedido que nunca fue una venta ───────────────────────
--
-- Un CANCELADO es una venta que existió y se perdió: el comprador se arrepintió,
-- no contestó, se cayó el pago. Duele, y tiene que doler — cuenta en la tasa de
-- conversión, que es el número con el que la marca decide cuánto invertir.
--
-- Un ANULADO nunca fue una venta: el pedido de prueba, el dedazo del vendedor,
-- el formulario enviado dos veces. Contarlo junto al cancelado ensucia justo ese
-- número, y como se hace más a menudo de lo que uno cree —cada demo, cada
-- prueba de despliegue— el ruido no es marginal.
--
-- `status` no tiene CHECK: es texto libre desde el inicio, así que este valor no
-- necesita migración. Se documenta acá porque el archivo es el registro del
-- esquema, y un estado que solo existe en el código de la app es un estado que
-- la siguiente consulta SQL va a ignorar.
--
--   status = 'active'    → vivo
--            'cancelado' → se perdió. Cuenta en conversión.
--            'anulado'   → nunca existió. NO cuenta en nada. (`contable()`)
--            'delivered' | 'rejected' | 'expired' → históricos del checkout
--
-- El código: `estaVivo` / `esAnulado` / `contable` en src/lib/order-tracking.ts.
-- Se pone y se quita desde el panel (order-manage, acciones `anular`/`restore`):
-- anular por error tiene que poder desandarse, porque el estado se pone
-- justamente cuando alguien se equivocó.
--
-- Ver también: la etapa `preparando` salió del eje del pedido (ago-2026). NO se
-- borra del CHECK de `stage` —las filas viejas siguen siendo válidas— pero la
-- app ya no la escribe y la lee como `confirmado` (`stageVigente` en
-- src/lib/order-stages.ts). Un pedido en `preparando` es lo que siempre fue:
-- cobrado y sin guía.
--
-- Los pedidos anulados de una tienda, para revisarlos:
--   SELECT order_id, buyer_name, product_name, created_at
--   FROM order_sessions WHERE store_id = '<tienda>' AND status = 'anulado'
--   ORDER BY created_at DESC;


-- ─── 29. CURIOSOS: los leads del checkout, ahora visibles en el panel ────────
--
-- `checkout_drafts` (bloque 12) existía desde hace meses y NADIE la miraba: el
-- checkout escribía el lead y ahí se quedaba. Desde ago-2026 es la primera
-- columna del tablero de pedidos —"Curiosos"— y la lee `get-store-drafts`.
--
-- Un curioso es quien dejó DNI y WhatsApp y no siguió. Los dos datos importan y
-- por eso son el filtro: con el DNI se le crea la cuenta, con el WhatsApp se le
-- escribe. Sin uno de los dos la fila no se puede accionar, y una columna llena
-- de filas sobre las que no se puede hacer nada enseña a ignorar la columna.
--
-- Sigue FUERA de order_sessions, por lo mismo que decía el bloque 12: ahí
-- contaminaría el CRM y el round-robin le asignaría un vendedor a cada lead que
-- nunca compró. Se lee aparte y el tablero lo pinta como lo que es —gente por
-- llamar, no pedidos—: sin etapa, sin chat, sin suma de plata.
--
-- El índice de recuperación del bloque 12 ya sirve a esta consulta
-- (store_id + converted_at IS NULL). No hace falta uno nuevo.
--
-- Los curiosos accionables de una tienda:
--   SELECT buyer_name, document_number, phone, district, last_step, updated_at
--   FROM checkout_drafts
--   WHERE store_id = '<tienda>' AND converted_at IS NULL
--     AND document_number IS NOT NULL AND document_number <> ''
--   ORDER BY updated_at DESC;


-- ─── 30. OPERADOR: el nivel que faltaba entre admin y miembro ────────────────
--
-- El panel tenía DOS niveles y con eso, dar de alta a alguien que ayude a
-- operar la plataforma obligaba a elegir entre darle todo —incluido apagar la
-- tienda de un cliente— o darle nada.
--
--   miembro     is_admin = false                      · lo suyo: sus pedidos
--   operador    is_admin = true,  is_operator = true  · opera todo, no reparte mando
--   admin       is_admin = true,  is_operator = false · todo
--
-- Los dos ejes son independientes a propósito:
--
--   · `is_admin` / `is_super_admin` dicen HASTA DÓNDE llega: su tienda, o toda
--     la plataforma.
--   · `is_operator` dice QUÉ NO PUEDE hacer dentro de ese alcance.
--
-- Así "operador de una marca" y "operador de la plataforma" son la misma regla
-- aplicada a distinto alcance, sin una tercera columna ni un segundo camino. Y
-- todos los `is_admin` que ya estaban escritos siguen valiendo tal cual para un
-- operador, que es exactamente la promesa del rol: hace todo lo que hace el
-- admin.
--
-- Qué le queda vedado — UNA cosa (lo aplica el servidor, no el panel):
--
--   · crear o ascender administradores         `admin-team`
--
-- Eran tres (29-ago-2026). Apagar la tienda de una marca y borrar un producto
-- se le devolvieron: son trabajo de operar —una marca que no paga se apaga el
-- mismo día, un producto mal cargado se borra— y tener que despertar a un
-- administrador para eso convierte el rol en un ayudante, que es lo contrario
-- de para qué existe. La que queda es la que no se puede soltar: **nombrar es
-- repartir mando, no operar**, y sin ese candado el nivel entero es decorativo
-- — un operador que puede nombrar admins se nombra a sí mismo, o crea uno y
-- entra con él. Una restricción que el restringido puede levantar no es una
-- restricción.
--
-- Tampoco le quita: anular o cancelar un pedido. Los dos se deshacen
-- (`restore`, `recreate`) y son trabajo diario de quien opera.
--
-- El default es `false`: nadie se vuelve operador por correr esto. Los que ya
-- existen siguen siendo lo que eran.
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_operator boolean DEFAULT false;

-- Quién es qué, para revisarlo de un vistazo:
--   SELECT nombre, store_id, role_label, is_admin, is_operator, is_super_admin, active
--   FROM sellers ORDER BY is_super_admin DESC, is_admin DESC, nombre;
--
-- Y si hiciera falta hacer operador a alguien que ya existe (lo normal es
-- crearlo desde el panel, en Equipo):
--   UPDATE sellers SET is_admin = true, is_operator = true, role_label = 'Operador'
--   WHERE auth_user_id = '<uuid>';


-- ─── 31. EL SALDO ES OTRA OPERACIÓN, NO EL MISMO PAGO ───────────────────────
--
-- El pedido se cobra en DOS momentos, y hasta hoy la fila solo sabía del
-- primero:
--
--   1. Al cerrar el checkout, el comprador **o adelanta o paga todo**. Eso vive
--      en `advance_amount` / `payment_verification` y lo cruza `pay360-webhook`.
--   2. Si adelantó, queda un SALDO. Cuando la guía existe, se le emite un
--      segundo cupón; al pagarlo se suelta la clave de recojo (27.d).
--
-- Son operaciones distintas —otro cupón, otro número de operación bancaria,
-- otra fecha, a veces otro banco— y por eso son otras columnas y no una suma
-- sobre las de arriba. Un reclamo del comprador pregunta por UNA de las dos, y
-- con un solo "pagado S/180" no hay manera de saber cuál.
--
-- `saldo_verification`: PENDING (cupón emitido, sin pagar) | MATCHED (cobrado).
-- NULL = todavía no se le pidió el saldo.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS saldo_amount        numeric;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS saldo_verification  text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS saldo_matched_at    timestamptz;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS saldo_event_id      uuid;  -- el pago que lo cuadró
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pay360_saldo_coupon_id     text;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pay360_saldo_consumer_code text;

-- El webhook llega con un id de cupón y tiene que saber a CUÁL de los dos cobros
-- corresponde. Busca por los dos, así que los dos se indexan.
CREATE INDEX IF NOT EXISTS idx_order_sessions_saldo_coupon
  ON order_sessions(pay360_saldo_coupon_id)
  WHERE pay360_saldo_coupon_id IS NOT NULL;

-- ⚠️ Lo que este bloque NO cambia, y conviene no cambiarlo por descuido: el
-- anillo de avance del panel se llena con `advance` + `saldo` **cruzados por la
-- pasarela**, y con nada más. Un comercio puede cobrar por fuera —efectivo,
-- transferencia, un acuerdo por el chat— y mover el pedido a `entregado`; de esa
-- plata no tenemos rastro, así que no cuenta como cobrada. Ver `cobradoDelPedido`
-- en src/lib/order-money.ts.
--
-- Cuánto se ha cobrado de verdad por la pasarela, por pedido:
--   SELECT order_id, product_price, advance_amount, payment_verification,
--          saldo_amount, saldo_verification
--   FROM order_sessions WHERE store_id = '<tienda>' AND payment_provider = '360PAY'
--   ORDER BY created_at DESC;


-- ─── 32. COMENTARIOS INTERNOS: A QUIÉN SE ETIQUETA ──────────────────────────
--
-- `chat_messages.visibility` ya separaba lo que ve el comprador (`all`) de lo
-- que es solo del equipo (`sellers`). Lo que faltaba era **a quién va dirigido**
-- un comentario interno: sin eso, etiquetar a alguien con `@` era texto suelto
-- —se lee, pero nadie sabe que le tocaba a él— y no hay a quién avisarle.
--
-- Guarda los `auth_user_id` de la gente etiquetada. Array y no una columna
-- suelta porque un comentario puede llamar a dos personas, que es justo cuando
-- hace falta ("@Renzo @Kevin, ¿quién lo despacha?").
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mentions jsonb DEFAULT '[]';

-- ⚠️ Lo que este bloque NO cambia y sostiene todo lo demás: que un mensaje sea
-- `visibility = 'sellers'` NO lo esconde por sí solo. Quien decide es
-- `get-session`, y hasta hoy le bastaba con `?viewer=seller` en la URL — que el
-- comprador puede escribir, porque el token del pedido es suyo. Desde el mismo
-- cambio que trae esta columna, los mensajes internos exigen un **JWT de
-- vendedor verificado** contra `sellers`. Sin esa comprobación, "comentario
-- interno" sería una etiqueta de color, no una garantía.
--
-- Los comentarios internos de un pedido:
--   SELECT created_at, sender_name, body, mentions
--   FROM chat_messages WHERE session_id = '<uuid>' AND visibility = 'sellers'
--   ORDER BY created_at;


-- ─── 33. EL ALCANCE SALE DE DÓNDE VIVE, NO DE UNA CASILLA ───────────────────
--
-- `platform` (bloque 8) es la tienda que no vende: la casa de quien opera Kross.
-- Quien trabaja EN Kross vive ahí; quien trabaja en una marca vive en la suya.
-- El dato estaba, pero nadie lo leía: para saber si alguien administraba la
-- plataforma se miraba `is_super_admin`, una bandera que había que acordarse de
-- encender al dar de alta.
--
-- Y no se encendió. Los operadores de Kross se crearon desde el panel —que ya
-- mandaba la bandera— mientras la Edge Function desplegada todavía no la leía,
-- así que la fila entró con `is_super_admin = false`. El resultado: personas que
-- ESTÁN en la plataforma pero no la administran. En krossclub.app el login las
-- echaba con "ingresa desde el sitio de tu marca" — y su marca no existe. Un
-- candado que el que lo sufre no puede abrir.
--
-- Desde hoy el alcance se deduce en `supabase/functions/_shared/alcance.ts`, que
-- leen las dos mitades (panel y funciones):
--
--   administra la plataforma  =  is_super_admin
--                             OR (store_id = 'platform' AND is_admin)
--
-- La bandera se sigue respetando —nadie pierde lo que tenía— pero ya no hace
-- falta que esté. No ensancha nada: en `platform` solo hay quien opera Kross
-- (los pedidos son de las marcas, ahí no hay miembro raso que atender), y a un
-- admin de marca se le crea en la suya.
--
-- Esto ALINEA las filas que quedaron a medias, para que la columna diga lo mismo
-- que la regla. Es idempotente y no toca a nadie de una marca.
UPDATE sellers
SET is_super_admin = true
WHERE store_id = 'platform'
  AND is_admin = true
  AND COALESCE(is_super_admin, false) = false;

-- Quién administra la plataforma hoy:
--   SELECT nombre, store_id, role_label, is_admin, is_operator, is_super_admin, active
--   FROM sellers WHERE store_id = 'platform' ORDER BY is_super_admin DESC, nombre;
--
-- ⚠️ En esa consulta, una fila con `is_admin = false` es un **alta rota**, no un
-- estado válido: en la plataforma no hay pedidos que atender, así que un miembro
-- raso ahí no puede hacer nada en ninguna parte. Es lo que dejó el alta contra
-- una función anterior — guardó nombre y correo e ignoró las banderas.
--
-- Este bloque NO las arregla a propósito: subir de nivel a alguien es una
-- decisión, no una migración, y un script de esquema no la toma por nadie. Se
-- arregla **desde el panel** (Equipo → la persona → Nivel), que es donde ahora
-- se puede — antes solo se podía al crear, y de ahí que la única salida fuera
-- un UPDATE a mano. Si hace falta uno igualmente:
--
--   UPDATE sellers
--   SET is_admin = true, is_operator = true, is_super_admin = true, role_label = 'Operador'
--   WHERE store_id = 'platform' AND nombre IN ('...');
--
-- ⚠️ Lo que este bloque NO cambia: qué puede DESTRUIR cada uno. El alcance dice
-- hasta dónde llega (su tienda o todas); `is_operator` dice qué no puede hacer
-- dentro de ese alcance (bloque 30). Son dos ejes y siguen siendo independientes
-- — un operador de la plataforma entra a cualquier tienda y sigue sin poder
-- apagarla.


-- ─── 34. BORRAR UNA TIENDA: EL ORDEN NO ES OPCIONAL ─────────────────────────
--
-- `stores` casi no tiene claves foráneas: la única que cascadea es
-- `store_secrets` (bloque 25). O sea que un `DELETE FROM stores` a secas **no
-- borra nada más** — deja `store_id` huérfano en nueve tablas, con pedidos
-- apuntando a una tienda que ya no existe y un panel que no sabe pintarlos.
--
-- Lo hace la acción `delete` de `manage-store`, que además comprueba cinco
-- cosas antes de tocar nada. Se dejan escritas acá porque son la razón de que
-- la acción exista y no un `DELETE` a mano:
--
--   1. quien llama administra la PLATAFORMA (un admin de marca no borra su marca)
--   2. la tienda NO es `platform` — es donde vive el equipo de Kross
--   3. no es la tienda de quien llama
--   4. está APAGADA (`active = false`): apagar se deshace, borrar no
--   5. tiene CERO `order_sessions` y CERO `payment_events` — una venta que
--      existió y una plata que se recaudó bajo el contrato con 360pay son el
--      respaldo de un reclamo que puede llegar meses después. Apagada la marca
--      ya no vende, que es lo que se quería.
--
-- Y el barrido, si alguna vez hay que hacerlo a mano. `buyer_actions` va
-- PRIMERO: su clave apunta a `buyers` sin ON DELETE, así que borrar el
-- comprador antes lo rechaza la base.
--
--   DELETE FROM buyer_actions WHERE buyer_id IN (SELECT id FROM buyers WHERE store_id = '<id>');
--   DELETE FROM buyers            WHERE store_id = '<id>';
--   DELETE FROM checkout_drafts   WHERE store_id = '<id>';
--   DELETE FROM notifications_log WHERE store_id = '<id>';
--   DELETE FROM call_recordings   WHERE store_id = '<id>';
--   DELETE FROM complaints        WHERE store_id = '<id>';
--   DELETE FROM products          WHERE store_id = '<id>';
--   DELETE FROM sellers           WHERE store_id = '<id>';
--   DELETE FROM store_secrets     WHERE store_id = '<id>';   -- cascadearía igual
--   DELETE FROM stores            WHERE id = '<id>';
--
-- Las cuentas de `auth.users` del equipo NO se tocan: una persona puede
-- trabajar en dos marcas, y quitarle el acceso por haber cerrado una sería
-- destruir de más. Se quitan a mano desde Authentication si corresponde.
--
-- Antes de borrar, mirar qué hay colgando (esto no cambia nada):
--   SELECT s.id, s.slug, s.nombre, s.active,
--          (SELECT count(*) FROM order_sessions o WHERE o.store_id = s.id) AS pedidos,
--          (SELECT count(*) FROM order_sessions o WHERE o.origin_store_id = s.id) AS pedidos_origen,
--          (SELECT count(*) FROM payment_events p WHERE p.store_id = s.id) AS cobros,
--          (SELECT count(*) FROM products pr WHERE pr.store_id = s.id) AS productos,
--          (SELECT count(*) FROM sellers se WHERE se.store_id = s.id) AS equipo,
--          (SELECT count(*) FROM buyers b WHERE b.store_id = s.id) AS compradores
--   FROM stores s ORDER BY s.created_at;


-- ─── 35. CUÁNDO VENCE EL CUPÓN ──────────────────────────────────────────────
--
-- El vencimiento lo elegimos NOSOTROS: `expiry_date` es un campo obligatorio de
-- `POST /coupons` y sale de `COUPON_TTL_DAYS` (bloque `_shared/pay360.ts`). Lo
-- que faltaba era GUARDARLO: se calculaba, se mandaba y se tiraba.
--
-- Sin esta fecha el panel no puede responder la única pregunta que importa
-- antes de volver a pedirle el saldo a alguien: **¿el código que le voy a
-- mandar todavía sirve?** Mandar una tarjeta de pago con un cupón vencido es
-- peor que no mandarla — el cliente hace su parte, Yape lo rechaza, y el que
-- queda mal es el comercio.
--
-- NULL = emitido antes de este bloque. No se asume vencido: no saber si algo
-- caducó no es saber que caducó, y bloquear el cobro por una columna vacía
-- dejaría sin cobrar pedidos cuyo cupón está perfectamente vivo.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pay360_coupon_expires_at       timestamptz;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pay360_saldo_coupon_expires_at timestamptz;

-- ⚠️ Lo que este bloque NO cambia: **no existe "extender" un cupón.** Ni hace
-- falta. `pay360-coupon` ya reemite —consulta el previo, y si no está pagado lo
-- anula antes de emitir el nuevo—, y el CÓDIGO DE PAGO del comprador no cambia
-- al hacerlo: es estable por comprador (`pay360_consumer_code`), lo que cambia
-- es el cupón que cuelga de él. Así que "se venció, generar otro" es
-- literalmente volver a llamar a `pay360-coupon`.
--
-- Cupones de saldo vivos y cuándo caducan:
--   SELECT order_id, saldo_amount, saldo_verification,
--          pay360_saldo_consumer_code, pay360_saldo_coupon_expires_at
--   FROM order_sessions
--   WHERE saldo_verification = 'PENDING' ORDER BY pay360_saldo_coupon_expires_at;


-- ─── 36. UN PEDIDO TIENE N COBROS, NO DOS ───────────────────────────────────
--
-- Hasta hoy un pedido tenía exactamente DOS cobros y vivían como columnas:
-- `advance_*` y `saldo_*`. Funcionó mientras el producto cobraba dos veces, y
-- dejó de funcionar en cuanto hizo falta un tercero — un flete, una diferencia
-- por un cambio de talla, un cobro suelto que el vendedor arma a mano. Con
-- columnas, el tercero no tiene dónde ir: o se le monta encima al saldo (y el
-- saldo deja de ser el saldo) o no existe.
--
-- Así que un cobro pasa a ser una FILA. El adelanto y el saldo no son casos
-- especiales: son dos filas más, con el mismo id, el mismo cupón y el mismo
-- rastro bancario que cualquier otra.
--
--   tipo `adelanto` · el primero, al cerrar el checkout
--   tipo `saldo`    · el segundo, cuando ya hay guía
--   tipo `extra`    · cualquier otro, con su concepto
--
-- ⚠️ `total` NO es un tipo guardado, y es a propósito: "pagó todo" es un
-- adelanto que cubre el precio ENTERO, y eso se decide contra el valor de HOY.
-- Un upsell convierte un pago total en un adelanto sin tocar la fila — si
-- estuviera guardado, habría que acordarse de reescribirlo. Ver `order-money.ts`.
CREATE TABLE IF NOT EXISTS cobros (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  store_id              text,
  tipo                  text NOT NULL,                      -- adelanto | saldo | extra
  monto                 numeric NOT NULL,
  -- PENDING (cupón emitido, sin pagar) | MATCHED (entró) | ANULADO
  estado                text NOT NULL DEFAULT 'PENDING',
  matched_at            timestamptz,
  payment_event_id      uuid,
  pay360_coupon_id      text,
  pay360_consumer_code  text,
  coupon_expires_at     timestamptz,
  -- Para los `extra`: qué se está cobrando. "Flete a Piura", "diferencia de
  -- talla". Sin esto un cobro suelto es un monto sin razón, y el comprador que
  -- lo recibe por el chat no tiene cómo saber qué está pagando.
  concepto              text,
  -- Quién lo creó, cuando lo creó una persona (`auth_user_id`). NULL = lo
  -- emitió el sistema: el adelanto del checkout, el saldo de la guía.
  created_by            text,
  created_at            timestamptz DEFAULT now()
);

-- RLS encendido y SIN políticas, a propósito: así solo entra el service role.
-- Ni el comprador ni el panel leen esta tabla directo — van por `get-session` y
-- `get-store-sessions`, que deciden qué le toca ver a cada uno. Para la tabla de
-- la plata, "nadie salvo el servidor" es la política correcta.
ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cobros_session ON cobros(session_id);
CREATE INDEX IF NOT EXISTS idx_cobros_cupon   ON cobros(pay360_coupon_id) WHERE pay360_coupon_id IS NOT NULL;

-- Un pedido tiene UN adelanto y UN saldo. Los `extra` no se limitan: pueden ser
-- varios, y esa es justamente su razón de existir. El índice parcial es lo que
-- hace que el backfill de abajo se pueda correr mil veces sin duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cobros_unico_por_tipo
  ON cobros(session_id, tipo) WHERE tipo IN ('adelanto', 'saldo');

-- ─── El traspaso ────────────────────────────────────────────────────────────
-- Cada columna de plata que ya existe se convierte en su fila. Idempotente por
-- el índice de arriba: correrlo de nuevo no duplica nada.
--
-- `COALESCE(estado, 'PENDING')`: una fila con monto y sin veredicto es un cupón
-- emitido y sin cruzar, que es exactamente lo que significa PENDING. Marcarla
-- MATCHED sería inventar plata.
INSERT INTO cobros (session_id, store_id, tipo, monto, estado, matched_at,
                    payment_event_id, pay360_coupon_id, pay360_consumer_code,
                    coupon_expires_at, created_at)
SELECT o.id, o.store_id, 'adelanto', o.advance_amount,
       COALESCE(NULLIF(upper(o.payment_verification), ''), 'PENDING'),
       o.payment_matched_at, o.payment_event_id, o.pay360_coupon_id,
       o.pay360_consumer_code, o.pay360_coupon_expires_at, o.created_at
FROM order_sessions o
WHERE COALESCE(o.advance_amount, 0) > 0
ON CONFLICT DO NOTHING;

INSERT INTO cobros (session_id, store_id, tipo, monto, estado, matched_at,
                    payment_event_id, pay360_coupon_id, pay360_consumer_code,
                    coupon_expires_at, created_at)
SELECT o.id, o.store_id, 'saldo', o.saldo_amount,
       COALESCE(NULLIF(upper(o.saldo_verification), ''), 'PENDING'),
       o.saldo_matched_at, o.saldo_event_id, o.pay360_saldo_coupon_id,
       o.pay360_saldo_consumer_code, o.pay360_saldo_coupon_expires_at, o.created_at
FROM order_sessions o
WHERE COALESCE(o.saldo_amount, 0) > 0
ON CONFLICT DO NOTHING;

-- ⚠️ **Las columnas viejas siguen ahí, y siguen escribiéndose.** No es
-- indecisión: es cómo se migra la tabla de la plata sin apostar. Veintiún
-- archivos leen esas columnas hoy; moverlos todos de un golpe, sin poder probar
-- contra la base de producción, sobre pedidos que respaldan un contrato de
-- recaudación, es la clase de cambio que sale mal una vez y se paga durante
-- meses.
--
-- El orden es: primero la tabla y que TODO la lea (esto), después que solo ella
-- se escriba, y al final las columnas se van. Mientras dure, quien escribe un
-- cobro lo hace en UN solo sitio —`_shared/cobros.ts`— para que no haya dos
-- lugares decidiendo qué es un cobro.
--
-- Comprobar que el traspaso cuadra (las dos cifras tienen que dar igual):
--   SELECT
--     (SELECT COALESCE(sum(advance_amount),0) FROM order_sessions WHERE upper(payment_verification) = 'MATCHED')
--   + (SELECT COALESCE(sum(saldo_amount),0)   FROM order_sessions WHERE upper(saldo_verification)   = 'MATCHED') AS por_columnas,
--     (SELECT COALESCE(sum(monto),0) FROM cobros WHERE estado = 'MATCHED')                                        AS por_cobros;
