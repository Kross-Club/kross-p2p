# 18 · KROSS FORM, EL FORMULARIO COMO EMBED

> **Diseño cerrado. Pieza 1 construida** (17-set-2026). Este archivo es el contrato: se
> escribió ANTES del código para que las decisiones —dónde vive cada pieza, quién manda el
> monto, qué dominio puede embeber qué— no se tomen a mitad de un commit.
>
> Viven ya la aritmética (§5) —`adelantoFromPacks`, `adelantoDelPedido` y la regla de destino,
> con su espejo en el navegador— y el esquema con su panel (§4, §5.b): `embed_keys`,
> `products.cobra_completo`, el adelanto por pack en el editor de productos y la compuerta
> `stores.kross_form`. Falta el script, `embed-order` y la vuelta a WhatsApp.
>
> Kross Form es **el checkout de Kross servido como `<script>` en la página de otro**. Nace
> para los clientes de dropshipping que ya usan GoHighLevel y Neural, arman su web en
> **GemPages** y hoy pegan ahí un botón de Releasit. Tienen Shopify solo como catálogo.
>
> No es la PWA. No es una app de Shopify. Es un formulario, un cobro opcional de Yape y un
> botón a WhatsApp — y vive en el mismo Supabase de la PWA (`ofdjghntvmrdfjhazfvz`), porque
> reutiliza su riel de cobro entero.
>
> Leer junto con `12-FLOW.md` (el cobro), `09-PIXELS-CAPI.md` (el Purchase server-side) y
> `01-SALES-ENGINE.md` (de dónde sale el formulario que se está recortando).

## 1. Por qué fuera del App Store de Shopify

La regla de Shopify es explícita: están prohibidas las apps que *"bypass checkout or payment
processing, or register any transactions through the Shopify API in connection with such
activity"*. Un formulario que cobra Yape por Flow dentro de la página **es exactamente eso**,
y es rechazo en revisión, no zona gris.

Releasit sí está en la galería, y la diferencia explica la regla: **Releasit no procesa
dinero**. Crea la orden en Shopify marcada COD/pendiente vía Admin API. No hay pago que
evadir. Lo que el comerciante pega en GemPages no es el formulario: es un botón con una clase
CSS que dispara el formulario que la app ya inyectó.

Cobrar Yape dentro del formulario solo sería legal como **payments extension**, y eso es un
programa cerrado: postular como Payments Partner, ser aprobado, firmar revenue share con
Shopify y mostrar únicamente medios que Shopify apruebe. Meses, con resultado incierto.

**Así que Kross Form no es una app de Shopify.** Nunca instala nada, nunca llama a su API,
nunca toca su checkout. Es un script de terceros en una página web, como un chat widget o un
pixel — y el Partner Program Agreement solo obliga a quien es partner. No lo somos.

**Lo que se gana:** cero revisión, cero espera de 2-4 semanas, cero webhooks GDPR
obligatorios, cero Billing API, cero 15 % de revenue share. Se cobra por Stripe como ya hace
`15-AFILIADOS.md`, y se despliega el mismo día.

**Lo que se pierde, y es real:** el pedido **no existe en Shopify**. Sin descuento de stock,
sin orden en su admin, sin fulfillment, sin sus analytics. Para este ICP no importa —el stock
en drop se lleva como ilimitado y la operación vive en Neural—, pero un cliente que dependa
del stock de Shopify **no puede usar Kross Form tal cual**. Es el criterio de exclusión.

Y se pierde la galería: no hay descubrimiento. Se vende uno a uno, a clientes que ya son
nuestros. Esa es la apuesta.

## 2. Las tres piezas y sus tres dominios

| Pieza | Dónde | Qué la caracteriza |
|---|---|---|
| **El script** | `js.krossform.com/kf.js` | Público, cache larga, **sin sesión ni cookies**. Lo carga la página del comerciante. |
| **El panel** | `krossform.com` | Sesión de Supabase. El comerciante carga productos, packs y adelantos. |
| **Las funciones** | `ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/*` | CORS por allowlist de dominio, nunca `*`. |

