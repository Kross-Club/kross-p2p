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
  públicos `branding` y `products`, privado `call-recordings`), Realtime (broadcast).
  Las imágenes que sube el panel se reducen en el navegador antes de subirlas
  (`src/lib/images/downscale.ts`): el comprador las descarga en 4G.
- **Multi-tenant:** subdominio → tienda vía `src/lib/store-context.tsx`
  (`marca.krossclub.app`). `isPlatformHost()` separa la plataforma de una marca.
  Branding por marca con variable CSS `--brand`.

## Autenticación & roles ✅

- **Supabase Auth** para el equipo (`sellers.auth_user_id`).
- **Super Admin (plataforma Kross):** `sellers.is_super_admin`. Solo ve "Marcas" y
  **Entra** a una marca para operarla (impersonación `acting`/`effective` en
  `src/lib/seller-session.ts`).
- **Admin de tienda:** `is_admin`, scoped a su `store_id`. Lo ve todo.
- **Roles de equipo (`role_label`):** el modelo por defecto solo usa **Logística**,
  que supervisa que el seguimiento automático (checkout → cobro → tracking) esté
  funcionando bien; la venta la cierra la app sola y el reparto lo hace la agencia,
  así que no hacen falta vendedores ni motorizados. Ventas · Soporte · Motorizado
  quedan como roles **legado**: el panel ya no los ofrece al crear/cambiar rol,
  pero se siguen reconociendo — si una tienda aún conserva Ventas, sus vendedores
  reciben los pedidos nuevos primero; sin Ventas, se asignan a Logística.
- **Comprador:** identificado por DNI/teléfono (`buyers`), sin login de contraseña; entra
  por su subdominio (`/acceso`). NO hay login de comprador en el host de plataforma.

### Identidad del comprador: DNI vs. teléfono ✅ (implementado)

`buyers` tiene **dos** índices únicos por tienda: `(store_id, document_number)` y
`(store_id, phone)`. O sea que el teléfono **ya es** una llave de identidad válida, y
`register-buyer` ya trae la rama que crea la cuenta solo con teléfono. No hace falta
tocar el esquema para dejar de pedir DNI.

**Decisión de producto (jul-2026):** el DNI se pide **solo en provincia**, no en Lima.
La asimetría es real y no arbitraria:

| | Lima | Provincia |
|---|---|---|
| Dinero por adelantado | no (COD puro) | sí (adelanto de flete) |
| ¿Quién absorbe el no-recibido? | el motorizado, en el momento | la marca, ya pagó el envío |
| ¿Alguien más exige el DNI? | nadie | **la agencia, para entregar el paquete** |

✅ **Confirmado con operaciones:** Shalom y Olva exigen DNI del destinatario para liberar
el paquete. En provincia el campo no es burocracia nuestra sino de ellos, y el copy lo
dice así porque es un motivo que el comprador acepta sin discutir.

**Riesgos de identificar solo por teléfono, con los ojos abiertos:**
- En Perú los números se reciclan: alguien podría heredar el historial y los puntos de otro.
- Una familia comparte un número → historiales que se mezclan.
- El `score` del comprador pierde filo: quien no recibe pedidos cambia de número y vuelve.

**Mitigación propuesta 🔮 — captura diferida del DNI.** Lima cierra la venta solo con
teléfono, y el DNI se pide **después**, en el chat del pedido, cuando le sirve al comprador:
para ver "Mis pedidos", acumular puntos o reclamar la recompensa de bienvenida. Deja de ser
un peaje antes de comprar y pasa a ser lo que desbloquea un beneficio. Es el mismo patrón
que ya se aplicó al pin de ubicación (ver [02-LOGISTICS §4](./02-SMART-LOGISTICS.md)).
La infraestructura ya existe: `buyer-login` resuelve por `document_number`, y `ScorePage`
y `MisPedidosPage` son justamente las pantallas que lo justifican.

## Modelo de datos (núcleo) ✅

