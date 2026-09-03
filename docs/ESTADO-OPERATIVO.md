# Estado operativo

> **Última verificación contra la base: 29-ago-2026** · **texto actualizado: 02-sep-2026.**
> Son dos fechas distintas a propósito: la primera es la última vez que alguien corrió la
> consulta de abajo contra producción, la segunda cuándo se escribió esto. Un cambio de código
> mueve la segunda; solo mirar la base mueve la primera.
>
> Qué marca está viva, qué le falta, y qué deudas hay abiertas. Lo que el código no dice.

## Cómo leer esto (y por qué no miente)

**La base de datos manda.** Este doc **no** es la fuente de verdad de los flags: los refleja
con fecha, y lleva lo que la BD no guarda — el *porqué*, el *siguiente paso* y *quién lo
destraba*. Un doc que copia a mano el estado de producción miente en una semana.

Para refrescar la tabla de abajo en cinco segundos, en el SQL Editor de
[`ofdjghntvmrdfjhazfvz`](https://supabase.com/dashboard/project/ofdjghntvmrdfjhazfvz):

```sql
select s.id, s.slug, s.nombre, s.active,
       s.pay360_enabled, s.pay360_env, s.pay360_payment_prefix,
       s.pay360_business_id is not null as conectado,
       s.home_delivery_enabled, s.checkout_ab_mode, s.wa_enabled,
       (select count(*) from products p where p.store_id = s.id) as productos,
       (select count(*) from order_sessions o where o.origin_store_id = s.id) as pedidos
from stores s order by s.id;
```

Si el resultado no cuadra con la tabla, **gana el resultado**: actualiza el doc y cambia la
fecha de arriba.

## Deploys pendientes (29-ago-2026)

**Léelo primero.** La lista que se arrastraba desde el 21-ago **se vació el 29-ago de
madrugada** —SQL corrido y 25 funciones desplegadas—, y esto es lo que entró después.

### Flow: las llaves son de cada marca, no de Kross · SQL + 3 funciones (02-sep-2026)

**Qué pasó.** El riel se construyó asumiendo que Kross sería *comercio integrador* de Flow y
que una llave de plataforma daría de alta a las marcas como comercios asociados. Al primer
intento real, Flow respondió **`Commerce is not integrator`**: ser integrador es un permiso que
ellos habilitan sobre una cuenta, y la de Kross no lo tiene. El modelo pasa a ser **una cuenta
de Flow por marca, con sus propias llaves**, pegadas desde *Marca → Cobros*.

**Qué se ve si no entra:** nada — Flow sigue apagado en todas las marcas y todo cobra por
360pay. Lo que NO se puede hacer hasta desplegar es configurar Flow en ninguna marca.

**Primero el SQL** (bloque §41; idempotente):

```sql
alter table store_secrets add column if not exists flow_api_key            text;
alter table store_secrets add column if not exists flow_secret_key         text;
alter table store_secrets add column if not exists flow_secrets_updated_at timestamptz;
```

**Después las funciones:**

```
supabase functions deploy manage-store  --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy flow-order    --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy flow-confirm  --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
```

> **Los secretos `FLOW_API_KEY*` de plataforma ya no los lee nadie.** Se pueden borrar cuando
> se quiera (`supabase secrets unset FLOW_API_KEY FLOW_SECRET_KEY FLOW_API_KEY_LIVE
> FLOW_SECRET_KEY_LIVE`), sin apuro: sobran, no estorban. Las llaves de Kross Shop se vuelven a
> pegar en el panel, que es donde ahora viven.

> ⚠️ **La comisión de Kross no tiene mecanismo en Flow.** Sin split, Flow le liquida a la marca
> el monto menos su comisión y Kross no cobra nada. En Kross Shop da igual —la cuenta es de
> Kross—, pero **antes de encender Flow en una marca cliente hay que decidir cómo se le cobra.**
> Es una decisión comercial, no un pendiente de código.


### Flow Pagos, el segundo riel · 4 funciones (02-sep-2026)

**El grueso ya entró el 02-sep**: el SQL (§39 y §40) corrido, y desplegadas `pay360-coupon`
—con el arreglo del `columnasDe` que reventaba cada emisión de cupón—, `pay360-webhook`,
`flow-order`, `flow-confirm`, `flow-return`, `register-buyer`, `manage-store`, `get-session`
y `get-store-sessions`. El panel ya muestra el bloque de Flow, apagado.

**Falta esto, y no corre prisa.** El merge con `main` cambió `_shared/tracking.ts`: el cobro
automático en origen pasó de `payment_provider === '360PAY'` a `esRielEnLinea(payment_provider)`
—la misma condición que usa el panel—, así que las funciones que empaquetan ese módulo cargan
una versión nueva. Sin desplegarlas rige la vieja, que **con Flow apagado se comporta idéntico**;
lo que quedaría fuera es la tarjeta del saldo en origen para un pedido de Flow, y todavía no
hay ninguno.

```
supabase functions deploy shalom-webhook       --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
supabase functions deploy shalom-tracking-sync --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy olva-tracking        --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy olva-tracking-sync   --project-ref ofdjghntvmrdfjhazfvz
```

**Y los secretos de Flow, cuando lleguen** (Kross es el comercio integrador; son de plataforma,
nada va a `store_secrets`):

```
supabase secrets set FLOW_API_KEY=… FLOW_SECRET_KEY=… --project-ref ofdjghntvmrdfjhazfvz
supabase secrets set FLOW_API_KEY_LIVE=… FLOW_SECRET_KEY_LIVE=… --project-ref ofdjghntvmrdfjhazfvz
```

Lo que falta para cobrar por Flow **no es código**: la cuenta de sandbox, que Flow apruebe el
one-shot, conectar Kross Shop desde el panel —**eligiendo el ambiente antes**, que conectar es
de un solo sentido— y **resolver la unidad de `amount` para PEN** con una orden de S/10 mirando
cuánto muestra su checkout. Ver `docs/12-FLOW.md` §7.

### El vencimiento del cupón · SQL + `pay360-coupon` + `get-session` (31-ago-2026)

**Qué se ve si no entra:** el botón *Enviar tarjeta de pago* aparece siempre (los cupones sin
fecha cuentan como vigentes, a propósito), pero **nadie sabe cuándo caduca ninguno** y el camino
de *"venció · generar otro código"* no se activa jamás. Y los cupones nuevos siguen naciendo a
7 días en vez de 30.

**Primero el SQL** (bloque §35; idempotente):

```sql
alter table order_sessions add column if not exists pay360_coupon_expires_at       timestamptz;
alter table order_sessions add column if not exists pay360_saldo_coupon_expires_at timestamptz;
```

**Después las funciones:**

```
supabase functions deploy pay360-coupon --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-session   --project-ref ofdjghntvmrdfjhazfvz
```

> Las filas que ya existen quedan con la fecha en NULL y eso **no las bloquea**: no saber si un
> cupón caducó no es saber que caducó. Se irán llenando conforme se emitan cupones nuevos.

### El modelo de cobros · SQL + 4 funciones (31-ago-2026)

**Qué se ve si no entra:** nada cambia en pantalla — y eso es lo que se busca de este paso. Sin
el SQL, `get-store-sessions` y `get-session` piden una tabla que no existe: el tablero **no se
cae** (se sigue sin la lista y el panel usa las columnas de siempre), pero la mudanza no arranca
y los cobros nuevos no quedan registrados como filas.

**Primero el SQL** (bloque §36: tabla + traspaso de lo que ya hay; idempotente):

```sql
-- correr el bloque §36 completo de supabase/setup-kross.sql
```

**Y comprobar que el traspaso cuadra** — las dos cifras tienen que dar igual:

```sql
select
  (select coalesce(sum(advance_amount),0) from order_sessions where upper(payment_verification) = 'MATCHED')
+ (select coalesce(sum(saldo_amount),0)   from order_sessions where upper(saldo_verification)   = 'MATCHED') as por_columnas,
  (select coalesce(sum(monto),0) from cobros where estado = 'MATCHED')                                        as por_cobros;
```

**Después las funciones:**

```
supabase functions deploy get-store-sessions --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-session        --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-coupon      --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-webhook     --project-ref ofdjghntvmrdfjhazfvz
```

> Si la consulta de arriba NO cuadra, **no sigas**: avísame con los dos números. Que la tabla
> diga una plata distinta a las columnas es lo único que este paso no puede permitirse.

### La guía manual con su clave, el reintento por API, y el demo sin estados imposibles · 2 funciones, sin SQL (01-set-2026)

**Qué se ve si no entra:** el frontend sale solo con el merge (el formulario nuevo, el candado
del cobro, el demo entero), pero **la clave de la guía manual no se guarda** (`order-manage`
viejo la ignora) y **el botón "Reintentar por el API" devuelve error** (`shalom-order` viejo
rechaza el flag). Sin desplegar nada, el demo enseña ambos flujos completos.

Lo que entra:

- **El formulario de registrar envío pide los TRES datos del comprobante físico** — nro. de
  orden, código y **clave de recojo** (`set_tracking` con `clave`, solo Shalom, 4 dígitos). Con
  la clave guardada, la guía manual entra al mismo circuito que la de API: el panel la enseña
  al equipo y el chat la entrega solo contra el saldo pagado (o con la guía, si no debía nada).
- **Y solo aparece en pedidos COBRADOS**: el adelanto es lo que autoriza a despachar (misma
  regla que `shalom-order`). Antes, un pedido recién creado ya ofrecía "Registrar envío" — la
  captura de "Wilder Flores".
- **El expediente `FAILED` se explica y ofrece dos salidas**: copiar la guía emitida por fuera,
  o **"Reintentar por el API de Shalom"** (`order-manage` · `retry_shalom` → `shalom-order` con
  `retry: true`, que re-reclama el candado SOLO desde `FAILED`). El botón existe para el
  después: se corrigió el producto en Shalom Pro, volvió el servicio.
- **`shalom-order` reintenta solo lo reintentable, hasta 3 intentos en total**: un error del
  servidor (5xx) se reintenta con backoff (2 s, 4 s) y **nunca a ciegas** — sin clave de
  idempotencia, antes de cada re-emisión pregunta si la orden ya existe (la consulta de
  `reconciliar`). Un 4xx no se reintenta: repetir lo inválido no lo vuelve válido. El botón
  manual aparece recién cuando ese camino se agotó (el `FAILED`).
- **La alerta "⚠️ Guía manual" se apaga al registrar la guía** (venga a mano o por reintento):
  quedaba prendida para siempre sobre un pedido resuelto (`esperaGuiaManual`).
- **El demo deja de fabricar estados imposibles** (la regla: lo que el demo enseña es lo que la
  tienda real hace):
  - **Nadie antes de `confirmado` tiene la plata cruzada** — el webhook escribe
    `stage: 'confirmado'` en el mismo acto de cruzar, así que "Pedido creado" con el adelanto
    pagado (la captura de Wilder) no puede existir. La tirada del generador se sigue haciendo
    y se ignora (el azar de los demás pedidos no se corre).
  - **El hilo de `validando` ya no dice "Adelanto verificado"** — validando es justamente "el
    yapeo que todavía no cuadra".
  - **`shalom_order_status` solo en pedidos Shalom** — un FAILED de Shalom en un pedido Olva
    era un estado que `shalom-order` no puede producir (descarta Olva antes de reclamar).
  - Y registrar a mano o reintentar **enseñando** funciona en el dispositivo, con los mismos
    mensajes del servidor (`guiaManualEnDemo` / `reintentoShalomEnDemo`): la manual sin PDF
    (su botón cae a la hoja de la app), la reintentada con el voucher de muestra.

```
supabase functions deploy order-manage --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy shalom-order --project-ref ofdjghntvmrdfjhazfvz
```

### La clave del demo ya no se entrega con saldo de upsell pendiente · solo frontend (01-set-2026)

**Nada que desplegar.** El reporte fue una captura ("Luis Núñez"): un pedido con **"Saldo sin
pagar S/ 180"** en el panel y **la clave de recojo ya entregada** en el chat. Era el upsell del
generador: la guía calculaba su saldo con el precio BASE, así que a quien pagó el total base y
llevaba upsell le decía *"ya pagaste el total"* y le soltaba la clave — con el panel cobrándole
un saldo. Y el upsell viaja **en el paquete**, o sea que existía antes de registrar la guía: la
guía debía cobrar el total de ese momento (`valorPedido`) y retener la clave. Ahora el invariante
está probado sobre el generador entero: **ningún hilo con la clave entregada sigue debiendo**.

> La tienda real no tenía este bug — `registrarGuia` cobra contra `product_price` de hoy. El
> caso real que sí existe (un upsell DESPUÉS de entregada la clave) sigue siendo la deuda ya
> anotada abajo: un saldo nuevo que la pasarela no cobra sola.

### La cobranza empieza en origen: la tarjeta del saldo la manda el tracking · 4 funciones, sin SQL (01-set-2026)

**Qué se ve si no entra:** el paquete entra a la agencia de origen y el chat sigue mudo — ni el
aviso de que la guía ya es oficial (que la tarjeta de la guía promete) ni la tarjeta de pago del
saldo. La cobranza sigue esperando a `EN_DESTINO` como hasta hoy. El demo enseña el flujo entero
sin desplegar nada.

Lo que entra (`onTransition` en `_shared/tracking.ts` — el reflejo COMPARTIDO, así que vale igual
venga por webhook o por barrido, Shalom u Olva):

- **`EN_ORIGEN` ahora habla**: el aviso del momento (`mensajeDeOrigen`, una sola copy) — en
  Shalom, la pre-guía volviéndose oficial con las palabras que la guía prometió ("por acá te
  avisamos apenas pase").
- **Y cobra**: si el pedido debe su saldo, sale sola **la tarjeta de pago** (`type: 'cobro'`),
  la MISMA que manda el vendedor a mano — la copy se mudó a `_shared/cobro-por-chat.ts` (con
  `soles`; el frontend re-exporta) para que el cobro automático y el manual no puedan decir
  frases distintas. El comprador la paga DE VERDAD: su cupón se emite al tocar el botón, como
  siempre. Condiciones: adelanto cruzado, saldo sin cruzar, tienda en `360PAY`, y ninguna
  tarjeta del saldo ya en el hilo (el vendedor pudo adelantarse).
- **De paso, un bug real**: `saldoOf` no sabía del saldo ya pagado — un pedido con el saldo
  cruzado recibía en `EN_DESTINO` un "paga tu saldo de S/X" por una deuda que no existía. Ahora
  el saldo MATCHED cuenta como pagado (misma regla que `registrarGuia`).
- **El demo, en paridad**: los hilos del generador que pasaron por origen llevan el aviso y la
  tarjeta (pagada en los que pagaron, cobrando en los que deben); avanzar la fase enseñando
  deja los mismos avisos (antes el chat quedaba mudo), y en `EN_ORIGEN` con deuda la tarjeta
  sale y **el cliente la paga a los diez segundos** — acuse, comprobante y clave de recojo, la
  cascada entera del webhook.

```
supabase functions deploy shalom-webhook       --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy shalom-tracking-sync --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy olva-tracking-sync   --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy olva-tracking        --project-ref ofdjghntvmrdfjhazfvz
```

> La tarjeta automática no manda push propio todavía: llega como mensaje (y en vivo si el chat
> está abierto). El empujón con push/WhatsApp puede montarse después sobre el mismo mensaje,
> como la plantilla de recojo de `EN_DESTINO`.

### Los estados de Shalom completos y la clave de recojo · 4 funciones, sin SQL (01-set-2026)

**Qué se ve si no entra:** el frontend sale solo con el merge (la barra del envío ya muestra
**Registrado** encendido en la pre-guía, y los identificadores se llaman como en el voucher:
*Nro. de orden* y *Código*), pero **la clave de recojo no aparece en el panel** (`get-session`
viejo no la manda) y **pagar el saldo no la suelta por el chat** (`pay360-webhook` viejo). El
demo enseña todo el flujo sin desplegar nada.

Lo que entra:

- **La barra del envío tiene su primer estado: `Registrado`** — encendido mientras la guía es
  pre-guía (emitida, sin fase del courier). Antes la barra salía entera apagada con "Esperando el
  primer estado…", que se lee como "no pasó nada" justo cuando el envío acaba de existir. Con la
  nota de qué significa: pre-guía en Shalom, guía esperando reporte en Olva.
- **Los identificadores hablan como el voucher de Shalom** (`idsDeGuia`, una sola definición):
  *Nro. de orden* y *Código* en el chat, la barra y la hoja de guía. En Olva la guía se sigue
  llamando guía.
- **La clave de retiro se ve en el panel del vendedor** (barra del envío), detrás del candado
  FUERTE de `get-session` (`puedeLeerInterno`, el mismo de los comentarios internos — nunca por
  `viewer=seller`, que se escribe con el token del comprador).
- **El pago del saldo suelta la clave solo, por el chat** (`mensajeDeClave`): el acuse promete
  "Te enviamos tu clave de recojo por acá" y ahora el webhook cumple. Y si el pedido ya no debía
  nada al registrarse la guía (pagó el total, o el saldo cruzó antes que la guía manual), la
  clave sale **junto con la guía** (`registrarGuia`). Solo pedidos que la tienen: la guía
  registrada a mano no eligió clave — la suya vive en el comprobante físico y la manda una
  persona, como siempre.
- **El demo, en paridad**: el generador deriva código y clave del número (cero tiradas nuevas),
  los hilos con saldo pagado llevan su acuse con comprobante y su clave, los que deben no la
  tienen, y pagar el saldo enseñando la suelta a los diez segundos igual que el webhook.

```
supabase functions deploy get-session    --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-webhook --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy order-manage   --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy shalom-order   --project-ref ofdjghntvmrdfjhazfvz
```

> Con esto se cierra la deuda "la clave no tiene quién se la entregue": la entrega el pago.

### La guía de muestra del demo · solo frontend (01-set-2026)

**Nada que desplegar.** El botón *Ver mi guía de Shalom* del **demo** abre un voucher real de
Shalom (autorizado por el dueño; vive en el Storage del proyecto Neural, bucket `shalom-guias`).
La URL está en `GUIA_DEMO_PDF` (`src/lib/demo/cambios-demo.ts`) — para cambiar la muestra basta
reemplazarla. Las guías **Olva** del demo van sin PDF (no hay documento que enseñar): su botón
cae a la hoja de guía de la app.

### La guía FORMAL de Shalom en PDF · SQL + 1 función (01-set-2026)

**Qué se ve si no entra:** el botón *Ver mi guía de Shalom* sigue abriendo la hoja de guía de la
app (el respaldo). Nada se rompe.

La doc de la API (subida a la sesión el 01-set) lo confirma: `GET /v1/orders/{ose_id}/voucher`
devuelve **la guía formal como PDF binario** — no hay URL que guardar. Así que `shalom-order` la
descarga al emitir la guía (30 s de timeout propio, best-effort: un PDF que no baja jamás retrasa
el registro) y la sube al bucket **`shalom-guias`**; el mensaje del chat lleva esa URL pública.
Es el mismo patrón del proyecto Neural con su propio bucket `shalom-guias`.

**1 · El SQL** (bloque §38; idempotente):

```sql
insert into storage.buckets (id, name, public)
values ('shalom-guias', 'shalom-guias', true)
on conflict (id) do nothing;
```

**2 · La función:**

```
supabase functions deploy shalom-order --project-ref ofdjghntvmrdfjhazfvz
```

> La guía registrada **a mano** sigue sin PDF (no pasa por el generador): su botón abre la hoja
> de la app. Y en el demo igual — el demo no fabrica documentos de Shalom.

### La guía en los hilos del demo, la hoja de guía, y el botón de saldo que no cobraba · solo frontend (01-set-2026)

**Nada que desplegar.**

- **Los hilos del demo con guía llevan su tarjeta** (pre-guía, dónde seguirla, saldo), con el botón
  *Ver mi guía de Shalom/Olva*. Sin PDF del courier, el botón abre la **hoja de guía de la app**
  (`/guia/<token>`): la misma regla en demo y en real — el PDF si la API lo trajo; si no, la hoja,
  armada con los datos que el panel ya enseña. Con fases reportadas deja de decir pre-guía.
- **De `confirmado` en adelante ya no hay adelantos sin pagar en el demo.** El sorteo dejaba un 8%
  en ámbar dentro de Confirmado — un pedido diciendo dos cosas a la vez (lo que se vio con "Luis
  Castillo"). La tirada se sigue haciendo (no correr el azar del resto) y se ignora.
- **Bug real de paso:** `get-session` no devuelve `token`, así que el botón *Pagar S/X con Yape*
  del comprador era un **no-op silencioso** en pedidos reales (`pedido.token` llegaba undefined y
  `pagar()` retornaba sin hacer nada). Ahora las páginas ponen el token de su URL en la sesión al
  cargar. ⚠️ Ojo: esto explica cualquier reporte de "el botón de pagar el saldo no hace nada".

### El push del pago recibido · 2 funciones (01-set-2026)

**Qué se ve si no entra:** todo igual que hoy — el acuse llega al chat y en vivo, pero el
comprador con la app cerrada no se entera hasta abrir.

`pay360-webhook` ahora manda el **push** con el acuse ("✅ <marca> · Pago recibido") apenas cruza
un cobro — adelanto, saldo o extra. Abre directo el chat del pedido, donde está el botón del
comprobante. El aviso vive en **`_shared/notificar.ts`** (se mudó desde `seller-send-message`,
que ahora lo importa): push primero, WhatsApp de respaldo si `WA_AUTO_FALLBACK=on`, todo en
`notifications_log`. Best-effort siempre — el 2xx del webhook jamás depende de un aviso.

```
supabase functions deploy pay360-webhook      --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy seller-send-message --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL.

> Deuda anotada: `register-buyer`, `send-message`, `create-call-token` y `seller-call-token`
> conservan sus copias viejas del push. Migrarlas a `_shared/notificar.ts` es una tarea aparte.

### La pre-guía de Shalom, con su PDF · 2 funciones (01-set-2026)

**Qué se ve si no entra:** el mensaje de guía sigue saliendo como siempre (la píldora con la copy
vieja) y sin el botón del PDF. Nada se rompe.

Al registrarse la guía —a mano o por el generador automático— el comprador recibe una **tarjeta**
que explica que es una **pre-guía** (se vuelve oficial cuando el paquete entra a la agencia de
origen y por el chat se le avisa), que puede seguir su envío desde la app —sincronizada con su
guía— o en Shalom, y qué pasa con su saldo. Si la guía la emitió la API, lleva además el botón
**"Ver mi guía de Shalom"** que abre el PDF de la orden (la URL se extrae de la respuesta de
`POST /v1/orders`, sin casarse con el nombre del campo). La guía registrada **a mano** no trae
PDF: misma tarjeta, sin botón.

```
supabase functions deploy shalom-order --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy order-manage --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL (el mensaje usa `media_url`, que existe desde siempre).

> ⚠️ **Por confirmar con una guía real**: la doc de la API de Shalom no la puedo leer desde este
> entorno (el proxy bloquea el dominio), así que el extractor del PDF acepta cualquier URL `.pdf`
> o un campo que se llame rótulo/etiqueta/comprobante. Si la primera guía automática sale sin
> botón, pide los logs de `shalom-order` y ajustamos el extractor al campo real.

### El comprobante en los hilos viejos, y el ícono sin jerarquía · solo frontend (01-set-2026)

**Nada que desplegar.**

- **Todos los pedidos que ya pagaron su adelanto (o el total) enseñan su comprobante en el
  chat**, aunque hayan pagado antes de que existiera. No se rellena la base: el aviso que ya
  estaba en el hilo —el *"✅ ¡Recibimos tu adelanto…"* del webhook, el *"Adelanto verificado"* de
  los hilos del demo— se reconoce por su propia copy (`cobroDelAviso`) y se pinta como la tarjeta
  con el botón, en su misma posición del hilo. Igual para saldos y extras pagados.
- El ícono de **billetera** deja el verde: mismo par de colores que la oferta. Son tres maneras
  de escribir en el hilo y ninguna manda sobre las otras.

### El demo cobra con código de pago y el acuse sale sin recargar · solo frontend (01-set-2026)

**Nada que desplegar.**

- El saldo y el extra pagados en demo salían **sin "Código de pago"**: el rastro solo lo sembraba
  el generador. Ahora el pago del demo lo siembra igual — el saldo con la serie del generador
  (`KSH6xxx` en `saldo_trace`) y el extra con **el código del comprador**, que es el que usa la
  tienda real.
- El acuse con el comprobante quedaba guardado pero **la pantalla no lo pintaba hasta recargar**:
  el segundo tiempo parcheaba solo la sesión. Ahora relee todo por la puerta del demo
  (`reloadSession`), mensajes incluidos.

En la tienda REAL el equivalente es el `broadcast` del webhook (PR #130): con `pay360-webhook`
desplegado, el acuse le llega en vivo a los dos chats.

### El saldo sin cupón en el DEMO · solo frontend (31-ago-2026)

**Nada que desplegar.**

Con la tarjeta del saldo sin cupón, el demo pasó a recorrer un camino que antes no existía: un
pedido cuyo saldo **no tiene fila ni `saldo_amount`**, porque esa columna solo la escribe la
emisión del cupón. Y pasaba mal por partida doble — anunciaba *"¡Recibimos tu saldo de S/0!"* y la
tarjeta del saldo, en vez de ponerse verde, **desaparecía** (`saldoPorCobrar` deja de devolverla
en cuanto el saldo está cruzado, y no había fila que ocupara su lugar).

Ahora `saldoPagadoEnDemo` deriva el monto con `saldoDelPedido` y **crea la fila del saldo si no
existe**, que es justo lo que hace el webhook cuando le entra un cupón sin fila previa.

### El saldo sin cupón, y el botón invisible · solo frontend (31-ago-2026)

**Nada que desplegar.** Sale con el merge, como todo el frontend.

Dos cosas que solo se veían mirando la pantalla:

- **El texto del botón del comprobante no se veía.** `--ok-bg` y `--ok-fg` son **el mismo lima** en
  tema oscuro; el color de texto válido sobre el lima es `--ok-on`, y así lo usa el resto del
  panel. Le pasaba igual al "Pago recibido" del comprador.
- **Un pedido con el adelanto cruzado y el saldo sin pedir no enseñaba nada del saldo.** El cupón
  del saldo **no lo emite nadie del servidor**: se emite cuando el comprador toca pagar. Como el
  panel pinta la lista de cobros y esa fila todavía no existe, no había ni monto pendiente ni
  botón para mandarle la tarjeta — el vendedor esperando a que el cliente hiciera solo lo que él
  tenía que pedirle. Ahora sale como tarjeta ámbar aunque no sea una fila (`saldoPorCobrar`), y
  dice lo que es: *"todavía no se le ha pedido"*.

### El webhook avisa por el canal · `pay360-webhook` (31-ago-2026)

**Qué se ve si no entra:** un cobro cruza y **en la pantalla abierta no pasa nada**. El mensaje
con el botón del comprobante entra al hilo en la base, pero ni el chat del comprador ni el panel
se enteran hasta recargar. Es justo lo que uno mira al probar un cobro, así que se ve como que
el comprobante no salió.

`pay360-webhook` escribía en la base y no avisaba a nadie: era el único de los tres escritores del
chat sin `broadcast`. Ahora manda el acuse por `order:<id>` —solo el del comprador, nunca el
mensaje interno— y un `cobros_update` para que la plata se vuelva a pedir por la puerta que la
calcula.

```
supabase functions deploy pay360-webhook --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL.

### El comprobante de pago · 3 funciones, sin SQL (31-ago-2026)

**Qué se ve si no entra:** el botón *Ver mi comprobante* no aparece —el mensaje que lo lleva lo
escribe `pay360-webhook`— y si alguien abre `/comprobante/<id>` a mano, la página responde *este
comprobante no existe*, porque `get-comprobante` todavía no está desplegada. El resto del panel,
igual. **En el demo sí funciona sin desplegar nada**: el comprobante de la tienda de ejemplo se
arma en el dispositivo.

**Sin SQL.** La columna que hace falta (`chat_messages.cobro_id`) es la del bloque §37, que ya
corriste con *Cobrar algo más*.

```
supabase functions deploy get-comprobante --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-webhook  --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-session     --project-ref ofdjghntvmrdfjhazfvz
```

> `get-comprobante` es **nueva**: la primera vez, `supabase functions deploy` la crea sola.
> `get-session` se redespliega porque su lectura del rastro bancario se mudó a `_shared/rastro.ts`
> —el mismo código que ahora usa el comprobante— y `pay360-webhook` porque es quien manda el
> mensaje con el botón.

### Cobrar algo más · SQL + 5 funciones (31-ago-2026)

**Qué se ve si no entra:** el ícono de billetera aparece en la barra del chat y el cobro **falla**
— `order-manage` responde *Unknown action*. Y si entran las funciones pero no el SQL, el cobro se
crea pero su tarjeta del chat se pinta contra el **saldo** del pedido: monto equivocado y un botón
que abre Yape por otra cosa. **El SQL primero.**

**1 · El SQL** (bloque §37; idempotente, se puede correr dos veces):

```sql
alter table chat_messages add column if not exists cobro_id uuid references cobros(id) on delete set null;

create index if not exists idx_chat_messages_cobro on chat_messages(cobro_id) where cobro_id is not null;
```

**2 · Las funciones:**

```
supabase functions deploy order-manage        --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy seller-send-message --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-session         --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-coupon       --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-webhook      --project-ref ofdjghntvmrdfjhazfvz
```

> `pay360-webhook` es el que **no** puede quedarse atrás: sin él, un cobro extra pagado no calza
> con ninguna de las dos columnas viejas y se marca como **adelanto** — le pisa `advance_amount`
> con el monto del flete y da por cobrado un adelanto que nadie pagó.

### El detalle del pedido en el chat · `order-manage` (31-ago-2026)

**Qué se ve si no entra:** en el demo el mensaje sale con el detalle entero (total, abonado y
saldo), y en una tienda de verdad sigue saliendo el viejo *"Nuevo total: S/175"* a secas. O sea,
el demo prometiendo algo que la tienda no hace.

```
supabase functions deploy order-manage --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL.

### Cobrar el saldo por el chat · nada que desplegar (31-ago-2026)

El botón *Cobrar por el chat* de la tarjeta ámbar manda un mensaje con `type: 'cobro'`.
`chat_messages.type` es texto libre y `seller-send-message` lo pasa tal cual, así que **no hay
SQL ni función que subir**: sale entero con Vercel al mergear.

### El rastro de cada cobro · `get-session` (31-ago-2026)

**Qué se ve si no entra:** en las tarjetas de cobro salen el pedido, el código de pago, el cupón
y la operación —lo que ya guardaba la base— pero **un cupón emitido y sin pagar sigue sin
mostrar nada**: la tarjeta ámbar se queda sin con qué buscarse, que es justo cuando hace falta.

```
supabase functions deploy get-session --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL. El resto del cambio es panel y sale con Vercel.

### Borrar una tienda · `manage-store` (29-ago-2026, tarde)

**Qué se ve si no entra:** en *Tiendas → Editar* aparece la zona roja de "Eliminar esta
tienda" y al confirmar responde `Unknown action` (el panel lo traduce a "la función está
desplegada en una versión anterior"). Nada se borra.

```
supabase functions deploy manage-store --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL. Es el mismo deploy que ya debía `manage-store` por lo del operador, así que cubre las
dos cosas.

> Antes de borrar, mirar qué cuelga de cada tienda — la consulta está al final del bloque §34
> de `setup-kross.sql` y no cambia nada. El servidor rechaza el borrado si la marca tiene un
> solo pedido o cobro, pero verlo antes ahorra el intento.

### El operador opera sin pedir permiso · `manage-store` + `manage-product` (29-ago-2026, tarde)

**Qué se ve si no entra:** el panel le ofrece al operador apagar una tienda y borrar un
producto, y el servidor se lo rechaza con `operador_no_apaga` / `operador_no_borra`. O sea, un
botón que falla — exactamente lo que estas dos funciones dejan de hacer.

```
supabase functions deploy manage-store --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy manage-product --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL. Las dos ya estaban en la lista pendiente del PR #116, así que este deploy cubre
ambas cosas.

### El nivel se cambia desde el panel · `admin-team` (29-ago-2026, tarde)

**Qué se ve si no entra:** en *Equipo → una persona* aparece el selector de **Nivel**, y al
tocarlo responde `400 Unknown action`. El resto del panel funciona igual.

```
supabase functions deploy admin-team --project-ref ofdjghntvmrdfjhazfvz
```

Sin SQL. Y si alguien quedó sin nivel por un alta contra una función vieja, el arreglo ya no
pide base de datos: se sube desde esa misma pantalla. **Desplegada el 29-ago.**

### El alcance de la plataforma · SQL + 11 funciones

**Qué se ve si no entra:** los operadores de Kross (Paolo, Diego) siguen sin poder entrar por
`krossclub.app` — *"Ingresa desde el sitio de tu marca"*, y su marca no existe. Y si el
frontend sale solo (Vercel lo despliega al mergear) el resultado es **peor que el error**: el
login los deja pasar y el menú les enseña Tiendas, pero cada consulta la sigue respondiendo
una función que los mide por `is_super_admin` — lista vacía, "Forbidden" al guardar. Un panel
que se ve bien y no hace nada.

**Primero el SQL** (alinea las filas que quedaron a medias; idempotente, no toca a nadie de
una marca):

```sql
update sellers set is_super_admin = true
where store_id = 'platform' and is_admin = true and coalesce(is_super_admin, false) = false;
```

Y para ver quién quedó cómo:

```sql
select nombre, store_id, role_label, is_admin, is_operator, is_super_admin, active
from sellers where store_id = 'platform' order by is_super_admin desc, nombre;
```

**Después las funciones** — las once que preguntan por el alcance:

```
supabase functions deploy admin-team --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy manage-store --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy manage-product --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy order-manage --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy list-clients --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy delivery-map --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-recordings --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy invite-buyers --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy import-buyers --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy run-campaign --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy retention-metrics --project-ref ofdjghntvmrdfjhazfvz
```

> `order-manage` arregla además algo que **ya estaba roto para el dueño**: su `store_id` es
> `platform`, así que la comprobación "de otra tienda no manda en este pedido" lo dejaba a él
> —y a los operadores— sin poder invitar, reasignar ni expulsar en ningún pedido.

### Lo que sí está al día

Lo de la madrugada del 29-ago, comprobado, no supuesto:

- **SQL** — las 13 columnas y el índice, verificados con una consulta contra
  `information_schema` (§7, `answered_at`, §30 operador, §31 saldo, §32 `mentions`).
- **Funciones** — `supabase functions list` con fecha del 29-ago: el bloque grande a las
  03:52–03:54 y las tres últimas a las 05:35 (`order-manage` v41, `get-store-sessions` v40,
  `get-session` v65).

> `get-session` tardó dos intentos: el primero **falló** y nadie lo habría notado —la versión
> anterior sigue viva y el panel se ve igual—. De ahí salió la red que ahora lo ataja: ver
> [Una función rota no se nota hasta el deploy](#una-función-rota-no-se-nota-hasta-el-deploy-29-ago-2026).

### El SQL, por si hace falta otra vez

Idempotente y en un bloque, para levantar un entorno nuevo o comprobar uno viejo. Correrlo de
nuevo no hace nada.

```sql
alter table chat_messages  add column if not exists call_recording_id uuid references call_recordings(id);
alter table order_sessions add column if not exists answered_at       timestamptz;
alter table sellers        add column if not exists is_operator       boolean default false;
-- El saldo es otra operación, no el mismo pago (bloque §31)
alter table order_sessions add column if not exists saldo_amount               numeric;
alter table order_sessions add column if not exists saldo_verification         text;
alter table order_sessions add column if not exists saldo_matched_at           timestamptz;
alter table order_sessions add column if not exists saldo_event_id             uuid;
alter table order_sessions add column if not exists pay360_saldo_coupon_id     text;
alter table order_sessions add column if not exists pay360_saldo_consumer_code text;
create index if not exists idx_order_sessions_saldo_coupon
  on order_sessions(pay360_saldo_coupon_id) where pay360_saldo_coupon_id is not null;
-- A quién se etiqueta en una nota interna (bloque §32)
alter table chat_messages  add column if not exists mentions jsonb default '[]';
-- El alcance sale de dónde vive (bloque §33). No agrega columnas: alinea las filas
-- de quien está en la plataforma administrando y se quedó sin la bandera.
update sellers set is_super_admin = true
where store_id = 'platform' and is_admin = true and coalesce(is_super_admin, false) = false;
```

### El orden, siempre el mismo

Cuatro pasos, y el orden no es preferencia: cada uno depende del anterior.

| # | Qué | Por qué va ahí |
|---|---|---|
| 1 | **Merge del PR** | Vercel sube el frontend **solo**, al mergear. Por eso cada PR se escribe de modo que el panel aguante sin su backend — y por eso cada uno dice *"qué se ve si no entra"*. |
| 2 | **`git pull`** en tu terminal | `supabase functions deploy` sube lo que hay en TU carpeta. Sin el pull, despliegas la versión anterior y parece que el deploy no hizo nada. |
| 3 | **SQL** en el SQL Editor | PostgREST rechaza el `select` **entero** si falta una columna: una función nueva contra un esquema viejo deja el tablero en blanco. El esquema siempre va delante. |
| 4 | **`supabase functions deploy …`** | Ya con la base lista y el código actualizado. |

Y el SQL **se pega entero**, no se referencia: decir "corre el bloque §36" ya costó una vuelta —la consulta de comprobación se corrió antes de que existiera la tabla y respondió `relation "cobros" does not exist`—. Si un paso necesita SQL, el PR lleva el SQL literal, listo para copiar.

### Y la regla, que es lo que evita que esto se vuelva a llenar

**El frontend sale solo con `main`; las Edge Functions y el SQL NO.** Vercel despliega al
mergear, así que un PR que toque los dos lados deja producción a medias hasta que alguien corra
los comandos. Por eso cada PR que toca `supabase/` dice arriba qué desplegar, y por eso esta
sección existe: es donde se acumula lo que el merge no hizo.

Cuando vuelvas a dejar deploys pendientes, anótalos acá con **qué se ve si no entran** — que es
lo único que hace decidible si corre o espera. Y el orden importa siempre igual: **primero el
SQL, después las funciones**; PostgREST rechaza el `select` entero si falta una columna, así que
una función nueva contra un esquema viejo deja el panel en blanco.

> Los comandos van con el `--project-ref` **literal en cada línea**, sin variable de shell: el
> equipo trabaja en Windows y `REF=...` es sintaxis de bash — en PowerShell falla y el CLI
> termina abriendo el selector interactivo de proyectos.

Para comprobar qué versión quedó viva, la consulta está en
[Cómo comprobar que un deploy entró](#cómo-comprobar-que-un-deploy-entró).

## Marcas

| Marca | `id` | Activa | Cobro en línea | Catálogo | Pedidos |
|---|---|---|---|---|---|
| **Kross Shop** | `st_kross-shop_mt233mx7` | ✅ | ✅ **360pay en producción** (prefijo `KSH`) | 1 producto | 4 |
| **Gadicaf** | `t1` | ✅ | ⛔ sin conectar — ver bloqueo #1 | 1 producto | 1 |
| **Kross** | `platform` | — | — (no vende: es la tienda de la plataforma) | 0 | 0 |
| **Culqi Test** | `store-culqi-test` | ⛔ desarmada | — | 1 producto | 0 |

> **Verificado contra la base el 29-ago-2026.** `platform` lleva el slug `krosstest` y
> `active = false` —resto de las pruebas del principio— y por eso aparecía en *Tiendas*
> pareciendo una marca de pruebas olvidada. **Ya no sale en esa lista**: no es una marca, y ahí
> viven las 3 cuentas del equipo de Kross. Su equipo se administra en *Equipo*.
>
> Cuentas reales ese día: Kross Shop 19 pedidos / 8 cobros / 16 compradores · Gadicaf 1 pedido,
> 4 del equipo, 1 comprador · Culqi Test vacía (1 producto) · `platform` 3 del equipo.

### Kross Shop — la primera marca cobrando en línea

- **360pay conectado y en `live`**, prefijo de código de pago `KSH`, webhook `PAYMENT_PAID`
  activo. **Primer pago real cobrado el 21-ago-2026**: del pago en Yape al pedido cruzado
  pasaron 6.6 segundos, sin intervención.
- **Entrega a domicilio apagada**: solo recojo en agencia. El `DEFAULT` de la columna se
  cambió a `false` el mismo día — una marca nueva no promete entrega a la puerta hasta que
  alguien decida que puede cumplirla.
- A/B del checkout en `SPLIT` (mitad y mitad).
- WhatsApp aún sin activar.

### Gadicaf

- **Sin 360pay conectado**, así que su paso 3 no cobra: el pedido se registra y el adelanto
  lo coordina un asesor por el chat.
- El flujo manual de Yape se eliminó el 21-ago-2026 y **no le costó nada**: ninguna de
  las cuatro tiendas tenía `yape_number` configurado, así que no había número que
  mostrarle a ningún comprador.
- WhatsApp activo. Entrega a domicilio apagada.

### Pixels de anuncios + CAPI — construido, sin configurar por marca (25-ago-2026)

Ya se puede medir la rentabilidad de los anuncios de cada marca: el **pixel de Meta y
TikTok** emite el embudo (landing → registro → etapa) al Events Manager del cliente, y el
**CAPI server-side** reporta el **Purchase** de quien adelanta el pago —para armar el público
"de los que pagan"—. Ver [`09-PIXELS-CAPI.md`](./09-PIXELS-CAPI.md).

- **Ninguna marca lo tiene configurado todavía.** Cada marca pega sus pixel IDs y sus tokens
  de CAPI desde el panel (*Marcas → editar → 📊 Pixel y anuncios*). Sin eso no emite nada y
  nada se rompe.
- **Falta desplegar:** correr `setup-kross.sql` (bloque §26) y redeploy de `register-buyer`,
  `manage-store` y `pay360-webhook` (`--no-verify-jwt`). No hay secretos de plataforma: los
  tokens son por tienda, en `store_secrets`.
- **Deuda anotada:** los tokens de CAPI viajan por el panel al guardarse (como el password de
  Shalom Pro y la llave de 360pay §2). Rotarlos si se exponen; nunca vuelven en las respuestas.

### Recuperar contraseña del panel — construido, falta un ajuste en Auth (25-ago-2026)

El equipo ya puede recuperar su contraseña solo, desde `/login → ¿Olvidaste tu contraseña?`
(ver [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md#recuperar-contraseña-del-panel--implementado)).
Antes dependía de que otro admin le creara una cuenta nueva, y si el que olvidaba era el
único admin de la marca, nadie adentro podía destrabarla.

**Antes de anunciarlo al equipo, revisar tres cosas en el proyecto `ofdjghntvmrdfjhazfvz`:**

- **Redirect URLs** (*Authentication → URL Configuration*): tiene que estar
  `https://*.krossclub.app/**`. Sin eso Auth ignora el `redirectTo` y el vendedor de una
  marca aterriza en el host de la plataforma, donde su cuenta ni siquiera puede entrar.
- **SMTP.** El servicio de correo de cortesía de Supabase manda unos pocos correos por hora
  y no garantiza entrega: si el panel se va a apoyar en esto, va SMTP propio.
- **Los correos del equipo tienen que ser buzones reales.** `admin-team` crea los miembros
  con `email_confirm: true`, o sea que nadie verificó la dirección: un miembro cargado con
  un correo inventado no tiene a dónde recibir el enlace. El panel ya los muestra
  (*Equipo*, solo admins) para poder revisarlos de un vistazo — **requiere redesplegar**
  `admin-team`: `supabase functions deploy admin-team --project-ref ofdjghntvmrdfjhazfvz`.
  Hasta ese deploy, la pantalla se ve como antes (sin correos) y nada se rompe.

### Marca v2.0 — el rediseño entró al panel (25-ago-2026)

El manual nuevo ([`10-MANUAL-DE-MARCA.md`](./10-MANUAL-DE-MARCA.md)) reemplaza al de la etapa
agencia. En el producto ya está aplicado el sistema: símbolo modular, paleta ink/lima,
Inter, estados §6.1 y tema oscuro por defecto **en el panel del vendedor**. Lo que ve el
comprador sigue con el color de cada marca — eso es el white-label y no cambia.

Lo que falta está listado en §10.1 del manual: el barrido de acentos en las pantallas que
no se tocaron, el chat del panel (`ChatView`), la web pública de Kross en ink, y los mapas.

### El acceso ya promete facturas (26-ago-2026)

La pantalla de acceso al panel dice "Productos, cobros con Yape, envíos con Shalom, chats,
llamadas y facturas". **La facturación todavía no existe en el producto**: va con Nubefact y
está por construirse. La promesa entró antes que la función a propósito; si el plan cambia,
la línea vive en `src/components/AuthShell.tsx`.

### ~~Los recojos en Lima ya entran a En vivo~~ ✅ (26-ago-2026) — En vivo se retiró el 28-ago

Había **dos definiciones de "es recojo"** y una no conocía `AGENCIA_LIMA` — el valor que
escribe el checkout para un recojo en agencia de Lima, que es lo único que vende Kross Shop
hoy con el domicilio apagado. Tres efectos, los tres silenciosos:

- El pedido recibía la línea de vida de **domicilio** (`… preparando → en camino → entregado`)
  en vez de la del courier, así que las fases de Shalom no se mostraban — ni al vendedor ni al
  comprador (`OrderTrackingMap`).
- `vaEnElMapa()` devolvía `false` → el pedido **nunca entraba a `/vendedor/mapa`**.
- Peor: con Shalom reportando `EN_TRANSITO`, el paso activo se quedaba en `preparando`. **El
  reporte del courier se descartaba.**

Corregido: `isPickupDispatch()` en `src/lib/session.ts` es la única definición, normaliza
mayúsculas y tolera los valores heredados; `esEnvioPorAgencia()` se eliminó. Cubierto por
tests de regresión en `order-tracking.test.ts` (los de `live-map.test.ts` se fueron con la
pantalla).

**No requiere deploy de Edge Functions** — es solo frontend, sale con el próximo build. La
mitad del arreglo que tocaba a *En vivo* dejó de aplicar cuando esa pantalla se retiró; la que
importa —la línea de vida correcta para un recojo en Lima— sigue viva y es la que usa el
tablero.

### La libreta de clientes necesita un deploy (27-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


Clientes pasó a ser la libreta de personas, con Retención adentro
([`11-RELACIONES.md`](./11-RELACIONES.md)). **No hay SQL que correr** — ninguna columna nueva.

`list-clients` es una función **nueva**; las otras dos se redespliegan porque ahora empaquetan
`_shared/clientes.ts`, donde quedó la definición única de LTV y segmentos:

```
supabase functions deploy list-clients      --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy retention-metrics --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy run-campaign      --project-ref ofdjghntvmrdfjhazfvz
```

Sin el deploy **nada se rompe y nada se pierde**: el modo *Personas* muestra un aviso de que
no pudo cargar (y sugiere justamente que falta publicar `list-clients`), mientras *Reactivar* e
*Invitar* siguen funcionando como antes con las funciones ya desplegadas. Es la diferencia con
el paso 5: acá la ventana no deja al equipo sin nada.

### Una función rota no se nota hasta el deploy (29-ago-2026)

`get-session` salió a `main` sin compilar. Una edición partió en dos una expresión de dos
líneas y dejó huérfano un `|| req.headers…` detrás de una llave; el deploy lo rechazó con
*"Expected a semicolon"* y **la versión anterior siguió viva** — o sea, el panel se veía bien y
el candado de los comentarios internos no estaba puesto. El peor estado: parece hecho y no lo
está.

Se escapó porque nada en el repo miraba esos archivos: `tsc -b` cubre `src/` —las funciones son
Deno y quedan fuera del proyecto—, ningún test las importa y el build de Vite no las toca. La
única comprobación era el despliegue mismo.

Ahora `src/lib/edge-functions.test.ts` parsea **todas** las funciones con el parser de
TypeScript en cada `npm test`. No comprueba tipos —no hay Deno acá, ni forma de resolver `npm:`
ni los globales de Deno— y no hace falta: lo que se escapó fue sintaxis, que es justo la clase
de error que no avisa hasta el deploy.

> Si el CLI responde `unexpected deploy status 400` con un mensaje del parser, **no es la
> conexión**: es el archivo. Corre `npm test` antes de volver a intentarlo.

### Cómo comprobar que un deploy entró

El CLI no dice mucho al terminar. Para ver qué versión quedó viva de cada función:

```
supabase functions list --project-ref ofdjghntvmrdfjhazfvz
```

La columna de versión sube en cada deploy y `updated_at` marca la hora. Si una función que
creías haber desplegado sigue con la fecha vieja, no entró — pasa cuando el CLI abre el
selector de proyectos y se cancela sin elegir.

### Las llamadas en el hilo necesitan SQL + deploy (27-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


La llamada dejó de ser una sección y pasó a ser un evento del pedido
([`11-RELACIONES.md`](./11-RELACIONES.md)). El frontend ya salió con `main`; el backend no.

**1. Correr en el SQL Editor** el bloque §7 de `setup-kross.sql` (es idempotente, se puede
correr entero):

```sql
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS call_recording_id uuid REFERENCES call_recordings(id);
```

**2. Desplegar:**

> Los comandos van con el `--project-ref` **literal en cada línea**, sin variable de shell: el
> equipo trabaja en Windows y `REF=...` es sintaxis de bash — en PowerShell falla y el CLI
> termina abriendo el selector interactivo de proyectos. Si copias esto en PowerShell, pega
> línea por línea.

```
supabase functions deploy get-session        --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy create-call-token  --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy seller-call-token  --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy livekit-webhook    --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
```

Sin la columna, `livekit-webhook` falla al insertar el mensaje de cierre y la llamada no queda
registrada en el hilo — **corre el SQL antes que el deploy**. Sin el deploy, la pantalla de
Llamadas ya no existe pero todavía nada escribe llamadas en el hilo: las grabaciones viejas
siguen en la BD y se pueden consultar por SQL, pero el equipo se queda sin dónde oírlas. Es la
única ventana de este cambio en la que se pierde algo, así que conviene no dejarla abierta.

### El saldo se cobra solo (28-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


**1. SQL primero** (idempotente, bloque §31 de `setup-kross.sql`):

```sql
alter table order_sessions add column if not exists saldo_amount               numeric;
alter table order_sessions add column if not exists saldo_verification         text;
alter table order_sessions add column if not exists saldo_matched_at           timestamptz;
alter table order_sessions add column if not exists saldo_event_id             uuid;
alter table order_sessions add column if not exists pay360_saldo_coupon_id     text;
alter table order_sessions add column if not exists pay360_saldo_consumer_code text;
create index if not exists idx_order_sessions_saldo_coupon
  on order_sessions(pay360_saldo_coupon_id) where pay360_saldo_coupon_id is not null;
```

**2. Los deploys:**

```
supabase functions deploy pay360-coupon      --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy pay360-webhook     --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-session        --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-store-sessions --project-ref ofdjghntvmrdfjhazfvz
```

El pedido se cobra en dos momentos y hasta hoy la fila solo sabía del primero. Ahora
`pay360-coupon` acepta `tipo: 'saldo'` y emite un **segundo cupón**; `pay360-webhook`
distingue cuál de los dos se pagó **por el id del cupón** —el `external_ref` es el mismo
pedido en ambos, y el monto no sirve: la mitad de un pedido de S/180 es 90, igual que su
saldo—; `get-session` devuelve el rastro de los dos.

`get-store-sessions` entra en la lista porque el **tablero** también necesita el saldo: sin él
el anillo de un pedido ya pagado entero se queda a la mitad y el filtro de pagos no ofrece la
opción *Saldo*.

**Corre el SQL antes que los deploys**, y acá el orden importa más que de costumbre, por dos
razones distintas:

- sin las columnas, `pay360-coupon` emitiría un cupón real en 360pay y fallaría al anotarlo. Un
  cupón emitido y no anotado no es un registro que falta — **es plata mal cobrada**: el banco
  paga siempre el pendiente más antiguo, así que el huérfano se lleva el pago del próximo
  pedido de ese mismo comprador;
- y PostgREST rechaza un `select` entero si una sola columna no existe, así que
  `get-store-sessions` desplegada antes del SQL **deja el panel en blanco** — el mismo golpe
  que el DNI.

Sin los deploys no se rompe nada: el botón de pagar el saldo no aparece (el panel solo lo
ofrece cuando la tienda cobra en línea y el adelanto ya cruzó), el filtro de pagos se queda con
*Adelanto* y *Total*, y el saldo se sigue coordinando por el chat, como hasta ahora.

Qué es y por qué son dos operaciones: [`11-RELACIONES.md`](./11-RELACIONES.md).

### El rol Operador, y el equipo de la plataforma (28-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


**1. SQL primero** (idempotente, nadie se vuelve operador por correrlo):

```sql
alter table sellers add column if not exists is_operator boolean default false;
```

**2. Los tres deploys:**

```
supabase functions deploy admin-team     --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy manage-store   --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy manage-product --project-ref ofdjghntvmrdfjhazfvz
```

- `admin-team` aprende a crear operadores — y a **rechazar** que un operador cree
  administradores, que es lo que sostiene todo lo demás.
- `manage-store` rechaza que un operador apague una tienda.
- `manage-product` rechaza que un operador borre un producto.

**Corre el SQL antes que los deploys.** Sin la columna, `admin-team` falla al insertar el
miembro nuevo, y las otras dos leen `is_operator` como `undefined` — o sea que tratarían a
todo el mundo como administrador. **Ese es el orden que importa: sin la columna la
restricción no existe**, aunque el panel ya la muestre.

Sin los deploys: el panel ya ofrece el rol pero `admin-team` lo ignora y crea un admin
normal. Es la única ventana fea de este cambio, así que conviene no dejarla abierta.

Qué es el rol y por qué está partido así: [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md#el-operador-el-nivel-que-faltaba-entre-admin-y-miembro--28-ago-2026).

**Y una cosa que NO es código.** El reparto equivalente en el repo —quién mergea a
`main`— es una configuración de GitHub, no de este panel: *Settings → Branches → branch
protection* de `main`, requerir PR y restringir quién puede mergear. Mientras no esté
puesta, la regla escrita en [`GIT-FLOW.md`](./GIT-FLOW.md) es un acuerdo, no un candado.

### El mapa de entregas por distrito (28-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


**Un deploy nuevo. No hay SQL.**

```
supabase functions deploy delivery-map --project-ref ofdjghntvmrdfjhazfvz
```

`delivery-map` cuenta los pedidos **entregados** por sitio de entrega y producto, y alimenta el
mapa del Perú que ahora vive al costado de la libreta de clientes (solo en escritorio). No
devuelve datos personales —ni nombres, ni DNI, ni teléfonos— pero sí la facturación por zona, y
por eso pasa por la misma puerta de admin que `list-clients`.

Sin el deploy, la libreta funciona igual y el mapa dice *"No se pudo cargar el mapa de
entregas"* con el nombre de la función que falta. No rompe nada.

Y se **quitó** el modo *En vivo* de Pedidos: no necesita despliegue —es solo frontend— y los
enlaces con `?modo=mapa` caen en la lista. La razón está en
[`11-RELACIONES.md`](./11-RELACIONES.md): la caja que se deslizaba entre dos sedes no estaba
donde el mapa la ponía; esa posición era la fase del courier redibujada, y en un mapa una
posición se lee como una posición.

### El pipeline nuevo: Curiosos y Anulado (28-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


**Un solo deploy nuevo y dos redeploys. No hay SQL que correr.**

```
supabase functions deploy get-store-drafts   --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy order-manage       --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-store-sessions --project-ref ofdjghntvmrdfjhazfvz
```

- **`get-store-drafts` es nueva.** Lee `checkout_drafts` —la tabla de leads que existe desde el
  bloque §12 y que hasta hoy nadie miraba— y alimenta la columna **Curiosos** del tablero: los
  que dejaron DNI y WhatsApp y no siguieron.
- `order-manage` gana `anular` / `restore`, y su lista de etapas pierde `preparando`.
- `get-store-sessions` ya traía cancelados; ahora trae también los **anulados**, que van a su
  propia columna, y dos columnas más: `shalom_order_status` / `shalom_order_reason`, para marcar
  en *Confirmado* los pedidos **cobrados cuya guía el courier rechazó** — los que hay que
  registrar a mano.

**Sin SQL porque no hace falta:** `status` es texto libre desde el inicio (no tiene CHECK), así
que `'anulado'` se guarda tal cual; y `checkout_drafts` ya existe con su índice de recuperación.
Los bloques §28 y §29 de `setup-kross.sql` documentan los dos, pero **no hay nada que correr**.

Qué pasa si estos deploys no entran:

| Sin desplegar | Qué se ve |
|---|---|
| `get-store-drafts` | la columna **Curiosos** sale vacía. El lector trata el 404 como lista vacía a propósito: el tablero sigue funcionando entero. |
| `order-manage` | el botón **🚫 Anular** falla y avisa. Nada más cambia — avanzar de etapa sigue igual. |
| `get-store-sessions` | los anulados no llegan al panel, así que la columna 🚫 no aparece (los que ya estén anulados en la base quedan invisibles, no perdidos), y el chip **⚠️ Guía manual** no se pinta en ninguna tarjeta. El buscador del filtro tampoco encuentra por **DNI** —el resto de campos sí—. |

**`preparando` no se borra de la base.** El CHECK de `stage` la sigue aceptando y las filas
viejas siguen siendo válidas: la app las lee como `confirmado` (`stageVigente`), que es lo que
esos pedidos son —cobrados y sin guía—. No hay migración de datos en este cambio.

Un efecto de operación que conviene avisarle al equipo: **ya no hay entrega automática a
Soporte**, porque la etapa que la disparaba (`preparando`) no existe. Logística se queda con el
pedido desde `confirmado` hasta `en_camino`. A Soporte se le sigue pudiendo invitar al chat.

### Marcar un pedido como respondido (28-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


**1. SQL primero** (SQL Editor, proyecto PWA):

```sql
alter table order_sessions
  add column if not exists answered_at timestamptz;
```

**2. Luego los tres deploys:**

```
supabase functions deploy order-manage       --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-store-sessions --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy get-session        --project-ref ofdjghntvmrdfjhazfvz
```

- `order-manage` gana la acción `mark_answered`.
- `get-store-sessions` devuelve `answered_at` y el `sender_name` de cada mensaje (para que la
  Lista diga **quién** escribió en vez de "Tú:").
- `get-session` devuelve `answered_at`, para que el botón del chat sepa si hay deuda.

Sin la columna, `mark_answered` falla y el botón avisa. Sin los deploys: la Lista sigue diciendo
"Tienda:" en vez del nombre, y "Sin responder" no reconoce lo marcado a mano — no rompe nada,
pero la vista no sirve para lo que se hizo. **Corre el SQL antes que los deploys.**

### ~~`list-clients`: el número de pedido en la ficha del cliente~~ — revertido el mismo día

Se añadió `order_id` al `select` y se quitó horas después: el número de pedido en cada fila
respondía *"¿cuál de estos estoy viendo?"*, y esa pregunta ya la contesta la fila marcada. **No
hay nada que desplegar por esto**: la función desplegada devuelve un campo que el panel ya no
lee, y eso no rompe nada.

### `get-session` otra vez: saber si el cliente está en la app (27-ago-2026)

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


```
supabase functions deploy get-session --project-ref ofdjghntvmrdfjhazfvz
```

Adjunta dos campos más a `buyer_contact` (que es **solo para el vendedor**, misma regla de PII
que el DNI): `activated_at` —si el comprador entró alguna vez a la app— y `push_activo` —si hoy
tiene una suscripción viva en `push_subscriptions`—. Sin el deploy, la ficha del cliente y el
botón de la cabecera muestran el caso "nunca ha entrado a la app" para todos: no rompe nada,
pero el dato no sirve hasta desplegar. No hay SQL: las dos columnas ya existen.

### El CRM espera un deploy (26-ago-2026) — *En vivo* también, hasta que se retiró

> ✅ **Desplegado el 29-ago-2026.** Lo de abajo se queda como el porqué —que sigue siendo
> lo útil—, pero los comandos ya se corrieron: ver
> [Producción está al día](#producción-está-al-día-29-ago-2026).


`get-store-sessions` **todavía no devuelve en producción** `product_id`, `dispatch_type`,
`agency_name`, `agency_branch_id`, `address_lat/lng`, `advance_amount`,
`payment_verification` ni `tracking_*`:

> Los comandos van con el `--project-ref` **literal en cada línea**, sin variable de shell: el
> equipo trabaja en Windows y `REF=...` es sintaxis de bash — en PowerShell falla y el CLI
> termina abriendo el selector interactivo de proyectos. Si copias esto en PowerShell, pega
> línea por línea.

```
supabase functions deploy get-store-sessions --project-ref ofdjghntvmrdfjhazfvz
```

Y el 26-ago-2026 se le sumó otro grupo: **`registrado` dejó de mapearse a `EN_ORIGEN`** en el
mapeo de hitos de los dos couriers (ver [`11-RELACIONES.md`](./11-RELACIONES.md)). Ese mapeo
vive en `_shared/`, que se **empaqueta dentro de cada función**, así que hay que redesplegar
todas las que lo importan:

```
supabase functions deploy shalom-tracking-sync --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy shalom-order         --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy olva-tracking        --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy olva-tracking-sync   --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy manage-store         --project-ref ofdjghntvmrdfjhazfvz
supabase functions deploy shalom-webhook       --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
```

Hasta ese deploy, el backend sigue marcando `EN_ORIGEN` en cuanto Shalom registra la guía: el
frontend ya distingue las dos columnas, pero el dato que le llega no. **Nada se rompe** — es
la conducta de antes.

Sin el deploy de `get-store-sessions`, y sin romper nada:

- **`/vendedor/mapa`** carga pero sale vacía: no tiene qué dibujar.
- **El CRM y Stats** ya usan las columnas del courier, pero se quedan en la mitad de arriba
  del eje: `registrado`, `en origen` y `en destino` salen vacías porque no llegan ni la guía
  ni las fases, y un pedido en `validando` cae en la columna **"Pedido"** en vez de en
  "Validando" (la línea de vida no incluye ese paso si no ve `advance_amount`). Ya no
  desaparece, que es lo que hacía antes; simplemente todavía no se etiqueta bien.
- **El chip de antigüedad del CRM** sale con `~` en todos los pedidos: sin `tracking_phase_at`
  solo puede medir desde `created_at`, y lo dice en vez de fingir precisión. La alerta de
  demora (⚠️ rojo) no aparece hasta que llegue `tracking_demora_at`.

Con el deploy, las columnas del courier se llenan solas y `validando` cae donde debe.

El otro requisito es de datos, no de código: un pedido solo aparece con su línea completa si
su **producto tiene sede de origen** configurada (*Productos → editar → sede Shalom*). Sin
eso se dibuja el destino, pero no de dónde sale.

### La web pública se rediseñó con la oferta nueva (27-ago-2026)

`krossclub.app` dejó de venderse como "software de comercio contraentrega" y pasó a
**«La tecnología de tu tienda»**. El cambio es de fondo, no de portada: contraentrega quiere
decir cobrar todo en la puerta, y el checkout cobra **la mitad del pedido o el total** dentro
del formulario, con Yape validado solo. La portada lo enfrenta con la sección «Esto ya no es
contraentrega» y con los cuatro pasos del cobro.

- Todo el sitio quedó en **ink + lima** (manual v2.0). Era el pendiente de su §10.1.
- El copy vive en `src/config/propuesta.ts`; el catálogo (`src/config/catalogo.ts`) se
  reescribió alrededor del cobro y **los precios no se tocaron**.
- Las portadas del catálogo se regeneran con `npm run build:portadas`.
- **No requiere deploy de funciones ni tocar la base**: es front y contenido estático.
- **Deuda:** los metadatos de `index.html` son estáticos y describen a Kross, así que la vista
  previa de un enlace de `marca.krossclub.app` sale con el texto de la plataforma. Anotado en
  `docs/04-CUMPLIMIENTO-WEB.md`.

## Bloqueos abiertos

| # | Qué bloquea | Desde | Qué lo destraba | Dueño |
|---|---|---|---|---|
| 1 | **Gadicaf no puede cobrar adelantos en línea**: no tiene 360pay conectado ni número de Yape configurado. Sus pedidos se cierran igual y el adelanto se coordina por chat, pero pierde la confirmación automática. | 21-ago-2026 | Conectarla desde el panel → Cobros → *Cobrar el adelanto con Yape (360pay)*. Es la misma alta de un clic que se hizo con Kross Shop. | Fundador |
| 2 | **Credenciales expuestas sin rotar**: la llave de partner de 360pay y el secreto de firma del webhook pasaron por el chat y por capturas de pantalla. | 20-ago-2026 | Rotar la llave desde 360pay y el secreto con `POST /businesses/{id}/hooks/{hookId}/rotate-secret`, y recargar los secrets del proyecto. | Fundador |

### Culqi quedó fuera (21-ago-2026)

Los dos bloqueos que ocupaban este espacio eran de Culqi: la API directa exigía acreditación
**PCI DSS / SAQ-D** y el cobro nunca pasó del token. **Se eliminó el motor entero** —código,
Edge Functions, columnas, llaves guardadas y el documento de acreditación— el día que 360pay
cobró su primer sol real.

No fue solo limpieza: **tener dos motores encendidos a la vez confundía la configuración de
cada marca**, y el que quedaba bloqueado no aportaba nada. 360pay resuelve el mismo problema
sin tocar credenciales de pago, porque Kross Club es *partner* y cada marca es un *business*
bajo esa cuenta. Ver [`06-360PAY.md`](./06-360PAY.md) y
[`07-CONTRATO-360PAY.md`](./07-CONTRATO-360PAY.md).

## Guía automática de Shalom — encendida en ninguna marca todavía

El generador de envíos existe (ver [`02-SMART-LOGISTICS.md`](./02-SMART-LOGISTICS.md)
§ *Generador de guías Shalom*), pero **`stores.shalom_auto_guide_enabled` arranca en
`false` para todas**: un pedido de agencia Shalom con el adelanto verificado arma su
envío completo y lo deja como **ensayo** en el chat de vendedores, sin emitir nada.

El contrato de `POST /v1/orders` ya está **verificado contra la doc del proveedor**
(25-ago-2026). Para encenderlo en una marca quedan dos cosas, en este orden:

1. **Configurar cada producto**: agencia de origen, tamaño y contenido declarado
   (Panel → Productos → el producto → Envío). El panel marca los que faltan.
2. **Prender el interruptor** en Panel → Mi marca → Envíos, después de mirar uno o
   dos ensayos completos en el chat.

Nada de esto se probó todavía contra la API real: la primera guía emitida es el
verdadero estreno, y conviene mirarla de cerca (y borrarla con
`DELETE /v1/orders/{id}` si sale mal, mientras no la reciban en agencia).

Mientras tanto la guía se registra a mano como siempre y **nada se rompe**: el
generador avisa a Logística cuándo no aplicó y por qué.

## Deuda técnica conocida

Anotada donde vive, para que no haya que redescubrirla:

| Deuda | Dónde | Por qué importa |
|---|---|---|
| `payment_reason` puede acabar frente al comprador vía `get-session?viewer=seller` — la vista de vendedor sigue decidiéndose por la URL para todo menos los mensajes. | `pay360-coupon/index.ts` · `notePaymentFailure` | Obliga a que **ningún texto de terceros** entre ahí. Es la razón de que los motivos de fallo sean frases cortas y propias, y de que el error crudo de 360pay vaya **solo** a los logs de la función. Los mensajes `sellers` **ya no están**: desde los comentarios internos exigen un JWT de vendedor verificado. Falta mover el resto de campos a esa misma puerta. |
| Nada impide emitir un cupón por debajo de S/5. | `07-CONTRATO-360PAY.md` §6 | La comisión es plana: un adelanto de S/5 le deja S/0 al comercio. Falta un piso configurable por tienda, o caer a contraentrega puro cuando el adelanto no lo alcance. |
| `stores` no guarda RUC ni razón social de cada marca. | `07-CONTRATO-360PAY.md` §5 | El contrato con 360pay nos obliga a mantener ese registro de los comerciantes referidos. |
| `manage-store` mantiene vivo el camino legacy `admin_auth_id` para branding. | `01-SALES-ENGINE.md` §3.3 · `manage-store/index.ts:82` | Doble superficie de auth. Los campos de cobro ya exigen JWT verificado; falta retirar el resto. |
| Catálogo de distritos incompleto 🟡 | `02-SMART-LOGISTICS.md` § Deuda conocida | Afecta la cobertura de reparto. |
| La key de prueba de Olva API Perú viajó por el chat al recibirse. | `02-SMART-LOGISTICS.md` § Tracking de guías Olva | Rotarla al pasar a producción (se pide por el WhatsApp del proveedor) y recargar Vault/secret. Misma familia que el bloqueo #2. |
| Los mensajes automáticos salen como si los hubiera tecleado el vendedor asignado (`sender_role: 'seller'` + su nombre). | `register-buyer` (bienvenida) · algunos de `order-manage` · detalle en [`11-RELACIONES.md`](./11-RELACIONES.md) | Mientras siga así, un **% de involucramiento del equipo** contado desde el chat sale inflado: cada pedido nace con un mensaje "de" su vendedor que su vendedor no escribió. El arreglo es marcarlo en el origen —una columna `automatico` en `chat_messages`, o el rol `bot`— y redesplegar las funciones que escriben. |
| Un **upsell después de haber cobrado el saldo** deja un saldo nuevo que la pasarela no cobra sola. | `src/lib/order-money.ts` · `puedePagarSaldo` | Las columnas guardan UNA operación de saldo, y el botón exige que no haya un saldo ya cruzado. Si al pedido se le agrega algo después, el anillo baja y el saldo aparece —eso sí funciona—, pero el cobro lo coordina el asesor por el chat. Arreglarlo pide un historial de cobros, no una columna más. |
| `derivePhase()` del tracking Olva está calibrada sin guías reales — **y la cascada ya corre sobre ella** (barrido `olva-tracking-sync` + avisos + cobranza). | `supabase/functions/_shared/olva.ts` | Un texto mal clasificado dispara (o calla) la cobranza en el momento equivocado. Vigilar de cerca las PRIMERAS guías Olva registradas y calibrar contra sus textos reales. |

## Limpieza pendiente

- **`store-culqi-test`** quedó desarmada (`active=false`) y conserva 1 producto. Con Culqi
  fuera ya no tiene ningún motivo para existir: borrarla.
- **El cliente `Prueba Kross`** creado en el panel de 360pay para confirmar la forma del
  `POST /customers`. Borrarlo desde `console.360pay.pe` → Clientes.

## Cuándo tocar este doc

Cuando cambie algo que la BD no explica sola: se enciende o apaga un cobro, entra una marca
nueva, se destraba o aparece un bloqueo, se salda una deuda. **Y siempre las fechas de
arriba** — un doc de estado sin fecha no se puede creer.

Son dos y no se mueven juntas: *texto actualizado* la mueve cualquier cambio de estos; *última
verificación contra la base* solo la mueve haber corrido de verdad la consulta de arriba contra
producción. Subirla sin haberla corrido convierte el doc en lo que dice no ser.

Y cuando un deploy entre, **táchalo de [Producción está al día](#producción-está-al-día-29-ago-2026)**:
una lista de pendientes que ya no lo son deja de leerse a la semana. Al 29-ago esa sección está
vacía —se corrió todo—, así que lo que toca al dejar algo pendiente es **volver a llenarla**,
diciendo qué se ve si no entra.
