# 00 · CORE ARCHITECTURE — Base de datos, Autenticación y Panel Admin

> Módulo base del **Sistema Operativo de E-commerce Perú (Kross)**. Todo lo demás
> (Sales, Logistics, Loyalty) se apoya en lo que aquí se define. Antes de tocar otro
> módulo, respeta estos estándares.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Rol del módulo

Provee: multi-tenancy white-label, autenticación de equipo, panel de administración y
el **estado central del cliente** (`MerchantCustomerSession`) que los tres módulos leen
y actualizan.

## Stack ✅

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS 4. Deploy en Vercel.
- **Backend:** Supabase — Postgres + RLS, Edge Functions (Deno), Storage (buckets
  públicos `branding` y `products`, privado `call-recordings`), Realtime (broadcast).
  Las imágenes que sube el panel se reducen en el navegador antes de subirlas
  (`src/lib/images/downscale.ts`): el comprador las descarga en 4G.
- **Multi-tenant:** subdominio → tienda vía `src/lib/store-context.tsx`
  (`marca.krossclub.app`). `isPlatformHost()` separa la plataforma de una marca.
  Branding por marca con variable CSS `--brand`.

## Autenticación & roles ✅

- **Supabase Auth** para el equipo (`sellers.auth_user_id`).
- **Quien administra la plataforma (Kross):** ve **Tiendas** y **Equipo**, y **Entra**
  a una tienda para operarla (impersonación `acting`/`effective` en
  `src/lib/seller-session.ts`). Ya **no** es la bandera suelta: la pregunta la responde
  `supabase/functions/_shared/alcance.ts` — ver *El alcance sale de dónde vive* abajo.
- **Admin de tienda:** `is_admin`, scoped a su `store_id`. Lo ve todo.
- **Operador:** `is_admin` + `is_operator` (28-ago-2026). Ver más abajo.
- **Roles de equipo (`role_label`):** el modelo por defecto solo usa **Logística**,
  que supervisa que el seguimiento automático (checkout → cobro → tracking) esté
  funcionando bien; la venta la cierra la app sola y el reparto lo hace la agencia,
  así que no hacen falta vendedores ni motorizados. Ventas · Soporte · Motorizado
  quedan como roles **legado**: el panel ya no los ofrece al crear/cambiar rol,
  pero se siguen reconociendo — si una tienda aún conserva Ventas, sus vendedores
  reciben los pedidos nuevos primero; sin Ventas, se asignan a Logística.
- **Equipo de UN pedido (29-ago-2026):** los roles de arriba dicen qué puede alguien en la
  **tienda**; quién manda en **un pedido** es otra pregunta, y vive en
  `supabase/functions/_shared/equipo-pedido.ts` — el único archivo del repo que leen el panel
  y el servidor con la misma respuesta. Un pedido tiene **un responsable**
  (`assigned_seller_id`) y alrededor invitados que también escriben
  (`writer_seller_ids`, `invited_by`):

  | | Quién |
  |---|---|
  | escribir | el responsable y los invitados, **en turno**; quien administra, siempre |
  | invitar | cualquiera que escriba — quien atiende es quien descubre que necesita a Logística |
  | sacar a alguien | quien lo invitó, el responsable, o quien administra. **Al responsable no** |
  | pasar el pedido | el responsable o quien administra, con **nota obligatoria** |

  El responsable también cambia **solo** al avanzar de etapa (`confirmado` → Logística,
  `en_camino` → Motorizado), eligiendo por menor carga entre los que están en turno; ese
  traspaso **conserva** a los invitados.

  Y eso es la manija, no la puerta: `order-manage` comprueba quién llama con su **JWT**
  (`quienLlama`), no con un id en el cuerpo de la petición — incluido que sea de esa tienda,
  salvo quien administra la plataforma, que entra a todas (`alcance.ts`).

- **Notas internas en el chat (29-ago-2026):** `chat_messages.visibility = 'sellers'` +
  `mentions`. La columna **no esconde nada por sí sola**: quien decide es `get-session`, que
  para lo interno exige un **JWT de vendedor verificado** —`?viewer=seller` lo escribe
  cualquiera, y el token del pedido es del comprador—. Tampoco viaja por el canal realtime del
  comprador ni por su push. Ver 11-RELACIONES.

