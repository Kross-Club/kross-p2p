# 17 · EVA COURIER — EL REPARTO A DOMICILIO EN LIMA Y CALLAO

> Estado: **✅ registro y rótulo probados contra la cuenta real; el webhook todavía no**
> (16-set-2026). El primer reparto salió en el sandbox —`ORD-1789519901031` → tracking
> `858E9F4DE7C9`, despacho del mismo día, con su rótulo en el bucket—. Lo que falta es mover ese
> pedido de estado en el portal de Eva para ver entrar el primer `order.status_updated`, y
> después repetir todo en producción (§ *Puesta en marcha*). Lo que enseñaron los dos primeros
> intentos está en §9. Leer junto con `02-SMART-LOGISTICS.md` § *Dos formas de llegar a la
> puerta* (la bandera y la decisión por pedido, §60) y `13-CONEXIONES.md` (los eventos
> `reparto.*`).
> Manuales del proveedor: *Integración API v1.1* (2026-07-15), *Generación de Rótulos v1.0*
> (2026-07-16) y *Webhooks v1.0* (2026-06-03), los tres de Fly Express («EVA 3.0»).

## 1. Qué hace, en una frase

**Un pedido a domicilio en Lima o Callao, pagado, que la marca decidió mandar con el courier, se
registra solo en Eva**: Eva pasa por el local a recogerlo, lo lleva a la puerta y avisa cada
cambio por webhook. La marca imprime el rótulo desde su panel y lo pega al paquete; el comprador
ve en su pedido que va en camino y que se entregó. Nadie copia nada a mano.

## 2. Quién es quién

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **La bandera** | `stores.courier_lima_enabled` (§60): esta marca reparte con Eva | Marca → Entrega a domicilio, super admin |
| **La decisión** | `order_sessions.reparto_lima = 'COURIER'` (§60): ESTE pedido va con Eva | Sola si la marca solo tiene courier; el vendedor la elige si tiene las dos |
| **La cuenta** | Una, de la PLATAFORMA: `EVA_API_KEY` y `EVA_WEBHOOK_SECRET` en los secrets de las funciones | Igual que Olva LAT (`alcance: 'plataforma'`), no por marca |
| **El registro** | `eva-order` (Edge Function interna) | Lo disparan `flow-confirm`, `set_reparto` y «Reintentar» |
| **El reflejo** | `eva-webhook` (`--no-verify-jwt`) | Eva lo llama en cada cambio de estado |
| **La regla** | `_shared/eva.ts`, puro, con tests | Payload, distritos, cobro, estados, firma |

**Por qué la cuenta es de la plataforma y no de cada marca.** El webhook es UNA URL con UN
secret — Eva lo configura en su portal por cuenta—, y hoy hay una cuenta. Si mañana una marca
trae la suya, la llave pasa a `store_secrets` como la de Nubefact; el código está partido para
que ese cambio sea local. Consecuencia que conviene saber: el **remitente** que Eva imprime en el
rótulo es el nombre de la cuenta (Kross), por eso `observations` lleva «Tienda: {marca}» para el
motorizado.

## 3. El contrato de Eva, leído de sus manuales

Tres endpoints y un webhook. Todo con `Authorization: Api-Key <llave>` (no `Bearer`).

| Operación | Ruta | Qué devuelve |
|---|---|---|
| Registrar el pedido | `POST /api/v1/orders/` | `201` con `tracking_id` (alfanumérico, es LA referencia) |
| Consultar el pedido | `GET /api/v1/orders/{tracking_id}/` | `status` + `tracks` (hitos, motorizado, fotos, cobro) |
| El rótulo | `POST /api/v1/integration/shipping-labels/` con `{ids, format}` | El **PDF binario** (no JSON); `sticker` (A7) o `A4` |
| El webhook | `POST` a nuestra URL, `X-EVA-Signature` | `order.status_updated` · `test.ping` |

Sandbox: `https://api-test.evacourier.pe` (`EVA_API_BASE` lo pisa). Producción:
`https://api.evacourier.pe`.