Separar el script del panel en subdominios distintos no es estética: el script se sirve a
miles de navegadores en páginas ajenas y no debe compartir origen con nada que tenga sesión.

**El mismo Supabase que la PWA, y es obligatorio.** El panel lee `products`, `order_sessions`
y `cobros`; el cobro pasa por `flow-order`/`flow-confirm`/`flow-return`. Ponerlo en el proyecto
de Neural (`nqibrziksedspoctjhmc`, otro esquema, otra región) sería dos fuentes de verdad para
el mismo pedido.

### 2.a El panel dentro de Neural

`neural.kross.club` embebe `krossform.com` en un iframe. El comerciante se loguea dos veces
—una en Neural, otra en Kross Form— y **eso está aceptado**: el SSO (Neural firma un token
corto, `kf-sso` lo canjea por sesión) es trabajo en los dos repos y no bloquea el lanzamiento.
Queda para v2. Quien no quiera el iframe, abre `krossform.com` directo.

⚠️ **Hoy el iframe sale en blanco.** `vercel.json` manda `X-Frame-Options: SAMEORIGIN` para
`/(.*)`. Hay que reemplazarlo **solo en las rutas del panel** por:

```
Content-Security-Policy: frame-ancestors https://neural.kross.club
```

y dejar `SAMEORIGIN` en todo lo demás. **Nunca `frame-ancestors *`** en un panel que mueve
dinero: eso es clickjacking servido en bandeja.

Y un efecto que hay que conocer antes de que alguien lo reporte como bug: la sesión dentro de
un iframe cross-site vive **particionada** (storage partitioning de Chrome, ITP de Safari).
Supabase guarda en `localStorage`, así que funciona, pero esa sesión no es la misma que la de
`krossform.com` abierto en su propia pestaña, y Safari puede borrarla a los ~7 días. Es un
re-login ocasional, no una falla. Con el SSO de v2 deja de notarse.

## 3. El snippet

Calcado del gesto que estos comerciantes ya conocen de Releasit: un botón cualquiera de
GemPages con una clase en *Advanced → CSS Class*.

```html
<!-- una sola vez en la página -->
<script defer src="https://js.krossform.com/kf.js" data-kf="pub_9f3a2c"></script>

<!-- el disparador, tantos como packs se quieran ofrecer -->
<button class="kf-open" data-kf-producto="gorra-negra" data-kf-pack="2 unidades">
  Pedir ahora
</button>
```

Reglas del script:

- **Shadow DOM, no `!important`.** El formulario se monta en un shadow root cerrado. Es lo
  único que aguanta el CSS de GemPages más el del theme más el del siguiente builder. Sin
  esto, el embed se rompe cada semana en una tienda distinta.
- **Sin React.** Bundle propio, entry aparte en `vite.config.ts`, objetivo < 20 KB gzip.
  `CheckoutModal.tsx` no se reutiliza tal cual: arrastra Supabase, sesión y el contexto
  multi-tenant por subdominio (`src/lib/store-context.tsx`) que aquí no aplica.
- **Nada bloquea el render.** `defer`, y el formulario se arma al primer clic.

## 4. `embed_keys`: la key es pública, lo que autoriza es el dominio

```sql
CREATE TABLE IF NOT EXISTS embed_keys (
  public_key          text        PRIMARY KEY,   -- pub_… , viaja en el HTML de cualquiera
  store_id            text        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  dominios_permitidos text[]      NOT NULL DEFAULT '{}',
  whatsapp            text,                      -- a dónde va el comprador al final
  activo              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE embed_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON embed_keys FROM anon, authenticated;
```

El `whatsapp` vive en la llave y no en `stores` porque un comerciante puede repartir los
pedidos de dos landings a dos números distintos sin tener dos tiendas. Y el RLS va con
`REVOKE` como `store_secrets`: la tabla la escribe y la lee el service role desde las
funciones, nunca el navegador.

