# Estado operativo

> **Última verificación contra la base: 21-ago-2026.**
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

## Marcas

| Marca | `id` | Activa | Cobro en línea | Catálogo | Pedidos |
|---|---|---|---|---|---|
| **Kross Shop** | `st_kross-shop_mt233mx7` | ✅ | ✅ **360pay en producción** (prefijo `KSH`) | 1 producto | 4 |
| **Gadicaf** | `t1` | ✅ | ⛔ sin conectar — ver bloqueo #1 | 1 producto | 1 |
| **Kross** | `platform` | ✅ | — (no vende: es la tienda de la plataforma) | 0 | 0 |
| **Culqi Test** | `store-culqi-test` | ⛔ desarmada | — | 1 producto | 0 |

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

### Los recojos en Lima ya entran a En vivo ✅ (26-ago-2026)

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
tests de regresión en `order-tracking.test.ts` y `live-map.test.ts`.

**No requiere deploy de Edge Functions** — es solo frontend, sale con el próximo build. Sí
sigue pendiente el deploy de `get-store-sessions` de la nota de abajo: sin él el mapa carga
vacío igual, porque no recibe los campos que dibuja.

### La libreta de clientes necesita un deploy (27-ago-2026)

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

### Cómo comprobar que un deploy entró

El CLI no dice mucho al terminar. Para ver qué versión quedó viva de cada función:

```
supabase functions list --project-ref ofdjghntvmrdfjhazfvz
```

La columna de versión sube en cada deploy y `updated_at` marca la hora. Si una función que
creías haber desplegado sigue con la fecha vieja, no entró — pasa cuando el CLI abre el
selector de proyectos y se cancela sin elegir.

### Las llamadas en el hilo necesitan SQL + deploy (27-ago-2026)

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

### Marcar un pedido como respondido (28-ago-2026)

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

```
supabase functions deploy get-session --project-ref ofdjghntvmrdfjhazfvz
```

Adjunta dos campos más a `buyer_contact` (que es **solo para el vendedor**, misma regla de PII
que el DNI): `activated_at` —si el comprador entró alguna vez a la app— y `push_activo` —si hoy
tiene una suscripción viva en `push_subscriptions`—. Sin el deploy, la ficha del cliente y el
botón de la cabecera muestran el caso "nunca ha entrado a la app" para todos: no rompe nada,
pero el dato no sirve hasta desplegar. No hay SQL: las dos columnas ya existen.

### En vivo y el CRM esperan el mismo deploy (26-ago-2026)

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
| `payment_reason` y los mensajes `sellers` pueden acabar frente al comprador vía `get-session?viewer=seller`. | `pay360-coupon/index.ts` · `notePaymentFailure` | Obliga a que **ningún texto de terceros** entre ahí. Es la razón de que los motivos de fallo sean frases cortas y propias, y de que el error crudo de 360pay vaya **solo** a los logs de la función. |
| Nada impide emitir un cupón por debajo de S/5. | `07-CONTRATO-360PAY.md` §6 | La comisión es plana: un adelanto de S/5 le deja S/0 al comercio. Falta un piso configurable por tienda, o caer a contraentrega puro cuando el adelanto no lo alcance. |
| `stores` no guarda RUC ni razón social de cada marca. | `07-CONTRATO-360PAY.md` §5 | El contrato con 360pay nos obliga a mantener ese registro de los comerciantes referidos. |
| `manage-store` mantiene vivo el camino legacy `admin_auth_id` para branding. | `01-SALES-ENGINE.md` §3.3 · `manage-store/index.ts:82` | Doble superficie de auth. Los campos de cobro ya exigen JWT verificado; falta retirar el resto. |
| Catálogo de distritos incompleto 🟡 | `02-SMART-LOGISTICS.md` § Deuda conocida | Afecta la cobertura de reparto. |
| La key de prueba de Olva API Perú viajó por el chat al recibirse. | `02-SMART-LOGISTICS.md` § Tracking de guías Olva | Rotarla al pasar a producción (se pide por el WhatsApp del proveedor) y recargar Vault/secret. Misma familia que el bloqueo #2. |
| La **clave de retiro** que genera el envío (`shalom_pickup_code`) no tiene todavía quién se la entregue al comprador cuando paga el saldo. | `27.d` del esquema · `pay360-webhook` | El checkout la promete desde el día 1 ("apenas pagues te enviamos tu clave"). Hoy queda guardada en el pedido y la manda una persona; el paso natural es que el pago del saldo la suelte solo. **No puede ir por `visibility: 'sellers'`**: con el token del comprador se lee igual (`?viewer=seller`). |
| `derivePhase()` del tracking Olva está calibrada sin guías reales — **y la cascada ya corre sobre ella** (barrido `olva-tracking-sync` + avisos + cobranza). | `supabase/functions/_shared/olva.ts` | Un texto mal clasificado dispara (o calla) la cobranza en el momento equivocado. Vigilar de cerca las PRIMERAS guías Olva registradas y calibrar contra sus textos reales. |

## Limpieza pendiente

- **`store-culqi-test`** quedó desarmada (`active=false`) y conserva 1 producto. Con Culqi
  fuera ya no tiene ningún motivo para existir: borrarla.
- **El cliente `Prueba Kross`** creado en el panel de 360pay para confirmar la forma del
  `POST /customers`. Borrarlo desde `console.360pay.pe` → Clientes.

## Cuándo tocar este doc

Cuando cambie algo que la BD no explica sola: se enciende o apaga un cobro, entra una marca
nueva, se destraba o aparece un bloqueo, se salda una deuda. **Y siempre la fecha de
arriba** — un doc de estado sin fecha no se puede creer.