- **Comprador:** identificado por DNI/teléfono (`buyers`), sin login de contraseña; entra
  por su subdominio (`/acceso`). NO hay login de comprador en el host de plataforma.

### El alcance sale de dónde vive, no de una casilla ✅ (29-ago-2026)

`platform` es la tienda que **no vende**: la casa de quien opera Kross (bloque §8 del
esquema). Quien trabaja EN Kross vive ahí; quien trabaja en una marca, en la suya. El dato
estaba desde el principio — lo que faltaba era **leerlo**.

Hasta hoy el alcance se preguntaba por `is_super_admin`, una bandera que había que acordarse
de encender al dar de alta. Y no se encendió: los operadores de Kross se crearon desde el
panel —que ya la mandaba— mientras la Edge Function desplegada todavía no la leía. Sus filas
entraron con `is_super_admin = false`, y el resultado fue gente que **está** en la plataforma
pero no la administra:

- en `krossclub.app` el login los echaba con *"ingresa desde el sitio de tu marca"* — y su
  marca no existe;
- si entraban igual, el menú les daba el panel de `platform`: cinco secciones de una tienda
  que no vende.

Un candado que **el que lo sufre no puede abrir**. Por eso el alcance deja de ser un dato que
se recuerda y pasa a ser uno que se deduce, en un archivo que leen las dos mitades —
`supabase/functions/_shared/alcance.ts`:

```
administra la plataforma  =  is_super_admin
                          OR (store_id = 'platform' AND is_admin)
```

La bandera se sigue respetando —nadie pierde lo que tenía— pero ya no hace falta que esté. Y
**no ensancha nada**: en `platform` solo hay quien opera Kross (los pedidos son de las marcas,
ahí no hay miembro raso que atender), y a un admin de marca se le crea en la suya.

Dónde se pregunta, que es el punto de tenerlo en `_shared`:

| Lado | Qué decide |
|---|---|
| `LoginPage` | quién entra por `krossclub.app` y quién por su subdominio |
| `seller-nav` | Tiendas + Equipo, o la herramienta entera de una tienda |
| `seller-session` | que **Entrar** a una marca cuente como impersonación |
| 11 Edge Functions | `store_id` del body respetado o ignorado (una tienda, o todas) |

Si esas dos mitades contestaran distinto el resultado sería lo peor de los dos mundos: un
panel que se ve bien y no hace nada — menús, botones y listas que al tocarlos vuelven vacíos.

**Entrar a una marca baja el alcance a propósito.** `enterStore` actúa con el `store_id` de
esa tienda, así que desde dentro no se ofrecen los botones que ahí no van (apagarla, cambiarle
el subdominio). Y el alcance sigue siendo **otro eje** que el de destruir: un operador de la
plataforma entra a cualquier tienda y sigue sin poder apagarla.

### El operador: el nivel que faltaba entre admin y miembro ✅ (28-ago-2026)

Había DOS niveles, y con eso dar de alta a alguien que ayude a operar obligaba a elegir
entre darle todo —incluido apagar la tienda de un cliente— o darle nada.

| | Banderas | Alcance | Puede |
|---|---|---|---|
| **miembro** | — | sus pedidos | atender lo suyo |
| **operador** | `is_admin` + `is_operator` | su tienda, o la plataforma | todo lo del admin **menos destruir** |
| **admin** | `is_admin` | íd. | todo |

**Los dos ejes son independientes**, y ahí está lo que lo hace barato:

- `is_admin` / `is_super_admin` dicen **hasta dónde llega** — una tienda, o la plataforma.
- `is_operator` dice **qué NO puede** dentro de ese alcance.

Así "operador de una marca" y "operador de la plataforma" son la misma regla en distinto
alcance, sin una tercera columna ni un segundo camino. Y como el operador ES `is_admin`,
**los `is_admin` que ya estaban escritos por todo el repo siguen valiendo tal cual** —
que es exactamente la promesa del rol: *hace todo lo que hace el admin*.

