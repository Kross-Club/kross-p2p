# 01 · SALES ENGINE — Cierre & Conversión

> **Objetivo:** liberar al emprendedor del cuello de botella de atender clientes a mano.
> Cerrar ventas en minutos sin personal humano.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Componentes

### 1. Agente IA "Closer" (voz + texto) 🟡
- **Hoy ✅:** voz WebRTC vendedor↔comprador con **LiveKit** (`seller-call-token`,
  `create-call-token`, overlay de llamada, ringtone) + grabación por Egress
  (`livekit-webhook`). Asistente IA para el **vendedor** en `BotIAPage.tsx`.
- **Costura lista ✅ (dormida):** hook `src/lib/useVoiceCloser.ts` que conecta un agente
  **ElevenLabs Conversational AI** al estado del checkout: le da **contexto dinámico**
  (paso, Lima/provincia, pago) y dispara un **nudge de voz a los 5s** de inactividad.
  El transporte de audio es **pluggable** (`VoiceTransport`); por defecto `noopTransport`
  → si no hay `VITE_ELEVENLABS_AGENT_ID` el hook queda dormido y no rompe nada.
  Signed URL efímera vía `elevenlabs-signed-url` (API key en backend).
- **Falta 🔮:** enchufar la tubería de audio real (`@elevenlabs/react`) en un
  `createElevenLabsTransport()` que implemente `VoiceTransport`, y crear el agente en
  ElevenLabs. Recién ahí la voz atiende y cierra sola.
- Al cerrar por voz, marcar `sale.closedBy = 'AI_CLOSER'` (columna lista; `register-buyer`
  ya acepta `closed_by`).

### 1.b Checkout multi-paso (refactor en curso) 🟡

**Núcleo ✅ construido** en `src/lib/checkout/`:

| Archivo | Rol |
|---|---|
| `types.ts` | Contrato de `CheckoutState`. Tipado estricto, sin `any` |
| `checkout.config.ts` | **TODA** regla de negocio: montos, umbrales, textos, modos |
| `machine.ts` | Reducer puro. `advanceAmount`, `deliveryMethod`, `needsLocationConfirmation` y `courierSurcharge` son **derivados**, nunca los setea la UI |
| `validation.ts` | Schemas por paso, sin dependencias (son 4 campos; una librería no se paga sola) |
| `persistence.ts` | Borrador en `localStorage` por `orderId`, TTL 24 h. Nunca revienta |
| `analytics.ts` | `trackEvent()` con interfaz lista para enchufar Pixel/GA4 |
| `services/` | `DistrictCoverageService` (decide la venta), `CoverageService` (polígonos, post-venta), `AgencyService`, `PaymentVerificationService` |

- **3 pasos:** pack → datos+entrega → resumen+pago. El adelanto de provincia es
  **S/10** (`ADVANCE_PROVINCIA_PEN`); Lima va 100 % contraentrega.
- **Idempotencia:** cada checkout nace con un `orderId` uuid. `register-buyer` debe
  aceptarlo para que un doble tap no genere dos pedidos (pendiente, Fase 3).
- **No hay mapa en el checkout.** La cobertura se decide por **distrito** (178 cubiertos,
  483 seleccionables, 9,6 KB gzip). Coincide con los polígonos en el 94,9 % de los casos,
  y el mapa costaba un paso a todos para ganar precisión en el 5 %. Ver
  [`02-LOGISTICS §4`](./02-SMART-LOGISTICS.md). La coordenada se captura después de la
  venta, en el chat del pedido.
- **La rama de agencia siempre está abierta**: distrito sin cobertura, zona de visita
  semanal o simple preferencia del comprador — el pedido se cierra igual.
- 64 tests contra la data real del courier y de Shalom: `npm test`.

**UI ✅ construida** (Fase 2) en `src/components/checkout/`:

