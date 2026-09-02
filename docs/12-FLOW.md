# 12 · FLOW PAGOS, EL SEGUNDO RIEL

> Estado: **🟡 construido, sin una sola orden emitida contra Flow.** El código está entero —contrato,
> emisión, webhook, vuelta, panel y ruteo— y la suite lo cubre; lo que falta no es técnico:
> credenciales de Flow, el comercio aprobado y una prueba con S/5. Ver §7.
> Leer junto con `07-CONTRATO-360PAY.md` §9 (la tarifa y el corte de S/90) y
> `06-360PAY.md` (el otro riel, con el que este comparte casi todo).

## 1. Por qué un segundo riel

360pay cobra **S/3.72 planos** por transacción. Flow cobra **3.5% + IGV = 4.13%** del monto. Se
cruzan en **S/90.00 exactos** (`3.15 / 0.035`; el IGV multiplica a los dos lados y se cancela), y
casi ningún adelanto de la PWA llega ahí: un adelanto de S/10 cuesta S/0.41 por Flow y S/3.72
por 360pay. Con la tarifa de Kross (5% + S/1.20) eso es la diferencia entre S/1.29 de margen y
margen negativo.

Así que el ruteo es **`< S/90 → Flow · ≥ S/90 → 360pay`**, y vive en un solo sitio:
`_shared/comision.ts` (`CRUCE_DE_RIELES`, `proveedorPara`, `rielPara`).

### ⚠️ El S/0.80, y por qué el código NO lo cuenta (02-sep-2026)

**El portal de Flow dice que sí lo cobra.** Mirando *Medios de pago* de la cuenta de Kross:

| Id | Medio | Tipo | Comisión | Costo fijo | Estado |
|---|---|---|---|---|---|
| **152** | **Yape** | Billetera | 3.50% | **0.80 PEN** | Activo |
| **169** | **QR Interoperable** | Billetera | **2.59%** | **0.00 PEN** | Activo |
| 167 | Yape Pagos Recurrentes | Cargo automático | 3.50% | 0.00 PEN | Inactivo — se pide por correo a `operaciones@flow.cl` |
| 29 | PagoEfectivo | Efectivo | 3.90% | 0.80 PEN | Activo |
| 11 | Tarjetas | Tarjetas | 3.50% | 0.80 PEN | Inactivo |

**El contrato de partner de Kross lo excluye**, y esa es la versión que rige: `COSTO_PASARELA`
deja `FLOW.fijo` en 0 y el cruce se queda en S/90. La tabla del portal es la tarifa de lista,
no la de esta cuenta.

**Es la única variable que tumba la tarifa entera**, así que se verifica y no se supone. En la
primera liquidación: `settlement/getByIdv2 → detail.payment[].fixed` **debe venir en 0**. Si
viene 0.80, hay que corregir `COSTO_PASARELA.FLOW.fijo` a `0.80 * IGV` y asumir lo que sigue:

| | corte con 360pay | margen a S/20 | margen a S/50 | piso |
|---|---|---|---|---|
| Sin el fijo (lo que está en el código) | S/90 | S/1.37 | S/1.63 | **S/1.02 neto** |
| Con el fijo | **S/67** | **S/0.43** | **S/0.69** | **S/0.22 neto** |

El piso pasa de un sol a veinte céntimos: seguiría siendo positivo en todo monto, pero deja de
cumplir el objetivo con el que se eligió el S/1.20 fijo, y tocaría subirlo.

### 🔮 El QR Interoperable puede ser mejor que Yape

`169 · QR Interoperable · 2.59% + 0.00`, activo, le gana a Yape (3.5% + 0.80 de lista) en
**todos** los montos, y en Perú el QR interoperable incluye Yape y Plin:

| | corte con 360pay | margen a S/20 | margen a S/50 | piso |
|---|---|---|---|---|
| QR Interoperable (169) | **S/122** | S/1.59 | S/2.17 | S/1.02 neto |

Lo que no se sabe es la experiencia: un QR en una PWA que ya vive en el celular del comprador
puede ser incómodo de escanear, y esa fricción se paga en conversión. Se mide en la primera
prueba dejando **vacío** el *ID de Yape en Flow*: Flow muestra todos los medios activos y se ve
cuál elige la gente.

## 2. El modelo, y en qué se diferencia de 360pay

Flow es un **checkout alojado con redirect**. Ninguna llamada de su API acepta el celular y el
código de aprobación de Yape: eso se teclea **en la página de Flow**.

