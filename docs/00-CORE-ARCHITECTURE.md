# 00 · CORE ARCHITECTURE — Base de datos, Autenticación y Panel Admin

> Módulo base del **Sistema Operativo de E-commerce Perú (Kross)**. Todo lo demás
> (Sales, Logistics, Loyalty) se apoya en lo que aquí se define. Antes de tocar otro
> módulo, respeta estos estándares.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Rol del módulo

Provee: multi-tenancy white-label, autenticación de equipo, panel de administración y
el **estado central del cliente** (`MerchantCustomerSession`) que los tres módulos leen
y actualizan.

## Stack ✅

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS 4. Deploy en Vercel.
- **Backend:** Supabase — Postgres + RLS, Edge Functions (Deno), Storage (buckets
  público `branding` y privado `call-recordings`), Realtime (broadcast).
- **Multi-tenant:** subdominio → tienda vía `src/lib/store-context.tsx`
  (`marca.krossclub.app`). `isPlatformHost()` separa la plataforma de una marca.
  Branding por marca con variable CSS `--brand`.

## Autenticación & roles ✅

- **Supabase Auth** para el equipo (`sellers.auth_user_id`).
- **Super Admin (plataforma Kross):** `sellers.is_super_admin`. Solo ve "Marcas" y
  **Entra** a una marca para operarla (impersonación `acting`/`effective` en
  `src/lib/seller-session.ts`).
- **Admin de tienda:** `is_admin`, scoped a su `store_id`.
- **Roles de equipo (`role_label`):** Ventas · Logística · Soporte · Motorizado.
- **Comprador:** identificado por DNI/teléfono (`buyers`), sin login de contraseña; entra
  por su subdominio (`/acceso`). NO hay login de comprador en el host de plataforma.

## Modelo de datos (núcleo) ✅

- `stores` — una marca por fila: branding, slug, `active`, config WhatsApp (`wa_*`),
  retención (`welcome_points`, `points_rate`, `restock_days`, `winback_days`).
- `sellers` — equipo: `role_label`, `is_admin`, `is_super_admin`, `available`.
- `buyers` — clientes: `document_number`, `phone`, `nombre`, `score`, `puntos`,
  `address_lat/lng/verified`, `source`, `activated_at`.
- `order_sessions` — pedidos: `stage` (`nuevo→confirmado→preparando→en_camino→entregado`),
  `assigned_seller_id`, `product_price`, `items`, `token` público.
- `chat_messages`, `push_subscriptions`, `notifications_log`, `call_recordings`.

## Panel Admin ✅

Edge Function `manage-store` (list/create/update/wa_usage/client_stats). El super admin
crea marcas + su primer admin sin SQL. Navegación por rol en `src/components/BottomNav.tsx`.

## Estado central compartido — `MerchantCustomerSession`

Contrato conceptual que unifica los tres módulos. Hoy vive **distribuido** en las tablas
`buyers` + `order_sessions` (no como un único objeto), pero esta es la forma canónica que
todo módulo debe poder leer/escribir:

```typescript
type MerchantCustomerSession = {
  customer:  { dni: string; fullName: string; phone: string }
  delivery:  { lat: number; lng: number; addressText: string; reference: string
               dispatchType: 'MOTORIZADO_LIMA' | 'AGENCIA_PROVINCIA'
               agencyName?: 'SHALOM' | 'OLVA' | 'OTRO' }
  sale:      { productId: string
               paymentMethod: 'YAPE_PLIN' | 'CONTRAENTREGA' | 'TARJETA'
               closedBy: 'AI_CLOSER' | 'DIRECT_CHECKOUT' }
  loyalty:   { pointsEarned: number; nextReorderDate: Date }
}
```

Lector único: **`src/lib/session.ts` → `toCustomerSession(order, buyer)`** ensambla este
objeto desde `order_sessions` + `buyers`. Todos los módulos leen la sesión por ahí.

Mapeo actual → objetivo:
| Campo | Hoy | Estado |
|---|---|---|
| `customer.*` | `buyers.document_number/nombre/phone` | ✅ |
| `delivery.lat/lng/addressText` | `order_sessions.address_*` / `buyers.address_*` | ✅ |
| `delivery.reference` | `order_sessions.delivery_reference` (columna lista, sin UI aún) | 🟡 |
| `delivery.dispatchType` | `order_sessions.dispatch_type` (def `MOTORIZADO_LIMA`) | ✅ |
| `delivery.agencyName` | `order_sessions.agency_name` (columna lista, provincia pendiente) | 🟡 |
| `sale.paymentMethod` | `order_sessions.payment_method` (def `CONTRAENTREGA`) — escrito por checkout | ✅ |
| `sale.closedBy` | `order_sessions.closed_by` (def `DIRECT_CHECKOUT`) — escrito por checkout | ✅ |
| `loyalty.points` | `buyers.puntos` | ✅ |
| `loyalty.nextReorderDate` | derivado de `restock_days` en campañas | 🟡 |

## Estándares del módulo

- Toda Edge Function: CORS + validación de entrada + service role para escribir.
- RLS activo; el frontend no lee tablas sensibles directo, invoca funciones.
- Nunca secrets/tokens en código, commits ni chat.
- Cambios de datos que afecten a otro módulo → actualizar aquí el contrato primero.

## Ver también
- Capa estratégica: [`ICP Sales`](./ICP%20Sales/) y [`ICP LTV`](./ICP%20LTV/).
- Módulos: [01-SALES](./01-SALES-ENGINE.md) · [02-LOGISTICS](./02-SMART-LOGISTICS.md) · [03-LOYALTY](./03-LOYALTY-ENGINE.md).
