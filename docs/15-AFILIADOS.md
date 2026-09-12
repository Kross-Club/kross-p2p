# 15 · AFILIADOS — Quién trajo a quién, y cuánto se le debe

> **Objetivo:** que entregar un enlace de afiliado, saber quién está debajo de
> quién, comprobar si la suscripción del comercio está al día y calcular lo que
> se le debe a cada afiliado sean **cuatro consultas y no una hoja de cálculo**.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado
>
> Estado: **✅ construido, 🟡 sin correr en producción** (10-set-2026). Falta el
> SQL, los deploys y la cuenta de Stripe conectada — ver *Puesta en marcha*.
>
> **§52 (10-set-2026): la tienda también es afiliada.** Cada marca nace con su
> enlace y lo ve en su propio panel.
>
> **§53 (12-set-2026): el enlace es opaco y el modo prueba no paga.** Las dos
> secciones están al final.

## Las tres piezas, y quién mueve cada una

Conviene no confundirlas, porque las mueven tres actores distintos y solo una
está automatizada de punta a punta:

| | Quién paga | A quién | Por dónde |
|---|---|---|---|
| **El plan** | el comercio | Kross | **Stripe**, $67/mes, automático |
| **La comisión de Kross** | el comercio | Kross | la pasarela, por *split* en cada cobro (`comision.ts`) |
| **La comisión del afiliado** | Kross | el afiliado | **transferencia a mano**, S/0.10 por transacción |

⚠️ **La comisión del afiliado NO sale por Stripe.** No hay Connect, no hay
*transfers* y no hay cuentas conectadas. Stripe hace una sola cosa en este
programa: decir **qué meses pagó cada tienda**. Ese dato entra por
`stripe-webhook` y es la llave de todo lo demás.

Atar el pago al afiliado a Stripe habría significado meter una API de por medio
para mover soles entre dos peruanos —que es justo lo que Yape hace gratis— y
además dejar el programa sin funcionar el día que esa API responda mal.

## La decisión que sostiene todo: no hay contador

**Una transacción ya está escrita.** Es una fila de `cobros` en estado
`MATCHED` (§36 del esquema), con su `store_id` y su `matched_at`. Así que la
comisión del mes **no se acumula en ninguna parte**: se cuenta cada vez que
alguien la mira.

Un contador aparte sería una segunda versión de la misma verdad, y las dos
versiones se separan el día que un cobro se anula, un webhook llega dos veces o
alguien corrige una fila a mano. Cuando eso pasa, nadie sabe cuál de los dos
números es el bueno — y uno de ellos es lo que se le prometió a una persona.

Lo único que se guarda es **el mes cerrado** (`affiliate_payouts`), y se guarda
por la razón opuesta: una vez que el número se le prometió a alguien, un cobro
anulado en octubre no puede cambiar lo que se debe por setiembre.

> **Qué cuenta como transacción:** cada cobro `MATCHED`, sea `adelanto`, `saldo`
> o `extra`. **No es por pedido.** Un pedido que paga la mitad y después el
> saldo son dos cobros, y Kross cobra su tarifa en los dos: pagarle al afiliado
> por pedido sería pagarle por la mitad de lo que generó.

## Las cuatro preguntas, y dónde se responden

### 1. ¿Cuál es el enlace, y cómo llega la atribución hasta la tienda?

El código del afiliado **es** su enlace: `krossclub.app/?ref=jhoann`.

Entre el clic y la tienda dada de alta pasan días —el comerciante mira, se va,
vuelve por Google, pregunta por WhatsApp—. La atribución cruza ese hueco en tres
saltos:

```
/u/48291733          →  localStorage (30 días, último toque gana)   src/lib/referido.ts
   ↓ el lead se manda
web_orders.affiliate_code  (texto)                                   web-order
   ↓ el lead se convierte en tienda
stores.affiliate_id + affiliate_at  (relación)                       manage-store
```

> El enlace lleva un identificador **opaco** y la ventana es de 30 días con
> **último toque**. Las dos cosas cambiaron en §53; la explicación está allí.

