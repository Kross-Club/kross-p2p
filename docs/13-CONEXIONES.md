# 13 · CONEXIONES — Las APIs de terceros y sus fallos

> **Objetivo:** que cuando una API de la que dependemos falle, se pueda decir
> exactamente **cuál, desde cuándo, con qué error y con qué identificador** —sin
> entrar al dashboard de Supabase a leer logs a mano—, y que ese identificador
> sirva para reclamarle al dueño de esa API.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## El problema que resuelve (03-set-2026)

Kross se apoya en **catorce APIs que no controla**: los dos rieles de cobro, los
tres proveedores de tracking, WhatsApp, RENIEC, LiveKit, los CAPI de Meta y
TikTok, la voz de IA, el correo de reclamaciones, el push y el geocoding.

Hasta hoy, cuando una fallaba el error terminaba en un `console.error`. Eso
significaba tres cosas, y las tres se pagaban en el peor momento:

1. **No había dónde mirar.** Para saber si 360pay estaba caído había que entrar
   al dashboard de Supabase, elegir la función correcta y leer logs por hora.
2. **No había identificador.** Reclamarle a un proveedor empezaba por *"ayer nos
   falló"*, que no es un reporte. Ellos piden su `x-request-id`; nosotros no lo
   guardábamos.
3. **Un `healthz` en verde tapaba el problema.** El semáforo que ya existía
   preguntaba *"¿estás vivo?"*, no *"¿mis llamadas te están funcionando?"*. Un
   proveedor que responde el chequeo y rechaza las llamadas reales se veía
   verde.

## Cómo funciona

### La tabla · `api_events` (§42 del esquema)

Guarda lo que **no** salió bien, más un **latido `OK`** por barrido o chequeo
—para que haya línea de tiempo sin que la tabla crezca con cada request—. Se
purga sola a los **30 días** (`api-events-purge`, pg_cron): un fallo de hace tres
meses no se le reclama a nadie.

| Campo | Qué es |
|---|---|
| `ref` | **El identificador que se le enseña al proveedor**: `KX-7QK4M2`. Corto, legible por teléfono (alfabeto Crockford: sin I, L, O ni U) y con prefijo propio para que se reconozca en un hilo de soporte |
| `provider` · `op` | Quién y qué se le pedía, en el vocabulario de Kross (`guia.emitir`, `cupon.crear`, `tracking.lote`) y no en el suyo |
| `outcome` | `OK` · `RECHAZO` (4xx: contestó, casi siempre es config nuestra) · `FALLO` (5xx: es de ellos) · `SIN_RESPUESTA` (timeout, red) |
| `provider_ref` | **SU** id de request (`x-request-id`, `cf-ray`, `x-amzn-requestid`…). Es lo primero que pide su soporte |
| `detail` | Su respuesta cruda, **saneada** y recortada a 600 caracteres |
| `store_id` · `session_id` | De qué marca y de qué pedido salió la llamada, cuando aplica |
| `duration_ms` | Cuánto tardó. Un proveedor que responde en 40 s no está sano aunque responda |

⚠️ **`detail` pasa siempre por `sanear()`.** Una respuesta de error suele
devolver de vuelta lo que le mandaste, y lo que le mandaste incluye llaves,
tokens y contraseñas de terceros. La regla del repo es que un secreto no se
escribe en ningún lado, y una tabla que el panel muestra es el peor sitio
posible: se tapan `Bearer …`, los pares `password`/`api_key`/`token`/`secret`
(en JSON y en querystring) y cualquier chorizo de 40+ caracteres que parezca una
llave aunque nadie lo nombre. Está cubierto con tests
(`src/lib/integraciones.test.ts`) porque es la clase de cosa que solo se descubre
cuando ya se publicó.

### Las dos mitades del código

| Pieza | Qué hace |
|---|---|
| `_shared/integraciones.ts` | **Pura y compartida** con el panel: el catálogo de las catorce, `sanear()`, `nuevaRef()`, `refDelProveedor()` y `saludDe()`. Servidor y pantalla dicen lo mismo porque leen lo mismo |
| `_shared/api-eventos.ts` | La que escribe. `anotar`, `anotarRespuesta`, `anotarSinRespuesta`, `anotarResultado` (para `flow.ts`/`pay360.ts`, que son puros) y `anotarCapi` |
| `supabase/functions/integraciones` | La que lee: acciones `estado`, `eventos` y `evento` |
| `src/pages/vendedor/ConexionesPage.tsx` | La pantalla |

Tres reglas del que escribe, y ninguna se negocia:

1. **Nunca tumba la llamada que estaba anotando.** Todo en `try/catch`, nada se
   propaga. Un log que rompe producción es peor que no tener log.
2. **Nunca guarda un secreto** (arriba).
3. **No anota los éxitos uno por uno.** Se anota lo que falla, más el latido.
   Anotar cada request exitosa llenaría la tabla de ruido y escondería justo lo
   que se busca. **La excepción es `guia.emitir`**: cada guía emitida cuesta
   plata, así que esa se anota salga bien o mal.

### El veredicto de salud

`saludDe()` combina **dos** señales, y ahí está la gracia:

| Estado | Cuándo | Qué significa |
|---|---|---|
| 🟢 **Operativa** | responde el chequeo y 0 fallos en 24 h | nada que hacer |
| 🟡 **Con fallos** | **responde el chequeo pero viene fallando** | el caso que antes no se veía: healthz verde, llamadas rebotando |
| 🔴 **Caída** | no responde el chequeo | plan B manual |
| ⚪ **Sin configurar** | no hay llave | **no es lo mismo que caída**: no está montada |
| ⚪ **Sin datos** | no expone un chequeo barato y no hay eventos | preguntarle a RENIEC cuesta; mandar un WhatsApp también |

Solo tres proveedores exponen un chequeo gratis: **Shalom PE** (`/healthz`),
**Olva** (`/healthz`) y **Shalom LAT** (`/validate`, que además confirma que la
llave sigue activa — la mitad de las veces que una integración "se cae", lo que
pasó es que venció su llave). Para el resto, el veredicto sale del historial.

## La pantalla · Panel → **Conexiones** ✅

En el menú **solo de la plataforma** (`seller-nav.ts`), junto a Tiendas y
Equipo. El admin de una marca puede abrirla por URL y ve sus propios eventos,
pero no la lleva en el menú: cuando algo de esto se cae, quien lo destraba es
Kross, y ponerle delante todos los días un tablero que no puede accionar es
ruido.

Ordena por **daño**: lo caído primero, después lo que falla, después lo sano, y
al final lo que ni está montado. De cada una dice qué hace, **de quién es** (a
quién hay que reclamarle) y —en las que se configuran por marca— *en cuántas de
mis marcas está lista*, que convierte "Flow está bien" en "Flow está bien en 2
de 5".

Arriba de todo, el **buscador de referencia**: alguien reporta `KX-7QK4M2` y se
abre ese evento con su hora, su operación, su status, el id de request del
proveedor y su respuesta. Es el caso de uso de soporte y por eso está primero.

### Quién puede verla

**Solo por JWT verificado**, y solo un admin. A diferencia de `manage-store`,
esta función **no acepta** el atajo `admin_auth_id` (cuyo valor conoce
cualquiera, porque `stores` es de SELECT público): la pantalla nace después, así
que nace sin esa deuda. Quien administra la plataforma lo ve todo; el admin de
una marca ve el mismo tablero, pero sus eventos son los de **su** tienda — el
texto crudo de un proveedor puede traer datos de un pedido, y los pedidos de una
marca no son de otra.

## Qué está instrumentado ✅

Todo el stack, en el punto donde se sabe **de qué marca** era la llamada:

| Proveedor | Dónde se anota |
|---|---|
| **360pay** | `pay360-coupon` (cliente y cupón), `pay360-webhook` (firma rechazada, estado del cupón) |
| **Flow** | `flow-order` (crear la orden), `flow-confirm` (consultar su estado) |
| **Shalom PE** | su helper `llamar()` en `shalom-order` cubre catálogo, persona, emisión, reconciliación y el PDF; más el barrido y la consulta puntual en `_shared/shalom-rastreo.ts` |
| **Shalom LAT** | su propio `llamar()` en `shalom-lat-emisor` (instancia, sesión, pendientes, emisión) y el rastreo en el router |
| **Olva** | `olva-tracking` y `olva-tracking-sync` |
| **WhatsApp** | `send-wa-template`, `run-campaign`, `invite-buyers`, `list-wa-templates`, `seller-call-token` y `_shared/notificar.ts` |
| **Meta CAPI · TikTok** | los tres sitios que disparan conversiones, vía `anotarCapi` |
| **RENIEC (Decolecta)** | `dni-lookup` |
| **Web Push** | `_shared/notificar.ts` — solo cuando fallaron **todas** las suscripciones (una muerta es normal) |
| **ElevenLabs · Resend · Nominatim** | sus funciones |

Dos detalles de diseño que evitan inundar la tabla: en las **campañas** y las
**invitaciones** se anota **una vez por corrida** (una plantilla mal aprobada
falla en las 300 y serían 300 renglones del mismo error), y los **barridos**
dejan un solo latido por corrida, no uno por guía.

`flow.ts` y `pay360.ts` **no importan** `api-eventos.ts` y no van a hacerlo: son
puros porque los importa `npm test`, donde no hay Deno. Se anotan desde la Edge
Function, que además es donde se sabe de qué marca era la llamada — y en los
rieles de cobro las llaves son de cada marca, así que un `401` sin saber de quién
no sirve para nada.

## Lo que falta 🔮

- **Aviso proactivo.** Hoy hay que entrar a mirar. Lo natural es que una
  integración crítica que pasa a `CAIDA` avise al equipo de Kross (push o
  WhatsApp) en vez de esperar a que alguien abra la pantalla.
- **Tendencia.** Se ven los fallos de 24 h y los últimos 30 días en lista; falta
  la curva que distingue "se cayó hoy" de "viene degradándose hace una semana".
- **Latencia como señal.** `duration_ms` se guarda pero todavía no se usa para
  el veredicto: un proveedor que responde en 40 s no está sano.