La `public_key` está a la vista en el código fuente de la página: **no es una credencial**.
Lo que decide si una petición se atiende es el `Origin`, contrastado contra
`dominios_permitidos`. Y el `Access-Control-Allow-Origin` de la respuesta devuelve **ese
origen exacto**, nunca `*` — por ahí viajan nombre, DNI y teléfono del comprador.

La key tampoco da lectura: no existe ningún endpoint que, con la key, liste pedidos o
compradores. Solo escribe pedidos nuevos.

### 4.a `stores.kross_form`: la compuerta

Un booleano por tienda, apagado por defecto. Mientras esté en `false`, el editor de productos
**no enseña ni un campo del embed** —ni el adelanto del pack, ni el interruptor de cobrar el
100 %— y el guardado no manda esas claves, así que la marca no puede ni escribirlas por
accidente. Es lo que hace que §68 del esquema sea invisible para las marcas que hoy venden en
krossclub.app (§10).

Dónde vive el panel de Kross Form es harina de otro costal y **sigue sin decidirse**: el
editor de productos que hoy enciende esta compuerta es el de la PWA, y el doc dice
`krossform.com` (§2). Las dos opciones —un despliegue aparte del mismo repo, o la misma app
sirviéndose en los dos dominios y ramificando por hostname como ya hace `store-context`— dan
el mismo editor, así que la compuerta sirve igual en las dos. Hay que elegir antes de la
pieza 4.

## 5. El adelanto: monto por pack

Ésta es la decisión que más código toca, así que va completa.

`products.packs` es un `jsonb` de `[{ nombre, descripcion, precio, image? }]`, y
`priceFromPacks()` (`supabase/functions/_shared/advance.ts:108`) empareja el pack **por
`nombre`**. El adelanto entra como un campo más del mismo objeto:

```jsonc
{ "nombre": "2 unidades", "descripcion": "…", "precio": 89, "adelanto_pen": 20 }
```

Y se lee con una hermana `adelantoFromPacks()` escrita **al lado**, con la misma regla de
emparejamiento. Cero tablas nuevas, cero migración de datos, y se conserva intacta la
invariante que más pesa: **el monto jamás viene del navegador**, se re-deriva contra la fila
del producto.