**Se guarda el código en texto durante el tramo del lead y se resuelve a un id
recién al crear la tienda.** En el momento del lead el código puede no resolver
—un enlace viejo, un afiliado dado de baja— y un texto que no resuelve es un
dato que se puede investigar; una FK que no resuelve es un lead que se pierde.

Cuando la atribución no viaja sola —el comerciante llegó por el enlace pero se
dio de alta por teléfono— se cuelga a mano desde *Panel → Afiliados*.

### 2. ¿Quién está debajo de quién?

`affiliates.referred_by` apunta a quien trajo al afiliado. El árbol se guarda
**entero**, a cualquier profundidad.

**Hoy solo se paga el nivel 1** —el que trajo la tienda—, y eso es una decisión
del negocio, no una limitación del esquema. Guardar el árbol sin pagarlo ya sirve
para dos cosas que no son especulativas: responder *"¿de dónde salió esta
tienda?"* tres saltos arriba cuando hay que auditar una atribución, y enseñarle a
un afiliado a quién reclutó.

> ⚠️ Un árbol guardado en una columna **puede tener ciclos**: nada en Postgres
> impide que A traiga a B y B traiga a A, y una función recursiva que no lo
> contemple cuelga el servidor. Se evita al escribir (`cerrariaCiclo`, que la
> Edge Function enforza) y se tolera al leer (corta-ciclos en `arbolDeAfiliados`),
> porque una fila mal escrita a mano en el SQL Editor no puede tumbar el panel.

### 3. ¿Está activa su suscripción?

La pregunta que decide la comisión **no** es *"¿esta tienda está suscrita HOY?"*
sino ***"¿tenía el mes pagado CUANDO hizo esta venta?"***. La diferencia es plata
de alguien:

- Con la pregunta de hoy, una tienda que cancela el 28 le borra al afiliado las
  400 ventas del 1 al 27. El afiliado trabajó y no cobra.
- Al revés, una que se suscribe el 28 le regala las 400 que hizo sin plan.

Por eso lo que se guarda no es un estado, son **tramos pagados**: una fila en
`subscription_periods` por cada factura pagada, con el rango que esa factura
cubre (`invoice.paid` de Stripe lo trae en `lines[].period`). Una transacción
cuenta si su fecha cae dentro de alguno.

El estado de hoy (`store_subscriptions.status`) también se guarda, pero para otra
cosa: **el semáforo del panel y la lista de a quién llamar**. No decide
comisiones.

| Stripe | Kross | Qué significa |
|---|---|---|
| `active` | Al día | — |
| `trialing` | En prueba | — |
| `past_due` · `unpaid` | Pago rechazado | Sigue operando y el mes todavía puede pagarse. **Es a quien hay que llamar** |
| `canceled` · `incomplete_expired` | Cancelada | — |
| `incomplete` | Sin plan | Nunca cobró el primer pago: existe en Stripe y no existe acá |

### 4. ¿Cuánto se le debe?

```
comisión del mes = (transacciones MATCHED de sus tiendas
                    que caen dentro de un tramo pagado) × S/0.10
```

**Que la tarifa cabe** está cubierto con pruebas contra `comision.ts`: Kross se
queda con `margenDeKross()` —S/1.98 por transacción en el corte de riel, S/1.19
en el peor caso del ruteo por monto—, así que S/0.10 es como mucho el 8 % de ese
margen. El único caso donde el margen sería negativo es un monto bajo cobrado por
360pay, y eso lo previene el ruteo por monto (`proveedorPara`), no este programa.

**Las transacciones que NO cuentan se enseñan, no se esconden.** Un afiliado que
ve *"300 ventas, S/0.00"* sin explicación asume que el sistema le robó; con el
motivo al lado, la conversación es *"tu tienda no pagó el plan"* — que es la
verdad y además es lo único que él puede destrabar.

#### El mes es el de Lima, no el de UTC

Una venta del 30 a las 20:00 en Lima figura el 1 de octubre a la 01:00 en UTC.
Contarla en octubre le mueve la comisión de mes al afiliado, y el número que ve
deja de cuadrar con lo que vendió su tienda. Perú no mueve el reloj desde 1994,
así que el desfase es fijo: **UTC-5, siempre** (`HORAS_LIMA`).