| | 360pay | Flow |
|---|---|---|
| Qué emite el servidor | un cupón + un deeplink a la app de Yape | una **orden** + el **enlace al checkout de Flow** |
| Qué hace el comprador | toca, se va a la **app** de Yape, vuelve por su cuenta | toca, se va a la **página** de Flow (ya en Yape si hay `paymentMethod`), teclea celular + código, **Flow lo devuelve** |
| Cómo se confirma | webhook firmado con el evento entero | webhook con **solo un token** → `payment/getStatus` firmado por nosotros |
| Cómo vuelve | no vuelve solo (§17.d de 06) | **POST del navegador** a `urlReturn` → `flow-return` → 302 a `/p/<token>` |
| "Cupón más antiguo" | sí, y obliga a UN cupón vivo por comprador | **no existe**: cada orden es suya |
| Reemisión | anular y emitir otra | **reutilizar** la pendiente; otra solo si está rechazada/anulada |
| Quién es Kross | partner, con un `business_id` por marca | **comercio integrador**, con un `merchantId` por marca |
| Llaves | una de partner (plataforma) | `apiKey` + `secretKey` de **plataforma** — nada en `store_secrets` |

El recorrido del comprador es **más largo que el deeplink de 360pay** (sale a una web y de ahí
a la app por el código) pero tiene una ventaja real: **la vuelta la hace Flow**, con un POST, y
desaparece el "¿vuelve solo?" que costó el primer pedido de Kross Shop.

`CulqiYapeBox` (borrado en `87fed95`) **no se rescató**: era el formulario de un cargo directo, y
no hay cargo directo. Lo que sí se rescató de ahí son los invariantes de servidor.

## 3. Lo que la doc de Flow establece (verificado, 01-sep-2026)

Las diez páginas de `developers.flow.cl` pegadas al chat. Lo que no está en ellas se marca.

**`payment/create`** (POST `application/x-www-form-urlencoded`):

| Parámetro | Qué mandamos |
|---|---|
| `commerceOrder` (req.) | **`cobros.id`**, no el id de sesión: un pedido tiene N cobros y cada uno es su orden |
| `amount` (req.) | ⚠️ **unidad para PEN no documentada** (los ejemplos son CLP enteros). `montoParaFlow()` manda soles con decimales; es UNA línea si el sandbox dice otra cosa |
| `currency` · `payment_currency` | `PEN` — no documentado, obvio |
| `email` (req.) | sintetizado: `<celular>@buyers.krossclub.app`, como hacía Culqi |
| `paymentMethod` | el ID de Yape del portal (`stores.flow_payment_method`): *"el pagador será redireccionado directamente al medio de pago"*. Sin él, selector |
| `merchantId` | `stores.flow_merchant_id` — la plata va al comercio, no al integrador |
| `urlConfirmation` · `urlReturn` | `…/functions/v1/flow-confirm` y `…/flow-return` |
| `timeout` | 30 días en segundos (`ORDER_TTL_S`), como `COUPON_TTL_DAYS` |
| `optional` | `{ tipo }` |

Respuesta: `{ url, token, flowOrder }` → el enlace es `url + "?token=" + token`.

**Firma**: HMAC-SHA256 hex sobre los parámetros **ordenados alfabéticamente y concatenados
`nombre+valor`** sin separador, en `s`. El orden es el `sort()` sin comparador de los ejemplos
oficiales (`paymentMethod` antes que `payment_currency`). Fijado en `flow.test.ts` contra los
dos ejemplos literales de la doc.

**`payment/getStatus`** (GET firmado, por `token`): `status` **1 pendiente · 2 pagada · 3
rechazada · 4 anulada**, y `paymentData { media, amount, fee, balance, transferDate }`.

**Confirmación**: POST form-urlencoded con **solo `token`**. Responder 200 en <15 s. *"Los
estados de las transacciones no se verán afectados por errores en la respuesta"* — por eso
re-consultar es la verdad. Yape es "billetera" → medio **síncrono**: la confirmación llega
antes del retorno.

**Retorno**: POST **del navegador** a `urlReturn`, con `token`.

**`merchant/create`**: `id`, `name`, `url` → `status` **0 pendiente · 1 aprobado · 2
rechazado**. La aprobación es manual de Flow.

**Sandbox**: `https://sandbox.flow.cl/api`, cuenta aparte. Tarjeta de prueba Perú
`5293138086430769 · 11/27 · 123`. **No hay credenciales de prueba de Yape** en la doc.

## 4. Lo construido

### `_shared/flow.ts` — el contrato, puro

Sin efectos de red propios ni `Deno.env` (lo typechequea el front). `firmar`, `crearOrden`,
`estadoPorToken`, `crearComercio`, `esPagada` (la ÚNICA lectura del estado: `status === 2`),
`esFinalSinPago`, `desgloseDeFlow`, `tokenDelWebhook`. **22 tests** en
`src/lib/checkout/flow.test.ts`, incluida la firma contra `node:crypto`.

