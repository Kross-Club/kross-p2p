# ICP LTV — Enfoque 2 (retención y recompra)

> **Estado:** en desarrollo por fases. Fase 1 (activación) y Fase 2 (recompra) construidas.
> Fase 3 (campañas + dashboard) propuesta.

## 1. El giro estratégico

Kross se **reposiciona de herramienta de adquisición a producto de retención**. El nuevo
ICP no es el dropshipper por impulso, sino la **marca de recompra**: productos consumibles
o de identidad de marca donde el cliente vuelve — suplementos, cosmética, café, skincare.

**Por qué el giro (racional de negocio):**
- El valor no está en cerrar un pedido, sino en el **LTV** (que el cliente compre otra vez).
- El activo defensible de Kross es el **canal propio**: una app instalable de marca que la
  marca posee, a diferencia de anuncios alquilados o un CRM genérico.
- Para el ICP de recompra, cada cliente activado vale mucho más en el tiempo → la app puede
  cobrar menos por entrada y monetizar el volumen y la retención.

**Estructura de 2 tracks (para no desenfocar):**
- **CRM Team** — clientes existentes en GoHighLevel (drop por impulso). Se mantiene como
  cash cow en modo mantenimiento. No se reconstruye GHL + Neural dentro de Kross.
- **Retention Team** — Kross como la apuesta de retención. Es lo que documenta esta carpeta.

**Pricing:** no bajar precio universalmente; **tiering**. Base accesible ($50 + costo de
API + llamadas) para captar volumen de marcas de recompra, y planes superiores para los
clientes actuales de mayor ticket.

## 2. Roadmap por fases

| Fase | Nombre | Objetivo | Estado |
|---|---|---|---|
| 1 | Activación | Importar la base y activar clientes existentes | ✅ Construida |
| 2 | Recompra | Loop de recompra: catálogo + reorder + puntos | ✅ Construida |
| 3 | Campañas + Dashboard | Disparar recompra proactiva y medir retención | ✅ Construida |

---

## Fase 1 — Activación (activar la base existente)

**Idea:** la marca ya tiene clientes; el primer trabajo de retención es traerlos a su app.

- **Importar base de datos de clientes** (`import-buyers`): upsert de compradores con
  `source='import'` por `(store_id, document_number)` o teléfono. CSV con detección de
  columnas (`parseCsv` en `ClientesPage.tsx`).
- **Recompensa de bienvenida al activar el DNI** (`buyer-login`): al primer login válido se
  otorga **una sola vez** una recompensa (`welcome_points`) y se marca `activated_at`.
  Configurable por marca (puntos + mensaje).
- **Embudo de activación** (`manage-store` acción `client_stats`): devuelve
  `{ total, imported, activated, pending }` → métricas de activación en `ClientesPage.tsx`
  (total / importados / activados + %).
- **Invitación masiva controlada** (`invite-buyers`): envío por lotes de 80 a los
  importados con `activated_at IS NULL AND invited_at IS NULL`; plantilla WhatsApp con
  `[nombre, recompensa, link-de-acceso]`; marca `invited_at`; devuelve `{sent, failed, remaining}`.
- **Link de invitación compartible** en `ClientesPage.tsx`.

**Diseño (por qué):** la activación se ancla en un **incentivo real** (recompensa de
bienvenida) para que registrarse tenga una razón inmediata; el envío masivo es **controlado
por lotes** para no quemar el número de WhatsApp ni la reputación del remitente.

**Deploy Fase 1:**
```
supabase functions deploy import-buyers --project-ref ofdjghntvmrdfjhazfvz
```
```
supabase functions deploy buyer-login --project-ref ofdjghntvmrdfjhazfvz
```
```
supabase functions deploy invite-buyers --project-ref ofdjghntvmrdfjhazfvz
```

---

## Fase 2 — Recompra (loop de recompra)

**Idea:** una vez activado, la recompra debe ser **trivial** y los puntos deben **valer algo**.

- **Tienda del comprador** (`TiendaPage.tsx`, ruta `/tienda`): catálogo de la marca con
  grid de productos y `OrderSheet` (selector de pack + toggle "Usar mis puntos").
- **Pedir en 1–2 toques**: como el comprador ya está logueado, **no reingresa datos** —
  elige producto/pack → "Pedir ahora" → pedido creado.
- **"Volver a pedir"** en cada pedido pasado (`MisPedidosPage.tsx`): recompra el mismo en
  1 toque. Más "Comprar de nuevo" como CTA hacia la tienda.
- **Canje de puntos redimibles** (`register-buyer` acción `redeem_points`):
  ```ts
  const maxByPrice = Math.floor(body.product_price / rate)
  const usedPoints  = Math.min(body.redeem_points, buyer.puntos ?? 0, maxByPrice)
  // descuento = usedPoints * rate; finalPrice aplicado al pedido; se descuentan los puntos
  ```
  Configuración **"1 punto = S/X"** por marca (`stores.points_rate`, editable en `ClientesPage.tsx`).

**Diseño (por qué):**
1. La recompra debe ser trivial — el cliente ya dio sus datos; pedirle que los reingrese
   mata la recompra.
