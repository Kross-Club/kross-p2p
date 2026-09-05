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
| `persistence.ts` | Borrador en `localStorage` por `orderId`, TTL 24 h. Nunca revienta y **migra los borradores de versiones anteriores** |
| `analytics.ts` | `trackEvent()` con interfaz lista para enchufar Pixel/GA4 |
| `services/` | `DistrictCoverageService` (decide la venta), `CoverageService` (polígonos, post-venta), `AgencyService`, `PaymentVerificationService` |

- **3 pasos:** pack → datos+entrega → resumen+pago. Adelanto vigente: **la mitad del
  pedido (mínimo) o el total**, a elección del comprador en el paso 3. Única fuente:
  `advanceFor(price, choice)` en `checkout.config.ts`, con su espejo server-side
  `_shared/advance.ts`. Ya **no** hay tabla por destino ni por courier.
- **Idempotencia:** cada checkout nace con un `orderId` uuid. `register-buyer` debe
  aceptarlo para que un doble tap no genere dos pedidos (pendiente, Fase 3).
- **No hay mapa en el checkout.** La cobertura se decide por **distrito** (178 cubiertos,
  483 seleccionables, 9,6 KB gzip). Coincide con los polígonos en el 94,9 % de los casos,
  y el mapa costaba un paso a todos para ganar precisión en el 5 %. Ver
  [`02-LOGISTICS §4`](./02-SMART-LOGISTICS.md). La coordenada se captura después de la
  venta, en el chat del pedido.
- **La rama de agencia siempre está abierta**: distrito sin cobertura, zona de visita
  semanal o simple preferencia del comprador — el pedido se cierra igual.
- 83 tests contra la data real del courier y de las dos agencias: `npm test`.

**UI ✅ construida** (Fase 2) en `src/components/checkout/`:

| Archivo | Rol |
|---|---|
| `CheckoutModal.tsx` | Shell: progreso, trap de foco, Esc con confirmación, CTA sticky en el safe area |
| `ExitOffer.tsx` | Diálogo centrado de retención al intentar salir (oferta o confirmación seca) |
| `steps/Step1Pack.tsx` | Packs con precio por unidad, ahorro explícito y badge `×N` de cantidad |
| `steps/Step2Delivery.tsx` | WhatsApp → DNI → nombre → **distrito** (orden de compromiso creciente). El selector de distrito es UNO solo, con los 483 del país |
| `steps/Step3Confirm.tsx` | Resumen del pedido + cuánto adelanta. No pide nada más |
| `steps/OrderDone.tsx` | Pedido confirmado. Llegar aquí ES el KPI del refactor |
| `payment/Pay360Box.tsx` | Botón que abre Yape con el monto ya fijado + código copiable (desktop) |
| `services/OrderService.ts` | `submitOrder` (idempotente) + consulta del estado del cobro |
| `branches/LimaBranch.tsx` | Dirección + referencia. El distrito ya viene del paso 2 |
| `branches/ProvinciaBranch.tsx` | Veredicto de cobertura (efecto sobre el distrito) → domicilio o agencia |
| `branches/AgencyPicker.tsx` | Shalom y Olva: 3 sedes más cercanas con distancia real |
| `fields/` | `Field`, `PhoneField`, `SearchSelect` (483 distritos, navegable con teclado) |
| `useCheckout.ts` | Cose reducer + persistencia + validación al blur + instrumentación |

- **Revisión sin Supabase:** `/checkout-demo` monta el modal con packs de ejemplo y data
  real de cobertura. Solo se registra en desarrollo (ver `App.tsx`).
- Verificado en navegador real a **360 px y 1440 px**: sin scroll horizontal, Lima cierra
  en ~2 s, el borrador sobrevive a la recarga y Esc con data pide confirmación.

- **Fase 3 ✅:** el paso 3 cierra pedidos de verdad (resumen, adelanto por Yape, submit
  idempotente, pantalla de confirmación). La landing lo sirve tras `?checkout=v2`.
- **Pendiente 🔮:** Fase 4 (instrumentación completa y pulido) y **medir v2 contra el
  checkout actual** antes de cambiar el que hoy vende — cambiarlo sin datos sería apostar.
- ⚠️ `src/lib/checkout-flow.ts` y el cuerpo de `CheckoutQuiz.tsx` quedan **en pie hasta
  que Fase 3 esté verde**, para no romper la landing. Se borran al cerrar el refactor.
  `useVoiceCloser.ts` todavía lee el estado viejo: se adapta al cerrar Fase 3.

#### Ajustes tras revisar Fase 2 (jul-2026) ✅

Confirmado con operaciones: **Shalom y Olva sí exigen DNI del destinatario** para
entregar el paquete. Eso valida la asimetría y el copy.

**a) El DNI sale de Lima ✅.** Lima cierra con teléfono + nombre y nada más: es el segmento
de mayor volumen y el DNI es el campo que más abandono genera. En provincia se queda,
porque ahí hay dinero adelantado y porque la agencia lo exige para entregar. El contrato
de identidad y sus riesgos están en
[00-CORE · Identidad del comprador](./00-CORE-ARCHITECTURE.md).

**b) Nombre y DNI dejan de competir ✅.** Se piden los dos porque el nombre del DNI
(titular, vía Decolecta) y "quién recibe" no son siempre la misma persona — en COD recibe
la mamá, el vecino, el portero. Pero el orden actual (nombre → DNI) hace que el
autocompletado casi nunca se aprovechara. Al quedar el DNI solo en provincia, ahí se
**invirtió**: DNI primero → Decolecta rellena el nombre → el microcopy
*"¿Lo recibe otra persona?"* cubre la minoría. Un campo menos de tipeo en el flujo más
largo. Orden final: **WhatsApp → DNI → nombre → distrito**.

#### La región se deriva del distrito ✅ (se eliminó el toggle Lima/Provincia)

El paso 2 preguntaba «¿Dónde lo recibes? Lima y Callao / Provincia» antes del DNI. Ya no:
`isLimaMetro()` deduce la región del distrito elegido, así que el toggle pedía un dato que
el sistema ya tenía y cobraba un tap para llegar al mismo sitio.