| Archivo | Rol |
|---|---|
| `CheckoutModal.tsx` | Shell: progreso, trap de foco, Esc con confirmación, CTA sticky en el safe area |
| `steps/Step1Pack.tsx` | Packs con precio por unidad y ahorro explícito |
| `steps/Step2Delivery.tsx` | WhatsApp → nombre → Lima/Provincia → DNI (orden de compromiso creciente) |
| `branches/LimaBranch.tsx` | Distrito + dirección + referencia. COD, sin adelanto |
| `branches/ProvinciaBranch.tsx` | Distrito → veredicto → domicilio o agencia |
| `branches/AgencyPicker.tsx` | Shalom (3 sedes más cercanas) · Olva (texto libre) |
| `fields/` | `Field`, `PhoneField`, `SearchSelect` (483 distritos, navegable con teclado) |
| `useCheckout.ts` | Cose reducer + persistencia + validación al blur + instrumentación |

- **Revisión sin Supabase:** `/checkout-demo` monta el modal con packs de ejemplo y data
  real de cobertura. Solo se registra en desarrollo (ver `App.tsx`).
- Verificado en navegador real a **360 px y 1440 px**: sin scroll horizontal, Lima cierra
  en ~2 s, el borrador sobrevive a la recarga y Esc con data pide confirmación.

- **Pendiente 🔮:** Fase 3 (pago, comprobante, submit, verificación), Fase 4
  (instrumentación completa y pulido). El paso 3 hoy es un placeholder y la landing
  sigue usando `CheckoutQuiz`: se cambia cuando el flujo pueda cerrar un pedido.

#### Ajustes pedidos tras revisar Fase 2 (jul-2026) 🔮

**a) El DNI sale de Lima.** Lima cierra con teléfono + nombre y nada más: es el segmento
de mayor volumen y el DNI es el campo que más abandono genera. En provincia se queda,
porque ahí hay dinero adelantado y porque la agencia lo exige para entregar. El contrato
de identidad y sus riesgos están en
[00-CORE · Identidad del comprador](./00-CORE-ARCHITECTURE.md).

**b) Nombre y DNI dejan de competir.** Hoy se piden los dos porque el nombre del DNI
(titular, vía Decolecta) y "quién recibe" no son siempre la misma persona — en COD recibe
la mamá, el vecino, el portero. Pero el orden actual (nombre → DNI) hace que el
autocompletado casi nunca se aproveche. Al quedar el DNI solo en provincia, ahí conviene
**invertirlo**: DNI primero → Decolecta rellena el nombre → un enlace pequeño
*"¿Lo recibe otra persona?"* cubre la minoría. Un campo menos de tipeo en el flujo que ya
es el más largo.

**c) Copy del DNI.** El actual —*"Para crear tu cuenta y que puedas seguir tu pedido"*—
plantea un beneficio nuestro como si fuera suyo. En provincia hay uno mucho más fuerte y
verificable por el comprador: **la agencia se lo va a pedir para entregarle el paquete**.
Un hecho de su mundo, no un trámite del nuestro. Confirmar con operaciones antes de
escribirlo (ver la advertencia en 00-CORE).

**d) Descuento de retención al intentar salir 🔮.** Al cerrar el modal con datos
ingresados, ofrecer S/5 de descuento sobre cada pack antes de dejarlo ir. Dos cosas que
hay que resolver **antes** de construirlo, no después:

- **En móvil no existe `mouseleave`,** que es el disparador clásico de exit-intent. Y el
  tráfico de anuncios de Meta es casi todo móvil. Si se implementa solo con `mouseleave`,
  la función no se dispara para la mayoría del tráfico. En móvil el disparador viable es
  el **botón atrás** (interceptando el historial) o el toque en la X, que ya existe.
- **Cuesta margen y enseña a abandonar.** S/5 sobre una ganancia típica de S/49–78 por
  pedido es 7–10 % del margen, en cada pedido donde dispare — incluidos los de quien
  habría comprado igual. Propuesta: una sola vez por comprador, y medirlo contra un grupo
  de control antes de dejarlo permanente. El monto va a `checkout.config.ts`, no al JSX.
- ⚠️ `src/lib/checkout-flow.ts` y el cuerpo de `CheckoutQuiz.tsx` quedan **en pie hasta
  que Fase 3 esté verde**, para no romper la landing. Se borran al cerrar el refactor.
  `useVoiceCloser.ts` todavía lee el estado viejo: se adapta al cerrar Fase 3.

### 2. Checkout CRO ultra-rápido ✅
- **Validación DNI con Decolecta (RENIEC)** → autocompleta el nombre y reduce campos:
  `supabase/functions/dni-lookup/index.ts` (secret `DECOLECTA_TOKEN`).
