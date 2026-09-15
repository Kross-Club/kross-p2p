# 16 · LA BOLETA ELECTRÓNICA, CON NUBEFACT

> Estado: **✅ construido, sin probar contra una cuenta real** (15-set-2026). Falta la primera
> emisión en la cuenta DEMO de Nubefact de una marca y después la de producción (§ *Puesta en
> marcha*). Leer junto con `01-SALES-ENGINE.md` § *Cada paso lleva lo suyo* (el paso «Boleta
> electrónica» del pedido) y `13-CONEXIONES.md` (los eventos `boleta.*`).
> Manual del proveedor: *NUBEFACT_DOC_API_JSON_V1* (3.0, 07/09/2026).

## 1. Qué hace, en una frase

**Quien paga el pedido completo recibe su boleta de venta electrónica**, emitida por la marca
—con su RUC, desde su cuenta de Nubefact— y aceptada por SUNAT. Sale sola al confirmarse el
pago, el comprador la ve como tarjeta en su chat y como paso «Boleta electrónica» en su pedido,
y el vendedor la ve en su panel debajo de la plata, con un botón para cuando no salió.

Es del ICP nuevo (14-set-2026): marcas **formales**, que cobran el 100 % antes de despachar. Con
un adelanto no hay venta cerrada que facturar: la boleta es solo del pedido pagado del todo, que
es también lo único que el paso del pedido enseña.

## 2. Quién factura: la marca, con TRES datos

Nubefact autentica con una **ruta** (única por cuenta) y un **token**. Kross **no** es reseller ni
emite en nombre de nadie: cada marca abre su cuenta en `nubefact.com`, activa *API (Integración)*,
y pega en **Marca → Boleta electrónica con Nubefact** exactamente tres cosas:

| Dato | Para qué |
|---|---|
| **Ruta** | Identifica la cuenta. Con ella queda identificado el emisor |
| **Token** | Autentica (header `Authorization`) |
| **Serie** | Cuál de las series de esa cuenta usa Kross (§2.b) |

La ruta y el token van a `store_secrets` y **no vuelven nunca** al panel (mismo trato que las
llaves de Flow). El interruptor solo se enciende con las tres (`puedeFacturar`): lo valida el
panel y lo vuelve a validar `manage-store`.

> **Lo que NO se pide, y por qué** (15-set-2026). El panel pedía además RUC, razón social y
> dirección fiscal de la marca. No participan de nada: **el emisor no viaja en el JSON** —lo
> identifica la ruta— así que esos datos solo servían para bloquear a quien ya podía facturar. Lo
> único que el JSON lleva son los campos `cliente_*`, y hay un test que lo vigila. Las columnas se
> quedan en la base con lo que cada marca escribió (§59): nada se borra.
>
> Y la **dirección del cliente** es opcional en una boleta —lo dice el manual: *«Dirección
> completa (OPCIONAL en caso de ser una BOLETA DE VENTA o NOTA ASOCIADA)»*—, así que se manda si
> el pedido la tiene y si no, no.

## 2.b La serie y la numeración: lo que cuesta una prueba entera

Dos cosas se aprenden caras (15-set-2026, con la cuenta de Mono Shop):

**La serie tiene que ser una que la cuenta YA EMITA, y no hay forma de preguntárselo.** Nubefact
no las crea al vuelo, y su API **no tiene operación que las liste**: son cuatro —generar,
consultar, anular, consultar anulación— y ninguna devuelve las series. Una serie no habilitada se
rechaza con **`[21] No puedes emitir comprobantes con esta serie`**, un mensaje que no menciona la
serie por ningún lado. `B001` y `BB01` fallaron; `BBB1`, la de la cuenta, funcionó.

Por eso el panel **ya no propone ninguna** (antes nacía en `B001`, invención nuestra y justo la
que falla): el campo nace vacío, pide copiarla de Nubefact → *Ver Facturas, Boletas y Notas*, y
tiene un botón **Probar** que hace `consultar_comprobante` sobre la última boleta declarada. Es la
única comprobación que el API permite **sin emitir nada**, y confirma tres cosas de un golpe: que
la ruta y el token sirven, que esa serie existe en la cuenta, y que la numeración está donde la
marca cree.

**La numeración arranca donde la cuenta va, no en 1.** Una cuenta que ya facturaba —a mano, o
desde otro sistema— tiene números usados; empezar en 1 los choca uno por uno. Por eso *Marca →
Boleta electrónica* tiene **Última boleta emitida**: se pone el número de la última de esa serie y
la próxima sale con el siguiente.