### `flow-order` — emitir

Gemelo de `pay360-coupon`: monto **re-derivado en servidor** y contrastado, config por
`origin_store_id`, tope de intentos, `payment_provider === 'FLOW'`. Dos cosas propias:

- **La fila de `cobros` se escribe ANTES de emitir**: su `id` es el `commerceOrder`, y existir
  antes es lo que garantiza que una orden emitida nunca quede sin fila que la conozca.
- **Una orden pendiente se reutiliza.** Con `flow_token` guardado se consulta el estado: pagada
  → `already_paid`; pendiente → **el mismo `flow_pay_url`** (el comprador puede tenerlo abierto
  en otra pestaña); rechazada/anulada → otra. Sin respuesta → `network_after`, nunca a ciegas.

Devuelve `pay_url`. El front navega **en la misma pestaña** (`goToFlow`): es la lección de
§17.d, y además el POST de retorno llega a la pestaña que navegó.

### `flow-confirm` — el webhook (`--no-verify-jwt`)

Cinco defensas, en este orden porque el POST no trae ni estado ni firma:

1. El token, del body crudo.
2. **La fila que lo conoce** (`cobros.flow_token`). Un token de nadie se ignora con 200.
3. Dedupe `flow:<token>` sobre `(store_id, dedupe_key)`.
4. **`getStatus` firmado con nuestra secret key** — es lo que da la autenticidad.
   Sin respuesta → se suelta el dedupe y 503. **Pendiente → se suelta el dedupe** (un medio
   asíncrono avisa de nuevo con el mismo token). Rechazada/anulada → queda el rastro y
   `payment_reason` dice cuál.
5. Contraste de monto contra la fila.

Al cruzar: `cobros` → `MATCHED` con `costo_pasarela_pen = paymentData.fee` y **`comision_pen`
NULL** (§39: la comisión de Kross no viene en el estado y no se rellena con la tarifa); las
columnas de siempre vía `columnasDe`; el `raw` del evento pasa a ser el **estado**, con
`operation_number = flowOrder` y `bank_tx_id = media`, para que el rastro del panel tenga con
qué buscarlo en el portal de Flow; los dos mensajes del chat con la misma copy; CAPI y la guía
**solo en el adelanto**.

### `flow-return` — la vuelta (`--no-verify-jwt`)

`vercel.json` reescribe todo a `index.html`, que es estático y no recibe POST. La vuelta
aterriza acá, resuelve el `order_token` de la PWA por la fila (**el token de Flow nunca es la
credencial**) y responde **302 a `https://<slug>.krossclub.app/p/<token>`**. De paso dispara
`flow-confirm` en segundo plano con el mismo token: es la segunda oportunidad si la
confirmación no llegó, e idempotente por dedupe si llegó.

No le dice nada al comprador: la página del pedido pinta el estado real.

### El seam de proveedor

Se había borrado con Culqi y se repuso: `esRielEnLinea()` en `_shared/comision.ts` es **la
única definición** de "cobra en línea" (antes era `=== '360PAY'` en tres sitios).
`puedePagarSaldo`, `seCobraPorChat`, `register-buyer` y el checkout pasan por ahí.
`Cobro.riel` sale de la **fila** (`flow_token` vs `pay360_coupon_id`), no del pedido, y es lo
que pone "(Flow)" o "(360pay)" en la tarjeta del panel y en el botón de copiar para soporte.

### El ruteo — `register-buyer`

El front manda su **preferencia** (`preferredRailFor`: `'360PAY'` si lo tiene, si no `'FLOW'`,
nada si no cobra en línea); el servidor **decide** con `rielPara(adelanto, habilitados)`
leyendo `stores.pay360_enabled / flow_enabled` de la tienda de origen, y lo devuelve en
`payment_provider`. El modal sigue lo que vuelve; si la función desplegada es anterior y no
lo devuelve, cae a su preferencia — una tienda solo con 360pay cobra igual.

### El panel — `MarcaPage` / `manage-store`

Bloque de Flow debajo del de 360pay: **Conectar con Flow** (`merchant/create`, una sola vez,
con el nombre del comercio), el **ID de Yape** del portal, el ambiente, y el toggle — que no
prende sin comercio conectado, mismo gate que 360pay. Todo exige JWT verificado.

## 5. Decisiones que conviene conocer antes de tocar esto

