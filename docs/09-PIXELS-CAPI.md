# 09 · PIXELS & CAPI — Meta + TikTok, medición de anuncios por marca

> Cómo cada marca ve si su publicidad es rentable y cómo le devolvemos a Meta/TikTok
> a los compradores que SÍ pagaron, para que traigan más de esos.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Rol del módulo

Las marcas (clientes white-label) corren sus propios anuncios en Meta y TikTok, cada una
con su propio pixel y su propia cuenta publicitaria. Este módulo:

1. **Emite el embudo al Events Manager de la marca** ✅ — llegada a la landing → registro →
   en qué etapa se quedó. La marca lo lee en SU panel de Meta / TikTok, que es donde ya
   juzga sus anuncios (no hay tablero dentro de Kross: sería duplicar lo que la plataforma
   ya le da).
2. **Reporta la conversión por CAPI (server-side)** ✅ — cuando el comprador **adelanta el
   pago**, el evento sale del servidor. Meta/TikTok arman con eso el público "de los que
   pagan" y el anunciante pide *lookalikes* de ese público.

**Multi-tenant:** todo es por marca. Los IDs de pixel son **públicos** (viajan al navegador);
los tokens de CAPI son **secretos**. Una marca sin configurar no emite nada y nada se rompe.

## Por qué CAPI y no solo el pixel del navegador

- El **Purchase** se confirma por **webhook de 360pay**, cuando el comprador ya se fue a
  Yape (en otra app) y muchas veces no vuelve a la landing. El navegador no puede reportarlo:
  **solo el servidor lo tiene.**
- Muchos **Lead** del navegador se pierden por ad-blockers y por el ITP de iOS. CAPI los
  reporta igual desde el servidor.
- Los dos caminos (navegador y servidor) se **deduplican por `event_id`**: Meta/TikTok
  descartan el duplicado y se quedan con el que llegó con mejor data.

## Mapa de eventos

| Momento | Dónde dispara | Meta | TikTok | `event_id` |
|---|---|---|---|---|
| Vio la landing | navegador (init) | `PageView` + `ViewContent` | `ViewContent` | aleatorio |
| Abrió el checkout | navegador (`checkout_opened`) | `InitiateCheckout` | `InitiateCheckout` | aleatorio |
| Terminó datos + entrega | navegador (`step_completed{2}`) | `AddToCart` | `AddToCart` | aleatorio |
| **Se registró** (pedido creado) | navegador (`order_submitted`) **y** `register-buyer` | `Lead` | `CompleteRegistration` | **`checkout_id`** (dedup) |
| **Adelantó el pago** | **solo** `pay360-webhook` | `Purchase` | `CompletePayment` | `order_sessions.id` |

- El navegador cubre el embudo hasta el registro; el **Purchase es exclusivamente
  server-side** (el comprador ya no está).
- El **valor del Purchase es el adelanto pagado** (`value = paid`, dinero real recibido y
  garantizado), no el total. El precio total del pedido va como propiedad extra
  (`custom_data.order_value` / `properties.order_value`), para no inflar el ROAS con el
  saldo COD que puede no cobrarse.
- El `Lead` no lleva `value`: lo que importa ahí es contar registros, no un monto.

## Piezas

### Cliente — `src/lib/pixels/` ✅

| Archivo | Rol |
|---|---|
| `pixels.ts` | `initPixels({metaPixelId, tiktokPixelId})`: bootstrap de `fbq`/`ttq` (sin `eval`), una sola vez, solo si la marca tiene ID. Guardas anti-doble-carga y SSR |
| `attribution.ts` | `parseAttribution` (**puro**, testeable sin DOM) + `captureAttribution()`: lee cookies `_fbp`/`_fbc`/`_ttp` y los click ids `fbclid`/`ttclid`; sintetiza `_fbc` desde `fbclid` con el formato oficial `fb.1.<ts>.<fbclid>` |
| `sink.ts` | `PixelSink implements AnalyticsSink`: traduce cada `CheckoutEvent` al evento estándar de cada red. `trackLandingView()` para el `ViewContent` |

**Enganche:** `src/pages/LandingProductoPage.tsx` trae `meta_pixel_id`/`tiktok_pixel_id` en el
mismo `select` de flags de la tienda, y ahí llama `initPixels()`, `setAnalyticsSink(new
PixelSink({contentId}))` y `trackLandingView()`. Es el único punto donde la marca corre
anuncios, así que el `PageView`/`ViewContent` no ensucia otras páginas. El bus de eventos ya
existía (`src/lib/checkout/analytics.ts`); antes de esto `setAnalyticsSink` no se llamaba en
ningún sitio y todo caía en un sink de consola.

**Atribución → orden:** `OrderService.submitOrder` captura la atribución **al enviar** (para
entonces el pixel ya plantó `_fbp`/`_fbc` y la URL sigue con `fbclid`) y la manda en el body
de `register-buyer`.

### Servidor — `_shared/capi.ts` ✅

Módulo compartido, **sin APIs exclusivas de Deno** (usa Web Crypto), así el test corre bajo
Vitest importándolo por ruta relativa — igual que `_shared/advance.ts` y `_shared/pay360.ts`.

- `sha256Hex`, `hashNormalized`, `normalizePhonePE`/`hashPhonePE` — hashing de PII (teléfono
  a E.164 con prefijo 51, nombre y `external_id` normalizados). **Meta y TikTok exigen la PII
  hasheada con SHA-256**; los identificadores del clic (`fbp`/`fbc`/`ttp`/`ttclid`/IP/UA) van
  en crudo.
