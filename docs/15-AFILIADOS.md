# 15 · AFILIADOS — Quién trajo a quién, y cuánto se le debe

> **Objetivo:** que entregar un enlace de afiliado, saber quién está debajo de
> quién, comprobar si la suscripción del comercio está al día y calcular lo que
> se le debe a cada afiliado sean **cuatro consultas y no una hoja de cálculo**.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado
>
> Estado: **✅ construido, 🟡 sin correr en producción** (10-set-2026). Falta el
> SQL, los dos deploys y la cuenta de Stripe conectada — ver *Puesta en marcha*.

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
?ref=jhoann          →  localStorage (90 días, primer toque gana)   src/lib/referido.ts
   ↓ el lead se manda
web_orders.affiliate_code  (texto)                                   web-order
   ↓ el lead se convierte en tienda
stores.affiliate_id + affiliate_at  (relación)                       manage-store
```

**Se guarda el código en texto durante el tramo del lead y se resuelve a un id
recién al crear la tienda.** En el momento del lead el código puede no resolver
—un enlace viejo, un afiliado dado de baja— y un texto que no resuelve es un
dato que se puede investigar; una FK que no resuelve es un lead que se pierde.

**Primer toque gana**, con ventana de 90 días. Es lo que hace que el programa se
explique en una frase: *si tú lo trajiste, es tuyo*. Con último toque, quien
pauta sobre la marca se lleva los referidos que otro trabajó a mano.

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
| `src/pages/afiliado/AfiliadoPage.tsx` | `/afiliado` — su enlace, su mes, sus tiendas, su rama |
| `src/pages/vendedor/AfiliadosPage.tsx` | `Panel → Afiliados` — el árbol, atribuir, cerrar el mes, marcar pagado |

Pruebas: `src/lib/afiliados.test.ts` (37), `src/lib/stripe.test.ts` (18),
`src/lib/referido.test.ts` (7).

### Lo que el webhook contesta, y por qué importa

Stripe reintenta durante tres días todo lo que no sea 2xx:

- firma inválida o cuerpo ilegible → **400**. Nunca va a mejorar.
- evento que no nos toca → **200**. Recibido y descartado.
- falló la escritura → **500**, **a propósito**. Un `invoice.paid` que se pierde
  por un error transitorio es un mes pagado sin registrar, y eso es un afiliado
  al que no se le paga lo que ganó.

Dos defensas más, cada una contra un problema distinto:

- **Idempotencia** — índice único sobre `stripe_invoice_id`. La misma factura
  llega dos y tres veces (y `invoice.paid` e `invoice.payment_succeeded` se
  disparan los dos por el mismo cobro).
- **Orden** — Stripe **no garantiza el orden**. Un `subscription.updated` viejo
  que llega después de uno nuevo haría retroceder el estado, y una suscripción
  cancelada volvería a figurar activa sola. Se compara `stripe_event_at` contra
  lo guardado y se descarta lo viejo.

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
   Es idempotente: §51 se agrega y lo anterior no se toca.
2. **Secreto** — `STRIPE_WEBHOOK_SECRET` = el `whsec_…` del endpoint. **No hace
   falta ninguna API key de Stripe**: esta función solo escucha.
3. **Deploys**
   ```
   supabase functions deploy afiliados       --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy stripe-webhook  --project-ref ofdjghntvmrdfjhazfvz --no-verify-jwt
   supabase functions deploy web-order       --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy manage-store    --project-ref ofdjghntvmrdfjhazfvz
   ```
4. **Stripe** — crear el producto de $67/mes y el endpoint apuntando a
   `…/functions/v1/stripe-webhook`, suscrito a: `checkout.session.completed`,
   `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.
5. **Enlazar cada tienda con su cliente de Stripe.** Es el paso que hay que
   hacer bien o nada cuenta. Dos formas, y la primera es la buena:
   - **Checkout Link con `client_reference_id = <store_id>`** — el comercio se
     da de alta solo y el enlace queda hecho.
   - `metadata.store_id` en la suscripción, si se crea desde el dashboard.

   Sin ninguno de los dos, el webhook resuelve por `stripe_customer_id` contra
   `store_subscriptions` — que solo sirve **después** de que el primer evento ya
   dejó el enlace escrito.

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