- **El saldo y los extras van por el riel del PEDIDO**, no por su propio monto. Un adelanto de
  S/40 por Flow con saldo de S/140 paga el saldo por Flow (S/5.78) aunque 360pay saliera a
  S/3.72. Es a propósito: re-rutear por cobro obligaba a que `pay360-coupon`/`pay360-webhook`
  aceptaran pedidos con `payment_provider='FLOW'`, y el invariante del cupón más antiguo se
  razona por pedido. **Deuda abierta**, con un precio conocido (~S/2 por saldo grande).
- **Con Flow no hay `AWAITING`.** El comprador no está en la PWA mientras paga; la fase queda en
  `ISSUING` mientras el navegador navega, y el modal desaparece. La vuelta es a `/p/<token>`,
  no al modal.
- **Un adelanto rechazado deja al comprador sin botón** en `/p/<token>`: `PagarSaldo` solo
  cobra saldos. Hoy vuelve por el "retomar pedido" de la landing (`saveLastOrder`), igual que
  con 360pay. Deuda compartida por los dos rieles.
- `coupon_expires_at` de la fila de Flow se espeja en `pay360_coupon_expires_at` vía
  `columnasDe`: el nombre es de 360pay, el significado ("cuándo vence el enlace de pago") no, y
  `vigencia-de-cupon.ts` lo lee igual para los dos.

## 6. Esquema (§40)

`stores`: `flow_enabled`, `flow_merchant_id`, `flow_payment_method` (integer), `flow_env`.
`cobros`: `flow_token` (índice parcial), `flow_pay_url`. **Nada en `store_secrets`**: las
llaves son de plataforma — `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_API_KEY_LIVE`,
`FLOW_SECRET_KEY_LIVE` en `supabase secrets set`.

## 7. Puesta en marcha

| Paso | Estado |
|---|---|
| Llaves de la cuenta → `supabase secrets set` **de plataforma**, nunca en el repo ni en `store_secrets`. De `www.flow.cl` van a `FLOW_API_KEY_LIVE` / `FLOW_SECRET_KEY_LIVE`; de `sandbox.flow.cl`, a `FLOW_API_KEY` / `FLOW_SECRET_KEY`. Cambiar un secreto **no** obliga a redesplegar: se lee en cada invocación | ⏳ producción |
| Correr §40 en el SQL Editor de `ofdjghntvmrdfjhazfvz` | ✅ 02-sep-2026 |
| Desplegar `flow-order`, `flow-confirm --no-verify-jwt`, `flow-return --no-verify-jwt`, `register-buyer`, `manage-store`, `get-session`, `get-store-sessions` | ✅ 02-sep-2026 |
| **Elegir el ambiente ANTES de conectar** (ver abajo) y conectar Kross Shop desde el panel; la aprobación la hace Flow | ⏳ |
| **Resolver la unidad de `amount`**: crear una orden de S/10 y mirar cuánto muestra el checkout de Flow **antes de confirmar el pago** | ⏳ bloquea cobrar |
| Pagar de verdad ese S/10 —las llaves son de producción, no hay tarjeta de prueba— y ver que `flow-confirm` lo cruza a MATCHED | ⏳ |
| **ID del medio** (portal → *Medios de pago*, columna `Id`): Yape es **152**, QR Interoperable **169**. Dejarlo **vacío** en la primera prueba para ver qué ofrece Flow y qué elige la gente | ⏳ |
| Punta a punta desde la PWA instalada en Android: que el POST de vuelta llegue a la pestaña del pedido | ⏳ |
| Encender el toggle en Kross Shop con un adelanto de S/5 | ⏳ |
| Primera liquidación: `fixed` debe ser 0 | ⏳ |

### Probar el `amount` con llaves de producción

Se puede, mirando el monto en la página de Flow **antes** de confirmar. `montoParaFlow()` manda
soles con decimales (`10` para S/10), así que el error posible es que Flow lea eso como
céntimos —cobraría de MENOS, S/0.10— o que rechace la orden. **No hay forma de que cobre de
más**: no existe unidad mayor al sol. Es la trampa de 360pay al revés, donde `pen * 100` sí
cobraba cien veces de más.

### Conectar es de un solo sentido

`manage-store` da de alta el comercio **en el ambiente que esté elegido al momento del click**
y guarda `flow_merchant_id`; un segundo intento rebota con `flow_ya_conectado` (409) porque dar
de alta dos veces partiría la liquidación entre dos comercios. Por eso el selector de *Ambiente*
se pinta **encima** del botón en el panel, y por eso conectar en pruebas y después querer
producción **no se arregla desde la pantalla**. La salida es a mano, en el SQL Editor:

```sql
update stores set flow_merchant_id = null, flow_enabled = false where slug = '<marca>';
```

Y volver a conectar con *Producción* elegido. El comercio de sandbox queda huérfano en la cuenta
de pruebas de Flow, que no molesta a nadie.