- `locationType` sigue en el estado —el pedido, las métricas y `advanceFor()` lo leen—
  pero pasó a ser **derivado**, como `advanceAmount` y `deliveryMethod`. La UI no lo setea.
- **Un solo selector de distrito**, con los 483 del país, montado en `Step2Delivery`. Antes
  había uno por rama, cada uno con su filtro: entre los dos se habían perdido los 128
  distritos del departamento de Lima que no son Lima metropolitana. Con una sola lista ese
  agujero no puede volver.
- `SET_DISTRICT` reemplaza a `SET_LOCATION_TYPE` + `SET_LIMA_DISTRICT` +
  `SET_PROVINCIA_DISTRICT`. Cambiar de región descarta lo capturado de la otra; cambiar de
  distrito dentro de Lima descarta el pin, que apuntaba a la zona vieja.
- `LimaAddress` guarda ahora `department` y `province`: sin la llave completa el selector
  no puede reconocer lo ya elegido, y hay homónimos (5 Miraflores, 12 Acobamba).
- El veredicto de cobertura pasó de un handler a un **efecto sobre el distrito** en
  `ProvinciaBranch`, así se recalcula también cuando el comprador vuelve atrás y lo cambia.
- ⚠️ `DistrictCoverageService.districtsFor()` ya no alimenta la UI. Se mantiene porque los
  tests la usan para verificar que las dos ramas siguen siendo complementarias.

#### Recoger en agencia también en Lima ✅

Shalom tiene **163 sedes en el departamento de Lima** y Olva 128, así que el mostrador es
una opción real ahí, no un parche de provincia. `LimaBranch` ofrece las dos tarjetas —«En
mi casa» y «Recojo en agencia»— y monta el mismo `AgencyPicker`.

- A diferencia de provincia, en Lima **no hay veredicto de cobertura que esperar**: el
  motorizado propio llega a todo Lima metropolitana, así que las dos opciones se muestran
  siempre y la elección es del comprador.
- **El método y el punto subieron a la raíz del estado** (`deliveryMethod` y `pickup`).
  Vivían dentro de `provinciaConfig`, y dejarlos ahí obligaba a que un pedido limeño
  arrastrara una config de provincia. `persistence.ts` migra los borradores guardados.
- ⚠️ **El adelanto ya no depende del destino.** `ADVANCE_LIMA_PEN`,
  `ADVANCE_LIMA_AGENCIA_PEN`, `ADVANCE_PROVINCIA_PEN`, `ADVANCE_PROVINCIA_DOMICILIO_PEN`,
  `ADVANCE_BY_AGENCY` y `ADVANCE_AGENCY_FROM_PEN` **se borraron**. Sale del precio del
  pack — ver el bloque «El adelanto es la mitad del pedido, o el total».
- ⚠️ **`dispatch_type` pasó de tres valores a cuatro** (región × método) y esto NO es solo
  frontend: `register-buyer` tiene lista blanca y **aplasta contra `MOTORIZADO_LIMA` todo
  lo que no reconoce**. Sin `AGENCIA_LIMA` ahí, un recojo en Lima se guardaba como entrega
  a domicilio y el motorizado salía a una casa por un paquete que estaba en el mostrador.
- Por lo mismo se agregó `isPickupDispatch()` en `src/lib/session.ts`: comparar contra
  `=== 'AGENCIA_PROVINCIA'` estaba regado por el código —`AddressBar` entre otros— y con
  el valor nuevo le pedía el pin de su casa a quien va a pasar por el mostrador.

**Deploy:** este cambio requiere redesplegar la función.
```
supabase functions deploy register-buyer --project-ref ofdjghntvmrdfjhazfvz
```

#### Entrega a domicilio prendida o apagada POR MARCA ✅

`stores.home_delivery_enabled` decide si la marca ofrece entrega a la puerta. **El recojo
en agencia nunca se apaga** — es la salida que siempre está abierta—, así que el switch
solo gobierna la otra rama: el motorizado en Lima y el courier a domicilio en provincia,
que son las que dependen de tener operación de última milla contratada.

- **Se prende desde el panel**, en *Marcas → editar* (`MarcaPage`), y es **solo super
  admin**: depende de un hecho comercial que conoce la plataforma. Que un admin de marca
  lo prendiera sin tener con quién repartir prometería entregas que después no ocurren.
- **El flag viaja en `CheckoutState`**, no solo en la UI, porque el reducer AUTO-DECIDE el
  método desde la cobertura. Sin él, una marca sin última milla cerraba pedidos con
  `deliveryMethod: 'DOMICILIO'` en cuanto el distrito tenía cobertura del courier.
- `derive()` normaliza el método en CADA acción. Es lo que tapa la puerta de atrás:
  `RESTORE` metía un borrador guardado cuando la marca sí repartía y el pedido salía
  prometiendo domicilio después de que el admin lo apagara. Lo encontró un test.
- Como `variant`, se re-resuelve desde la tienda en cada montaje y **no se restaura del
  borrador**.
- ⚠️ **Default de la columna: `true`.** Es a propósito — al correr el script, las marcas
  que HOY reparten a domicilio no pueden quedarse sin esa opción. Las marcas nuevas nacen
  en `false` porque `manage-store` (acción `create`) lo escribe explícito. Un default
  `false` habría apagado el domicilio de todas, y backfillear con un `UPDATE` rompería la
  idempotencia del script: al re-correrlo volvería a prender lo que el admin apagó a mano.
- `/checkout-demo` tiene el mismo switch, para revisar los dos modos sin tocar Supabase.

**Deploy:**
```
supabase functions deploy manage-store --project-ref ofdjghntvmrdfjhazfvz
```
> Correr también `supabase/setup-kross.sql` (agrega `stores.home_delivery_enabled`).

**c) Copy del DNI ✅.** El anterior —*"Para crear tu cuenta y que puedas seguir tu
pedido"*— planteaba un beneficio nuestro como si fuera suyo. Ahora dice **"La agencia te
lo pedirá para entregarte el paquete"**: un hecho de su mundo, verificable, no un trámite
del nuestro.

