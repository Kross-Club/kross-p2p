# 12 · FLOW PAGOS, EL SEGUNDO RIEL

> Estado: **🟡 construido, sin una sola orden emitida contra Flow.** El código está entero —contrato,
> emisión, webhook, vuelta, panel y ruteo— y la suite lo cubre; lo que falta no es técnico:
> que cada marca pegue sus llaves de Flow y una prueba con S/5. Ver §7.
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
| **152** | **Yape** | Billetera | 3.50% | **0.80 PEN** | Activo — **no es el one-shot** |
| **169** | **QR Interoperable** | Billetera | **2.59%** | **0.00 PEN** | Activo |
| 167 | Yape Pagos Recurrentes | Cargo automático | 3.50% | 0.00 PEN | Inactivo — se pide por correo a `operaciones@flow.cl` |
| — | **Yape one-shot** | Billetera | por confirmar | por confirmar | ⏳ **en aprobación; Flow entrega su id cuando salga** |
| 29 | PagoEfectivo | Efectivo | 3.90% | 0.80 PEN | Activo |
| 11 | Tarjetas | Tarjetas | 3.50% | 0.80 PEN | Inactivo |

El pie de esa tabla dice **"el valor de la tarifa está publicado sin impuesto incluido… en el
caso de Perú es de 18.00%"**, lo que confirma cómo está escrito `COSTO_PASARELA`: los números
se guardan netos y se multiplican por `IGV`. Si algún día aplicara el fijo, es `0.80 * IGV` =
**S/0.944**, no S/0.80. Ahí mismo: **el reembolso cuesta S/14.00** — más que la comisión de
casi cualquier adelanto, así que un reembolso por Flow se decide, no se despacha.

**El contrato de partner de Kross excluye el fijo**, y esa es la versión que rige: `COSTO_PASARELA`
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
| Quién es Kross | partner, con un `business_id` por marca | **nadie**: no hay capa de plataforma (ver abajo) |
| Llaves | una de partner (plataforma) | `apiKey` + `secretKey` **de cada marca**, en `store_secrets` (§41) |
| Quién cobra la comisión de Kross | la pasarela, por split | **nadie todavía** — deuda comercial abierta |

### Kross NO es integrador de Flow (02-sep-2026)

Este riel se construyó asumiendo que Kross sería **comercio integrador** y cada marca un
**comercio asociado** dado de alta con `merchant/create`, calcado del par llave-de-partner +
`business_id` de 360pay. **Flow lo desmintió al primer intento**: el alta responde

```
Commerce is not integrator
```

Ser integrador no es una credencial que uno pida: es un **permiso que Flow habilita sobre una
cuenta**, y la de Kross no lo tiene. El nombre, el ambiente y las llaves no tenían nada que ver
—el error habla de quién llama, no de lo que manda.

Así que el modelo es el de cualquier pasarela sin capa de plataforma: **cada marca abre su
cuenta en Flow y trae sus dos llaves**, que se pegan en *Marca → Cobros* y viven en
`store_secrets` (§41). Lo que eso arrastra:

- **La plata cae en la cuenta de cada marca.** Es lo que ya se quería, pero ahora sin
  intermediario.
- **La comisión de Kross no tiene mecanismo en este riel.** Con 360pay la descuenta el split;
  acá no hay split, así que `cobros.comision_pen` se queda en NULL para los cobros de Flow y se
  cobra por fuera. **Es una decisión comercial abierta, no un pendiente de código**, y hay que
  resolverla antes de encender el riel en una marca cliente.
- **Desaparece el "conectar" de un solo sentido.** No hay nada que crear en Flow desde el panel:
  o la marca pegó sus llaves, o no cobra. Cambiar de ambiente ya no es irreversible.
- `stores.flow_merchant_id` **queda de aquel intento y ya no lo lee nadie.** No se borra —borrar
  una columna es destructivo y una columna muerta no molesta— pero no significa nada.

Si algún día Flow habilita integrador sobre la cuenta de Kross, volver es re-poner
`merchant/create` y el `merchantId` de `payment/create`: está en el historial, commit `35c1e4a`
hacia atrás.

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
| `email` (req.) | uno solo para todos (`EMAIL_DEL_PAGADOR`): el checkout no pide correo. Ver §5 |
| `paymentMethod` | el ID de Yape del portal (`stores.flow_payment_method`): *"el pagador será redireccionado directamente al medio de pago"*. Sin él, selector |
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

Bloque de Flow debajo del de 360pay: el **ambiente**, las **dos llaves** de la cuenta de Flow
de la marca, el **ID del medio** del portal, y el toggle — que no prende sin llaves cargadas,
mismo espíritu que el gate de 360pay. Todo exige JWT verificado.