Es un **monto en soles, no un porcentaje**: es lo que el comerciante dice en voz alta ("que
adelanten 20 soles") y no tiene redondeos que explicar.

### 5.a La escalera, en este orden exacto

```
adelantoDelPedido(pack, dispatch_type, producto):

  1. dispatch_type termina en _LIMA   → 0                    (contraentrega, SIEMPRE)
  2. producto.cobra_completo          → precio del pack
  3. pack.adelanto_pen > 0            → min(adelanto_pen, precio del pack)
  4. producto.permite_mitad           → round(precio * 0.5)
  5. si no                            → 0
```

**Lima primero porque es la regla de seguridad**, no la comercial: Lima y Callao son
contraentrega y ningún dato del producto puede cambiarlo.

Bordes, definidos para que nadie los improvise:

- `adelanto_pen` ≥ precio del pack → se cobra el precio del pack. Nunca más que el pedido.
- `adelanto_pen` ausente, `0`, negativo o basura → ese pack **no cobra adelanto**: va
  contraentrega aunque sea provincia. La dirección segura acá es no cobrar, no cobrar de más.
- El redondeo al sol se mantiene (`Math.round`): el comprador yapea a mano y "S/69.50" invita
  a teclear mal.

### 5.b Qué es toggle y qué es el camino principal

En v1 el camino del embed es **solo el adelanto por pack**. Lo demás queda como interruptores
del producto, apagados por defecto, que existen para la PWA y no estorban acá:

| Regla | Dónde vive | v1 en el embed |
|---|---|---|
| `packs[].adelanto_pen` | nuevo, en el jsonb del pack | **el camino** |
| `products.permite_mitad` | ya existe (§56) | toggle, apagado |
| `products.descuento_pen` | ya existe (§56), oferta de salida | toggle, 0 |
| `products.cobra_completo` | nuevo, booleano | toggle, apagado |

### 5.c La escalera se AGREGA; `advanceForServer` no se toca

La tentación era reescribir `advanceForServer()` para que entendiera montos además de
`HALF`/`FULL`. **No se hizo, y es la decisión que protege a la PWA** (§11): esa función es la
que cobra todos los pedidos de krossclub.app, y un cambio ahí es un cambio en el adelanto de
todas las marcas vivas para ganar algo que solo necesita el embed.

Lo que hay en su lugar, en el mismo `_shared/advance.ts`:

| Función | Qué hace |
|---|---|
| `esContraentregaPorDestino(dispatchType)` | El peldaño 1. Lima, Callao y cualquier destino desconocido → contraentrega |
| `adelantoSaneado(v)` | Lo que el panel guardó, redondeado al sol; basura → 0 |
| `adelantoFromPacks(packs, packName)` | El monto del pack, emparejado por `nombre` igual que `priceFromPacks` |
| `adelantoDelPedido(entrada)` | La escalera de §5.a |

Los peldaños 2 y 4 **delegan en `advanceForServer`** en vez de repetir su aritmética, así que
el redondeo al sol sigue estando escrito una sola vez.

Y el espejo del navegador vive en `src/lib/checkout/adelanto-pack.ts`, archivo aparte de
`checkout.config.ts` por peso (el bundle de `kf.js` apunta a < 20 KB y no debe arrastrar la
cobertura ni la copy del checkout de la PWA) y por separación. `advance-parity.test.ts` los
compara valor por valor sobre toda la matriz: precio × adelanto × destino × los dos toggles.

## 6. Los dos caminos del comprador

```
LIMA / CALLAO  —  contraentrega
  clic → formulario → embed-order → pedido creado
                                  → 302 a wa.me con todo prellenado

PROVINCIA  —  adelanto por Yape
  clic → formulario → embed-order → flow-order → deeplink de Yape (celular)
                                               → o la página de Flow
       → el comprador paga
       → flow-confirm   (webhook firmado: ÉSTA es la verdad del pago)
       → flow-return    (POST del navegador de vuelta)
            ├─ Purchase por CAPI          ← server-side, obligatorio
            └─ 302 a wa.me con el pedido + "ya pagué"
```

`dispatch_type` ya discrimina el destino en `order_sessions`
(`MOTORIZADO_LIMA | MOTORIZADO_PROVINCIA | AGENCIA_PROVINCIA | AGENCIA_LIMA`), así que la
bifurcación no inventa un campo: usa el que el pedido ya tiene.

⚠️ **La regla de destino vive en el servidor.** Si "Lima → sin adelanto" se evalúa en el
formulario, cualquiera abre el inspector, declara Lima y se lleva un pedido a provincia sin
adelantar nada. Va pegada a `adelantoDelPedido()`, en `_shared/advance.ts`.

## 7. La vuelta: WhatsApp con el pedido prellenado

Los dos caminos terminan en `wa.me/<numero-de-la-tienda>?text=…` con la información que el
comprador acaba de escribir: producto, pack, nombre, teléfono, destino, código del pedido y
—si pagó— el monto adelantado.

Tres cosas que hay que respetar:

- **El Purchase se dispara server-side.** Como el comprador se va a WhatsApp, el pixel del
  navegador no alcanza. Sale por CAPI desde `flow-return`, que ya corre `runInBackground`
  (`_shared/capi.ts`). Ver `09-PIXELS-CAPI.md`.
- **`flow-return` necesita una rama.** Hoy redirige siempre a
  `https://<slug>.krossclub.app/p/<token>`. Los pedidos de embed no tienen slug de PWA: van a
  `wa.me`. Se distingue por el origen del pedido, no por un parámetro de la URL de retorno
  —que Flow conoce y cualquiera podría tocar.
- **El texto se recorta.** Un `text=` largo se rompe en algunos navegadores; el mensaje se
  arma con un tope y lo que no entra queda en el pedido, no en la URL.

## 8. Lo que v1 NO hace

Escrito para que nadie lo dé por supuesto:

- **No emite boleta.** `16-NUBEFACT.md` es para quien paga el pedido completo; acá el grueso
  va contraentrega. Se agrega cuando haya un cliente que lo pida.
- **No crea envío en Shalom, Olva ni Eva.** El pedido llega a WhatsApp y el vendedor coordina.
- **No sincroniza nada con Neural.** Ni catálogo ni pedidos. El push `pedido.pagado` → Neural,
  para su gráfica de facturación, es v2.
- **No hay SSO.** Dos logins, aceptado (§2.a).
- **No gestiona stock.** En drop es ilimitado. `products` no tiene columna de stock y no se le
  agrega.

## 9. Las invariantes que no se negocian

1. **El monto nunca viene del navegador.** Se re-deriva del producto y del pack, siempre.
2. **CORS por allowlist de dominio**, devolviendo el origen exacto. Jamás `*` en un endpoint
   que recibe datos del comprador.
3. **`frame-ancestors` con un dominio literal**, nunca comodín.
4. **La `public_key` no lee nada.** Solo escribe pedidos.
5. **`flow-confirm` es la verdad del pago.** `flow-return` es una cortesía del navegador y una
   segunda oportunidad; nunca la fuente.
6. **La regla de destino se evalúa en el servidor.**
7. **Kross Form no cambia el comportamiento de krossclub.app.** Agrega; no reescribe (§10).

## 10. Kross Form no toca krossclub.app

**Es una regla, no una aspiración.** Kross Form y la PWA comparten base de datos, riel de
cobro y este repositorio. Esa cercanía es lo que hace barato construirlo — y lo que haría
fácil romper, desde una funcionalidad para drop, el checkout de una marca que ya está
vendiendo hoy.

Lo que la regla obliga, en concreto:

1. **Nada que la PWA llame cambia de comportamiento.** `advanceForServer`, `advanceFor`,
   `eleccionDeAdelanto`, `ofertaDelProducto`, `priceFromPacks` y `saneaProducto` quedan tal
   cual. Kross Form agrega funciones hermanas; no reescribe las de nadie (§5.c).
2. **Las columnas nuevas nacen con el default de hoy.** `packs[].adelanto_pen` ausente y
   `cobra_completo` en `false` describen exactamente el producto que existe ahora: un pedido
   de krossclub.app se comporta igual con la columna que sin ella.
3. **Ninguna ruta nueva en la PWA.** El panel de Kross Form es su propio dominio. Lo que se
   comparte son funciones puras y tablas, no pantallas.
4. **`vercel.json` se toca por ruta, no en bloque.** El `frame-ancestors` que necesita
   `krossform.com` no puede aflojar el `X-Frame-Options` que protege al panel de la PWA (§2.a).
5. **Lo prueba un test, no la buena intención.** `advance-parity.test.ts` tiene un bloque
   —*krossform.com no toca krossclub.app*— que falla si alguien mete la escalera del embed
   dentro de las funciones de la PWA, o si un producto sin nada de Kross Form deja de
   comportarse como siempre.

La dirección también vale al revés: una regla de la PWA (§56, la mitad; la oferta de salida)
no se cuela al embed porque sí. En el embed son toggles apagados (§5.b).

## 11. Orden de construcción

| # | Qué | Por qué en este orden |
|---|---|---|
| 1 | ✅ `adelantoFromPacks()` + la escalera de §5.a + paridad | Es la aritmética; todo lo demás la llama |
| 2 | ✅ `embed_keys` + `cobra_completo` + el panel de packs con adelanto | El comerciante tiene que poder configurar antes de que exista el form |
| 3 | `embed-order` (CORS por allowlist, hermana de `web-order`) | El endpoint que recibe |
| 4 | `kf.js` con Shadow DOM | El formulario |
| 5 | La rama de `flow-return` a `wa.me` + Purchase por CAPI | Cerrar el camino de provincia |
| 6 | `frame-ancestors` en `vercel.json` + dominios en Vercel | Lo último: no bloquea nada de arriba |