**El nivel se cambia después, no solo al crear (29-ago-2026).** Hasta hoy el nivel solo se
daba en el alta, y eso dejó un agujero con nombre propio: si el alta se ejecutaba contra una
Edge Function anterior —que ignora en silencio los campos que no conoce y responde `ok`— la
cuenta nacía sin ninguna bandera y **no había pantalla que la enderezara**. El único arreglo
era un `UPDATE` a mano. Ahora: *Equipo → la persona → Nivel* (`admin-team` acción `set_level`),
y las banderas de cada nivel las escribe `_shared/nivel.ts`, el mismo sitio para el alta y para
el cambio. No puedes cambiarte el nivel a ti mismo — bajarse deja la tienda sin quien
administre y no hay quien lo deshaga.

**Y el alta se comprueba contra la fila, no contra la respuesta.** Después de crear o de
cambiar el nivel, el panel relee `sellers` y compara con lo que pidió (`faltoAlEscribir`). Si
no cuadra, lo dice y nombra la causa: la función está desplegada en una versión vieja. Ese
silencio —éxito parcial, sin error, visible días después y en otra pantalla— es lo que costó
una semana.

Lo que le queda vedado:

| No puede | Dónde se aplica |
|---|---|
| apagar la tienda de una marca | `manage-store` — `active: false` |
| borrar un producto | `manage-product` — acción `delete` |
| **crear o promover administradores** | `admin-team` — acción `create` |

El tercero no es "otra cosa que también restringimos": **sin él los dos primeros no valen
nada**. Un operador que puede nombrar admins se nombra a sí mismo, o crea uno y entra con
él. Una restricción que el restringido puede levantar no es una restricción.

Lo que **sí** puede, a propósito: anular y cancelar pedidos (`restore` y `recreate` los
deshacen, así que no destruyen nada, y son trabajo diario), sacar un producto de la venta
con `active: false`, y volver a **encender** una tienda apagada — se mira la dirección del
cambio, no solo el campo.

Las reglas viven en **`src/lib/permisos.ts`**, una sola vez, y cada una tiene su gemela en
la Edge Function correspondiente. **La del servidor es la que manda**: ocultar un botón no
protege nada, el POST llega igual. La del panel existe para no ofrecer lo que va a ser
rechazado.

Al **entrar a una tienda**, el perfil que se actúa arrastra `is_operator` (`...real` en
`enterStore`): un operador sigue siendo operador adentro. Y aunque no lo arrastrara, el
servidor mira al vendedor REAL — el perfil de impersonación vive en `localStorage`.

### Recuperar contraseña del panel ✅ (implementado)

Antes, quien olvidaba su contraseña dependía de que un admin de la marca le creara otra
cuenta desde **Equipo** — y si el que la olvidaba era el único admin, la marca se quedaba
fuera de su propio panel sin nadie adentro que pudiera destrabarla.

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Pedir el enlace | `/recuperar` | `supabase.auth.resetPasswordForEmail` con `redirectTo` al **mismo** origen |
| Fijar la nueva | `/nueva-contrasena` | Canjea el enlace por sesión, `updateUser({ password })`, cierra sesión y vuelve a `/login?actualizada=1` |

La lógica pura (leer el enlace, validar la contraseña, mapear errores) vive en
`src/lib/auth/password-recovery.ts`, con tests en `password-recovery.test.ts`. Solo es
para el **equipo**: el comprador no tiene contraseña que recuperar.

**El panel muestra con qué correo entra cada miembro** (*Equipo*, solo para admins). Sin
eso, recuperar la contraseña exigía adivinar la dirección con la que se creó la cuenta —y
el formulario público no la puede confirmar sin volverse un verificador de correos
válidos para cualquiera—. El correo vive en `auth.users`, que el panel no lee: lo
devuelve la acción `emails` de `admin-team` (service role), y **solo** los del equipo que
ese admin administra.

Cuatro decisiones que no son obvias:

1. **El enlace vuelve al subdominio desde el que se pidió.** El panel es multi-tenant por
   host; mandar a todos a `krossclub.app` sacaría al vendedor de su marca — y ahí solo
   entra el super admin.
2. **Nunca decimos si el correo existe.** Pedir el enlace siempre muestra "revisa tu
   correo": un formulario público que responde "ese correo no existe" es una lista de
   correos válidos servida a cualquiera. El único error que sí se muestra es el límite de
   envíos de Auth (429) y el fallo de red, porque reintentar al toque tampoco funcionaría.