- `stores` — una marca por fila: branding, slug, `active`, config WhatsApp (`wa_*`),
  retención (`welcome_points`, `points_rate`, `restock_days`, `winback_days`).
- `sellers` — equipo: `role_label`, `is_admin`, `is_super_admin`, `available`.
- `buyers` — clientes: `document_number`, `phone`, `nombre`, `score`, `puntos`,
  `address_lat/lng/verified`, `source`, `activated_at`.
- `order_sessions` — pedidos: `stage` (`nuevo→confirmado→preparando→en_camino→entregado`),
  `assigned_seller_id`, `product_price`, `items`, `token` público.
- `chat_messages`, `push_subscriptions` (una fila por **dispositivo** suscrito —
  celular y desktop conviven — con preferencias `notify_new_client` /
  `notify_new_message` que el servidor filtra al enviar), `notifications_log`,
  `call_recordings`.

## Panel Admin ✅

Edge Function `manage-store` (list/create/update/wa_usage/client_stats). El super admin
crea marcas + su primer admin sin SQL. Navegación por rol en `src/components/BottomNav.tsx`.

**Notificaciones push del equipo** (Equipo → Notificaciones, `src/components/PushSettings.tsx`):
cada miembro las activa/desactiva **por dispositivo** — el celular y la computadora se
suscriben por separado y ambos reciben — y por **evento**: 🛍️ nuevo cliente y 💬 nuevo
mensaje, cada uno con su sonido propio (`src/lib/notification-sounds.ts`). Con la app
enfocada la notificación entra silenciosa y suena el sonido del evento; en segundo plano
suena el sistema. El filtro por evento se aplica **en el servidor** (columnas
`notify_new_*` de la suscripción): lo apagado ni siquiera se envía.

## Estado central compartido — `MerchantCustomerSession`

Contrato conceptual que unifica los tres módulos. Hoy vive **distribuido** en las tablas
`buyers` + `order_sessions` (no como un único objeto), pero esta es la forma canónica que
todo módulo debe poder leer/escribir:

```typescript
type MerchantCustomerSession = {
  customer:  { dni: string; fullName: string; phone: string }
  delivery:  { lat: number; lng: number; addressText: string; reference: string
               // Región × método: son CUATRO, no dos. "No es agencia" NO significa
               // Lima, y "agencia" ya no significa provincia.
               dispatchType: 'MOTORIZADO_LIMA' | 'MOTORIZADO_PROVINCIA'
                           | 'AGENCIA_PROVINCIA' | 'AGENCIA_LIMA'
               agencyName?: 'SHALOM' | 'OLVA' }
  sale:      { productId: string
               paymentMethod: 'YAPE_PLIN' | 'CONTRAENTREGA' | 'TARJETA'
               closedBy: 'AI_CLOSER' | 'DIRECT_CHECKOUT' }
  // Adelanto. Sales lo cobra (manual §3.1-3.2 o 360pay §3.3, según la tienda);
  // Logistics decide con él si despacha. Por eso vive en el contrato.
  advance:   { amountPen: number            // mitad del pedido, o el total. NO por destino
               choice: 'HALF' | 'FULL'      // cuál eligió: el cobro re-deriva con esto
               verification: 'NOT_REQUIRED' | 'PENDING' | 'MATCHED'
               provider?: '360PAY' | null   // NULL = flujo manual; separa las piscinas de cruce
               providerChargeId?: string    // id del cupón, en payment_events
               reason?: string }            // veredicto interno — NUNCA al comprador
  // Envío por agencia (tracking por API, 02-SMART-LOGISTICS §3). Logistics
  // registra los identificadores del comprobante; un job periódico los consulta
  // contra la API del courier y refleja la fase. La fase dispara la cobranza
  // del saldo al llegar a EN_DESTINO — pero NUNCA mueve `stage` sola: el
  // pipeline lo avanza una persona (misma regla que `no_entregado`).
  shipment?: { courier: 'SHALOM' | 'OLVA'
               // Shalom rastrea por numero+codigo (u oseId); Olva por
               // numero+year (año de emisión en 2 dígitos, sin código).
               ref: { numero?: string; codigo?: string; oseId?: string; year?: string }
               phase: 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO' | null
               phaseAt?: Date
               demoraAt?: Date }              // alerta de demora del courier; NO es una fase
  stage:     'nuevo' | 'validando' | 'confirmado' | 'preparando' | 'en_camino' | 'entregado'
             | 'no_entregado'               // terminal de fracaso: lo marca una persona;
                                            // tasa de entrega = entregado/(entregado+no_entregado)
  loyalty:   { pointsEarned: number; nextReorderDate: Date }
}
```