**Lo que NO se comporta como Shalom, y cambia el diseño:**

- **No hay endpoint para buscar un pedido por nuestro `code`.** Solo por `tracking_id`, que es
  justo lo que no tenemos si la llamada murió sin respuesta. Eva acepta un `code` repetido y crea
  OTRO `tracking_id` (lo dice su §10). Así que un timeout o un 5xx **cierra en FAILED y una
  persona mira en app.evacourier.pe antes de reintentar** — igual que Olva LAT. Nunca se
  reintenta a ciegas: dos pedidos en Eva son dos motorizados en la puerta.
- **El distrito es un nombre EXACTO de su lista de 65**, «sensible a mayúsculas, tildes y
  espacios». No es el del INEI: «Lima» es `CERCADO DE LIMA`, `PACHACÁMAC` y `MI PERÚ` llevan
  tilde, `BREÑA` lleva Ñ. `distritoEva` traduce; lo que no traduce (Pucusana, San Bartolo, Punta
  Hermosa) frena la emisión con el motivo escrito. Test: todo el Callao del INEI traduce, y de
  Lima provincia solo quedan fuera esos tres balnearios.
- **La dirección viene en dos formas** y hay que partirla en calle + distrito: la del checkout
  («Av. Larco 1234, Miraflores») y la de Nominatim tras verificar por GPS («Av. Larco 1234,
  Miraflores, Lima, Lima Metropolitana, 15074, Perú»). `partirDireccionLima` recorre DESDE EL
  PRINCIPIO y gana el primer segmento que es un distrito de Eva — desde el final, «Lima» (la
  provincia) traduciría a Cercado y se llevaría por delante a Miraflores.
- **Es cliente tipo RECOJO**: Eva recoge en el local. `product` y `packages` son obligatorios y
  el rótulo es del **vendedor**. El comprador no necesita documento alguno — le llega el paquete.
- **Eva no reintenta el webhook** si respondemos 4xx/5xx o tardamos más de 10 s. El respaldo es
  el botón **Actualizar** del panel (§6): un `GET` que pregunta el estado y lo refleja igual.
  El barrido automático sigue sin construirse (🔮, §8).
- **En el portal de Eva el estado lo mueve el MOTORIZADO**, no el cliente (16-set-2026). El
  vendedor no puede empujar un pedido a «EN RUTA» para probar, y tampoco puede saber dónde va su
  paquete hasta que Eva llame. Por eso Actualizar no es un lujo: es la única lectura que el
  comercio controla.
- **El `GET` trae los `tracks` DESORDENADOS.** En el ejemplo del propio manual «ASIGNADO
  MOTORIZADO» (18:50) viene antes que «ENTREGADO» (16:19). El estado sale de `status`; `tracks`
  solo aporta el detalle del hito que le corresponde (`leerConsultaEva`).

## 4. Cuándo y cómo se registra

Tres puertas, todas convergen en `eva-order`, que trae su propio candado:

1. **`flow-confirm`, al cruzar el pago.** Uno por courier, como `shalom-order` y `olva-order`:
   cada generador descarta solo lo que no le toca.
2. **`order-manage` · `set_reparto`**, cuando el vendedor elige COURIER en un pedido **ya
   pagado**. Es el caso de la marca con las dos formas: al pagarse nadie había decidido.
3. **`order-manage` · `retry_eva`**, el botón «Reintentar» de *Envío Eva*, solo desde `FAILED`.

`eva-order` descarta antes de reclamar (no es `MOTORIZADO_LIMA`, no es `COURIER`, pago sin
verificar, ya tiene envío, ya procesado), **reclama** con `eva_order_status = PENDING` en un
UPDATE condicional, y recién ahí arma y manda. Las defensas, con su número:

| # | Defensa | Qué evita |
|---|---|---|
| 1 | Candado en la base | Dos disparos del mismo pago = dos motorizados |
| 2 | `courier_lima_enabled` de la marca | Registrar en Eva un pedido de una marca que no contrató |
| 3 | Nunca reintentar a ciegas | Un timeout que SÍ creó el pedido, y otro encima |
| — | *(no hay reconciliación)* | Es la defensa que Shalom tiene y Eva no permite |