3. **Al guardar se cierra la sesión.** El enlace abre una sesión de recuperación; entrar al
   panel con ella se saltaría la regla del host de plataforma que sí aplica `/login`.
4. **La URL se limpia** (`history.replaceState`) apenas se canjea el enlace: el token va en
   el hash y si no, queda en el historial y en lo que se copia al compartir la dirección.
5. **Si el enlace aterriza en otra ruta, se rescata.** Cuando el `redirectTo` no está en la
   lista blanca de Auth, Supabase lo ignora y devuelve al *Site URL* —la raíz, sin la
   ruta—, con la sesión igual en el hash. Ahí el enlace parecía no hacer nada: la home veía
   la sesión y mandaba al panel, saltándose el cambio de contraseña. Se corrige en
   `src/main.tsx`, **antes** de montar React: hacerlo en un efecto pierde la carrera contra
   esa redirección.

**Configuración en Supabase Auth (una vez, por proyecto).** En *Authentication →
URL Configuration*, `https://*.krossclub.app/**` tiene que estar en **Additional Redirect
URLs**. Sin eso Auth ignora el `redirectTo` y manda todo al *Site URL*: el vendedor de una
marca aterriza en el host de la plataforma y el enlace "no hace nada". La plantilla de
*Reset Password* por defecto (`{{ .ConfirmationURL }}`) funciona tal cual; si alguien la
cambia a `{{ .TokenHash }}`, la pantalla también lo soporta — es la única variante que
sirve cuando el correo se abre en otro dispositivo.

### Identidad del comprador: DNI vs. teléfono ✅ (implementado)

`buyers` tiene **dos** índices únicos por tienda: `(store_id, document_number)` y
`(store_id, phone)`. O sea que el teléfono **ya es** una llave de identidad válida, y
`register-buyer` ya trae la rama que crea la cuenta solo con teléfono. No hace falta
tocar el esquema para dejar de pedir DNI.

**Decisión de producto (jul-2026):** el DNI se pide **solo en provincia**, no en Lima.
La asimetría es real y no arbitraria:

| | Lima | Provincia |
|---|---|---|
| Dinero por adelantado | no (COD puro) | sí (adelanto de flete) |
| ¿Quién absorbe el no-recibido? | el motorizado, en el momento | la marca, ya pagó el envío |
| ¿Alguien más exige el DNI? | nadie | **la agencia, para entregar el paquete** |

✅ **Confirmado con operaciones:** Shalom y Olva exigen DNI del destinatario para liberar
el paquete. En provincia el campo no es burocracia nuestra sino de ellos, y el copy lo
dice así porque es un motivo que el comprador acepta sin discutir.

**Riesgos de identificar solo por teléfono, con los ojos abiertos:**
- En Perú los números se reciclan: alguien podría heredar el historial y los puntos de otro.
- Una familia comparte un número → historiales que se mezclan.
- El `score` del comprador pierde filo: quien no recibe pedidos cambia de número y vuelve.

**Mitigación propuesta 🔮 — captura diferida del DNI.** Lima cierra la venta solo con
teléfono, y el DNI se pide **después**, en el chat del pedido, cuando le sirve al comprador:
para ver "Mis pedidos", acumular puntos o reclamar la recompensa de bienvenida. Deja de ser
un peaje antes de comprar y pasa a ser lo que desbloquea un beneficio. Es el mismo patrón
que ya se aplicó al pin de ubicación (ver [02-LOGISTICS §4](./02-SMART-LOGISTICS.md)).
La infraestructura ya existe: `buyer-login` resuelve por `document_number`, y `ScorePage`
y `MisPedidosPage` son justamente las pantallas que lo justifican.

## Modelo de datos (núcleo) ✅

- `stores` — una marca por fila: branding, slug, `active`, config WhatsApp (`wa_*`),
  retención (`welcome_points`, `points_rate`, `restock_days`, `winback_days`).
- `sellers` — equipo: `role_label`, `is_admin`, `is_operator`, `is_super_admin`, `available`.
- `buyers` — clientes: `document_number`, `phone`, `nombre`, `score`, `puntos`,
  `address_lat/lng/verified`, `source`, `activated_at`.