- `buildMetaEvent` / `buildTiktokEvent` — arman el evento en la forma de cada API (Meta
  Conversions API, TikTok Events API v1.3).
- `sendMetaCapi` / `sendTiktokCapi` — el POST.
- `dispatchConversion(kind, cfg, input)` — orquesta ambas plataformas. **NUNCA lanza.**
- `runInBackground(promise)` — corre el envío DESPUÉS de responder (`EdgeRuntime.waitUntil`),
  para no sumarle latencia al registro ni al 2xx del webhook.

### `register-buyer` — Lead + persiste la atribución ✅

- Guarda `ad_fbp/ad_fbc/ad_ttp/ad_ttclid/ad_source_url` del body y `ad_client_ua/ad_client_ip`
  **de los headers** (el IP es spoofeable, no se acepta del body) en la orden.
- Tras crear el pedido, dispara **Lead** en segundo plano con `event_id = checkout_id` (el
  mismo del navegador → dedup). Solo si la tienda del producto tiene pixel ID + token.

### `pay360-webhook` — Purchase ✅

Tras marcar la orden `MATCHED`, dispara **Purchase** en segundo plano: `value = paid`,
`currency PEN`, `event_id = session.id`, PII hasheada + `ad_*` de la orden. En `try/catch`
total: **una falla de CAPI jamás cambia el 2xx del webhook** —el dinero ya está confirmado y
360pay reintenta si no ve el 2xx.

## Configuración por marca (self-serve)

El admin de la tienda la gestiona desde **Marcas → editar → "📊 Pixel y anuncios"**
(`src/pages/vendedor/MarcaPage.tsx`), sin depender de la plataforma:

- **Pixel IDs** (Meta / TikTok): públicos, se guardan con "Guardar cambios". Vaciar el campo
  **pausa** el pixel.
- **Tokens de CAPI**: secretos, patrón *write-only* idéntico al password de Shalom Pro —
  `type="password"`, se escriben pero **jamás vuelven al panel** (solo su presencia, los
  chips `✓ CAPI activo`). Se guardan por JWT verificado (`manage-store`, gate `trusted`).
- Códigos de prueba opcionales (Meta *Test Events* / TikTok `test_event_code`) para depurar
  sin ensuciar la data real.

## Base de datos (§26 de `setup-kross.sql`)

| Dónde | Columnas | Visibilidad |
|---|---|---|
| `stores` | `meta_pixel_id`, `tiktok_pixel_id` | **pública** (SELECT anon; viajan al navegador) |
| `store_secrets` | `meta_capi_token`, `tiktok_capi_token`, `meta_test_event_code`, `tiktok_test_event_code`, `ads_secrets_updated_at` | service role only |
| `order_sessions` | `ad_fbp`, `ad_fbc`, `ad_ttp`, `ad_ttclid`, `ad_client_ua`, `ad_client_ip`, `ad_source_url` | server-only |

> ⚠️ Los `ad_*` **no** están en el `select` de `get-session`: el IP/UA son PII y no pueden
> viajar al navegador del comprador. Si algún día se agrega una columna a ese `select`, no
> incluir ninguna `ad_*`.

## Deploy

1. Correr `supabase/setup-kross.sql` (bloque §26, idempotente).
2. Redeploy de las funciones:
   ```
   supabase functions deploy register-buyer  --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy manage-store     --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy pay360-webhook   --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
   ```
3. Cada marca pega sus pixel IDs + tokens desde el panel. **No hay env ni secretos de
   plataforma** que configurar: los tokens son por tienda, en `store_secrets`.

## Verificación

- `npm test` — `src/lib/pixels/{capi,attribution,sink}.test.ts` (hashing, normalización de
  teléfono, forma de payload sin PII cruda, síntesis `fbclid→fbc`, mapeo del sink).
- En una landing real con `?fbclid=test&ttclid=test`: confirmar en **Meta Test Events** y en
  el `test_event_code` de TikTok la secuencia `ViewContent → InitiateCheckout → AddToCart →
  Lead`, y que el `Lead` del navegador y el del servidor **deduplican** (mismo `event_id`).
- Pagar un cupón 360pay en sandbox y ver el `Purchase/CompletePayment` con `value` = adelanto
  y `currency PEN`.

## Decisiones deliberadas

- **Valor = adelanto pagado**, no el total: es dinero garantizado. El total va como propiedad
  extra, para no inflar el ROAS con el saldo COD.
- **Config por marca (self-serve):** es la cuenta publicitaria del cliente, no un hecho
  comercial de la plataforma como el reparto a domicilio. El admin de la tienda la pone.
- **Solo eventos, sin tablero interno:** el anunciante ya vive en su Events Manager; un
  tablero en Kross duplicaría lo que la plataforma da mejor. (El embudo interno parcial ya
  vive en `checkout_drafts` + el panel A/B, ver `01-SALES-ENGINE.md`.)
- **GA4/otros 🔮:** el `AnalyticsSink` queda listo para sumar un sink más sin tocar los call
  sites del checkout.

## Ver también
- [00-CORE · contrato `MerchantCustomerSession`](./00-CORE-ARCHITECTURE.md) — bloque `attribution`.
- [01-SALES-ENGINE](./01-SALES-ENGINE.md) — el bus de eventos del checkout (`analytics.ts`).
- [06-360PAY](./06-360PAY.md) — el webhook que confirma el adelanto y dispara el Purchase.