Las llaves **no vuelven nunca** al panel: el GET solo trae `flow_keys_configured` y
`flow_secrets_updated_at`, y los inputs nacen vacíos y se limpian apenas se guardan —un secreto
que sigue en un input es un secreto en la memoria del navegador y en el autocompletado. Quitar
las llaves apaga el riel en el mismo golpe, del lado del servidor: dejarlo encendido sin con qué
cobrar deja al comprador con un pedido y sin forma de pagarlo.

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
- **El `email` del pagador es uno solo para todos** (`EMAIL_DEL_PAGADOR` en `_shared/flow.ts`).
  El checkout de Kross no pide correo —DNI y celular— y Flow lo exige igual. Antes se
  sintetizaba del celular contra un dominio sin buzón; ahora es una dirección real. El costo:
  todos los avisos de Flow caen en ese buzón, y en el panel de Flow **todos los pedidos salen
  con el mismo pagador**, así que una transacción se rastrea por `commerceOrder` —el id de la
  fila de `cobros`— y nunca por el correo. **Provisional**: cuando deje de serlo, el sitio es
  un secreto de plataforma o una columna de `stores`, no el repo.
- `coupon_expires_at` de la fila de Flow se espeja en `pay360_coupon_expires_at` vía
  `columnasDe`: el nombre es de 360pay, el significado ("cuándo vence el enlace de pago") no, y
  `vigencia-de-cupon.ts` lo lee igual para los dos.

## 6. Esquema (§40 y §41)

`stores`: `flow_enabled`, `flow_payment_method` (integer), `flow_env` — nada de esto es
secreto y `stores` se lee en público. `cobros`: `flow_token` (índice parcial), `flow_pay_url`.

**Las llaves van en `store_secrets` (§41)**: `flow_api_key`, `flow_secret_key`,
`flow_secrets_updated_at`. Ahí y no en `stores` porque esa tabla tiene SELECT público y RLS es
por fila, no por columna: una `secret_key` en `stores` sería legible con la anon key. Mismo
criterio que `pay360_hook_secret` y `shalom_pro_password`. De ellas **solo vuelve la presencia
y la fecha** al panel, nunca el valor.

`stores.flow_merchant_id` sigue existiendo y **no la lee nadie**: es el resto del modelo de
integrador.

## 7. Puesta en marcha

| Paso | Estado |
|---|---|
| Correr **§41** y pegar las llaves de la marca en *Marca → Cobros* (salen de Flow → *Configuración → Datos de integración*). **No** van a `supabase secrets set`: son de la marca, no de la plataforma | ⏳ |
| Correr §40 en el SQL Editor de `ofdjghntvmrdfjhazfvz` | ✅ 02-sep-2026 |
| Desplegar `flow-order`, `flow-confirm --no-verify-jwt`, `flow-return --no-verify-jwt`, `register-buyer`, `manage-store`, `get-session`, `get-store-sessions` | ✅ 02-sep-2026 |
| ~~Conectar la marca como comercio asociado~~ — **no aplica**: la cuenta de Kross no es integrador (§2) | ✅ resuelto 02-sep-2026 |
| **Resolver la unidad de `amount`**: crear una orden de S/10 y mirar cuánto muestra el checkout de Flow **antes de confirmar el pago** | ⏳ bloquea cobrar |
| Pagar de verdad ese S/10 —las llaves son de producción, no hay tarjeta de prueba— y ver que `flow-confirm` lo cruza a MATCHED | ⏳ |
| **ID del medio** (portal → *Medios de pago*, columna `Id`). El del **one-shot llega cuando Flow lo apruebe** —el `152` activo no es ese—; entretanto, **vacío**: Flow muestra el selector con los medios activos y se ve qué elige la gente | ⏳ |
| **Mirar si el checkout de Flow le enseña al comprador el `email` del pagador.** Es uno solo para todos (`EMAIL_DEL_PAGADOR`); si se ve en pantalla, hay que volver a sintetizarlo por comprador | ⏳ |
| Punta a punta desde la PWA instalada en Android: que el POST de vuelta llegue a la pestaña del pedido | ⏳ |
| Encender el toggle en Kross Shop con un adelanto de S/5 | ⏳ |
| Primera liquidación: `fixed` debe ser 0 | ⏳ |

### Probar el `amount` con llaves de producción

Se puede, mirando el monto en la página de Flow **antes** de confirmar. `montoParaFlow()` manda
soles con decimales (`10` para S/10), así que el error posible es que Flow lea eso como
céntimos —cobraría de MENOS, S/0.10— o que rechace la orden. **No hay forma de que cobre de
más**: no existe unidad mayor al sol. Es la trampa de 360pay al revés, donde `pen * 100` sí
cobraba cien veces de más.

### La comisión de Kross, antes de encender esto en una marca cliente

Sin split, Flow le liquida a la marca el monto menos su comisión y **Kross no cobra nada**. En
Kross Shop da igual —la cuenta es de Kross—, pero en una marca cliente es regalar el riel. Hay
que decidir cómo se cobra (facturar aparte es lo más probable) **antes** de encender
`flow_enabled` fuera de casa. Hasta entonces, `comision_pen` en NULL para los cobros de Flow no
es un bug: es el número honesto.

Y ya no hay puerta de un solo sentido: guardar llaves no crea nada en Flow, se pueden cambiar,
y quitarlas apaga el riel en el mismo golpe.