**El cobro en la puerta** (`cobroEva`): sin saldo → `SOLO ENTREGAR`, 0; con saldo (producto que
permite la mitad, §56) → `EFECTIVO` por el saldo. Es UNA constante
(`METODO_DE_COBRO_DEL_SALDO`) porque es una decisión: Eva recauda y liquida al cliente de su
cuenta, y quién es ese cliente es conversación comercial, no un campo.

**Después del 201**, en este orden y a propósito: se guarda el tracking (`tracking_courier =
'EVA'`, `tracking_numero = tracking_id`, `eva_order_status = CREATED`) **antes** de cualquier
otra cosa —es lo único que permite consultar o recibir webhooks—; se baja el rótulo al bucket
`eva-rotulos` (best-effort: sin él la marca lo imprime desde el portal de Eva); se le dice al
comprador «tu pedido sale con motorizado» y al equipo «imprime el rótulo»; y se emite
`tracking_update` para que el panel se refresque solo.

## 5. El reflejo: qué mueve cada estado

Los trece estados de Eva, y qué hacen en Kross (`faseDeEva`, `esDemoraEva`,
`esCierreSinEntregaEva`, `mensajesDeEva`):

| Estado de Eva | `tracking_phase` | Al comprador | Al equipo |
|---|---|---|---|
| REGISTRADO · EN ALMACEN · ASIGNADO MOTORIZADO | — (sigue «preparando») | nada | solo si cambió |
| **EN RUTA** | `EN_TRANSITO` → «en camino» | «va en camino, te llama al llegar» | «salió» |
| PUNTO VISITADO · AUSENTE · REPROGRAMAR | — + `tracking_demora_at` | «pasó y no pudo entregar (motivo)» | estado + motivo + comentarios |
| INCIDENCIA | — + demora | nada (Eva habla con el cliente) | incidencia + motivo |
| **ENTREGADO** | `ENTREGADO` | «entregado, gracias» | «confirmar en el pipeline» + foto |
| NO ENTREGADO · DEVUELTO · CANCELADO | — | nada: lo decide la persona | «cerrado sin entregar» |

**Solo dos estados mueven la fase**, a propósito: en un domicilio el comprador tiene tres pasos
—preparando, en camino, entrega— y lo único que los mueve es que el motorizado salió y que
entregó. «En almacén» o «asignado» siguen siendo «preparando» para él; al vendedor se le enseña
el estado crudo (`eva_estado`) en *Envío Eva*.

**Los avisos son de Eva, no de agencia.** `applyTracking` ganó un hook `alAvanzar` (§64) que
reemplaza SOLO el mensaje: los de `onTransition` dicen «tu agencia», y un domicilio no tiene. La
regla de solo-hacia-adelante y la escritura siguen siendo las mismas para todos los couriers.

**Idempotencia.** La fase es solo-hacia-adelante. Para lo que no es fase, el webhook compara
`eva_estado` + `eva_estado_at` con lo que llega: mismo estado y misma hora = mismo evento, y no
se vuelve a escribir en el chat. Cada visita fallida sí cuenta (otra hora = otra visita).

**La firma.** `X-EVA-Signature` = HMAC-SHA256 hex del **body crudo** con el secret, comparación
en tiempo constante (`firmaEvaValida`, probada con `firmarComoEva`). Sin firma válida, 401 — lo
que pide su manual. Eva no reintenta un 4xx, y está bien: un impostor no merece reintento.

## 6. Qué ve cada uno

**El vendedor** (`EnvioEva.tsx`, debajo de la dirección): el tracking, el estado crudo en
palabras, tres pasos (registrado · en ruta · entregado), **Actualizar** (le pregunta el estado a
Eva y lo refleja; dice «sin novedad» cuando no cambió, porque un botón que no hace nada visible
se lee como que falló), **Imprimir rótulo** (PDF por el dominio de la marca), la foto de la
entrega si Eva la mandó, y cuando falló: el motivo con nombre y «Reintentar». Es su propio componente y no un tercer modo de `TrackingBar`: aquella es toda de
recojo en agencia (número, código, clave, formulario del comprobante) y nada de eso existe acá.