**e) El adelanto dependía de la AGENCIA ⛔ derogado (ago-2026).** Shalom pedía S/20 y Olva
S/25, y el monto salía en la tarjeta de cada sede. Se eliminó por una razón que trajo la
lista unificada de puntos (`02-SMART-LOGISTICS.md`): **dos sedes contiguas de couriers
distintos cobraban adelantos distintos por el mismo viaje**, y el número saltaba al
cambiar de tarjeta. Hoy el adelanto sale del precio del pack, es el mismo elija el punto
que elija, y **la tarjeta de la sede ya no muestra monto**.

**d) Descuento de retención al intentar salir ✅.** Al cerrar el modal con datos
ingresados se ofrecen **S/5 de descuento sobre cada pack** antes de dejarlo ir.

- **Disparador:** el toque en la X (o Esc en desktop). Se descartó `mouseleave`, el
  exit-intent clásico: no existe en móvil, y el tráfico de anuncios de Meta es casi todo
  móvil — habría disparado solo para una minoría.
- **Una sola vez por checkout.** `exitOfferShown` vive en el estado y se persiste, así que
  la regla sobrevive a una recarga. Insistir cada vez le enseña al comprador que salir es
  la forma de conseguir descuento. El segundo intento de salida muestra la confirmación
  seca, sin oferta.
- **Es un diálogo propio y centrado** (`ExitOffer.tsx`, `role="alertdialog"`), no una nota
  en el pie del modal. En el pie competía con el CTA y se leía como letra chica; al centro
  no hay nada más que decidir en ese instante. El monto va como héroe tipográfico y sale
  de `EXIT_DISCOUNT_PEN` — **el copy no lo escribe**, así que cambiar el descuento no deja
  textos mintiendo un monto viejo.
- **Esc y el clic en el fondo significan "quedarme"**, no "salir". Salir es un botón
  explícito. Perder una venta por una tecla repetida sería el peor intercambio posible.
  El diálogo trapea su propio Tab: si no, el trap del modal de abajo movía el foco a
  controles que el comprador no ve.
- **El ahorro por volumen se calcula sobre el precio de lista**, no sobre el descontado.
  Si no, el pack de 1 unidad —que no ahorra nada— mostraría "Ahorras S/5" y diluiría el
  anclaje hacia el de 2. El descuento se comunica aparte: precio tachado + banner verde.
- ⚠️ **Cuesta margen y puede enseñar a abandonar.** S/5 sobre una ganancia típica de
  S/49–78 por pedido es 7–10 %, y se paga también en los pedidos de quien iba a comprar
  igual. Los eventos `exit_offer_shown` y `exit_discount_applied` están instrumentados:
  **medirlo contra un grupo de control antes de darlo por bueno.** El monto se cambia en
  una línea de `checkout.config.ts`.

**f) Los borradores de versiones anteriores se migran, no se descartan ✅.** Al agregar
`discountPen` al estado, los borradores ya guardados volvían sin ese campo y el paso 1
hacía `precio - undefined`: **todos los packs mostraban `S/NaN`**. Un comprador que ve NaN
donde va el precio no compra, y el bug solo aparecía en quienes ya habían empezado un
checkout antes — o sea, en los más cerca de convertir.

- `persistence.ts` completa el borrador leído con los defaults de hoy
  (`initialCheckoutState()`), en vez de tirarlo: el borrador es el avance del comprador.
  Los objetos anidados (`customerInfo`, `payment`) se completan aparte, porque el spread
  los reemplaza enteros.
- Los números que entran a aritmética se validan **por valor, no por ausencia**: basta un
  `null` guardado para propagar NaN a toda la pantalla.
- `effectivePrice()` ignora cualquier entrada no finita. Es la única función que calcula
  el precio mostrado, así que ahí el `S/NaN` queda imposible venga de donde venga. En el
  peor caso se pierde el descuento —S/5—, nunca el precio.
- Dos tests de regresión en `checkout.test.ts`.

**g) Los packs siguen en filas horizontales, no en tarjetas verticales.** Se evaluó el
patrón tipo app de comida rápida (tarjeta vertical con foto grande) y **no aplica aquí**:

- En ese patrón cada ítem es un producto DISTINTO y la foto es lo que lo identifica. Aquí
  los tres packs son **el mismo producto en distinta cantidad**: la foto sería idéntica en
  las tres tarjetas, no distingue nada y empuja el precio fuera de la vista.
- A 360 px, tres tarjetas verticales son ~2 pantallas de scroll. Comparar precio por
  unidad y ahorro lado a lado —lo que mueve el ticket promedio— deja de ser posible de un
  vistazo, y el CTA se va abajo del fold. Contra la regla de decisión (gana lo que quita
  fricción), la fila gana.
- Lo que sí faltaba era una señal visual de cantidad: la fila ahora lleva un badge **`×N`**
  sobre la miniatura, venga o no venga foto.

**h) Foto por pack ✅ (opcional, la carga la marca).** `products.packs[].image` se sube
desde **Productos → editar → "+ Foto del pack"** (`ProductosPage.tsx`, bucket `products`).
`packs` es `jsonb`: no hubo migración.

- **La foto vende solo si muestra la CANTIDAD** — 1 frasco, 2 frascos, 3 frascos, mismo
  fondo. Convierte "llevas más" en algo que se ve antes de leer el precio. Si se sube la
  misma foto en los tres packs, es peor que no subir ninguna: no distingue nada y pesa en
  4G. El aviso está escrito en el propio editor, donde se toma la decisión.
- Sin foto propia, el fallback sigue siendo `images[0]` (la primera imagen de la landing).
- **Se reduce en el navegador antes de subirla** (`src/lib/images/downscale.ts`, preset
  `packThumb`: 400 px, calidad 0,82). Se muestra a 56 px y el comprador la carga en 4G;
  subir 4 MB para eso son segundos de espera en el paso donde se decide la venta. Si el
  navegador no puede procesarla, se sube tal cual: perder compresión es barato, perder la
  subida no. El mismo helper sirve para el comprobante de Yape en Fase 3.