- `order_sessions` — pedidos: `stage` (`nuevo→confirmado→preparando→en_camino→entregado`),
  `assigned_seller_id`, `product_price`, `items`, `token` público.
- `chat_messages`, `push_subscriptions` (una fila por **dispositivo** suscrito —
  celular y desktop conviven — con preferencias `notify_new_client` /
  `notify_new_message` que el servidor filtra al enviar), `notifications_log`,
  `call_recordings`.

## Panel Admin ✅

Edge Function `manage-store` (list/create/update/wa_usage/client_stats). El super admin
crea marcas + su primer admin sin SQL. Las secciones por rol viven en un solo lugar,
`src/lib/seller-nav.ts`, y las pintan `BottomNav` (móvil) y `SideNav` (PC).

**Dos formatos, un mismo panel** (`src/components/Layout.tsx`, decide `useIsDesktop()` de
`src/lib/use-desktop.ts` → `min-width:1024px` + puntero de mouse):

| | Móvil / tablet | PC del vendedor |
|---|---|---|
| Marco | columna de 430px, alto libre | ventana **16:9** centrada (`min(1440px, ancho, alto×16/9)`) — limitada por el alto, así que nunca se estira |
| Navegación | barra abajo (íconos) | barra lateral con etiquetas; header y menú fijos, el scroll es del contenido |
| Banner "Instala la app" | sí | **no**: instalar existe para recibir pedidos y llamadas con la pantalla apagada, o sea el celular; en escritorio solo tapaba la lista |

En PC la lista de chats (`ChatsVendedorPage`) usa el ancho: KPIs de la tienda (pedidos, sin
leer, nuevos, en proceso, entregados) y una tabla densa —cliente, pedido, etapa, último
mensaje, cuándo entró— para responder *a quién le debo un mensaje* sin abrir un chat.
En móvil sigue siendo la tarjeta de siempre; las dos pintan los mismos datos.

**Tema claro / oscuro** (`src/lib/theme.ts` · `src/components/ThemeToggle.tsx`): el botón
🌙/☀️ del header cambia el tema y la elección se guarda (`kross-theme` en localStorage).
Por defecto **sigue al sistema operativo**, y si eliges justo el tema que el sistema ya
pide, vuelve a `system` solo — así no hace falta un tercer botón "automático".

- El tema se aplica **solo mientras hay una pantalla de panel montada** (`usePanelTheme()`
  pone `data-theme` en `<html>` y lo quita al salir). La web pública y las páginas del
  comprador son de la **marca**, no del vendedor: no se oscurecen. `index.html` lo aplica
  además antes del primer pintado para que el panel no entre en blanco y salte a oscuro.
- Los colores viven en tokens de `src/index.css` (`--surface`, `--text`, `--border`,
  `--chat-bg`, `--ok/warn/danger/info/violet-*`…). **En oscuro también se invierte la rampa
  de grises de Tailwind** (`--color-gray-*`) y se apagan los chips de estado
  (`--color-green-100` y compañía), así que `text-gray-400` o `bg-green-100` cambian de tema
  sin tocar los componentes. Lo que NO se toca: `--color-white` (el `text-white` de los
  botones de color) ni los tonos 300–600 (los botones sólidos tipo `bg-green-500`).
- Al escribir pantallas nuevas del panel: usa las clases `gray-*` de Tailwind y los tokens
  de arriba. Un `#fff` o un `#111` a mano se queda fijo en los dos temas.

**Modo demo** (`src/lib/demo/`, interruptor en *Marca*): llena **todo** el panel —Pedidos en
sus cuatro modos, Clientes en los tres, Productos y Equipo— con una tienda de ejemplo que
despacha ~1.000 pedidos al día entre tres productos (S/150, S/120, S/180) y arrastra seis meses
de recompras. Sirve para enseñar cómo se ve la herramienta funcionando sin esperar a que la
marca venda.

