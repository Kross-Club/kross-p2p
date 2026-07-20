# ICP Sales — Enfoque 1 (adquisición COD)

> **Estado:** base consolidada. Este enfoque construyó el núcleo de la plataforma:
> multi-tenant white-label, pedido COD, chat en vivo comprador↔vendedor, llamadas,
> notificaciones y panel de operación. Es la fundación sobre la que se montó el
> enfoque LTV.

## 1. Qué es y a quién apuntaba

Kross nació como una PWA white-label para **ecommerce contraentrega (COD /
contraentrega)** en Perú. El cliente ideal original era el **dropshipper / vendedor
por impulso**: importa un producto, corre ads, y necesita cerrar el pedido rápido con
el comprador antes de que se enfríe.

La app resolvía la parte crítica de ese negocio: **convertir el clic del anuncio en un
pedido confirmado y despachado**, con seguimiento hasta la entrega.

Cada marca obtiene su propia app instalable en `marca.krossclub.app` — misma base de
código, branding por subdominio.

## 2. Arquitectura

**Frontend**
- React 19 + Vite 8 + TypeScript + Tailwind CSS 4.
- Deploy automático vía Vercel (el branch por defecto del repo ES el branch de features).
- PWA instalable con Service Worker (`public/sw.js`) y Web Push (VAPID).

**Backend (Supabase, project ref `ofdjghntvmrdfjhazfvz`)**
- Postgres + RLS.
- Edge Functions (Deno).
- Storage (buckets públicos y privados, protocolo S3).
- Realtime (canales de broadcast para chat y presencia).

**Multi-tenant**
- Resolución subdominio → tienda en `src/lib/store-context.tsx`.
- `isPlatformHost()` distingue el host de plataforma (krossclub.app) de un subdominio de marca.
- Branding por marca vía variable CSS `--brand` + colores en la tabla `stores`.
- Cache por-slug en localStorage para eliminar el "flash" de marca incorrecta al cargar.

**Comandos clave**
```
supabase functions deploy <name> --project-ref ofdjghntvmrdfjhazfvz
supabase secrets set NAME=value --project-ref ofdjghntvmrdfjhazfvz
```

## 3. Modelo de datos (núcleo)

- **`stores`** — una fila por marca. Branding (`logo_url`, `color_primary`, `color_dark`),
  slug (subdominio), estado `active`.
- **`sellers`** — usuarios del equipo de una marca. `is_admin`, `store_id`, `role_label`,
  `available`. (`is_super_admin` se agregó en la transición — ver `ICP LTV`).
- **`buyers`** — compradores. Identificados por DNI / teléfono.
- **`products`** — catálogo por marca, con `packs` (variantes de precio) e `images`.
- **`orders`** — pedidos COD, con token público para el chat del pedido.

## 4. Funcionalidades construidas

### 4.1 Onboarding de tiendas desde el panel admin
Crear marcas sin tocar SQL. `manage-store` (Edge Function) con acciones `list` / `create` /
`update`: crea la tienda + su primer admin (auth user + fila en `sellers`), con validación
y limpieza de slug (subdominio), slugs reservados y rollback si falla la creación del admin.

### 4.2 Gestión de equipo por tienda
Panel de Equipo (`EquipoPage.tsx`) scoped a la tienda. Alta/baja de miembros, roles,
avatar. Logo de marca visible en el login del vendedor y en el panel.

### 4.3 Branding por marca (CSS variable `--brand`)
Migración de colores hardcodeados a la variable `--brand` por marca, de modo que cada
subdominio pinta su propia identidad sin recompilar.

### 4.4 Pedido COD + chat en vivo
- Landing de producto (`LandingProductoPage.tsx`) → registro del comprador (`register-buyer`).
- Chat del pedido (`OrderChatPage.tsx`) comprador↔vendedor por Realtime.
- Panel del pedido para el vendedor (`VendedorPedidoPage.tsx`).
- Pipeline de estados del pedido (`order-manage`) con handoff entre roles del equipo.