- `/checkout-demo` trae tres SVG inline de 1, 2 y 3 frascos para poder revisar el patrón
  sin cargar nada.

### 2. Checkout CRO ultra-rápido ✅
- **Validación DNI con Decolecta (RENIEC)** → autocompleta el nombre y reduce campos:
  `supabase/functions/dni-lookup/index.ts` (secret `DECOLECTA_TOKEN`).
- Registro del comprador y creación del pedido: `register-buyer` (upsert por
  `document_number` o teléfono; asignación round-robin a un vendedor de **Ventas**;
  continuidad si ya tenía pedido activo con un vendedor).
- Landing de producto: `src/pages/LandingProductoPage.tsx`. Chat del pedido:
  `OrderChatPage.tsx` (Realtime).
- Escribe `customer.*` y `sale.productId` del estado central. ✅

### 3. Pagos locales sin fricción 🟡

- **Hoy ✅:** **Contraentrega (COD)** es el flujo real de cobro en Lima.
- **Hoy ✅ (backend, Fase 3):** verificación del **adelanto por Yape** en provincia —
  ingesta, cruce y estado del pedido. Ver §3.1.
- **Falta 🔮:** UI del paso 3 (caja Yape, subida del comprobante, pantalla de confirmación)
  y tarjeta.

#### 3.1 El flujo manual de Yape — eliminado (21-ago-2026)

Durante meses el adelanto se cobró así: la caja del paso 3 mostraba el número de
Yape de la marca, el comprador yapeaba desde su app, copiaba el **código de
seguridad de 3 dígitos** de su comprobante, lo tecleaba, y opcionalmente subía la
captura. En paralelo, un celular con el Yape de la marca mandaba cada
notificación a `yape-ingest`, y el backend cruzaba pago con pedido por monto +
código + nombre.

**Se eliminó entero.** Lo que se fue: `YapeBox`, `YapeCodeHint`, `VoucherField`,
`yape-ingest`, `voucher-url`, el matcher, el bucket `vouchers`, las columnas de
`stores` (`yape_number`, `yape_holder`, `yape_qr_url`, `yape_autoconfirm`) y las
de `order_sessions` (`advance_yape_code`, `advance_voucher_url`).

Las tres razones, en orden de peso:

1. **Le pedía al comprador la PRUEBA de un pago, no el pago.** Era el único
   punto del checkout donde tenía que aprender algo nuevo —buscar tres dígitos
   en una pantalla que quizá ya cerró— y se resolvió con un dibujo porque el
   texto no alcanzaba. 360pay le da un botón que cobra: no hay nada que
   aprender.
2. **El cruce era heurístico y podía equivocarse con dinero.** Monto + código +
   nombre, contra una piscina de pagos sin consumir. El cruce de 360pay es
   determinístico por `external_ref`.
3. **Dependía de un celular vivo.** Si el lector se caía, los pagos entraban y
   nadie se enteraba; y ninguna marca llegó a tenerlo configurado —al eliminarlo,
   `yape_number` estaba en NULL en las cuatro tiendas—.

**Qué pasa hoy en una marca sin 360pay conectado:** el paso 3 no pide nada, dice
que un asesor coordina el adelanto por el chat, y el pedido se cierra igual. El
adelanto queda `PENDING` y el panel de Ventas lo muestra sin cobrar.

Lo que **sí** sobrevivió porque no era del flujo manual: `payment_events` (con
sus columnas históricas), `payment_verification`, `payment_reason`, y la etapa
`validando`.

#### 3.2 Qué se le exige al comprador en el paso 3 — y qué no

**Nada.** Es la regla, no una casualidad de la implementación: `validateStep3`
devuelve `{}` siempre. Con 360pay el botón que cobra aparece DESPUÉS de terminar
el pedido; sin 360pay no hay nada que cobrar en esa pantalla.

Antes exigía el código de 3 dígitos, y eso tenía un costo medible: el CTA se
quedaba gris con "completa los datos marcados" para quien ya había llenado todo
lo demás.

#### 3.3 Cobro en línea con 360pay ✅ (por tienda · **primer pago real cobrado**)

La alternativa determinista al cruce por notificación, y la que hoy cobra de verdad.
**Kross Club es partner de 360pay** y cada marca es un *business* creado bajo esa cuenta,
así que ninguna marca pega llaves suyas ni nosotros tocamos credenciales de pago — no hay
acreditación PCI de por medio.

El detalle completo —las tres APIs, el modelo del cupón, el deep link, la firma del
webhook y las cinco defensas del handler— vive en [`06-360PAY.md`](./06-360PAY.md), y el
contrato de recaudación (quién es quién, flujo del dinero, tarifario) en
[`07-CONTRATO-360PAY.md`](./07-CONTRATO-360PAY.md). Lo que hace falta saber desde Sales:

```
  paso 3 ──registro──▶ register-buyer (payment_provider='360PAY', idempotente)
     │
     └──emisión──────▶ pay360-coupon ──▶ cliente + CUPÓN por el adelanto
                             │
                             └──▶ deep link de Yape (monto fijado por el cupón)
                                        │
   comprador paga en Yape ──────────────┘
                                        │
                             pay360-webhook (firma HMAC + dedupe + re-consulta)
                                        │
                             └──▶ payment_events + order_sessions MATCHED
```

**El paso 3 no pide nada.** Con 360pay activo, la pantalla solo anuncia el monto: el botón
que abre Yape aparece DESPUÉS de terminar el pedido. Pedirle ahí el código de 3 dígitos
sería pedirle la prueba de un pago que todavía no hizo.

**Lo que no se negocia:**

- **El monto jamás viene del navegador.** Se re-deriva en el servidor (`_shared/advance.ts`,
  espejo de `advanceFor` con test de paridad) y se contrasta contra la fila antes de emitir.
- **El monto tampoco viaja en el enlace.** Lo resuelve Yape leyendo el cupón, del lado del
  servidor. Es la propiedad de seguridad que sostiene todo el flujo: nadie paga S/1 un
  adelanto de S/25 editando la URL.