Y si igual choca, el servidor **salta el número, nunca adopta la boleta ajena**. Un `23` («ya
existe») significa dos cosas distintas según de quién sea el número:

| El número… | Qué significa el 23 | Qué hace |
|---|---|---|
| lo acabamos de reservar | está tomado por otro documento de la cuenta | pide el siguiente y reintenta (hasta 4 veces) |
| ya estaba en el pedido, de un intento anterior | la emitimos nosotros y no nos enteramos (un timeout) | la consulta y la adopta: es la suya |

Sin esa distinción, un pedido se quedaría con el comprobante de otra persona —con su nombre y su
monto— y nadie lo notaría hasta un reclamo.

## 3. Cuándo y cómo se emite

```
flow-confirm (cobro MATCHED, adelanto o saldo, nunca un extra)
  └─ runInBackground(emitirBoleta(session.id))          _shared/boleta.ts
        ├─ ¿la marca factura?            puedeFacturar(stores, store_secrets)
        ├─ ¿pagado del todo?             payment_verification = MATCHED y saldoOf() = 0
        ├─ reservar el número            UPDATE … boleta_estado = PENDIENTE (gana uno)
        │                                 siguiente_numero_de_boleta(store)  ← atómico
        ├─ armar el JSON                 armarBoleta() — nubefact.ts, puro, con tests
        ├─ POST ruta, Authorization: token
        ├─ código 23 (ya existe)         consultar_comprobante y guardar lo que diga
        ├─ OK                            order_sessions.boleta_* · tarjeta `boleta` al comprador
        └─ fallo                         boleta_estado = ERROR (el número se queda) · nota al equipo
```

**Una boleta por pedido, dos candados** (más el salto de número de §2.b). El primero es la base: la reserva `PENDIENTE` con
`boleta_numero IS NULL` la gana una sola llamada. El segundo es Nubefact: el `ORD` del pedido va
como `codigo_unico`, así que un duplicado que se le escapara al primero vuelve con **código 23** y
se consulta, no se reemite.

**El número no se pierde.** SUNAT exige correlatividad por serie. `siguiente_numero_de_boleta`
lo entrega de a uno, y si la emisión falla el número **se queda en el pedido** (`boleta_estado =
ERROR`): el reintento —el botón *Emitir boleta* del panel, `order-manage` → `emitir_boleta`— va
con el mismo, sin dejar huecos.

**Lo que se factura es lo que entró.** El total de la boleta es `product_price`, que es lo que el
comprador pagó. Las líneas salen de `items` (nombre · pack, cantidad, precio); si no suman el
total (un descuento de salida, un upsell viejo), se factura **una sola línea** con el pedido
entero antes que una boleta que no cuadre con la plata (`lineasDelPedido`).

## 4. La aritmética del IGV

Los precios de Kross **incluyen** el IGV: son lo que el comprador ve y paga. Nubefact pide el
`valor_unitario` sin IGV y el `precio_unitario` con él, y exige que la suma de las líneas cuadre
con los totales. Así que el IGV se extrae hacia atrás, por línea:

```
total     = precio × cantidad             (2 decimales)
subtotal  = total / 1.18                  (2 decimales)
igv       = total − subtotal              (nunca se calcula aparte: así siempre cuadra)
valor_unitario = subtotal / cantidad      (hasta 10 decimales, como admite el campo)
```

`tipo_de_igv = 1` (gravado, operación onerosa), `moneda = 1` (soles), `sunat_transaction = 1`,
`cancelado = true`, `medio_de_pago = YAPE`, `enviar_automaticamente_a_la_sunat = true`. Todo en
`nubefact.ts`, probado en `src/lib/nubefact.test.ts` para precios que no dividen exacto.

**El cliente.** Con DNI de verdad (8 dígitos, no todo ceros) va con tipo `1`; sin él, «varios»
(tipo `-`), que SUNAT admite en boletas por debajo de S/700. El nombre siempre va. La fecha de
emisión es la de **Lima** (UTC−5): el servidor corre en UTC, donde a las 8 pm ya es mañana, y
Nubefact rechaza una fecha que no sea hoy. Sin comillas dobles en ningún texto: rompen su JSON.

## 5. Qué guarda el pedido (§58)