### 4.5 Llamadas de voz (LiveKit) + grabación
- Voz WebRTC vendedor↔comprador (LiveKit): `create-call-token` / `seller-call-token`,
  overlay de llamada entrante, ringtone.
- **Grabación de llamadas (LiveKit Egress)** para monitoreo desde el admin:
  - `livekit-webhook` controla el Egress: **inicia** cuando entra el 2º participante,
    **detiene** al colgar (se graba solo la duración conectada → control de costo).
  - Debe desplegarse con `--no-verify-jwt` (el gateway de Supabase si no rechaza el JWT
    de LiveKit con 401).
  - Usa `RoomServiceClient.listParticipants` para contar participantes reales
    (`numParticipants` del webhook es poco fiable / llega 0).
  - RoomComposite audio-only → Supabase Storage (bucket privado `call-recordings`).
  - `get-recordings` + `LlamadasPage.tsx`: listado admin con URLs firmadas y reproductor.
  - Aviso legal de grabación + página de privacidad (`PrivacidadPage.tsx`).

### 4.6 Notificaciones push (Web Push / VAPID)
- Suscripción vía `save-push-subscription`, envío inline desde las Edge Functions.
- Ícono de notificación = ícono de la marca (no cuadrado genérico); `notif_icon_url`
  configurable, con fallback a `logo_url`.

### 4.7 WhatsApp Cloud API (producción)
- System User token permanente (`WHATSAPP_TOKEN`), `phone_number_id` + `WABA id` por tienda.
- Plantillas por-WABA, aprobación de display name.
- **Envío manual controlado por el vendedor**: botón de WhatsApp en el pedido para elegir
  cualquier plantilla aprobada, con **mapeo de variables configurable**
  (`list-wa-templates`, `send-wa-template`). Nota de chat en vivo solo para el vendedor.
- Fallback push-first → WhatsApp cuando el comprador está inalcanzable (gateado por
  `WA_AUTO_FALLBACK`, apagado por defecto).

### 4.8 CRM, productos, stats
- `CRMPage.tsx`, `ProductosPage.tsx` (`manage-product`), `EstadisticasPage.tsx`.
- Bot IA (`BotIAPage.tsx`) como asistente del vendedor.

## 5. Roles y pipelines

Modelo de roles con **2 pipelines** (COD y Agencia):
- **Ventas** → **Logística** (antes "Despacho") → **Soporte** (nuevo) → **Motorizado**.
- Handoff COD: Soporte acompaña en `preparando`, y el Motorizado acompaña en `en_camino`
  manteniendo a Soporte como co-escritor del chat.
- `order-manage`: `HANDOFF = { confirmado: 'logist', preparando: 'soporte', en_camino: 'motoriz' }`.

## 6. Separación plataforma vs. tienda (transición al final del enfoque 1)

Al cierre de este enfoque se separó el **super admin de Kross (plataforma)** de las tiendas:
- El super admin solo ve **"Marcas"** y **"Entra"** a una marca para operarla
  (impersonación vía `acting`/`effective` en `seller-session.ts`).
- Admins/equipo/clientes de una marca solo operan desde su subdominio.
- **No hay login de comprador en krossclub.app** (host de plataforma).
- `sellers.is_super_admin`; store de plataforma sembrada con `id='platform'`.

> Este cambio es el puente hacia el enfoque LTV: dejó la base lista para operar múltiples
> marcas de retención desde una sola plataforma.

## 7. Aprendizajes clave del enfoque 1

- El canal propio (app instalable de marca) es el activo defensible ("moat"), no el pedido puntual.
- "sent" (Meta aceptó) ≠ "delivered" en WhatsApp; el display name y la verificación del
  negocio afectan la entrega real.
- Controlar el costo de infra (grabación solo de duración conectada, WhatsApp manual) es
  parte del diseño de producto, no un detalle técnico.
- Estas lecciones motivaron el giro de ICP: de **cerrar un pedido** (Sales) a **hacer que
  el cliente vuelva** (LTV).