- **Un pedido de 360pay no cruza con yapes manuales** (`payment_provider` separa las dos
  piscinas): sin eso, un yape ajeno del mismo monto lo daría por pagado.
- **Antes de emitir se anulan los cupones pendientes del comprador.** El código de pago
  identifica al CLIENTE y el banco cobra SIEMPRE el más antiguo, así que un cupón viejo
  vivo secuestra el pago del siguiente pedido. En una marca de recompra eso es rutina.
- **La confirmación es asíncrona y es el camino normal**, no el excepcional: la fase
  `AWAITING` existe justo para no confundir "todavía no paga" con "el dinero pudo salir".
- **Las tiendas sin 360pay no notan nada**: `pay360_enabled=false` → paso 3 manual bit a
  bit, §3.1 y §3.2 intactos.

**Medido en el primer pago real** (21-ago-2026): del `paid_at` en 360pay al pedido cruzado
pasaron **6.6 segundos**, con el webhook llegando a los 4.7.

> **Aquí vivió el cobro con Culqi**, que nunca llegó a cobrar un sol: la API directa exigía
> acreditación PCI DSS / SAQ-D y quedó esperando al buzón de riesgos. Se eliminó entero
> —código, columnas, llaves y su documento de acreditación— cuando 360pay entró en
> producción: dos motores de cobro encendidos a la vez confundían la configuración de cada
> marca sin que el segundo aportara nada.

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

Fase 3 (bloque 13 de `setup-kross.sql`): `checkout_id` (único, idempotencia) ·
`advance_amount` · `advance_choice` · `payment_verification` · `payment_matched_at` ·
`payment_reason` · `payment_event_id`, y la tabla `payment_events`. El cobro en línea
agrega `payment_provider` y `origin_store_id` (§16) y los campos de 360pay en `stores`
(§20). Los secretos van aparte, en `store_secrets`, sin políticas.

## Endpoints / archivos de este módulo
- `supabase/functions/dni-lookup` — DNI → nombre (Decolecta/RENIEC). Secret `DECOLECTA_TOKEN`.
- `supabase/functions/register-buyer` — crea el pedido (idempotente por `checkout_id`);
  acepta `payment_method`, `closed_by` y el adelanto; cruza pagos ya recibidos.
- `supabase/functions/_shared/yape.ts` — parser de la notificación (con tests).
- `supabase/functions/_shared/yape-match.ts` — regla de cruce pago ↔ pedido (con tests).
- `supabase/functions/elevenlabs-signed-url` — signed URL del agente. Secrets
  `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`.
- `src/lib/checkout-flow.ts` — state machine del quiz de checkout.
- `src/lib/useVoiceCloser.ts` — hook del Voice Closer (dormido sin agente).
- `src/lib/session.ts` — contrato `MerchantCustomerSession` (ver 00-CORE).
- `src/lib/checkout/ticket.ts` — el ticket de la pantalla final (qué pagó, dónde recoge,
  qué llevar, qué sigue), puro y con tests. `OrderDone.tsx` solo lo pinta.