2. Los puntos deben VALER algo — un score que no se canjea es decorativo; canjeable, mueve conducta.
3. Dos caminos: el rápido ("Volver a pedir" el mismo) y el de descubrimiento (catálogo →
   otros productos de la marca → sube el ticket).

**Apunte de negocio:** el canje reduce el precio COD que cobra el motorizado; es un
descuento real del margen de la marca. Es una **palanca**: cada marca calibra `points_rate`
(ej. S/0.05–0.1 por punto) para que el descuento sea atractivo sin comerse el margen.

**Deploy Fase 2:**
```
supabase functions deploy register-buyer --project-ref ofdjghntvmrdfjhazfvz
```
```
supabase functions deploy manage-store --project-ref ofdjghntvmrdfjhazfvz
```
> Correr también `supabase/setup-kross.sql` (agrega `stores.points_rate` y columnas de retención).

---

## Fase 3 — Campañas + Dashboard

El motor que **mide** la retención y **dispara** la recompra proactivamente.

### Dashboard de retención (`retention-metrics` + `RetencionPage.tsx`, ruta `/vendedor/retencion`)
Calcula sobre los pedidos entregados (`order_sessions.stage='entregado'`) de la marca:
- **Tasa de recompra** = clientes con ≥2 entregas / clientes con ≥1.
- **Ingreso de clientes existentes** = suma del COD entregado.
- **LTV promedio** = ingreso / clientes con pedido, y pedidos promedio por cliente.
- **Clientes activos** (activaron su app) sobre el total de la base.
- Tamaño de los dos segmentos accionables (restock / win-back).

### Segmentos y campañas (`run-campaign` + `CampaignCard`)
Dos segmentos, calculados por **días desde la última entrega** de cada cliente:
- **RESTOCK (reposición)** — última compra hace `[restock_days, winback_days)` días: el
  consumible se está acabando → mejor momento para que repita. *Killer feature* del ICP de recompra.
- **WIN-BACK (reactivar)** — sin comprar hace más de `winback_days` días: cliente dormido,
  un empujón con incentivo antes de perderlo.

Al lanzar, `run-campaign` **recomputa el segmento** y envía la plantilla WhatsApp elegida:
- Por **lotes de 80** (protege el rating del número).
- Con **cooldown de 7 días por cliente** (`buyers.last_campaign_at`) para no spamear.
- Convención de plantilla: `{{1}}` nombre · `{{2}}` link a la tienda (`/tienda`).
- Registra el lote en `notifications_log` (`kind='campaign_<segmento>'`).

### Ventanas configurables por marca
`stores.restock_days` (def. 30) y `stores.winback_days` (def. 60), editables desde
`RetencionPage.tsx` vía `manage-store` (validación: inactivo > reposición). Cada marca las
calibra según el ciclo de su producto (un consumible de 30 días → reposición ~25–30).

**Diseño (por qué):**
1. **Medir antes que adivinar** — la tasa de recompra y el LTV le dicen a la marca si la
   retención funciona; sin eso, las campañas son a ciegas.
2. **El restock es el momento de oro** — mandar el recordatorio justo cuando el producto se
   acaba convierte mucho más que un blast genérico. Por eso el segmento se define por el
   ciclo real del producto, no por una fecha fija.
3. **Guardrails de canal** — lotes + cooldown + log: la retención agresiva quema el número
   de WhatsApp; el diseño protege el activo (el canal propio) por encima del envío puntual.

**Deploy Fase 3:**
```
supabase functions deploy retention-metrics --project-ref ofdjghntvmrdfjhazfvz
```
```
supabase functions deploy run-campaign --project-ref ofdjghntvmrdfjhazfvz
```
```
supabase functions deploy manage-store --project-ref ofdjghntvmrdfjhazfvz
```
> Correr también `supabase/setup-kross.sql` (agrega `stores.restock_days`, `stores.winback_days`,
> `buyers.last_campaign_at`). Frontend → Vercel + Ctrl+Shift+R.

### Pendiente / mejoras futuras
- **Automatización real** (cron): hoy la campaña se dispara manualmente desde el panel. El
  siguiente paso es un `pg_cron`/scheduled function que corra restock a diario sin intervención.
- Link de invitación **tokenizado** que identifica al cliente por teléfono (sin tipear DNI).
- Segmento de **leales/VIP** (≥N compras) para trato preferente.

## 3. Modelo de datos añadido en LTV

- `stores`: `welcome_points`, `welcome_msg`, `points_rate`, `notif_icon_url`,
  `restock_days`, `winback_days`, columnas `wa_*` (config WhatsApp).
- `buyers`: `source`, `welcome_granted`, `activated_at`, `invited_at`, `last_campaign_at`, `puntos`.
- `sellers`: `is_super_admin`.
- Store de plataforma sembrada con `id='platform'`.

## 4. Cómo se relaciona con ICP Sales

Misma app, misma base de código. LTV **reutiliza** todo lo de Sales (multi-tenant, chat,
llamadas, WhatsApp, pedido COD) y le añade la capa de retención encima. El pedido sigue
siendo COD; lo que cambia es el **objetivo**: no cerrar una venta, sino construir la recompra.