- Registro del comprador y creación del pedido: `register-buyer` (upsert por
  `document_number` o teléfono; asignación round-robin a un vendedor de **Ventas**;
  continuidad si ya tenía pedido activo con un vendedor).
- Landing de producto: `src/pages/LandingProductoPage.tsx`. Chat del pedido:
  `OrderChatPage.tsx` (Realtime).
- Escribe `customer.*` y `sale.productId` del estado central. ✅

### 3. Pagos locales sin fricción 🟡 / 🔮
- **Hoy ✅:** **Contraentrega (COD)** es el flujo real de cobro.
- **Hoy 🟡:** Yape/Plin aparecen como **etiquetas** en catálogos/seed (`src/data/seed.ts`),
  no como cobro integrado.
- **Falta 🔮:** integración transaccional de **Yape/Plin** (link/QR, confirmación de pago)
  y tarjeta. Al integrarse, setear `sale.paymentMethod` correctamente.

## Métricas del módulo
- Tiempo landing→pedido, % de campos autocompletados por DNI, tasa de cierre por canal
  (`closedBy`), pedidos por vendedor (carga round-robin).

## Estándares
- El closer y el checkout deben **siempre** poblar `customer` y `sale` del
  `MerchantCustomerSession` (ver [00-CORE](./00-CORE-ARCHITECTURE.md)) para que Logística
  y Loyalty no re-pregunten datos.
- DNI: normalizar a 8 dígitos; nunca hardcodear `DECOLECTA_TOKEN`.

## Estado de la base de datos (costuras Sales en `order_sessions`)
`payment_method` (def `CONTRAENTREGA`) · `dispatch_type` (def `MOTORIZADO_LIMA`) ·
`agency_name` · `delivery_reference` · `closed_by` (def `DIRECT_CHECKOUT`). Todas
aditivas/nullable. `register-buyer` ya persiste `payment_method` + `closed_by`.

## Endpoints / archivos de este módulo
- `supabase/functions/dni-lookup` — DNI → nombre (Decolecta/RENIEC). Secret `DECOLECTA_TOKEN`.
- `supabase/functions/register-buyer` — crea el pedido; acepta `payment_method`, `closed_by`.
- `supabase/functions/elevenlabs-signed-url` — signed URL del agente. Secrets
  `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`.
- `src/lib/checkout-flow.ts` — state machine del quiz de checkout.
- `src/lib/useVoiceCloser.ts` — hook del Voice Closer (dormido sin agente).
- `src/lib/session.ts` — contrato `MerchantCustomerSession` (ver 00-CORE).

## Secrets / env pendientes de configurar
Backend: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`. Frontend: `VITE_ELEVENLABS_AGENT_ID`
(sin esto el Voice Closer queda dormido, que es el estado esperado hasta crear el agente).

## Pendientes priorizados (dónde retomar)
0. 🔮 **Ajustes de Fase 2** (ver §1.b): sacar el DNI de Lima, invertir DNI↔nombre en
   provincia, copy del DNI y descuento de retención al salir. Antes de construir el
   descuento hay que decidir su disparador en móvil y su tope.
1. 🔮 **Fase 3 del checkout:** paso 3, bucket `vouchers`, submit idempotente por `orderId`,
   suscripción al veredicto del adelanto, pantalla de confirmación.
2. 🟡 **Lead parcial (`DRAFT`)**: `save-checkout-draft` + tabla `checkout_drafts` ya
   existen y el checkout los llama. Falta **desplegar la función** y correr el SQL, y
   construir la vista de recuperación de abandonos para Ventas.
3. 🔮 **Verificación del yape**: servicio externo ya contratado, integración pendiente.
   La costura está en `services/PaymentVerificationService.ts` — el mock deja todo en
   `PENDING` a propósito: hasta que exista el real, todo adelanto va a revisión humana,
   que es lo que pasa hoy en producción.
4. 🔮 `createElevenLabsTransport()` (implementar `VoiceTransport` con `@elevenlabs/react`)
   + crear el agente en ElevenLabs → activar la voz.
5. 🔮 Cobro Yape/Plin integrado (QR dinámico / confirmación de operación).