## Secrets / env pendientes de configurar
Backend: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`. Frontend: `VITE_ELEVENLABS_AGENT_ID`
(sin esto el Voice Closer queda dormido, que es el estado esperado hasta crear el agente).

## Pendientes priorizados (dónde retomar)
0. 🔮 **Ajustes de Fase 2** (ver §1.b): sacar el DNI de Lima, invertir DNI↔nombre en
   provincia, copy del DNI y descuento de retención al salir. Antes de construir el
   descuento hay que decidir su disparador en móvil y su tope.
2. 🟡 **Lead parcial (`DRAFT`)**: `save-checkout-draft` + tabla `checkout_drafts` ya
   existen y el checkout los llama. Falta **desplegar la función** y correr el SQL, y
   construir la vista de recuperación de abandonos para Ventas.
3. 🟡 **Conectar 360pay en Gadicaf**: es la única marca activa sin cobro en línea, así
   que su adelanto lo coordina un asesor por el chat. El alta es de un clic desde el
   panel → Cobros.
4. 🔮 `createElevenLabsTransport()` (implementar `VoiceTransport` con `@elevenlabs/react`)
   + crear el agente en ElevenLabs → activar la voz.
5. ✅ **Cobro Yape integrado — construido con 360pay (§3.3), con pago real cobrado.**
   Cada marca se conecta desde el panel; el comprador toca un botón, Yape abre con el
   monto ya fijado por el cupón y el pedido se cruza solo en segundos.

### Pantalla final: por qué el chat va ahí

En esa pantalla la venta YA está cerrada, así que lo que se optimiza no es
conversión sino **tasa de entrega** — que en COD es donde se gana o se pierde
plata de verdad. Un pedido que no se recoge cuesta flete de ida, de vuelta y
producto inmovilizado, y la causa número uno es que **el cliente no reconoce
quién le escribe** cuando llega el mensaje de coordinación.

De ahí las tres decisiones:

1. El botón nombra el beneficio ("coordinar la entrega"), no la mecánica.
2. Debajo va el aviso de que por ahí le escribiremos: es la vacuna contra el
   "¿quién eres?" del día de la entrega.
3. Se ofrece, no se empuja. Nada de redirección automática —después de que
   entregó su plata se siente a arrebato— y "Listo" se queda para quien quiera
   cerrar.

El chat tiene que tener algo cuando llegue: el acuse `visibility: 'all'` del
cruce es el primer mensaje de la marca. Un chat vacío desperdicia el viaje y
enseña a no volver.

**No se premia entrar al chat.** Un descuento por abrirlo enseña que ahí se
regatea, y llena el canal de gente pidiendo rebaja en vez de coordinando.

**El KPI es % de pedidos entregados al primer intento**, no clics al chat. El
clic es un proxy: si sube el clic y no sube la entrega, el cambio no sirvió.

#### La pantalla final es un ticket para capturar ✅ (05-set-2026)

Lo de arriba sigue vigente. Lo que cambió es **quién sostiene al comprador que no
entra al chat**. La estrategia de canales se movió (ver `14-EVALUACION-KROSS-CLUB.md`
y la discusión que llevó a SMS como riel de avisos): el comprador que más importa
—provincia, poca costumbre digital— **no instala la app ni vuelve al chat; guarda
capturas**. Así que la pantalla de gracias deja de ser un "listo, entra al chat" y
pasa a ser **un ticket diseñado para ser capturado**, con todo lo que va a necesitar
el día que le avisen que su paquete llegó:

| Bloque | Qué dice | De dónde sale |
|---|---|---|
| Cómo se pagó | «Pago recibido por Yape: S/ 95 de S/ 189.» | `paid` del webhook; nunca «tu pago no existe» |
| Tu pedido · Lo recoges en · A nombre de | Pack, **sede con dirección** (no un id), quien recibe | `AgencyService.getBranch` en el cliente; si no cargó, cae al distrito |
| Te falta pagar | Monto y CÓMO: por la app en agencia (suelta la clave), al recibir en domicilio | `price - advanceAmount` |
| El día del recojo lleva | Tu DNI · tu clave de recojo (y cuándo llega) | Solo en agencia |
| Qué sigue | «Te avisaremos a tu celular cuando llegue a la agencia. Suele tardar 2 días.» | `provinciaConfig.eta` traducido; **sin nombrar canal** |
| Llama a | Teléfono de la marca con `tel:` | `stores.wa_display_phone`, solo si está configurado |

El contenido lo arma `src/lib/checkout/ticket.ts` (puro, con tests en
`ticket.test.ts`); `OrderDone.tsx` solo lo pinta. Reglas que salen de ahí:

- **«Qué sigue» no nombra canal.** Hoy avisa push, WhatsApp o SMS según lo que
  tenga el comprador; prometer uno es mentirle a los que no lo tienen. Cuando el
  SMS esté construido (`08-RECORDATORIOS-RECOJO.md`) la frase puede decir «por
  mensaje de texto».
- **La captura es la persistencia.** Se le dice con todas sus letras («Toma una
  captura de esta pantalla»): no es obvio para quien no vive en apps.
- **El chat sigue siendo la única acción**, por las razones de arriba. Pero ya no
  es la única forma de no perderse.
- **El teléfono es el `wa_display_phone`** porque es el único número de la marca
  en la base. Se ofrece como *llamar*, con `tel:`, no como WhatsApp: nadie lee las
  respuestas de WhatsApp (no hay webhook entrante). Si eso confunde, la salida es
  una columna `support_phone` propia, no quitar el teléfono.
- Deuda anotada: `Store` del `store-context` ahora trae `wa_display_phone`; la
  caché por slug de antes no lo tiene hasta la siguiente carga.

## El checkout multi-paso es el default

Desde este cambio, la landing abre el checkout de 3 pasos. El viejo (`CheckoutQuiz`)
queda detrás de `?checkout=v1` **solo como escotilla**: si algo sale mal en
producción se vuelve al anterior cambiando la URL, sin esperar un deploy. No es un
experimento, es el botón de emergencia.

El motivo del cambio no es que el nuevo sea más bonito: el viejo **solo pedía
datos**. No tenía forma de llevar al comprador al chat del pedido, y de ahí sale la
tasa de entrega — el número que decide si un COD gana o pierde plata. Un checkout
que cierra la venta pero deja al cliente sin saber por dónde le van a escribir
optimiza la mitad del problema.

**Queda pendiente medirlo.** El cambio se hizo por criterio de producto, no con
datos comparados: si a las semanas la conversión cae, la escotilla está ahí. Borrar
`CheckoutQuiz` recién tiene sentido cuando haya números que respalden el cambio.

## El canal es el chat, no WhatsApp

La pantalla final prometía "Te escribimos por WhatsApp". **No es así**: WhatsApp
es el *fallback* para cuando el comprador no entra al chat del pedido.
Prometerlo mandaba a esperar por donde no escribimos primero, y de paso dejaba
el chat —que es lo que sostiene la tasa de entrega— sonando a algo secundario.

## "Ver mi pedido" en la landing

Al tocar "Listo" y cerrarse la ventana de confirmación, el comprador se quedaba
en la landing **sin ninguna vía de volver a su pedido**: el token vivía solo en
memoria del modal. Feedback de compradores reales.

Ahora el token se guarda en `localStorage` (`saveLastOrder`) y la barra inferior
ofrece **"Ver mi pedido"** junto a "¡Lo quiero!", en estilo secundario: la
landing sigue siendo para vender, no para dar seguimiento. Caduca a los 3 días
—después la entrega ya ocurrió y un botón viejo solo confunde— y un storage
corrupto o el modo incógnito no rompen nada.

## Lo que el flujo manual dejó escrito aquí

Esta sección tenía cuatro ensayos largos —la fricción del código de seguridad,
por qué el código no podía volverse opcional, por qué no había botón de "Abrir
Yape", el visor de comprobantes y por qué el código mandaba sobre el monto—.
Se eliminaron con el flujo (§3.1): documentaban decisiones sobre pantallas que
ya no existen, y un doc que explica en detalle algo que el código no hace es
peor que uno que no lo menciona.

Dos aprendizajes de ahí sí siguen valiendo, y por eso quedan:

- **`yape://` no es un deep link que funcione.** Es un esquema custom que Chrome
  Android no abre desde un enlace normal y que en iOS cae en la pantalla de
  error de Safari. El que sí funciona es el universal link
  `https://www.yape.com.pe/app/services-pay/pickService`, que es el que usa
  360pay: Android e iOS lo resuelven, y si la app no está instalada degrada a
  una página web en vez de a un callejón sin salida. **Con un matiz aprendido
  después** (§17.d de `06-360PAY.md`): desde la PWA instalada ese enlace sale
  por una Custom Tab, cuya URL inicial Android carga como web sin resolver App
  Links — ahí el `href` se convierte a `intent://` en el cliente
  (`src/lib/checkout/yape-link.ts`), que abre la app de Yape directo.
- **Paridad móvil/desktop.** Ninguna pantalla puede decir "ábrelo en tu
  celular": el flujo entero se graba en tutoriales desde una laptop. Por eso
  `Pay360Box` muestra SIEMPRE el código copiable, no solo cuando el botón falla.