- **Es por TIENDA y por DISPOSITIVO**, las dos cosas. Por dispositivo (`localStorage`, como el
  tema) porque si fuera de la marca, un vendedor encendiéndolo pondría a todo su equipo a mirar
  pedidos inventados y una tienda podría quedarse en demo en producción sin que nadie lo note.
  Por tienda porque preparar la demo de una marca no debe ensuciar la vista de las otras: un
  super admin puede tener Gadicaf en demo y saltar a Kross Shop a ver sus pedidos reales. La
  clave es `kross-demo:<store_id>`.
- **Se anuncia siempre**: mientras está encendido, `Layout` pinta una barra fija arriba con un
  botón de salida. Un demo que no se anuncia es una mentira.
- **Es determinista** (semilla fija, sin `Math.random()`): los números no cambian entre
  pintadas, así que se puede señalar un total en pantalla y confiar en él.
- **Las sedes son reales**: los destinos salen del listado de Shalom y Olva, así que las líneas
  del mapa caen donde caerían de verdad. Lo único inventado son los pedidos.
- **Los pedidos se abren completos**: cada uno trae su conversación (comprador, equipo y
  avisos del sistema) y algunos una llamada con grabación, que suena — es un WAV de ejemplo
  incrustado, no un botón muerto.
- **No toca la base ni exige deploy.** Reemplazó al botón "Ver ejemplo" que vivía solo en el
  mapa.

**Notificaciones push del equipo** (Equipo → Notificaciones, `src/components/PushSettings.tsx`):
cada miembro las activa/desactiva **por dispositivo** — el celular y la computadora se
suscriben por separado y ambos reciben — y por **evento**: 🛍️ nuevo cliente y 💬 nuevo
mensaje, cada uno con su sonido propio (`src/lib/notification-sounds.ts`). Con la app
enfocada la notificación entra silenciosa y suena el sonido del evento; en segundo plano
suena el sistema. El filtro por evento se aplica **en el servidor** (columnas
`notify_new_*` de la suscripción): lo apagado ni siquiera se envía.

## Estado central compartido — `MerchantCustomerSession`

Contrato conceptual que unifica los tres módulos. Hoy vive **distribuido** en las tablas
`buyers` + `order_sessions` (no como un único objeto), pero esta es la forma canónica que
todo módulo debe poder leer/escribir:

```typescript
type MerchantCustomerSession = {
  customer:  { dni: string; fullName: string; phone: string }
  delivery:  { lat: number; lng: number; addressText: string; reference: string
               // Región × método: son CUATRO, no dos. "No es agencia" NO significa
               // Lima, y "agencia" ya no significa provincia.
               dispatchType: 'MOTORIZADO_LIMA' | 'MOTORIZADO_PROVINCIA'
                           | 'AGENCIA_PROVINCIA' | 'AGENCIA_LIMA'
               agencyName?: 'SHALOM' | 'OLVA' }
  sale:      { productId: string
               paymentMethod: 'YAPE_PLIN' | 'CONTRAENTREGA' | 'TARJETA'
               closedBy: 'AI_CLOSER' | 'DIRECT_CHECKOUT' }
  // Adelanto. Sales lo cobra (manual §3.1-3.2 o 360pay §3.3, según la tienda);
  // Logistics decide con él si despacha. Por eso vive en el contrato.
  advance:   { amountPen: number            // mitad del pedido, o el total. NO por destino
               choice: 'HALF' | 'FULL'      // cuál eligió: el cobro re-deriva con esto
               verification: 'NOT_REQUIRED' | 'PENDING' | 'MATCHED'
               provider?: '360PAY' | null   // NULL = flujo manual; separa las piscinas de cruce
               providerChargeId?: string    // id del cupón, en payment_events
               reason?: string }            // veredicto interno — NUNCA al comprador
  // El SALDO (28-ago-2026): la SEGUNDA operación de cobro, y por eso está acá y
  // no dentro de `advance`. Ocurre después —cuando la guía ya existe—, con su
  // propio cupón, su propio número de operación bancaria y su propia fecha, y es
  // lo que suelta la clave de recojo. Cruza los dos módulos: Sales lo cobra,
  // Logistics depende de él para que el comprador retire.
  //
  // Juntarlo con el adelanto en un solo "pagado S/180" borraría lo único que un
  // reclamo necesita: cuál de las dos operaciones. Ver 11-RELACIONES.
  balance?:  { amountPen: number
               verification: 'PENDING' | 'MATCHED'   // PENDING = cupón emitido, sin pagar
               providerChargeId?: string }
  // Envío por agencia (tracking por API, 02-SMART-LOGISTICS §3). Logistics
  // registra los identificadores del comprobante; un job periódico los consulta
  // contra la API del courier y refleja la fase. La fase dispara la cobranza
  // del saldo al llegar a EN_DESTINO — pero NUNCA mueve `stage` sola: el
  // pipeline lo avanza una persona (misma regla que `no_entregado`).
  shipment?: { courier: 'SHALOM' | 'OLVA'
               // Shalom rastrea por numero+codigo (u oseId); Olva por
               // numero+year (año de emisión en 2 dígitos, sin código).
               ref: { numero?: string; codigo?: string; oseId?: string; year?: string }
               // NULL con guía escrita = REGISTRADO: la guía existe y el courier
               // todavía no reporta, o sea el paquete sigue en el almacén. No es
               // un valor del enum a propósito — es la AUSENCIA de reporte, y es
               // el hueco donde se pierde la plata (ver 11-RELACIONES).
               phase: 'EN_ORIGEN' | 'EN_TRANSITO' | 'EN_DESTINO' | 'ENTREGADO' | null
               phaseAt?: Date
               demoraAt?: Date }              // alerta de demora del courier; NO es una fase
  stage:     'nuevo' | 'validando' | 'confirmado' | 'en_camino' | 'entregado'
             | 'no_entregado'               // terminal de fracaso: lo marca una persona;
                                            // tasa de entrega = entregado/(entregado+no_entregado)
             // `preparando` SALIÓ del eje (ago-2026): no describía un hecho
             // verificable —nadie marca "ya lo empaqué"—. La BD todavía lo
             // acepta y hay filas con él; se leen como `confirmado`
             // (`stageVigente`). Y OJO: `stage` NO es lo que ve el vendedor —
             // el tablero funde este reloj con el del courier y con la
             // existencia de la guía. Ver `order-tracking.ts` y 11-RELACIONES.
  loyalty:   { pointsEarned: number; nextReorderDate: Date }
  // Atribución del anuncio que trajo la venta. La captura Sales en el checkout y
  // la guarda en la orden; el módulo de Pixels/CAPI la usa para reportar el
  // Purchase a Meta/TikTok (server-side, cuando el navegador ya no está). El IP
  // y el user-agent los captura el SERVIDOR de los headers, no del navegador.
  // NUNCA sale hacia el comprador (get-session no la incluye). Ver 09-PIXELS-CAPI.
  attribution?: { fbp?: string; fbc?: string; ttp?: string; ttclid?: string
                  clientUserAgent?: string; clientIp?: string; sourceUrl?: string }
}
```

**Tres reglas del bloque `advance` que cruzan módulos y no se negocian por pantalla:**

1. **`reason` no sale del backend hacia el comprador.** Es el veredicto interno del
   cobro ("no coincide el monto", el error crudo del proveedor). `get-session` lo elimina
   de la respuesta cuando el que mira no es vendedor. Da igual que la UI no lo pinte:
   viaja en el JSON y se ve en la pestaña de red.
2. **`stage` avanza solo con el pago confirmado**, y las advertencias no lo frenan: el
   dinero entró, la duda es de operaciones. Ver `01-SALES-ENGINE.md`.
3. **Cobrado es lo que cruzó la pasarela, y nada más.** `advance` + `balance`, los dos
   `MATCHED`. Un comercio puede cobrar por fuera —efectivo, transferencia, un acuerdo por
   el chat— y mover el pedido a `entregado`: de esa plata no hay rastro, así que no cuenta.
   Es lo que decide el anillo de avance del panel (`cobradoDelPedido` en
   `src/lib/order-money.ts`): **entregar el pedido no lo cobra; cobrar lo cobra.**

Lector único: **`src/lib/session.ts` → `toCustomerSession(order, buyer)`** ensambla este
objeto desde `order_sessions` + `buyers`. Todos los módulos leen la sesión por ahí.