Los rangos son **medio abiertos** (`desde <= t < hasta`), que es la única forma
de partir el tiempo sin dejar un hueco ni contar dos veces el último
milisegundo.

## El esquema · §51

| Tabla | Qué guarda |
|---|---|
| `affiliates` | El afiliado. `codigo` (**es** el enlace, único), `auth_user_id` (su cuenta), `referred_by` (el árbol), `active` |
| `stores.affiliate_id` · `affiliate_at` | La atribución. Una tienda tiene **un** afiliado, y la fecha resuelve la disputa que siempre llega |
| `web_orders.affiliate_code` | El código pegado al lead, mientras todavía no hay tienda |
| `store_subscriptions` | El estado de hoy en Stripe. **Semáforo, no llave** |
| `subscription_periods` | Los tramos pagados. **Esto sí decide la comisión** |
| `affiliate_payouts` | El mes cerrado. El único sitio donde una cifra se guarda en vez de calcularse |
| `affiliates.store_id` (§52) | De qué tienda es este afiliado. NULL = de fuera |
| `affiliates.public_id` (§53) | Los ocho dígitos opacos del enlace. Lo asigna un trigger |
| `subscription_periods.livemode` (§53) | Si el pago fue real. **Solo `true` comisiona** |

Más un índice que hace posible contar: `idx_cobros_liquidacion` sobre
`cobros(store_id, matched_at) WHERE estado = 'MATCHED'`. Sin él, liquidar es un
scan de la tabla de la plata entera, todos los meses y por cada afiliado.

Todas con **RLS encendido y sin políticas**: solo *service role*. Ni el afiliado
ni el panel leen estas tablas directo — van por la Edge Function, que decide qué
le toca ver a cada uno. Para la tabla de la plata, *"nadie salvo el servidor"* es
la política correcta (el precedente es `cobros`, §36).

## El código

| Archivo | Qué hace |
|---|---|
| `supabase/functions/_shared/afiliados.ts` | **Las reglas.** Tarifa, código, el mes de Lima, los tramos, el árbol. Puro, sin Deno: lo importan las funciones, vitest y el panel |
| `supabase/functions/_shared/stripe.ts` | **Leer a Stripe.** Firma HMAC con ventana de replay y lectura defensiva de sus objetos. Sin SDK: el webhook solo escucha, nunca llama |
| `supabase/functions/stripe-webhook/` | Guarda estado y tramos. `--no-verify-jwt` |
| `supabase/functions/afiliados/` | La API de las dos pantallas |
| `src/lib/referido.ts` | El `?ref=` en el dispositivo, 90 días, primer toque |
| `src/components/PanelDeAfiliado.tsx` | **El panel del afiliado**, compartido por el comerciante y el de fuera |
| `src/pages/afiliado/AfiliadoPage.tsx` | `/afiliado` — el marco del afiliado de fuera |
| `src/pages/vendedor/AfiliadosPage.tsx` | `Panel → Afiliados` — el programa entero para Kross; el panel propio para el comerciante |

Pruebas: `src/lib/afiliados.test.ts` (43), `src/lib/stripe.test.ts` (22),
`src/lib/referido.test.ts` (7).

### Lo que el webhook contesta, y por qué importa

Stripe reintenta durante tres días todo lo que no sea 2xx:

- firma inválida o cuerpo ilegible → **400**. Nunca va a mejorar.
- evento que no nos toca → **200**. Recibido y descartado.
- falló la escritura → **500**, **a propósito**. Un `invoice.paid` que se pierde
  por un error transitorio es un mes pagado sin registrar, y eso es un afiliado
  al que no se le paga lo que ganó.

Tres defensas más, cada una contra un problema distinto:

- **Idempotencia** — índice único sobre `stripe_invoice_id`. La misma factura
  llega dos y tres veces (y `invoice.paid` e `invoice.payment_succeeded` se
  disparan los dos por el mismo cobro).