| Columna | Qué es |
|---|---|
| `boleta_serie` · `boleta_numero` | Serie y correlativo, reservados antes de emitir |
| `boleta_estado` | `PENDIENTE` (emitiendo) · `EMITIDA` (Nubefact la tiene, SUNAT aún no contesta) · `ACEPTADA` · `RECHAZADA` · `ERROR` |
| `boleta_url` | El PDF (`enlace_del_pdf`, o `enlace` + `.pdf`) |
| `boleta_enlace` | La página del CPE en Nubefact |
| `boleta_emitida_at` · `boleta_error` | Cuándo, y por qué no |

`get-session` le manda al comprador serie, número, estado y PDF; `useTicketDelPedido` los
convierte en el paso «Boleta electrónica» (`hecho` con su botón cuando hay PDF; `pendiente` con
el botón apagado mientras no). El chat recibe un mensaje `type = 'boleta'` con `media_url` (la
tarjeta `TarjetaDeBoleta`, en los dos lados).

## 6. Dónde mirar cuando no sale

**Lo primero: el propio pedido.** Panel → el pedido → la línea de la boleta, debajo de la plata.
Si dice «Sin emitir», toca *Emitir boleta*: el motivo sale ahí escrito (marca sin configurar,
pedido sin pagar completo, falta el SQL §58). Es el diagnóstico más rápido y no necesita logs.

**Después, el log de la función.** La emisión automática corre en segundo plano
(`runInBackground` desde `flow-confirm`), así que un camino que no emite **no tumba nada y no se
ve**. Desde el 15-set-2026 todos dejan rastro: `[flow-confirm] disparando la boleta` primero, y
después `[boleta] emitida` o `[boleta] no se emitió` con el motivo y el detalle. En el dashboard
de Supabase, *Edge Functions → flow-confirm → Logs*.


**Y `api_events`**, para lo que es de la marca. *Panel → Conexiones → Nubefact*: ops
`boleta.emitir` y `boleta.consultar`, con el HTTP, el código
de Nubefact (`error_code`) y su mensaje en palabras (`ERRORES_NUBEFACT`: 10 token, 11 ruta, 20/21
formato, 22 fuera de plazo, 23 ya existe, 50/51 cuenta suspendida). Y en el pedido, la línea de
la boleta dice el estado y el error; el chat del equipo tiene la nota.

Una marca que **encendió** la facturación y le falta una pieza también sale acá, con el nombre de
lo que falta («RUC, token de Nubefact»). La que nunca la encendió no escribe eventos: no factura
y no tiene por qué llenarse la pantalla.

## 7. Puesta en marcha

1. Correr `setup-kross.sql` (§58: columnas, `siguiente_numero_de_boleta`).
2. Desplegar `flow-confirm`, `order-manage`, `manage-store`, `get-session`, `integraciones`.
3. En la marca: cuenta **DEMO** de Nubefact (`nubefact.com/register` → *API (Integración)*),
   pegar ruta y token en *Marca*, RUC, razón social, serie, encender.
4. Un pedido de prueba pagado completo → en `order_sessions` `boleta_estado`, `boleta_url`; en
   el chat la tarjeta; en Nubefact *Ver Facturas, Boletas y Notas*.
5. **Para producción** Nubefact pide, antes, generar por API desde la cuenta demo: 1 boleta en
   soles, 1 consulta de estado, 1 comunicación de baja (lista completa en el manual, § *Pasar a
   producción*). La baja y la nota de crédito **no están construidas** (🔮): hoy una boleta
   equivocada se anula desde el portal de Nubefact.

## 8. Lo que no hace (🔮)

- **Facturas.** El API sí las emite (`tipo_de_comprobante: 1`), y su serie **empieza con `F`** —
  igual que las boletas empiezan con `B`—, pero cuál `F…` la decide la cuenta, como con las
  boletas. Lo que falta no es eso: una factura obliga a `cliente_tipo_de_documento: 6` con el
  **RUC del cliente**, su razón social y su **dirección, que ahí sí es obligatoria**. El checkout
  no pide nada de eso. Serían un campo más en el paso 2 (¿factura?, RUC) y una serie `F…` en
  Marca.
- **Nota de crédito / anulación** ante un pedido cancelado después de pagado.
- **Boleta del saldo** cuando el pedido se pagó en dos tiempos: hoy se emite UNA, por el total,
  cuando el saldo cruza.
- **PDF propio**: se enlaza el de Nubefact. Guardarlo en Storage (`enlace_del_pdf` caduca?) no
  está verificado — anotar en la primera emisión real.