## Etapa `validando` y confirmación automática

Un pedido con adelanto quedaba en **"Pedido"** desde que el comprador pagaba
hasta que alguien lo confirmaba: **pagó y su barra no se movía**. Sin señal de
avance, su siguiente paso es escribir "¿llegó mi pago?" — justo el mensaje que
este checkout existe para evitar.

- **Con adelanto** el pedido nace en `validando`, entre `nuevo` y `confirmado`.
- **Sin adelanto** (Lima, contraentrega puro) nace **`confirmado`**: no hay nada
  que validar, y mostrarle un paso pendiente que nunca va a ocurrir se lee como
  que algo se atascó.
- **Un pago confirmado mueve a `confirmado`, sin flag de por medio.** Estuvo
  detrás de un `yape_autoconfirm` para medir primero cuánto acertaba el cruce
  manual, pero eso dejaba al comprador con el dinero cobrado y la barra quieta.
  La columna se eliminó con el flujo manual (§3.1).

**Las advertencias no frenan el avance.** Nombre distinto o código que no calza
quedan en `payment_reason` y en el mensaje interno, para que Ventas las revise
**antes de despachar** — que es el momento donde importan. Frenar la barra por
una advertencia le traslada al comprador una duda que es nuestra.

**El stepper se arma según el pedido** (`lib/order-stages.ts`, única definición
del orden: estaba copiado en seis archivos). Ventas sí ve `validando` siempre,
porque necesita distinguir un pedido que espera cruce de uno recién creado.

## Respuestas rápidas en el chat

Fichas tocables encima del campo de texto, al estilo de las plantillas de
WhatsApp. Hacen dos cosas a la vez: **bajan el costo de la primera
interacción** —escribirle de cero a un desconocido cuesta más que tocar un
botón— y **le enseñan que este chat es donde se resuelve su pedido**, que es lo
que sostiene la tasa de entrega.

**Se derivan del estado, no se guardan en la base.** Guardadas por mensaje
quedarían obsoletas: "¿Ya llegó mi pago?" seguiría ofreciéndose una semana
después de que el pago cuadró. Así la ficha siempre corresponde a lo que le pasa
al pedido ahora.

**Desaparecen en cuanto el comprador escribe.** Ya cumplieron su trabajo, y
dejarlas para siempre convierte la ayuda en estorbo sobre el teclado.

En `validando` la segunda ficha es **"Te envío mi comprobante"**: así la captura
se pide **solo a quien puede hacer falta**, en el momento en que importa, en vez
de pedírsela a todos por si acaso en el checkout.

## Adelanto en todos lados, y dos versiones que se miden ✅

### El checkout viejo se eliminó

`CheckoutQuiz` ya no existe. **No cobraba adelanto**, y ahora todo pedido lo
lleva — también en Lima. Dejarlo como escotilla de emergencia significaba que el
botón de emergencia era "cobrar S/0", que es peor que la emergencia.

### El adelanto es la mitad del pedido, o el total ✅ (vigente desde ago-2026)

```ts
export type AdvanceChoice = 'HALF' | 'FULL'
export const ADVANCE_HALF_SHARE = 0.5

export function advanceFor(price: number, choice: AdvanceChoice = 'HALF'): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  return choice === 'FULL' ? Math.round(price) : Math.round(price * ADVANCE_HALF_SHARE)
}
```

El comprador elige en el paso 3 (`AdvancePicker`) y cada tarjeta muestra **lo que
paga ahora y lo que le queda** — la duda real no es "cuánto pago" sino "cuánto me
falta después".