- **Orden, en el estado** — Stripe **no garantiza el orden**. Un
  `subscription.updated` viejo que llega después de uno nuevo haría retroceder
  el estado, y una suscripción cancelada volvería a figurar activa sola. Se
  compara `stripe_event_at` contra lo guardado y se descarta lo viejo.
- **Orden, en el alta** — y acá el mismo problema cuesta un mes de comisión.
  `invoice.paid` suele llegar **antes** que `checkout.session.completed`, que es
  el evento que enlaza la tienda con su cliente de Stripe; con un Payment Link
  —donde el `store_id` viaja solo en el `client_reference_id` de la sesión— esa
  primera factura llega sin poder atribuirse. Descartarla sería **perder el
  primer mes de todas las tiendas, en silencio**. Así que no se descarta: se
  contesta 500 y Stripe la reintenta, y en el segundo intento el enlace ya
  existe. Pasada una hora (`VENTANA_DE_REINTENTO_SEG`) se deja ir — lo que no se
  pudo atribuir en una hora no es una carrera de entrega, es una suscripción de
  esa cuenta de Stripe que no es de Kross.

### La versión de API de Stripe

El webhook lee las dos formas de cada objeto, porque Stripe movió campos y una
cuenta creada hoy manda la nueva:

| Dato | Antes | Desde `2025-04-30.basil` |
|---|---|---|
| La suscripción de una factura | `invoice.subscription` | `invoice.parent.subscription_details.subscription` |
| El metadata que la factura hereda | `invoice.subscription_details.metadata` | `invoice.parent.subscription_details.metadata` |
| El fin del periodo | `subscription.current_period_end` | `subscription.items.data[].current_period_end` |

Se leen **los dos caminos** en `_shared/stripe.ts`, con la vieja primero y la
nueva de respaldo. Leer solo una deja al webhook sin resolver nada contra la
otra versión, y el síntoma es el peor posible: los meses no se registran, sin
que nada falle.

## Cómo se opera

**Dar de alta un afiliado.** *Panel → Afiliados → Nuevo*: nombre, código (que es
su enlace) y correo. La contraseña del panel es opcional en ese momento — el
enlace funciona desde el minuto uno, lo que necesita cuenta es **mirar**; se le
da acceso después con *Darle acceso*.

**Entregar el enlace.** Se copia de la fila. `krossclub.app/?ref=<codigo>`.

**Cerrar el mes.** Un mes se cierra cuando terminó, nunca en curso: congelaría
un número que todavía va a crecer, y como cerrar es idempotente, el segundo
intento no lo corregiría — quedaría el número de mitad de mes para siempre.

**Pagar.** Se transfiere por fuera (Yape, cuenta) y se marca *Pagado* con la
referencia. Es el único paso del programa que una persona hace a mano, y es a
propósito: son unas pocas transferencias al mes.

## Puesta en marcha

