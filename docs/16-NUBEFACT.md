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

## 2. Quién factura: la marca

Nubefact autentica con una **ruta** (única por cuenta) y un **token**. Kross **no** es reseller
ni emite en nombre de nadie: cada marca abre su cuenta en `nubefact.com`, activa *API
(Integración)*, y pega ruta y token en **Marca → Boleta electrónica con Nubefact**, junto con su
RUC, razón social, dirección fiscal y la serie de boletas de esa cuenta (`B001`). La ruta y el
token van a `store_secrets` y **no vuelven nunca** al panel (mismo trato que las llaves de Flow);
lo fiscal es público porque sale impreso en cada boleta.

El interruptor solo se enciende con las cinco piezas (`puedeFacturar` en `_shared/nubefact.ts`):
lo valida el panel y lo vuelve a validar `manage-store`. Sin ellas no se emite nada y el paso del
pedido queda pendiente, con su botón apagado.

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

**Una boleta por pedido, dos candados.** El primero es la base: la reserva `PENDIENTE` con
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

*Panel → Conexiones → Nubefact*: ops `boleta.emitir` y `boleta.consultar`, con el HTTP, el código
de Nubefact (`error_code`) y su mensaje en palabras (`ERRORES_NUBEFACT`: 10 token, 11 ruta, 20/21
formato, 22 fuera de plazo, 23 ya existe, 50/51 cuenta suspendida). Y en el pedido, la línea de
la boleta dice el estado y el error; el chat del equipo tiene la nota.

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

- **Facturas** (RUC del cliente): el checkout no pide RUC. Sería un campo más en el paso 2 y
  `tipo_de_comprobante = 1` con serie `F…`.
- **Nota de crédito / anulación** ante un pedido cancelado después de pagado.
- **Boleta del saldo** cuando el pedido se pagó en dos tiempos: hoy se emite UNA, por el total,
  cuando el saldo cruza.
- **PDF propio**: se enlaza el de Nubefact. Guardarlo en Storage (`enlace_del_pdf` caduca?) no
  está verificado — anotar en la primera emisión real.