**Tres reglas del bloque `advance` que cruzan módulos y no se negocian por pantalla:**

1. **`reason` no sale del backend hacia el comprador.** Es el veredicto interno del
   cobro ("no coincide el monto", el error crudo del proveedor). `get-session` lo elimina
   de la respuesta cuando el que mira no es vendedor. Da igual que la UI no lo pinte:
   viaja en el JSON y se ve en la pestaña de red.
2. **`stage` avanza solo con el pago confirmado**, y las advertencias no lo frenan: el
   dinero entró, la duda es de operaciones. Ver `01-SALES-ENGINE.md`.

Lector único: **`src/lib/session.ts` → `toCustomerSession(order, buyer)`** ensambla este
objeto desde `order_sessions` + `buyers`. Todos los módulos leen la sesión por ahí.

Mapeo actual → objetivo:
| Campo | Hoy | Estado |
|---|---|---|
| `customer.*` | `buyers.document_number/nombre/phone` | ✅ |
| `delivery.lat/lng/addressText` | `order_sessions.address_*` / `buyers.address_*` | ✅ |
| `delivery.reference` | `order_sessions.delivery_reference` (columna lista, sin UI aún) | 🟡 |
| `delivery.dispatchType` | `order_sessions.dispatch_type` (def `MOTORIZADO_LIMA`) — ⚠️ lista blanca en `register-buyer`: lo no reconocido se aplasta al default **sin error** | ✅ |
| `delivery.agencyName` | `order_sessions.agency_name` — lo escribe el checkout al elegir punto de recojo | ✅ |
| `sale.paymentMethod` | `order_sessions.payment_method` (def `CONTRAENTREGA`) — escrito por checkout | ✅ |
| `sale.closedBy` | `order_sessions.closed_by` (def `DIRECT_CHECKOUT`) — escrito por checkout | ✅ |
| `advance.amountPen` | `order_sessions.advance_amount` — lo deriva el SERVIDOR (`_shared/advance.ts`) sobre el precio **verificado contra `products.packs`**, nunca sobre el del body | ✅ |
| `advance.choice` | `order_sessions.advance_choice` (def `'HALF'`) — sin esto el cobro no puede reproducir el monto mostrado | ✅ |
| `advance.verification` | `order_sessions.payment_verification` — la fija `pay360-webhook` | ✅ |
| `advance.provider` | `order_sessions.payment_provider` — '360PAY' o NULL | ✅ |
| `advance.providerChargeId` | `payment_events.provider_charge_id` (por `matched_order_id`) | ✅ |
| `advance.reason` | `order_sessions.payment_reason` — solo Ventas | ✅ |
| `shipment.courier/ref` | `order_sessions.tracking_courier/tracking_numero/tracking_codigo/tracking_ose_id/tracking_year` — los registra `order-manage` (acción `set_tracking`) | ✅ |
| `shipment.phase/phaseAt/demoraAt` | `order_sessions.tracking_phase/tracking_phase_at/tracking_demora_at` — los escriben los jobs `shalom-tracking-sync` / `olva-tracking-sync` (pg_cron) vía el reflejo compartido `_shared/tracking.ts`; `tracking_checked_at` audita el último chequeo | ✅ |
| `stage` | `order_sessions.stage` — orden en `src/lib/order-stages.ts` | ✅ |
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