**El comprador** («Ver pedido»): el recorrido de domicilio de siempre —preparando · en camino ·
entrega— con una línea más en «en camino»: «Con motorizado de Eva Courier.» Sin documento que
enseñar. Los avisos le llegan por el chat.

**Conexiones**: Eva es la **diecinueve** del catálogo, crítica (si se cae, no se despacha),
`alcance: 'plataforma'`, secreto `EVA_API_KEY`. Su chequeo: un `GET` a un tracking que no
existe — 404 = la llave entró y Eva contestó; 401/403 = la llave no sirve. Gratis y sin crear
nada. Eventos: `reparto.registrar`, `reparto.rotulo`, `reparto.storage`, `webhook.evento`.

## 7. Puesta en marcha

1. Correr `setup-kross.sql` §64 (columnas `eva_*`, bucket `eva-rotulos`).
2. En el portal de Eva (`app.evacourier.pe` → *Apps e Integraciones*): generar la **API Key**
   (se muestra una sola vez) y configurar el **webhook** con la URL
   `https://ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/eva-webhook`; Eva devuelve el secret,
   también una sola vez.
3. Secrets de las funciones: `EVA_API_KEY`, `EVA_WEBHOOK_SECRET`. Para el sandbox, además
   `EVA_API_BASE=https://api-test.evacourier.pe` (y la llave del sandbox).
   ⚠️ **Pega la llave sola**: sin comillas, sin espacios y sin copiar un marcador de ejemplo. La
   primera prueba real (16-set-2026) murió porque el secret llevaba un `…`: un header no admite
   nada fuera de ASCII y `fetch` revienta antes de salir. Desde entonces `problemaDeApiKey` lo
   dice con palabras en el pedido y en *Conexiones*; antes era un TypeError mudo.
4. Desplegar: `eva-order`, `eva-webhook` (**`--no-verify-jwt`**), `flow-confirm`
   (`--no-verify-jwt`), `order-manage`, `get-session`, `integraciones`.
5. En *Marca → Entrega a domicilio*, encender **Eva Courier · Lima y Callao**.
6. Un pedido de prueba a domicilio en Lima, pagado → en el pedido aparece *Envío Eva* con el
   tracking y el rótulo; en app.evacourier.pe aparece el pedido con `code = ORD-…`. Tocar
   «Enviar test» del webhook en el portal → `eva-webhook` responde `{ok, pong}`.
7. **Para producción**: cambiar `EVA_API_BASE` (o quitarlo) y la llave. Nada más cambia.

## 8. Lo que no hace (🔮)

- **Barrido AUTOMÁTICO de respaldo.** La consulta manual ya existe (el botón Actualizar, que usa
  el mismo `reflejarEstadoEva` que el webhook); lo que falta es correrla sola para los pedidos
  abiertos, en un pg_cron como `shalom-tracking-sync`. Mientras no exista, un webhook perdido se
  recupera con un toque, pero alguien tiene que darlo.
- **Cliente tipo ALMACEN** (Eva guarda el stock y descuenta por SKU). Kross es para marcas con
  stock en su local; RECOJO es el modelo.
- **Lote** (`POST /api/v1/orders/bulk`, hasta 200). Cada venta dispara una llamada; no hay carga
  masiva que justifique el lote.
- **Cobro mixto** (`metodo_pago_2`). Se lee del webhook y se guarda en el mensaje al equipo; no
  se concilia contra `cobros`.
- **Rótulo `sticker`.** `FORMATO_DE_ROTULO = 'A4'` es una constante; quien tenga ticketera la
  cambia. Un campo por marca cuando haga falta, no antes.
- **Rotar el secret** (`POST /api/v1/webhook/rotate-secret/`). Se hace desde el portal.
- **Demo.** El generador de la tienda de ejemplo no tiene pedidos a domicilio (todos son
  `AGENCIA_*`), así que Eva no se enseña en el demo. Es una brecha de paridad **anterior** a
  Eva —el domicilio entero no está en el demo— y se anota como tal, no se parcha tocando el
  azar del generador.