**Por qué reemplazó a la tabla por destino.** La comisión de 360pay es plana
(S/3.15 + IGV = **S/3.72** por transacción): sobre un adelanto de S/5 es el
**74%** del cobro, sobre S/95 el **3.9%**. Un fijo chico no paga la pasarela — es
la misma deuda ya anotada en `ESTADO-OPERATIVO.md` ("nada impide emitir un cupón
por debajo de S/5"), resuelta por el lado de la política en vez del piso.

> ⚠️ **Tensión abierta con el mercado.** Los operadores COD entrevistados cobran
> **S/20–30** de adelanto (`ICP Sales/VALIDACION-AGENCIA.md`). La mitad de un pack
> de S/189 son S/95: entre 3 y 5 veces el estándar. Puede ser el diferencial que
> produce compromiso de recojo, o un freno de conversión. **No está medido**, y es
> lo primero que hay que mirar cuando haya pedidos suficientes.

#### El cambio movió una frontera de seguridad

Con la tabla vieja el monto se derivaba del **destino**, así que era inmune a lo
que mandara el navegador. Ahora depende del **precio**, y el precio venía del
body: sin más, se podría declarar un pack de S/2 y que se cobre S/1.

La defensa se movió un paso atrás: **`priceFromPacks()`** en `_shared/advance.ts`
contrasta `product_price` contra `products.packs` **en el servidor** antes de
calcular. Si no se puede verificar (sin `product_id`, producto sin packs) **no se
bloquea la venta** —el pedido vale más que la comprobación— pero queda un
`console.warn`, y el adelanto sale del precio verificado cuando existe.

`choice` sí puede venir del cliente sin riesgo: solo elige entre mitad y total, y
ninguna de las dos baja del mínimo. Se persiste en
`order_sessions.advance_choice` (def `'HALF'`) porque el cobro en línea necesita
**re-derivar exactamente** el monto que se mostró.

#### Los montos viejos ⛔ histórico

| Destino | Antes | Después | Hoy |
|---|---|---|---|
| Lima metropolitana | S/0 | S/5 | mitad del pedido |
| Provincia · agencia Shalom | S/10 | S/20 | mitad del pedido |
| Provincia · agencia Olva | S/20 | S/25 | mitad del pedido |
| Provincia · entrega en casa | S/10 | S/30 | mitad del pedido |

Lima adelantaba S/0 y el rebote lo pagaba la marca entera: el pedido falso no
cuesta nada de hacer y sí cuesta el viaje del motorizado. S/5 no espanta a quien
va a comprar y sí a quien estaba jugando.

Entrega en casa a provincia cuesta más porque el courier cobra bastante más que
dejar el paquete en el mostrador, y ese diferencial no lo puede comer la marca en
cada pedido.

### El DNI ahora se pide siempre

Antes solo en provincia, con el argumento de que en Lima es contraentrega y
pedirlo es fricción pura. **Ese argumento se cayó cuando Lima pasó a adelantar**:
donde hay dinero por delante hace falta saber a nombre de quién, y el DNI es lo
que deja cuadrar el Yape con la persona. Además es la llave del comprador en todo
el sistema —recompra, puntos, historial— y tenerla solo para provincia partía en
dos la base de clientes.

### A y B

| | Quién elige domicilio vs. agencia |
|---|---|
| **A** | La cobertura, sola. El comprador nunca se entera de que había opción. |
| **B** | El **comprador**, después de poner su distrito, con los dos precios delante. |

En B las tarjetas aparecen **solo después del distrito**: antes no se sabe si el
courier llega ni cuánto cuesta, así que ofrecerlo sería preguntar a ciegas. Y el
precio va **dentro** de cada tarjeta — esconderlo hasta el paso del pago
convertiría la elección en una sorpresa.

El reparto es al azar y **estable por dispositivo** (`lib/checkout/variant.ts`):
sin eso el adelanto le bailaría entre S/20 y S/30 a la misma persona al recargar,
y una visita contaría en las dos ramas. `?checkout=A|B` fuerza una versión para
demostrar, sin tocar lo sorteado.

El pedido guarda `order_sessions.checkout_variant`. Sin esa columna se sabría
cuánta gente vio cada versión pero **no cuál vendió**, que es la única pregunta
que importa.

### El mando y el contador ✅

Bloque 19 del esquema. Vendedor → **Productos** trae el panel del experimento
(`src/pages/vendedor/AbTestPanel.tsx`), y cada producto ofrece sus enlaces
`?checkout=A` y `?checkout=B` para repartir tráfico de anuncios a mano.

**`stores.checkout_ab_mode`** (`SPLIT` · `A` · `B`) decide el reparto sin deploy:
`SPLIT` es el sorteo, y `A`/`B` mandan todo a esa versión cuando el experimento
terminó. Vive en `stores` porque la landing lo necesita antes de que el comprador
toque nada, y esa tabla ya tiene SELECT público.

**Forzar nunca persiste** — ni por URL ni por `checkout_ab_mode`. Si el modo
forzado se guardara en `localStorage`, al devolver el switch a 50/50 cada
dispositivo que pasó por ahí seguiría clavado en esa versión y el experimento
siguiente nacería sesgado sin que nadie lo note. Hay un test que protege la regla.

**El denominador es `checkout_drafts.checkout_variant`** (19.b): el lead parcial
ya se guarda apenas el WhatsApp es válido, así que marcarlo con su versión da la
tasa *empezó a llenar → compró* sin pedirle un dato más al comprador. La analítica
de front no sirve para esto: en la landing `setAnalyticsSink` ahora enchufa el
**pixel de Meta/TikTok** (`src/lib/pixels/`, ver [09-PIXELS-CAPI](./09-PIXELS-CAPI.md)),
que manda los eventos al Events Manager del anunciante — no a un almacén interno
consultable. Para el denominador del A/B sigue mandando `checkout_drafts`.

> El bus `trackEvent` de `checkout/analytics.ts` es la costura: alimenta el pixel
> sin que ningún paso conozca `fbq`/`ttq`. El Purchase NO sale de aquí —lo dispara
> el webhook por CAPI cuando el comprador ya se fue a Yape—.

`manage-store` acción **`ab_stats`** hace las cuentas con dos precauciones:

- **`since`** = el primer lead marcado con versión, y los pedidos se cuentan desde
  ahí. Sin eso, los pedidos viejos (que sí traen variante) se dividirían entre
  leads que nunca la tuvieron y la tasa saldría inflada.
- **El corte de PROVINCIA es el que vale.** La variante solo cambia el flujo en
  provincia con cobertura; en Lima A y B son idénticas y su tráfico solo diluye la
  señal. El panel pinta ese número en grande y el global en gris, rotulado.

> ⚠️ **Volumen.** Un A/B necesita cientos de pedidos por rama para separar señal
> de ruido. El panel no pinta ganador por debajo de 30 leads por versión y lo dice
> en pantalla; aun así, con el volumen actual los números sirven para ver que el
> flujo B no rompe nada, no para elegir ganador.

### Pendiente

- [ ] `dispatch_type` no distingue **domicilio en provincia**: hoy manda
      `MOTORIZADO_LIMA`, que Logistics lee como reparto de Lima. Antes casi no
      pasaba; con B es una opción que el comprador elige a propósito. Necesita un
      tercer valor y que Logistics lo entienda.

## El paso 2 se revela de a poco ✅

El paso pide cuatro cosas —WhatsApp, dónde recibe, DNI, nombre, distrito— y
mostrarlas todas de golpe se lee como un formulario largo: la razón número uno de
abandono en móvil.

Ahora **el nombre y el distrito aparecen recién con el DNI completo**. No oculta
trabajo, lo reparte: cada campo resuelto empuja al siguiente.

Se revela con el DNI y no con cualquier otro campo por un motivo concreto: el DNI
**trae el nombre desde RENIEC**, así que cuando el campo aparece suele venir ya
lleno. El comprador ve que el formulario trabaja para él en vez de pedirle.

> Se mide por **longitud** (8 dígitos), no por el resultado de la consulta a
> RENIEC. Si el servicio está caído o el documento no está en el padrón, el
> comprador tiene que poder seguir igual: perder la venta por un servicio externo
> es perderla por algo que no es culpa suya.

Aplica a las dos variantes, A y B.

## "Lima y Callao" en el recuadro ✅

Decía solo **Lima**, y el Callao entra en esa rama: es lo que cubre el motorizado
propio. Un comprador de Ventanilla o Bellavista leía "Lima" y "Provincia" y no
tenía forma de saber cuál le tocaba — la duda basta para que escriba por WhatsApp
en vez de terminar la compra.