Mapeo actual → objetivo:
| Campo | Hoy | Estado |
|---|---|---|
| `customer.*` | `buyers.document_number/nombre/phone` | ✅ |
| `delivery.lat/lng/addressText` | `order_sessions.address_*` / `buyers.address_*` | ✅ |
| `delivery.reference` | `order_sessions.delivery_reference` (columna lista, sin UI aún) | 🟡 |
| `delivery.dispatchType` | `order_sessions.dispatch_type` (def `MOTORIZADO_LIMA`) — ⚠️ lista blanca en `register-buyer`: lo no reconocido se aplasta al default **sin error** | ✅ |
| `delivery.agencyName` | `order_sessions.agency_name` — lo escribe el checkout al elegir punto de recojo | ✅ |
| `sale.paymentMethod` | `order_sessions.payment_method` (def `CONTRAENTREGA`) — escrito por checkout | ✅ |
| `sale.closedBy` | `order_sessions.closed_by` (def `DIRECT_CHECKOUT`) — escrito por checkout | ✅ |
| `advance.amountPen` | `order_sessions.advance_amount` — lo deriva el SERVIDOR (`_shared/advance.ts`) sobre el precio **verificado contra `products.packs`**, nunca sobre el del body | ✅ |
| `advance.choice` | `order_sessions.advance_choice` (def `'HALF'`) — sin esto el cobro no puede reproducir el monto mostrado | ✅ |
| `advance.verification` | `order_sessions.payment_verification` — la fija `pay360-webhook` | ✅ |
| `advance.provider` | `order_sessions.payment_provider` — '360PAY' o NULL | ✅ |
| `advance.providerChargeId` | `payment_events.provider_charge_id` (por `matched_order_id`) | ✅ |
| `advance.reason` | `order_sessions.payment_reason` — solo Ventas | ✅ |
| `balance.amountPen` | `order_sessions.saldo_amount` (bloque §31) — lo escribe `pay360-coupon` al emitir el segundo cupón | ✅ |
| `balance.verification` | `order_sessions.saldo_verification` — la fija `pay360-webhook`, que distingue cuál de los dos cobros llegó **por el id del cupón**: el `external_ref` es el mismo pedido en los dos, y el monto tampoco sirve —la mitad de S/180 es 90, igual que su saldo— | ✅ |
| `balance.providerChargeId` | `order_sessions.pay360_saldo_coupon_id` · `pay360_saldo_consumer_code` | ✅ |
| `shipment.courier/ref` | `order_sessions.tracking_courier/tracking_numero/tracking_codigo/tracking_ose_id/tracking_year` — los registra `order-manage` (acción `set_tracking`) | ✅ |
| `shipment.phase/phaseAt/demoraAt` | `order_sessions.tracking_phase/tracking_phase_at/tracking_demora_at` — los escriben los jobs `shalom-tracking-sync` / `olva-tracking-sync` (pg_cron) vía el reflejo compartido `_shared/tracking.ts`; `tracking_checked_at` audita el último chequeo | ✅ |
| `stage` | `order_sessions.stage` — orden en `src/lib/order-stages.ts` | ✅ |
| `loyalty.points` | `buyers.puntos` | ✅ |
| `loyalty.nextReorderDate` | derivado de `restock_days` en campañas | 🟡 |
| `attribution.fbp/fbc/ttp/ttclid/sourceUrl` | `order_sessions.ad_fbp/ad_fbc/ad_ttp/ad_ttclid/ad_source_url` — los escribe `register-buyer` del body | ✅ |
| `attribution.clientUserAgent/clientIp` | `order_sessions.ad_client_ua/ad_client_ip` — los captura `register-buyer` de los headers (server-only) | ✅ |

## Estándares del módulo

- Toda Edge Function: CORS + validación de entrada + service role para escribir.
- RLS activo; el frontend no lee tablas sensibles directo, invoca funciones.
- Nunca secrets/tokens en código, commits ni chat.
- Cambios de datos que afecten a otro módulo → actualizar aquí el contrato primero.

## Ver también
- Capa estratégica: [`ICP Sales`](./ICP%20Sales/) y [`ICP LTV`](./ICP%20LTV/).
- Módulos: [01-SALES](./01-SALES-ENGINE.md) · [02-LOGISTICS](./02-SMART-LOGISTICS.md) · [03-LOYALTY](./03-LOYALTY-ENGINE.md).