### ¿Y una guía para el comprador? No, y es a propósito

Eva entrega **un solo documento: el rótulo**, y es del vendedor —se pega al paquete para que el
motorizado sepa a dónde va—. No hay guía para el comprador, y no hace falta inventarle una:

| | Agencia (Shalom) | Domicilio (Eva) |
|---|---|---|
| Quién se mueve | **El comprador** va al mostrador | **El motorizado** va a su puerta |
| Qué presenta | Guía con QR + DNI + clave | Nada |
| Por eso | La guía es indispensable | Un documento que nadie le va a pedir |

Lo que el comprador sí tiene es **su pedido con el recorrido** (preparando → en camino →
entrega), que se mueve con lo que Eva reporta y le avisa por el chat. Eso es el equivalente
funcional de la guía: saber dónde está su paquete. Darle además un PDF que no usa en ningún lado
sería ruido con aspecto de documento — y peor, le enseñaría a esperar que alguien se lo pida.

## 9. Lo que enseñó la primera prueba real (16-set-2026)

Cuatro intentos contra el sandbox, y ninguno falló por el payload. Vale anotarlos porque los dos
primeros se repiten con **cada cuenta nueva** y el mensaje del proveedor no los explica solo.

| # | Qué contestó | Qué era | Cómo se ve ahora |
|---|---|---|---|
| 1 | `SIN_RESPUESTA` · `TypeError: 'headers' … is not a valid ByteString` | La `EVA_API_KEY` guardada tenía un carácter fuera de ASCII: un `…` copiado del comando de ejemplo. `fetch` revienta **antes de salir** y no dice cuál header | `problemaDeApiKey` la revisa antes y nombra al culpable («trae puntos suspensivos», «U+200B») en el pedido y en *Conexiones* |
| 2 | `RECHAZO 403` con un texto largo de negocio | **No es auth**: la llave entró. Era la ficha de cliente de Eva incompleta — faltaban contacto, dirección de recojo principal con distrito, billetera Yape/Plin y cuenta bancaria con CCI | El mensaje llega entero al chat (600 caracteres, no 300: a 300 se cortaba justo antes de la cuenta bancaria) |
| 3 | `OK 201` | El reparto quedó registrado, y el rótulo bajó al bucket en la misma corrida | — |
| 4 | **Actualizar**: `OK 200` y «contestó sin un estado que leer» | El `GET` volvió 200 pero `status` no estaba en la raíz como enseña el manual — y el código descartó el cuerpo sin anotarlo, así que no se sabe qué forma tenía | `leerConsultaEva` acepta las envolturas usuales (`data`/`order`/`result`/`results[0]`), el estado como objeto o bajo otro nombre, y solo sin nada de eso cae al track más reciente **por fecha**. Y si aun así no lee, el cuerpo crudo va a `api_events` (1.200 caracteres) y el botón da la referencia `KX-…` para verlo en *Conexiones* |

Dos cosas que el 201 confirmó de paso:

- **El distrito traduce.** La dirección del pedido era `por ahí cerca 123, Miraflores` y viajó
  como `MIRAFLORES`. Eva no valida la calle —acepta cualquier texto—; lo que valida es el
  distrito, que es exactamente donde su lista y el padrón del INEI se separan.
- **Una dirección SIN VERIFICAR se registra igual, y sin GPS.** `armarPedidoEva` solo manda
  `gps` cuando el pin está verificado: un pin sin confirmar mandaría al motorizado a otra casa.
  Eva lo aceptó sin coordenadas, como su manual dice (`gps` es opcional).

**Un 403 de Eva no siempre es la llave.** Su API usa el mismo código para «tu llave no sirve» y
para «tu cuenta está incompleta», y el segundo trae el detalle en `message`. Por eso el cuerpo
crudo se guarda en `api_events` (`detailMax: 900`): sin él, este intento se habría leído como un
problema de credenciales y la tarde se habría ido por el camino equivocado.