1. **SQL** — correr `supabase/setup-kross.sql` en el SQL Editor de
   [`ofdjghntvmrdfjhazfvz`](https://supabase.com/dashboard/project/ofdjghntvmrdfjhazfvz).
   Es idempotente: §51 y §52 se agregan y lo anterior no se toca. §52 hace el
   traspaso: cada tienda que ya existe se queda con su enlace.
2. **Secretos** — uno por modo, y los dos conviven:

   | Secreto | De qué destino |
   |---|---|
   | `STRIPE_WEBHOOK_SECRET` | el endpoint de **producción** |
   | `STRIPE_WEBHOOK_SECRET_TEST` | el endpoint de **prueba** (opcional) |

   **No hace falta ninguna API key de Stripe**: esta función solo escucha.
3. **Deploys**
   ```
   supabase functions deploy afiliados       --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy stripe-webhook  --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
   supabase functions deploy web-order       --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy manage-store    --project-ref ofdjghntvmrdfjhazfvz
   ```
4. **Stripe** — crear el producto de $67/mes y el endpoint apuntando a
   `…/functions/v1/stripe-webhook`, suscrito exactamente a estos seis:

   | Evento | Para qué |
   |---|---|
   | `checkout.session.completed` | **Enlaza la tienda con su cliente de Stripe.** Sin este, nada más se puede atribuir |
   | `customer.subscription.created` · `.updated` · `.deleted` | El semáforo del panel |
   | `invoice.paid` | **El tramo pagado.** Es lo que decide la comisión |
   | `invoice.payment_failed` | La lista de a quién llamar |

   `invoice.payment_succeeded` también se atiende, pero se dispara por el mismo
   cobro que `invoice.paid`: suscribir los dos no agrega nada (el índice único
   lo absorbe) y tampoco molesta.
5. **Enlazar cada tienda con su cliente de Stripe.** Es el paso que hay que
   hacer bien o nada cuenta. Dos formas, y la primera es la buena:
   - **Payment Link con `client_reference_id = <store_id>`** — se le pega al
     final de la URL del link:
     `https://buy.stripe.com/xxxx?client_reference_id=st_marca_abc123`. El
     comercio se da de alta solo y el enlace queda hecho. Es **un solo Payment
     Link** para todas las marcas; lo que cambia es el parámetro. Ojo: el de
     modo prueba y el de modo vivo son **dos links distintos**.
   - `metadata.store_id` en la suscripción, si se crea desde el dashboard.

   Sin ninguno de los dos, el webhook resuelve por `stripe_customer_id` contra
   `store_subscriptions` — que solo sirve **después** de que el primer evento ya
   dejó el enlace escrito.

## §52 · La tienda también es afiliada (10-set-2026)

§51 dio por hecho que un afiliado es alguien de fuera: un vendedor con su
enlace. Pero el mejor canal de Kross no es ese — es **el comerciante contento
que le recomienda la herramienta a otro comerciante**. Esa persona ya está
adentro, ya entra al panel todos los días y no necesita que nadie le explique el
producto.

Así que una tienda **es** un afiliado, y lo es desde que nace.

### Las dos direcciones, que se confunden leyendo rápido

| Columna | Qué dice |
|---|---|
| `stores.affiliate_id` | **Quién trajo a esta tienda** (§51.b) |
| `affiliates.store_id` | **De qué tienda es este afiliado** (§52) |

Una tienda puede tener las dos: la trajo Jhoann, y ella a su vez trajo a otras
tres. Lo que no puede es traerse a sí misma — sería un ciclo de largo 1 y la
tienda se cobraría su propia comisión mes tras mes, con el número saliendo bien
en todas las pantallas. Lo cierran tres candados: el `UPDATE` de limpieza de
§52.b, el rechazo de `atribuir` en la Edge Function, y que el alta automática y
la atribución son dos operaciones distintas que nunca se cruzan.

### El alta es automática, y el código es el slug

Cada tienda nace con su código de afiliado, y ese código es su **slug**: el
comerciante ya lo conoce —es su subdominio— así que no hay nada nuevo que
memorizar. Lo crea `manage-store` junto con la tienda; §52.a hace el traspaso de
las que ya existían.

**Por qué automático y no un interruptor.** Un programa de referidos que hay que
activar lo activa quien ya sabe que existe, o sea casi nadie. El enlace no cuesta
nada mientras no se use, y estar ahí es la mitad del trabajo.

El alta es **best-effort**: si falla, la tienda queda creada igual y su enlace se
le da después desde el panel. Perder una marca nueva por no haber podido escribir
una fila de referidos sería el peor negocio posible — la misma regla de
`api-eventos.ts`: anotar nunca tumba lo que estaba anotando.

### La segunda compuerta: su propio plan

Cuando el que refiere es una tienda, **su propia suscripción es una segunda
condición**. Mientras no pague su plan de Kross, sus referidas no le generan
comisión.

```
transacciones que cuentan = las que caen dentro de
    (tramos pagados de LA REFERIDA)  ∩  (tramos pagados del AFILIADO-TIENDA)
```

Es la misma regla de §51 un nivel más arriba, y por la misma razón: la comisión
es una parte del margen de un mes que Kross efectivamente cobró. Si el que se
lleva la parte dejó de pagar, ya no hay relación de la que salga. Un afiliado de
fuera no tiene plan que vencer, así que para él no hay segunda compuerta —
`interseccionDeTramos` solo entra cuando `affiliates.store_id` no es nulo.

Lo ya liquidado se paga igual: cerrar el mes congela el número (§51.f), y eso no
lo mueve nadie.

> ⚠️ **Las dos razones por las que algo no contó se cuentan por separado**, y no
> es cosmético: `sin_plan` (no pagó la referida) y `sin_mi_plan` (no pagué yo)
> mandan a llamar a personas distintas. Sumarlas en un número dejaría al
> comerciante reclamándole a su referido por algo que tiene que arreglar él.

### Dónde lo ve cada quien

**La misma ruta, dos contenidos** — el patrón que el panel ya usa para
`Tiendas`/`Marca`:

| Quién | Dónde | Qué ve |
|---|---|---|
| Kross | `Panel → Afiliados` | El programa entero: árbol, atribuir, cerrar el mes, pagar |
| El comerciante | `Panel → Afiliados` | **Su** enlace y **sus** referidas |
| El afiliado de fuera | `/afiliado` | Lo mismo que el comerciante, con su propio marco |

Los dos últimos son el **mismo componente**
(`src/components/PanelDeAfiliado.tsx`), con `suelto` decidiendo si trae marco y
botón de salir. Dos componentes para lo mismo se habrían separado en la primera
semana: uno arreglaría el conteo y el otro seguiría enseñando el viejo, y el que
reclama es el que cobra.

Quién ve qué lo decide el servidor (`quienLlama`), no la ruta: el enlace de una
marca lo ve **quien la administra** (`is_admin` sobre `sellers`, así que el
operador de esa marca también), no el vendedor raso — la comisión es de la marca,
no de quien atiende un pedido.

## §53 · El enlace no delata a la tienda, y el modo prueba no paga (12-set-2026)

Dos cosas que §52 dejó mal, y las dos se pagan con datos reales.

### El enlace es opaco

§52 usó el **slug** como código, y el código iba en la URL: `?ref=monoshop`. O
sea que cada vez que un comerciante repartía su enlace estaba publicando **el
subdominio de su tienda** —su dominio, su marca y su catálogo— a cualquiera que
lo recibiera. Para un comercio que compite con otros que también usan Kross, eso
no es un detalle: es entregarle a la competencia la lista de a quién mirar.

Ahora el enlace no lleva nada legible:

```
krossclub.app/u/48291733
```

`codigo` **no se va**: sigue siendo cómo se identifica a un afiliado en el panel
de Kross, que es donde tener un nombre legible sirve. Lo que cambia es que ya no
aparece en ninguna URL pública.

**Ocho dígitos y no seis.** Seis (900 000 posibles) se barren con un script en
una tarde, y el premio sería la lista de nombres de todos los afiliados. Ocho lo
suben a 90 millones: misma pinta, mismo largo al dictarlo, y deja de ser
barrible. No es un secreto —quien tenga el enlace ve el nombre, que es para lo
que existe— pero deja de ser una lista pública.

El `public_id` lo asigna **la base**, con un trigger (§53.a). Hay tres caminos
que crean afiliados (`manage-store`, la acción `crear`, el traspaso de §52.a) y
un afiliado sin identificador es un afiliado sin enlace, o sea inservible: el
trigger es el único sitio donde no hay que acordarse.

### «Has sido invitado por Javier López»

El visitante que llega por `/u/…` ve un aviso en el marco de la web pública, en
todas las páginas. No en un aterrizaje propio: un peaje entre el clic y el
producto gasta el clic. Y en todas, no solo en la primera — quien reparte el
enlace quiere que el nombre siga ahí **cuando el visitante llega a decidir**.

⚠️ **El nombre es el de la PERSONA, nunca el de la tienda.**
`affiliates.nombre` de un afiliado-tienda es el nombre de la marca, y enseñarlo
publicaría justo lo que esta sección vino a esconder. La acción `invitacion` lo
resuelve contra `sellers`: el administrador de esa marca. Si no hay
administrador que nombrar, **no hay aviso** — callarse es preferible a delatar a
una tienda.

Es la única acción **pública** de la Edge Function (va antes de la
autenticación: quien la llama es alguien que todavía no tiene cuenta). Devuelve
un nombre y nada más: ni el código, ni la tienda, ni si el afiliado existe.

### Último toque, 30 días

| | Antes (§51) | Ahora (§53) |
|---|---|---|
| Quién gana | el primer enlace pisado | **el más reciente** |
| Ventana | 90 días | **30 días** |

Manda el enlace más reciente: quien entre por el de otro afiliado queda
atribuido a ese otro. Con primer toque, el afiliado que de verdad convenció al
comerciante perdía el crédito contra otro cuyo enlace se pisó de pasada semanas
antes.

### El modo prueba no puede pagar comisiones

Con los dos modos de Stripe conectados a la vez —que es lo que hace falta para
poder seguir probando con el cobro real encendido— un pago de **prueba** entra
por el mismo webhook que uno de verdad. Sin distinguirlos, una tarjeta
`4242 4242 4242 4242` generaría un tramo pagado, ese tramo habilitaría
transacciones, y esas transacciones se convertirían en **soles que se le
transfieren a una persona**. Plata real por un pago que no existió.

Dos piezas:

- **Dos secretos.** `STRIPE_WEBHOOK_SECRET` y `STRIPE_WEBHOOK_SECRET_TEST`; la
  firma se prueba contra los dos y gana el primero que valide
  (`firmaValidaConAlguno`). Tener solo el de producción es el caso normal, no un
  error.
- **`livemode` guardado.** Stripe lo manda en cada evento. El tramo de prueba
  **se registra igual** —ver entrar el pago es lo que confirma que el webhook
  funciona— pero la liquidación cuenta solo `livemode = true`.

⚠️ **Que la firma sea válida no dice que el pago sea real.** Un evento de prueba
está tan bien firmado como uno de verdad: ese es el punto de tener los dos. Ante
la duda —un evento sin `livemode` legible— se asume **prueba**: la misma regla
que `desgloseDelEvento` en `comision.ts` (una cifra que no se midió no se
inventa), aplicada a lo que más caro sale equivocarse.

## Lo que falta, y lo que se decidió no hacer

- 🔮 **Probarlo de punta a punta.** No hay ningún evento real de Stripe todavía;
  la lectura de sus objetos está cubierta con pruebas contra la forma
  documentada, no contra un evento capturado. Es la misma etapa en la que
  estuvo Flow (`docs/12-FLOW.md`) antes del sandbox.
- 🔮 **Aviso al afiliado.** Hoy se entera de su liquidación cuando entra. Un
  push o un WhatsApp al cerrar el mes es una línea en `notificar.ts`, pero
  primero hay que tener meses cerrados de verdad.
- 🔮 **Segundo nivel.** El árbol ya está escrito; abrirlo es una tabla de
  tarifas por nivel y una vuelta más en el conteo. **Ojo con esto:**
  `docs/14-EVALUACION-KROSS-CLUB.md` es explícito sobre que en Perú un esquema
  que paga por reclutar y no por vender se lee como pirámide. Nivel 1 paga por
  **transacciones de tiendas reales**, que es lo contrario. Cada nivel que se
  agregue aleja el pago de la venta y acerca el programa a esa lectura.
- ⚠️ **Deuda: `stores.affiliate_id` es de lectura pública.** `stores` tiene
  política `SELECT` para `public` (la usa el storefront de cada marca), así que
  esa columna se puede leer desde el navegador. No expone a nadie —`affiliates`
  sí está cerrada, y el uuid no dice quién es—, pero permite saber qué tiendas
  comparten afiliado. Se arregla el día que `stores` deje de leerse entera
  desde el cliente; hacerlo hoy tocaría el storefront de todas las marcas.
- ⚠️ **El demo no lo enseña.** La regla de paridad de `CLAUDE.md` es sobre el
  panel de **una tienda**, y esto es de la plataforma: el demo llena la tienda
  de ejemplo, no la casa de Kross. Si algún día hay un demo del programa, va
  aparte.
