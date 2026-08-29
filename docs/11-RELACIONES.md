# 11 · RELACIONES — Cliente, Pedido, y todo lo demás

> Qué es una **cosa** y qué es una **vista** en el panel del vendedor.
> Se escribió porque el menú tiene diez entradas y cuatro leen exactamente la misma consulta.

Estado: 🔮 propuesta. Nada de lo de acá está implementado todavía; lo que sí está verificado
contra el código es el diagnóstico.

## El síntoma

Menú de un admin de tienda hoy (`src/lib/seller-nav.ts`), diez entradas:

> Chats · En vivo · Clientes · Retención · CRM · Productos · Equipo · Llamadas · Marca · Stats

De esas diez, **cuatro piden lo mismo**: `get-store-sessions`, o sea los `order_sessions` de
la tienda.

| Pantalla | Consulta | Qué hace con ella |
|---|---|---|
| **Chats** (`ChatsVendedorPage`) | `get-store-sessions` | ordena por último mensaje. En PC ya es una tabla con cliente, pedido, **etapa** y sin leer |
| **CRM** (`CRMPage`) | `get-store-sessions` | agrupa por `stage` (lista o kanban) |
| **Stats** (`EstadisticasPage`) | `get-store-sessions` | los cuenta por etapa y por asesor |

Cuatro pantallas, cuatro `fetch`, cuatro spinners, un solo dato. El costo no son las cuatro
pantallas: es que un vendedor que quiere saber *"¿a quién le debo algo?"* tiene que elegir
primero en cuál de las cuatro lo va a averiguar. El menú le hace responder una pregunta antes
de dejarlo trabajar.

**Los cuatro `fetch` ya son uno** (26-ago-2026): `useStoreOrders` en `src/lib/store-orders.ts`.
Las pantallas siguen siendo cuatro —eso es el paso 4—, pero leen del mismo sitio.

Y las otras tres del grupo no son lo que su nombre promete:

- **Clientes** no lista clientes. Es importar un CSV, invitar por WhatsApp masivo y configurar
  los puntos de bienvenida. Es *captación*, no la libreta de direcciones.
- **Retención** son las métricas de esos mismos clientes (recompra, LTV, segmentos) más las
  campañas. Misma entidad que Clientes, otra pantalla.
- **Llamadas** es un archivo de audios desconectado del pedido donde ocurrió la llamada.

## La regla

**Solo hay dos sustantivos. Todo lo demás es un evento del pedido o una vista del pedido.**

```
Cliente (buyers)  1 ─── N  Pedido (order_sessions)
   DNI por tienda             │
   no tiene estado            ├── mensajes   chat_messages.session_id
   vive para siempre          ├── llamadas   call_recordings.session_id
                              ├── pagos      payment_events.matched_order_id
                              ├── guía       tracking_* (columnas del pedido)
                              └── etapa      stage (columna del pedido)
```

- **Cliente** = una persona. Llave: DNI (respaldo, teléfono), única **por tienda** —
  el mismo DNI le compra a dos marcas y son dos clientes. No tiene estado propio.
- **Pedido** = una compra. Nace, avanza por `stage`, muere en `entregado` o `no_entregado`.
  Es la única entidad con ciclo de vida.
- **Lo demás no es una cosa: le pasa a un pedido.** Un mensaje, una llamada, un cupón cruzado,
  una guía de Shalom — ninguno existe sin su pedido, y ninguno merece una entrada de menú.

Y estas cuatro no son secciones, son **maneras de mirar la misma lista**:

| Vista | Es el pedido… | Responde |
|---|---|---|
| Bandeja | …ordenado por último mensaje | ¿a quién le debo un mensaje? |
| Tablero | …agrupado por etapa | ¿dónde se está atorando la operación? |
| Mapa | …puesto sobre el país | ¿dónde está la plata que ya salió? |
| Resumen | …contado | ¿cómo vamos? |

**Prueba de una línea para cualquier pantalla nueva:** si lo primero que hace al abrirse es
pedir `get-store-sessions`, no es una sección — es un modo de Pedidos.

## La navegación que sale de la regla — de 10 a 5

| Antes | Ahora | Estado |
|---|---|---|
| Chats · CRM · En vivo · Stats | **Pedidos**, con tres modos: Lista · Tablero · Resumen | ✅ 27-ago-2026 · En vivo se retiró el 28-ago |
| Clientes · Retención | **Clientes**: la libreta real de personas; reactivar e invitar viven adentro | ✅ 27-ago-2026 |
| Llamadas | ✂️ disuelta — cada grabación vive en el hilo de su pedido | ✅ 27-ago-2026 |
| Productos · Equipo · Marca | igual | — |

**El menú del admin está en cinco**: Pedidos · Clientes · Productos · Equipo · Marca. Era el
objetivo del doc y ya está. El miembro
del equipo ya tiene **una** entrada, y está bien — su trabajo entero es la lista de pedidos,
y los cuatro modos viven dentro de ella, no en el menú.

El modo vive en la URL (`?modo=tablero`), no en un `useState`: se puede enlazar un modo
concreto y el "atrás" del navegador hace lo esperable. Las cuatro rutas viejas
(`/vendedor/chats`, `/crm`, `/mapa`, `/estadisticas`) quedan como redirección al modo que les
corresponde — hay enlaces guardados y notificaciones push que apuntan ahí.

Los cuatro modos comparten un solo `fetch` y un solo estado. Eso ya está construido
(`useStoreOrders`), y al construirlo apareció algo peor que los cuatro spinners: **tres
definiciones distintas de quién ve qué**.

| Pantalla | Predicado que usaba |
|---|---|
| Chats · mapa | `!effective.is_admin` |
| CRM · Stats | `!(real.is_admin && !impersonating)` |

Coinciden en todos los casos menos uno, y ese uno importa: el **super admin que entra a una
marca**. `MarcaPage` le arma un perfil `is_admin: true` con su mismo `auth_user_id`, y como
`impersonating` queda en `true`, CRM y Stats filtraban por ese id. El super admin no está en
`involved_seller_ids` de ningún pedido, así que veía **la tienda completa en Chats y en el
mapa, y cero pedidos en CRM y Stats** — justo lo contrario de lo que el comentario de
`MarcaPage` promete ("el toolset completo funciona incluso en una marca sin equipo").

La regla que quedó es una sola frase, sin `impersonating` de por medio:

> Si eres admin **de lo que estás mirando**, ves esa tienda entera. Si no, ves los pedidos en
> los que estás metido.

Con las cuatro pantallas ya fundidas en una, la lectura es **una sola y trae los cancelados**:
el tablero los agrupa aparte y el resumen los cuenta en las notas, y los dos modos que no los
quieren —bandeja y mapa— los descartan al pintar, que es gratis. Cambiar de modo no vuelve a
pedir nada.

⚠️ **El precio, anotado para cuando importe:** el `limit` del servidor se aplica **antes**
de filtrar, así que los cancelados ocupan lugar en esa ventana y la bandeja puede mostrar
menos de 80 pedidos vivos. Con los volúmenes de hoy (4 pedidos en la marca más grande) no
roza; el arreglo real cuando roce es paginar o subir el límite en `get-store-sessions`, no
volver a partir la consulta en cuatro.

## Lo que falta de verdad #1: la ficha del cliente

Hoy se puede ver el **contacto** de un comprador (`ContactSheet`, tocando el avatar en el
chat) pero no a la **persona**. Ninguna pantalla responde *"¿este señor ya me compró antes?"*
— y esa es la pregunta que decide si se le despacha sin adelanto, si vale la pena el upsell,
y si el reclamo de hoy es de un cliente de tres pedidos o de un desconocido.

**Resuelto (27-ago-2026).** Clientes es ahora la libreta, con tres modos —igual que Pedidos, y
por el mismo criterio: cada uno responde una pregunta distinta.

| Modo | Responde |
|---|---|
| **Personas** | ¿quién me compra? — la lista, ordenada por lo gastado, y la ficha con su historial |
| **Reactivar** | ¿a quién le toca volver? — recompra, LTV, segmentos y campañas |
| **Invitar** | ¿cómo traigo a mi base a la app? — importar CSV, invitar por WhatsApp, puntos de bienvenida |

La ficha lleva **todos** sus pedidos, no solo los entregados: un cancelado o un no entregado
es justamente lo que explica por qué ese cliente merece otra mirada antes de despacharle sin
adelanto.

### Y una tercera copia que no llegó a nacer

Al escribir el listado apareció que *cuánto vale un cliente* y *cuándo le toca volver* estaban
**duplicadas**: `retention-metrics` y `run-campaign` tenían cada uno su versión de la misma
matemática. El listado iba a ser la tercera.

Con tres copias, el chip que dice "toca recompra" en la ficha y el contador del segmento que
dispara la campaña se separan en cuanto alguien toca una sola — y entonces la campaña le
escribe a un conjunto distinto del que el vendedor vio antes de apretar el botón. Ahora la
definición vive en `supabase/functions/_shared/clientes.ts`, la usan los tres, y **tiene
tests** (es TS puro sin APIs de Deno, así que el front la importa igual que `_shared/olva.ts`).

La regla que las une: **solo cuenta lo ENTREGADO**. Un pedido en `nuevo` no es plata, y en
contraentrega uno `no_entregado` tampoco — se devolvió.

## Lo que falta de verdad #2: la llamada no está en el pedido

Verificado en el código:

- `create-call-token` (llamada que **inicia el comprador**) sí escribe un mensaje
  `type: 'call_log'` en el hilo — pero el `MessageBubble` del **vendedor**
  (`VendedorPedidoPage`) no lo pinta como llamada: cae en la burbuja de texto genérica.
  El único que lo dibuja bien es el chat del comprador (`OrderChatPage`).
- `seller-call-token` (llamada que **inicia el vendedor**) **no escribe nada** en el hilo.
  Solo queda la fila en `call_recordings`, y esa fila se ve en la pantalla Llamadas — es
  decir, en otra parte de la app.

Resultado: la llamada donde el cliente corrigió su dirección no está donde está la dirección.

**Resuelto (27-ago-2026).** La llamada entra al hilo como lo que es, en dos momentos que
dicen cosas distintas:

| Cuándo | Quién lo escribe | Quién lo ve |
|---|---|---|
| Alguien llama | `create-call-token` / `seller-call-token` | **solo Ventas** — es el intento, sirva o no |
| La llamada termina | `livekit-webhook` al cerrar la grabación | los dos, con la duración |

El aviso de intento es de Ventas a propósito: al equipo le sirve ver que se llamó aunque no
contesten (de ahí sale el `nota: no_contesta`), pero el comprador no necesita una línea por
cada timbrazo. Lo que sí ven los dos es el cierre — saber que hubo una llamada de 3:24 no es
un secreto, es lo mismo que muestra WhatsApp.

El enlace mensaje↔grabación es **explícito** (`chat_messages.call_recording_id`), no por
cercanía de fecha: dos llamadas seguidas en el mismo pedido romperían cualquier heurística.

**El audio no viaja en el mensaje.** La URL firmada la pide el panel a `get-recordings`, que
sigue exigiendo admin — disolver la pantalla de Llamadas no debía ampliar en silencio quién
puede escuchar a un cliente. Y `call_recording_id` **no se le manda al comprador**: no es que
pudiera bajar el audio con él, es que su sola presencia le diría que esa llamada quedó
grabada. Misma regla que `payment_reason`.

## Lo que NO cambia: el hilo es del pedido, no de la persona

La tentación al simplificar es juntar los mensajes por persona, como WhatsApp. **No.** En
contraentrega la conversación *es sobre el pedido*: dónde está el paquete, a qué agencia va,
cuándo cae el saldo. El hilo por pedido es lo que permite que el equipo entre y salga por rol
(Ventas cierra, Despacho registra la guía, Motorizado entrega — `involved_seller_ids`), que
el "sin leer" signifique algo, y que el pedido se cierre entero.

La respuesta correcta no es un hilo por persona, es una **ficha** por persona que lista sus
hilos. Cosa distinta, puerta distinta — la misma regla que ya usa la cabecera del chat:
el nombre abre el **pedido**, el avatar abre a la **persona**.

## Deuda que aparece al dibujar el mapa

`/comprador/chats` y `/comprador/chat/:chatId` leían `useKrossStore()`, o sea el seed de
`src/data/seed.ts`: pantallas mock que nunca vieron datos reales y que además colgaban de
`RequireSellerAuth` — un comprador no entraba ahí ni queriendo.

**Resuelto (27-ago-2026), y eran cuatro, no dos.** Al ir a borrarlas aparecieron dos hermanas
del mismo defecto:

| Ruta mock | La pantalla real que ya la reemplazaba |
|---|---|
| `/comprador/chats` | `/mis-pedidos` |
| `/comprador/chat/:chatId` | `/p/:token` (`OrderChatPage`) |
| `/comprador/perfil` | `/mi-score` y la ficha en el panel |
| `/vendedor/chat/:chatId` | `/vendedor/pedido/:token` |

Con ellas se fueron `ChatView` (solo lo usaban esas dos) y `AccountSelector`, que **ya no lo
importaba nadie**. El bundle bajó 22 kB.

### El andamio se fue entero

`BotIAPage` (`/vendedor/bots`) era el último consumidor del store de maqueta, y el equipo
confirmó que ya no servía. Con ella se fueron `src/store/index.ts` y `src/data/seed.ts`: **no
queda nada del andamio de datos falsos**.

Lo que ocupó su lugar es otra cosa y está bien separada: el **modo demo**
(`src/lib/demo/`), que no es un resto de maqueta sino una función del producto — se enciende a
propósito desde *Marca*, llena el panel entero con una tienda de ejemplo para poder enseñar la
herramienta, y **se anuncia con una barra fija** mientras está activo. Ver
[`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md).

**Dónde vive el interruptor:** en *Marca*, **en la fila de cada marca**, junto a *Editar* y
*Entrar*. Estuvo un rato en una tarjeta suelta arriba de la lista y quedó inalcanzable para el
super admin: fuera de una marca se deshabilitaba (no había tienda a la que aplicarlo) y al
entrar a una, `MarcaPage` se bloquea entera por su guarda `!isAdmin || impersonating`. Puesto
en la fila, la pregunta "¿de cuál marca?" la responde el sitio del botón, y el mismo interruptor
sirve al super admin —que ve todas— y al admin de una sola marca, que ve la suya. El estado es
`localStorage` por tienda (`kross-demo:<store_id>`), o sea **por dispositivo**: encenderlo no
pone al equipo entero a mirar pedidos inventados. Se apaga desde el mismo sitio o desde
*Salir* en la barra del panel.

`src/types/index.ts` **no se toca**: aunque CLAUDE.md lo llama mock para los tipos de sesión,
toda la capa de checkout importa tipos de ahí.

## El eje del pedido: dónde termina lo nuestro y empieza el courier

Un pedido tiene **un solo eje**, y ese eje **cambia de dueño a la mitad**:

```
     NUESTRO — lo mueve una persona   │      DEL COURIER — lo mueve la API
 nuevo → validando → confirmado       │ registrado → en origen → en tránsito → en destino → entregado
                                      ▲
                            la costura: existe la guía
```

> `preparando` estaba entre `confirmado` y la costura hasta ago-2026. Salió del eje —ver
> [El pipeline, revisado](#el-pipeline-revisado-28-ago-2026)— y las filas que la BD todavía
> tiene se leen como `confirmado`.

Antes de la costura todo es **intención**: lo que nosotros decidimos que pasó. Después es
**observación**: lo que un tercero reporta. Son dos naturalezas distintas, y de ahí sale la
regla operativa:

> **Nadie mueve a mano un paso del que hay reporte.**

Por eso no son la misma columna en la BD (`stage` lo escribe una persona, `tracking_phase` lo
escribe un job) pero **sí son la misma línea en la pantalla**.

### Esto ya está construido — y el CRM es el único que no lo usa ✅🟡

`src/lib/order-tracking.ts` → `pasosDelPedido()` **ya funde los dos relojes en una sola
línea**: por agencia arma `… confirmado → registrado en {courier} → en tránsito → en agencia
de destino → entregado`, y ya tiene la regla de desempate correcta —
`Math.max(indicePorStage, indicePorFase)`: si los relojes discrepan gana el que va más
adelante, porque que Shalom diga EN_TRANSITO cuando nadie marcó "despachado" significa que el
paquete salió, no que no salió.

| Pantalla | ¿Usa la línea fundida? |
|---|---|
| `OrderTrackingMap` (chat, comprador y vendedor) | ✅ `pasosDelPedido` |
| **CRM** (`CRMPage`) | ✅ `COLUMNAS` + `columnaDelPedido` (26-ago-2026) |
| **Stats** (`EstadisticasPage`) | ✅ el mismo `columnaDelPedido` |
| **Chats** (`ChatsVendedorPage`) | ✅ chip y KPIs por la misma columna |

No hubo que diseñar el modelo: ya existía. Solo faltaba que el CRM lo usara.

**Lo que se arregló de paso.** El filtro del tablero era `stage === columna.key` y ninguna
columna recogía lo que sobraba, así que **un pedido cuyo `stage` no estaba en la lista
desaparecía del CRM**. No estaban `validando` —que `register-buyer` escribe en TODO pedido con
adelanto, o sea todos los de 360pay— ni `no_entregado`. Ahora la columna se deriva de
`pasosDelPedido`, que siempre devuelve exactamente un paso activo: por construcción, ningún
pedido puede caerse del tablero. `no_entregado` y `cancelado` van en su propio grupo, porque
el fracaso no es un paso del eje.

### Separar `registrado` de `en origen` — el hueco donde se pierde la plata

Hoy `_shared/shalom.ts` mapea **dos hitos distintos del proveedor a la misma fase**:

```ts
['origen',     'EN_ORIGEN'],
['registrado', 'EN_ORIGEN'],   // ← los aplasta
```

Pero no son lo mismo:

- **Registrado** = la guía existe. Acto administrativo. El paquete **sigue en nuestro almacén**.
- **En origen** = el paquete ya está físicamente en la agencia. Ya salió de nuestras manos.

Entre los dos hay un hueco —"emití la guía y nunca fui a dejar el paquete"— que es una de las
fugas más caras del contraentrega, y no tenía columna.

**Resuelto (26-ago-2026), y la solución fue quitar, no agregar.** `registrado` **no es una
fase del courier**: es la ausencia de una. El enum `Phase` sigue teniendo cuatro valores y
significa una sola cosa —*dónde está el paquete según quien lo transporta*—; `registrado` es
un hecho **nuestro**, y su señal es `tracking_numero`. De ahí sale el tercer reloj de la línea
de vida:

| Reloj | Quién lo mueve | Qué paso abre |
|---|---|---|
| `stage` | una persona del equipo | hasta `confirmado` |
| `tracking_numero` | nosotros, al emitir la guía | `registrado` |
| `tracking_phase` | el courier | `en origen` → `en tránsito` → `en destino` → `entregado` |

Gana el que va más adelante, la misma regla de siempre. El hito `registrado` de Shalom y el
texto `REGISTRAD` de Olva ya **no** se mapean a `EN_ORIGEN`: sin reporte, el pedido espera en
la columna Registrado. Son los cinco pasos que nombraste — solo que el primero no lo dice el
courier.

⚠️ **Las filas que ya estaban en producción** con `EN_ORIGEN` puesto por el hito `registrado`
se quedan ahí: `applyTracking` nunca retrocede una fase. Se muestran un paso más optimistas de
lo que están, y se corrigen solas en cuanto el courier reporte `origen`. Los pedidos nuevos
nacen bien.

### ~~CRM y En vivo son la misma función con distinta proyección~~ — y por eso sobraba una

El argumento era que el mapa y el tablero son la misma función proyectada distinto: la misma
fase, una en un eje abstracto (columnas) y otra en el eje geográfico. Cierto, y por eso mismo
**En vivo se eliminó el 28-ago-2026**.

Lo que el argumento no miraba es de dónde salía la posición sobre ese eje geográfico. La caja
del mapa se colocaba interpolando la recta entre dos sedes con `avanceDelPaquete()`:

```
EN_ORIGEN 0.1  ·  EN_TRANSITO 0.5  ·  EN_DESTINO 0.9  ·  ENTREGADO 1
```

O sea que **la posición era la fase, redibujada**. Ni los couriers dan la ubicación del camión
ni los camiones van en línea recta: un pedido "a mitad de camino" estaba a mitad de camino
porque el courier había dicho EN_TRANSITO, no porque nadie supiera dónde estaba. Y una
posición inventada en un mapa no se lee como una fase — se lee como una posición.

De las dos proyecciones de la misma función, la honesta es la del tablero: dice la fase
diciendo que es la fase, y encima deja actuar sobre el pedido.

Lo que sí quedó del mapa es el dibujo del país (`mapa-peru.ts`), y lo usa el mapa que sí tiene
un hecho detrás: **dónde se entregó** (ver abajo).

### Lo que cambia en lo que el CRM mide

Si las columnas son fases del courier, el número de la columna deja de ser *cuántos hay* y
pasa a ser **cuánto tiempo llevan ahí**. Es otra pantalla aunque se vea igual:

- `registrado` 2 días → el paquete nunca salió del almacén. **Es nuestro.**
- `en_destino` 5 días → llegó y el cliente no recoge. **Es plata parada: hay que cobrar el saldo.**

Las dos columnas ya existen: `tracking_phase_at` (cuándo entró a la fase) y `tracking_demora_at`
(la alerta de demora del courier, que **no es una fase**: convive con cualquiera). Con eso:
**columna = fase · chip = antigüedad · rojo = demora.** El CRM deja de ser una foto y pasa a
ser un detector de atoros, que es lo único que un CRM de contraentrega tiene que hacer.

**Construido (26-ago-2026).** `antiguedad()` en `order-tracking.ts` devuelve además un flag
`exacta`: sale en `true` cuando mide desde `tracking_phase_at` (tiempo real en ESA etapa) y en
`false` cuando solo hay `created_at`, porque las etapas de la mitad de arriba no guardan cuándo
entraron. El chip pinta `~` delante en ese caso: la pantalla no debe afirmar "tres días en esta
columna" cuando lo que sabe es "tres días desde que entró el pedido". El rojo lo reserva
`tracking_demora_at` — el único atraso que no estamos infiriendo nosotros.

### Qué NO se borra

`stage` se queda. Es el dueño de la mitad de arriba (`nuevo`, `validando`, `confirmado`) y del
cierre de fracaso `no_entregado` — que lo marca una persona y **ningún
courier va a reportar jamás**, porque el courier no sabe que el cliente nunca recogió.

Lo que sí sale, **solo para pedidos por agencia**, es `en_camino`: hoy es un humano adivinando
lo que Shalom ya sabe. Y `entregado` deja de marcarse a mano cuando hay reporte.

### El motorizado no rompe el modelo

Si la mitad de abajo es del courier, ¿qué hace `MOTORIZADO_LIMA`, que no tiene API? **El
motorizado es el courier**, solo que reporta a mano desde su app: recogí (en origen) · salí
(en tránsito) · llegué (en destino) · entregué. Mismas cuatro fases, otra fuente. No hace
falta un segundo modelo. Hoy `pasosDelPedido` colapsa ese tramo en un solo `en_camino`, y está
bien como paso intermedio — con la entrega a domicilio apagada en las dos marcas vivas, no
bloquea nada.

### ✅ El bug que bloqueaba todo lo demás — corregido (26-ago-2026)

`esEnvioPorAgencia()` en `src/lib/order-tracking.ts` **no incluía `AGENCIA_LIMA`**:

```ts
const ES_AGENCIA = ['AGENCIA_PROVINCIA', 'AGENCIA', 'RECOJO_AGENCIA']   // falta AGENCIA_LIMA
```

`AGENCIA_LIMA` lo escribe el checkout (`OrderService.ts`) y lo acepta `register-buyer`. O sea
es un valor real en producción. Consecuencias, las dos directas a este tema:

1. `pasosDelPedido` le da la línea de **domicilio** (`… confirmado → en camino → entregado`)
   a un pedido que va por Shalom → las fases del courier **nunca se muestran**, ni al
   vendedor ni al comprador (`OrderTrackingMap`).
2. `vaEnElMapa` (entonces en `live-map.ts`, hoy retirado con En vivo) devolvía `false` →
   **ese pedido nunca aparecía en En vivo.**

Y Kross Shop vende hoy **solo recojo en agencia, con entrega a domicilio apagada**: un recojo
en Lima es exactamente `AGENCIA_LIMA`. No es hipotético.

Y un tercer efecto, el peor, que solo se ve al reproducirlo: con `tracking_phase` en
`EN_TRANSITO`, el paso activo se quedaba en `preparando`. **El reporte del courier se
descartaba en silencio** — la mitad de abajo del eje no llegaba a existir.

Raíz: había **dos definiciones de "es recojo"** — `isPickupDispatch()` en `src/lib/session.ts`
(correcta) y `esEnvioPorAgencia()` en `order-tracking.ts` (incompleta).

**Corregido:** quedó una sola, la de `session.ts`, que además normaliza mayúsculas y tolera
los valores heredados; `esEnvioPorAgencia()` se eliminó y sus tres llamadas apuntan a la
definición única. Con tests de regresión en `order-tracking.test.ts` y `live-map.test.ts`.

## Orden de ejecución

De lo más barato a lo más caro. Cada paso deja la app usable; ninguno depende del siguiente.

| # | Paso | Toca |
|---|---|---|
| ~~0~~ | ✅ **`AGENCIA_LIMA` entra a "es recojo"** — una sola definición, la de `session.ts` | hecho (26-ago-2026) |
| ~~1~~ | ✅ **Un solo lector de pedidos** (`useStoreOrders`) con una sola regla de alcance | hecho (26-ago-2026) |
| ~~2~~ | ✅ **Columnas = fases del courier** en CRM, Stats y el chip de Chats | hecho (26-ago-2026) |
| ~~3~~ | ✅ **`registrado` deja de ser `EN_ORIGEN`** + chip de antigüedad en el CRM | hecho (26-ago-2026) |
| ~~4~~ | ✅ **Pedidos con selector de modo**; las 4 rutas viejas redirigen | hecho (27-ago-2026) |
| ~~5~~ | ✅ **La llamada es un evento del hilo**; la sección Llamadas se disolvió | hecho (27-ago-2026) |
| ~~6~~ | ✅ **Clientes de verdad**: libreta + ficha con historial, Retención adentro | hecho (27-ago-2026) |
| ~~7~~ | ✅ **Borradas las rutas mock** — eran cuatro, no dos | hecho (27-ago-2026) |

**El plan está terminado.** El menú del admin pasó de diez entradas a cinco, las dos entidades
del modelo —Cliente y Pedido— tienen cada una su pantalla, y las vistas que antes eran
secciones (chats, CRM, En vivo, stats, llamadas, retención) son hoy modos o eventos de esas
dos.

Lo que sigue abierto no es del plan sino de su despliegue: las funciones que hay que publicar
y la revisión visual que todavía nadie hizo. Está en [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md).

## Después del plan: el tablero pasa de contar pedidos a contar plata (27-ago-2026)

Cinco arreglos sobre la pantalla ya unificada. Cuatro son de uso; el quinto le faltaba al
modelo desde el paso 4.

### El sub-interruptor Lista/Kanban se fue

Dentro de *Tablero* había otro selector: la misma agrupación por etapa, en vertical o en
columnas. Era una **tercera** manera de mirar lo mismo dentro de un modo que existe justamente
para eso, y salía por defecto en la que menos dice: en vertical, nueve etapas son nueve
títulos separados por scroll, y el tablero deja de responder "¿dónde se atora la operación?".
Queda una sola vista, la de columnas.

### *Bandeja* se llama *Lista*

Mismo contenido, mismo archivo (`PedidosLista.tsx`, antes `PedidosBandeja.tsx`). "Bandeja" es
vocabulario de correo y no de pedidos: el vendedor no está vaciando una bandeja, está
recorriendo sus pedidos uno por uno. El modo se llama `lista`, que es lo que la pantalla es.

### La barra de arrastre va arriba

Nueve columnas, cinco en pantalla. La barra nativa vive al pie del contenido, o sea debajo de
la columna más larga: para descubrir que hay más etapas hay que bajar hasta el final, y para
arrastrar otra vez, bajar otra vez. Media operación quedaba fuera de la vista sin nada que lo
dijera. `ScrollHorizontal` arrastra **dos** contenedores sincronizados —un riel de 10 px
arriba, con la barra, y la caja real debajo, con la suya escondida— y mide el ancho con un
`ResizeObserver` sobre la fila (`w-max`), para que no se desincronice cuando cambian las
columnas.

### Cada etapa dice cuánto, no solo cuántos

El conteo dice **dónde** se atora la operación; la suma dice **cuánto cuesta** que esté atorada
ahí. Ocho pedidos parados en `registrado` no son lo mismo si son de S/ 120 o de S/ 180, y es la
mitad que decide a qué columna correr primero.

Al escribirlo apareció que "cuánto vale un pedido" no estaba definido en ningún lado: había dos
respuestas sueltas —`estadoDePago` en `live-map.ts` y la resta del saldo en `OrderChatPage`— y
ninguna con nombre. Ahora viven en `src/lib/order-money.ts`, y `estadoDePago` las usa en vez de
repetir la regla:

| Cifra | Qué es |
|---|---|
| `valor` | lo que cuesta el pedido |
| `cobrado` | lo que YA entró — **solo si 360pay lo cruzó** (`payment_verification = MATCHED`) |
| `saldo` | lo que falta cobrar, típicamente contra entrega |

`cobrado` es la definición cara y es la correcta: un adelanto declarado que todavía no se cruza
no es plata en caja, y pintarlo como cobrado le mentiría al vendedor sobre el número por el que
abre el tablero.

### El filtro es de *Pedidos*, no del tablero

Por la misma razón que la lectura (`useStoreOrders`) es una sola: los cuatro modos son la misma
lista mirada distinto. Un filtro por modo dejaría el tablero de "esta semana" y el resumen de
"todo" conviviendo en pantalla sin que nada avise que están contando cosas distintas. Vive en
`PedidosPage` y `src/lib/pedidos-filtro.ts`, y aplica a los cuatro.

Se filtra por **fecha de creación**, no por la fecha de la etapa: "los pedidos de ayer" es una
cohorte que no cambia de tamaño cuando el courier mueve uno. Medir contra la etapa haría que el
mismo rango diera otro número en cada sincronización del tracking.

Tres decisiones que el código deja escritas:

- **Las opciones salen de los pedidos que hay**, no de las tablas `team` y `products`: un
  desplegable con veinte productos donde diecinueve no tienen pedidos filtra a una pantalla
  vacía y hace creer que algo se rompió.
- **Un pedido con `created_at` ilegible se queda.** Se ve de más, nunca de menos: esconder un
  pedido por una fecha rota es perder plata sin dejar rastro.
- **El filtro va abierto, no detrás de un botón**, y cuando hay algo puesto dice `N de M`. Un
  filtro escondido que quedó encendido es la forma más rápida de creer que la tienda dejó de
  vender.

De paso se juntaron los formateadores de fecha, que ya eran tres y empezaban a discrepar
(`src/lib/fechas.ts`). El de la bandeja leía el reloj **dentro** del render, así que dos
tarjetas pintadas en distinto momento podían decidir distinto si un pedido "es de hoy"; ahora
`ahora` se pasa como dato, igual que en `antiguedad`.

## El pedido deja de ser un viaje (27-ago-2026)

### Abrir un pedido no saca de Pedidos

Hacer clic en un pedido navegaba a `/vendedor/pedido/:token`: se perdía la lista, el filtro y
el sitio donde uno estaba, y volver costaba otra consulta. Con cien pedidos al día ese viaje
se paga cien veces.

Ahora entra como **panel desde la derecha**, encima de la lista, desde *Lista* y desde
*Tablero*. El token vive en la URL (`?pedido=`) por lo mismo que el modo: "atrás" cierra el
panel, el enlace se puede mandar y recargar deja abierto lo que estaba abierto.

Es el **mismo componente**, no una copia. `VendedorPedidoPage` se partió en dos: la ruta
—que sigue existiendo intacta para lo que llega de afuera: notificaciones, enlaces viejos, el
historial del cliente— y `PedidoVista`, que se monta como página o como panel. Un pedido que
se comportara distinto según por dónde se abrió sería otra pantalla que mantener, que es
justo lo que este documento viene deshaciendo.

En PC el panel se ancla al **marco 16:9 de la app**, no a la ventana: `Layout` dibuja una
tarjeta centrada con margen gris alrededor, y un panel anclado a la ventana se desbordaría
sobre ese gris y se vería como otra aplicación encima.

De paso salió un bug latente: `usePanelTheme` escribía `data-theme` al montar y lo QUITABA al
desmontar, sin contar cuántos lo pedían. Con el pedido abierto en panel hay dos montados a la
vez —el marco y el pedido—, así que cerrar el pedido apagaba el tema del marco y el panel se
volvía claro hasta el siguiente cambio de tema. Ahora se cuenta.

### El avatar dejó de esconder la mitad del pedido

Tocando el avatar del chat se abría `ContactSheet`: DNI copiable, teléfono, y el rastro del
pago en 360pay (pedido, código de pago, operación bancaria, botón de copiar para soporte). Un
botón que no parece un botón, con datos que deciden si se despacha o no.

`ContactSheet` se borró y su contenido se repartió en la columna del pedido, **en el orden en
que se pregunta**:

| # | Bloque | Responde |
|---|---|---|
| 1 | **Cliente** (`CustomerCard`) | ¿de quién es este pedido? |
| 2 | **Etapa** (`StageSelector`) | ¿en qué va? |
| 3 | **Adelanto** + **con qué pagó** (`AdvancePanel` + `PagoTrace`) | ¿entró la plata? |
| 4 | **Dirección** (`AddressBar`) | ¿dónde recibe? |
| 5 | **Envío** (`TrackingBar`) | ¿dónde está el paquete? |

El bloque 1 va primero **y es un enlace a la persona** (`/vendedor/clientes?cliente=<id>`,
solo para quien tiene libreta). Esa es la relación que el modelo ya decía y la pantalla no: un
pedido pertenece a un cliente, y del cliente cuelgan **todos** sus pedidos. Si para saber quién
es hay que abrir un modal, la pertenencia no se ve.

Qué ficha está abierta en *Clientes* también pasó a la URL (`?cliente=`), justamente porque ya
no se abre solo desde la libreta.

### Se fue el mapa del chat

`OrderTrackingMap` pintaba una cuadrícula con un punto y *"7 sedes cerca"* en el sitio más caro
de la columna: lo primero que se ve al abrir un pedido. Sin callejero debajo no respondía nada
—la dirección exacta de la agencia está escrita dos tarjetas más abajo, y la fase del envío la
dice `TrackingBar` con texto—. Detalle y decisión en
[`02-SMART-LOGISTICS.md`](./02-SMART-LOGISTICS.md#el-mapa-del-pedido--retirado-del-chat-27-ago-2026).

**En vivo** se salvó entonces con ese argumento —"ahí el mapa sí responde algo"— y no aguantó
el 28-ago: lo que respondía era la fase, redibujada como posición. Ver
[CRM y En vivo](#crm-y-en-vivo-son-la-misma-función-con-distinta-proyección--y-por-eso-sobraba-una).
El mapa que sí tiene un hecho detrás es el de **dónde se entrega**, en Clientes.

### Lo que se rompió al poner dos pantallas vivas a la vez

Abrir el pedido en panel dejó, por primera vez, **dos pantallas montadas sobre los mismos
datos**. Salieron tres fallas del mismo origen, y una es de las caras.

**`supabase.channel(topic)` no crea un canal: devuelve el que ya existe.** Y
`canal.on(...)` después de `subscribe()` **lanza** (`cannot add broadcast callbacks for … after
subscribe()`). Mientras abrir un pedido significaba navegar, eso nunca pasaba: la lista se
desmontaba antes de que el pedido se montara. Con el panel encima, las dos piden los mismos
topics —`presence:buyers` y `order:<id>`—, la segunda recibe el canal ya suscrito de la
primera, le añade un manejador, y la excepción sube por el efecto hasta **desmontar el árbol
entero**: pantalla en blanco, y solo desde *Lista*, porque el Tablero no escucha nada.

Al arreglarlo apareció que la misma trampa ya estaba armada en otro sitio, sin panel de por
medio: `SellerPresenceTracker` vive en `Layout` y abre `presence:sellers`; **Equipo** pedía ese
mismo topic y se llevaba el mismo crash — y su `removeChannel` al salir apagaba la presencia
del propio vendedor.

`src/lib/realtime.ts` reparte: el canal se pide una vez, se ata una vez —un comodín de
broadcast y un `sync` de presencia— y cada pantalla registra y retira sus manejadores. Se
cierra cuando se va la última. Diez pruebas lo fijan, con un doble que imita las dos reglas de
la librería (devolver el canal existente, lanzar al atar después de `subscribe`): sin esas dos
reglas la prueba no probaría nada.

| Consumidor | Topic |
|---|---|
| `PedidosLista` | `presence:buyers`, `order:<id>` de cada pedido de la lista |
| `PedidoVista` | `presence:buyers`, `order:<id>` del pedido abierto |
| `SellerPresenceTracker` (abre y pone la clave) · `EquipoPage` | `presence:sellers` |

### La ficha del cliente en demo, y en el mismo cajón

La libreta del demo se pintaba sola, pero abrir a una persona consultaba `list-clients` —que
no sabe nada de un `demo-cli-7`— y la ficha decía *"No se pudo cargar"*. Justo ahí es donde se
ve la recompra, que es medio Loyalty. Ahora sale del generador
(`fichaDemoDeCliente`), juntando los pedidos **vivos** (con token, o sea que se abren con su
chat) y el **historial entregado** (sin token: no hubo conversación que guardar).

La ficha pasó de hoja inferior a **cajón de la derecha**, el mismo que el pedido: es el mismo
gesto —mirar algo sin salir de donde estás— y con dos marcos distintos se verían como dos
aplicaciones. `PanelDerecha` es ese marco, y `PanelPedido` quedó como una línea encima de él.
De paso la ficha muestra lo que faltaba para decidir cómo tratar a alguien: **puntaje**,
segmento, cliente desde cuándo, DNI y teléfono copiables, y el conteo de sus pedidos.

## Siete cosas del uso diario (27-ago-2026)

### El puntito verde es uno solo

Lo tenía **solo la Lista**, con su propio canal y su propio `Set`. El Tablero no lo mostraba y
el chat lo calculaba aparte. Es el mismo dato —quién tiene la app abierta ahora— y cambia lo
que uno hace: a quien está mirando la pantalla se le escribe, y al que no, se le llama. Ahora
vive en `src/lib/presencia.ts` y lo leen las tres.

En demo sale del generador. La presencia real es de Supabase y en una tienda de ejemplo no hay
nadie conectado: un tablero de mil pedidos al día donde ningún cliente está en línea no enseña
la herramienta, enseña un dato apagado.

### Avanzar de etapa pregunta antes

**No se puede retroceder.** El cambio dispara avisos al comprador y puede ceder el pedido a
otro rol, y un dedo que resbala en el móvil del vendedor deja un pedido en una etapa que no le
toca y sin manera de volver. Ahora sale *"¿Ya está todo listo para «Confirmado»?"* con **Sí /
Todavía no**.

Lo mismo para **cambiar la cantidad** de un producto: se guarda solo, le cambia el total al
comprador, y `+` y `−` están a un dedo de distancia.

`src/components/Confirmar.tsx` es ese diálogo, y no un `window.confirm`: el del navegador sale
con el dominio, sin contexto y sin poder explicar qué se está por hacer. Va por `createPortal`
al `body` porque se usa **dentro** del cajón del pedido, y un `fixed` dentro de un contenedor
animado se ancla al contenedor, no a la pantalla.

### El pedido, en la columna y no en una ventana encima del chat

El detalle —productos, cantidades, nota del CRM, cancelar— se abría como ventana en el centro
de la pantalla, **encima de la conversación que habla justamente de él**, mientras media
columna de la derecha quedaba vacía. En escritorio ahora cierra esa columna. En móvil sigue
siendo hoja: ahí no hay columna donde ponerlo.

### El cajón vuelve arriba el fondo — arreglado

En el Tablero, abrir un pedido devolvía el scroll de atrás al inicio y uno perdía dónde estaba;
en Lista y en Clientes no. La causa: `PanelDerecha` se declaraba dentro de la pantalla, o sea
como descendiente del `<main>` que scrollea, y el `scrollIntoView` del chat —que baja al último
mensaje al abrirse— arrastraba también a ese `<main>`. Ahora el cajón va por `createPortal` al
`body`: no tiene ancestro que arrastrar. Por lo mismo se portó la galería de imágenes del
pedido, que centra la imagen con `scrollIntoView`.

### El botón de llamar era invisible

`background: var(--text)` con un teléfono blanco encima. En el panel oscuro `--text` **es** casi
blanco: blanco sobre blanco. Ahora usa el par `--invert` / `--invert-fg`, que está definido
justamente para que el fondo y el icono se opongan en los dos temas.

### La campana pasa a ser "¿está en la app?"

Era una campana genérica que pedía permiso de notificaciones. Ahora es un teléfono y dice lo
que de verdad importa: si este cliente está en la PWA.

**El botón no se esconde cuando ya está.** Desinstalar no avisa a nadie, así que *"ya la tiene"*
nunca es una certeza, y esconderlo dejaría al vendedor sin manera de reinvitarlo. Lo que cambia
es el color y lo que dice. Los datos crudos van a la ficha del cliente, y son **dos, no uno**:

| Dato | De dónde | Qué promete |
|---|---|---|
| `activated_at` | `buyers` | entró alguna vez — no promete que la push de hoy le llegue |
| `push_activo` | ¿hay fila viva en `push_subscriptions`? | **hoy** le llega una notificación |

Separarlos es lo que hace útil el dato: **quien entró y ya no recibe** es exactamente a quien
hay que escribirle por WhatsApp en vez de mandarle una push que no va a llegar. `get-session`
los adjunta a `buyer_contact`, o sea **solo para el vendedor**, con la misma regla de PII que el
DNI y el teléfono.

## De dónde es el pedido, y los cajones que se apilan (27-ago-2026)

### La cabecera del chat dice de dónde es

Decía *"En línea ahora"* —que ya lo dice el punto del avatar— y si no, el producto, que desde
que el detalle bajó a la columna ya está a la vista. Ahora dice **distrito · provincia ·
departamento**, que es lo primero que se pregunta al abrir un chat: decide el courier, el costo
del envío y cuánto tarda.

El dato vive en dos sitios según cómo recibe el comprador, y por eso existe `src/lib/ubicacion.ts`:

| Cómo recibe | De dónde sale |
|---|---|
| a domicilio | el `address` del pedido, que ya viene "Distrito, Provincia, Departamento" |
| recojo en agencia | **la sede**, no el `address` |

Esa segunda fila es la trampa que `AddressBar` ya documentaba: en un recojo, el `address` es el
distrito del **comprador**, así que un pedido de Chaclacayo que se recoge en Huaycán se leía
como "Chaclacayo" y mandaba a Logística a la ciudad equivocada.

Y se colapsan las repeticiones seguidas: en Perú la ciudad, la provincia y el departamento
coinciden muy seguido, y *"Arequipa · Arequipa · Arequipa"* no informa más que *"Arequipa"*
ocupando el triple.

De paso, el punto de conexión usaba `var(--text)` para "conectado" — que en el panel oscuro
**es** casi blanco, o sea que salía blanco e indistinguible del apagado. Ahora es lima, el mismo
que en Lista y en el Tablero: un color, un significado.

### Los cajones se apilan

*"Ver sus pedidos"* en la tarjeta del cliente navegaba a Clientes: para mirar al dueño de un
pedido había que salir del pedido. Ahora la ficha se abre **encima**, en su propio cajón (capa
2, con su velo), y cerrarla te devuelve al pedido donde estabas. Desde ahí, tocar otro de sus
pedidos cambia el que está abierto abajo — que es justo lo que uno quiere: saltar entre los
pedidos de la misma persona sin volver a la lista.

Para eso la ficha salió de `ClientesPersonas` a `src/components/PanelCliente.tsx`: se abre desde
dos sitios y no puede vivir dentro de uno de los dos.

### El tablero scrollea él, no la página

Dos pedidos que resultaron ser el mismo arreglo.

**Los nombres de las etapas se quedan fijos arriba.** Con columnas de veinte tarjetas, a mitad
de scroll uno ya no sabe qué etapa está mirando. `position: sticky` necesita un contenedor que
scrollee, y el tablero no tenía ninguno: `overflow-x: auto` convierte la caja en contenedor de
scroll también en vertical, pero con alto automático nunca scrollea, así que el sticky no se
pegaba a nada.

**Y abrir un pedido ya no devuelve la pantalla de atrás al principio.** Portar el cajón al
`body` (PR anterior) sacó al panel del `<main>`, pero el tablero seguía siendo lo que hacía
scrollear a `<main>`. Ahora, en escritorio, la caja del tablero se queda con el alto que le
sobra y scrollea ella: `<main>` no tiene scroll que perder, así que no hay a dónde volver.

En móvil no: un área que scrollea dentro de otra, en un teléfono, se pelea con el gesto de la
página. Ahí el tablero sigue estirándose como siempre.

De paso, el chat bajaba al último mensaje con `scrollIntoView`, que arrastra a **todos** los
ancestros que scrolleen. Ahora mueve el `scrollTop` de su propio contenedor, que no puede tocar
nada de fuera.

## El número de pedido, y la tercera presentación del pedido (27-ago-2026)

### Cuál de sus pedidos es este

La ficha del cliente lista sus pedidos, y hasta acá eran cuatro filas parecidas: *"Faja
Reductora Premium · En tránsito"* dos veces, sin nada que dijera cuál es el que está abierto
detrás. Ahora cada fila lleva el **número que le puso la tienda** y el que está abierto va
marcado (*"Lo estás viendo"*, en lima). El mismo número va pegado al nombre en la cabecera del
chat, que es la otra mitad de la comparación.

`order_id` es `ORD-1756345678901`: prefijo fijo más el milisegundo en que entró. Entero no
sirve para lo que el vendedor necesita —mirar dos y saber si son el mismo—: trece dígitos
iguales salvo los últimos cuatro son trece dígitos que nadie compara. Se muestra la **cola**
(`#678901`, `src/lib/order-code.ts`), y el completo queda en el `title` y en el detalle del
pedido, que es donde se copia para soporte de 360pay.

Y la comparación de "¿es este?" se hace por **`id` de sesión**, no por el código pintado: dos
pedidos distintos pueden compartir cola, y marcar el equivocado es peor que no marcar ninguno.

### El pedido, ahora también en ventana

Los otros pedidos del cliente llevan un **`+`** que abre su chat y su detalle en una **ventana
al centro**. La diferencia con el cajón de la derecha es de intención, no de estilo:

| | Para qué |
|---|---|
| **Cajón derecho** (`PanelDerecha`) | **trabajar** sobre algo — se queda, se escribe, la lista sigue detrás |
| **Ventana centro** (`PanelCentro`) | **mirar** algo un momento y cerrarlo — un pedido viejo, para acordarse de qué pasó |

Por eso va centrada y no pegada al borde: no continúa el trabajo de atrás, lo interrumpe a
propósito.

Adentro va el **mismo** `PedidoVista`, en su tercera presentación: página, cajón y ventana. Un
pedido que se pintara distinto según desde dónde se abrió sería otra pantalla que mantener —
que es lo que este documento viene deshaciendo desde el primer paso.

Las capas quedan así, y por eso están numeradas en un solo sitio:

| Capa | Qué |
|---|---|
| 1 | el pedido abierto desde Pedidos |
| 2 | la ficha del cliente, encima del pedido |
| 3 | un pedido viejo, en ventana |
| — | `Confirmar` y la galería, por encima de todo |

### Y lo que se quitó al usarlo (27-ago-2026)

Cinco recortes, todos de lo mismo: **decir dos veces lo que ya está dicho**.

**No hay "pedido sin chat".** El demo listaba el historial como renglones sin token, y la ficha
los marcaba *"sin chat"*. Pero todo pedido nace de un formulario, así que todo pedido tiene
conversación: era un estado que el producto no tiene y que el demo estaba inventando. Ahora un
pedido viejo se abre entero —con su chat, su guía y su adelanto cruzado—, armado en el momento
(`pedidoHistorico`) y no al generar la tienda: son miles, y generar miles de chats para que se
lean cuatro es pagar por adelantado algo que casi nunca se usa.

**Se fue el código corto del pedido.** Se puso para responder *"¿cuál de sus pedidos es este?"*,
y esa pregunta ya la responde la fila marcada *"Lo estás viendo"*. Dos respuestas a la misma
pregunta, y la peor de las dos —seis dígitos que hay que comparar a ojo— sobraba. En su sitio,
junto al nombre, va el **DNI**: es lo que ninguna otra pantalla dice de un vistazo, y es la
identidad del comprador en Kross —un mismo número junta sus pedidos aunque cambie de teléfono—.
El `ORD-…` completo sigue donde se usa de verdad: en el rastro del pago, que es lo que se copia
para soporte de 360pay.

**En la ventana del centro no va la ficha del cliente ni el botón de volver.** A ese pedido se
llegó DESDE la ficha, que sigue abierta detrás: ofrecer volver a un sitio donde uno ya está es
ruido. Y la ventana ya trae su X arriba a la derecha; dos formas de cerrar lo mismo, a diez
píxeles una de otra, se leen como que hacen cosas distintas.

Eso hizo falta distinguir los tres montajes del pedido, y se hizo con **un dato y no con dos
banderas** (`montaje: 'pagina' | 'panel' | 'ventana'`): con booleanos sueltos existe el estado
imposible de estar en dos sitios a la vez.

**Y el monto va a la altura del `+`.** Colgado de la primera línea quedaba a otra altura que el
botón de al lado, y dos cosas que se leen juntas tienen que estar juntas.

## Ganar sitio, y no perder el sitio (28-ago-2026)

### El menú se pliega a íconos

El panel en PC es una tarjeta 16:9: todo lo que ocupa el menú se lo quita al tablero, que es
donde de verdad se trabaja. Plegado son **148 píxeles menos**, o sea media columna de etapas
más a la vista.

La elección vive en el dispositivo, donde el tema y el modo demo (`src/lib/menu-lateral.ts`):
es una forma de MIRAR y no una preferencia de la marca. Quien trabaja en una laptop chica lo
quiere plegado; quien tiene un monitor grande, no. Ninguno de los dos debería decidir por el
otro.

Plegado, la firma de arriba muestra **solo el logo** —que es 1:1, así que cabe— y cada entrada
lleva su `title`: un ícono sin nombre es un acertijo la primera vez, y el `title` es lo que lo
convierte en un recordatorio.

### El pedido que abriste queda marcado

Abrir un pedido y cerrarlo devolvía a una lista de cincuenta filas iguales, sin saber en cuál
estabas. Ahora el pedido abierto se marca **y la marca se queda** al cerrar el cajón, en Lista y
en Tablero: es la miga de pan para seguir por donde ibas.

Es **una sola** marca y no una lista de visitados: la pregunta es *"¿dónde estaba?"*, y varias
marcas no la responden — la reparten. Mientras el pedido está abierto lo marca su propio token;
al cerrarse queda el último, en `PedidosPage`, que es quien ya sabía cuál se abrió.

## La Lista deja de repetir al Tablero (28-ago-2026)

### El bug de "la primera columna"

En el Tablero, hacer clic en una tarjeta devolvía el scroll al principio — pero **solo en la
columna de más a la izquierda**. La causa no tenía nada que ver con la posición:

```tsx
export default function PedidosTablero(...) {
  const Card = ({ s }) => (...)   // ← declarado DENTRO del render
```

Un componente declarado ahí adentro **cambia de identidad en cada pintada**, así que React
desmonta y vuelve a montar TODAS las tarjetas cada vez que el tablero se re-renderiza — y
abrir el cajón lo re-renderiza. Con el tablero scrolleando en su propia caja, ese momento sin
tarjetas colapsa su alto, el navegador recorta el `scrollTop` a cero, y la vista salta arriba.

Se notaba "solo en la primera columna" porque **el scroll vertical es del tablero entero**: la
única columna con tarjetas allá abajo es la más alta, y la más alta era la primera. Cualquier
columna igual de larga habría hecho lo mismo.

El repo ya explicaba esta trampa **dos veces** —en `chipAntiguedad` y en el grupo de cierre, los
dos convertidos a helper por este motivo—; `Card` era la que se había quedado. Ahora es
`TarjetaPedido`, a nivel de módulo.

### La Lista pregunta otra cosa, y ahora lo muestra

| Vista | Pregunta | Y por eso muestra |
|---|---|---|
| **Tablero** | ¿dónde se atora la **operación**? | etapa, producto, plata |
| **Lista** | ¿a quién le debo un **mensaje**? | conversación, espera, quién atiende |

La Lista mostraba producto y etapa: lo que ya está resuelto dos clics más allá. Sus columnas
son ahora **Cliente · Atiende · Último mensaje · Actividad · Creado**, y aparece lo que faltaba:

- **quién habló último** — sin eso, *"Listo, ya pagué"* y *"Confirmo tu pedido"* se leen igual, y
  son lo contrario;
- **hace cuánto**, y en rojo si el cliente escribió y nadie contestó;
- **quiénes atienden**, con los avatares superpuestos del asignado y los invitados.

### Y sobre todo: el orden

Una bandeja no se lee entera. Se lee de arriba abajo hasta que se acaba el tiempo, así que **lo
que está arriba es la pantalla**. Ese orden ahora se elige (`src/lib/bandeja.ts`):

| Prioridad | Pone arriba |
|---|---|
| **Sin responder** (por defecto) | el cliente escribió último y nadie contestó — primero el que más lleva esperando |
| **Sin leer** | lo que llegó y nadie abrió |
| **Parados** | la demora que reporta el courier, y después lo más viejo en su etapa |
| **Recientes** | lo último que se movió |

*Sin responder* no es lo mismo que *sin leer*, y por eso son dos: **un mensaje leído y no
contestado sigue siendo una deuda**, y es justo el que se olvida.

No hay "se entrega hoy" porque no existe el dato: ningún courier nos da fecha estimada, y
prometerla en la pantalla sería inventarla. Lo más cercano que sí es real —el atraso que Shalom
reporta— es *Parados*.

Los KPI de arriba dejaron de contar etapas (eso lo cuenta el Tablero, y dos pantallas contando
lo mismo invitan a compararlas) y cuentan lo de la bandeja: pedidos, sin leer, sin responder, y
cuánto lleva esperando el más viejo.

### Un lector de equipo, como el de pedidos y el de clientes

Para pintar quién atiende hacían falta los nombres, y la consulta vivía dentro de la pantalla de
Equipo. Ahora es `src/lib/store-team.ts`, hermano de `store-orders` y `store-clients`: pinta al
instante desde una caché por tienda y revalida detrás. De paso, su `cargando` **siempre**
resuelve —incluso si la consulta falla—, que es el caso que el watchdog de cuatro segundos de
Equipo venía tapando.

### Las cuatro vistas, y el recuadro que se puede tocar (28-ago-2026)

Primer uso real, y tres de las cuatro prioridades no aguantaron:

| Antes | Ahora | Por qué |
|---|---|---|
| Sin leer | ❌ se fue | "Leído" es del buzón, no del CRM: lo que decide si hay trabajo es si **contestaste**, no si abriste |
| Sin responder | ✅ y ahora **recorta** | Ordenar no bastaba: la vista tiene que dar SOLO los que deben respuesta |
| Parados | **Favoritos** | La demora del courier ya se ve en el Tablero; lo que faltaba era "vuelvo a este" |
| Recientes | **Chats recientes** + **Pedidos recientes** | Eran dos cosas: un pedido de hace un mes puede tener el chat más nuevo de la lista |

Y **los recuadros son las vistas**. Antes había un contador arriba y un chip abajo que decían lo
mismo: un número que no se puede tocar invita a buscar dónde está lo que cuenta, y lo que
contaba estaba al lado. Ahora es una sola cosa — se toca, se ve cuántos hay, y el activo lleva
el borde lima.

### "Sin responder" necesitaba poder cerrarse

La regla —el último en hablar fue el comprador— deja fuera un caso común: **no toda respuesta
pasa por el chat**. Se le llamó, se le contestó por WhatsApp, o la pregunta no necesitaba
respuesta. Sin poder cerrarlo a mano, esos pedidos se quedan arriba para siempre y la lista deja
de significar algo.

De ahí `answered_at` en `order_sessions` y el botón ✓ del chat, que aparece **solo cuando hay
deuda** — un botón que no hace falta ocupa sitio y hace dudar de si había algo pendiente.

Dos decisiones que el código deja escritas:

- **Es del PEDIDO, no de quien lo marca.** Si Andrea lo cierra, Kevin no tiene que volver a
  mirarlo. Por eso es una columna y no `localStorage`.
- **Es una FECHA, no una bandera.** Un mensaje posterior del comprador es más nuevo que
  `answered_at`, así que el pedido vuelve solo a la lista: no hay nada que reabrir, y no existe
  el estado "marcado como respondido pero con una pregunta encima".

En cambio **favoritos sí es del dispositivo** (`src/lib/favoritos.ts`), y por la razón contraria:
dos vendedores de la misma tienda tienen pendientes distintos, y una estrella compartida se
llenaría de las marcas de todos hasta no decir nada. Si algún día tiene que seguir a la persona
entre sus dispositivos, pasa a ser una tabla `seller_favorites` — y ese cambio es de servidor,
no de esta pantalla.

### "Tú:" no dice nada en un equipo de seis

El último mensaje se prefijaba con "Tú:" para todo lo que saliera de la tienda. Ahora dice
**quién**: `Cliente:`, `Milagros:`, `Sistema:`, `Bot:`. Es justo lo que evita el trabajo
duplicado — si ya contestó Milagros, no hace falta que conteste nadie más. Un mensaje de vendedor
sin nombre guardado (los de antes de que se guardara) dice `Tienda:`, que es verdad sin inventar
a nadie.

### 🟡 Deuda: lo automático se disfraza de persona

`Tienda:` **no** quiere decir "automático" — es solo el respaldo para un mensaje sin nombre
guardado. Hoy el reparto es:

| Prefijo | Quién |
|---|---|
| `Cliente:` | el comprador (`sender_role: buyer`) |
| `Sistema:` | avisos automáticos: pago cruzado, guía, cambio de etapa (`system`) |
| `Bot:` | la IA closer, cuando exista (`bot` / `ia`) |
| `Milagros:` | una persona del equipo (`seller` + `sender_name`) |
| `Tienda:` | un `seller` sin nombre guardado — mensajes viejos |

Y ahí está el hueco: **el mensaje de bienvenida que escribe `register-buyer`** cuando entra el
pedido sale con `sender_role: 'seller'` y el nombre del asignado, o sea que se lee como si esa
persona lo hubiera tecleado. Lo mismo hacen dos o tres mensajes de `order-manage` (oferta
aceptada, pedido reactivado).

Mientras eso siga así, **un porcentaje de "involucramiento del equipo" contado desde el chat
saldría inflado**: cada pedido nace con un mensaje "de" su vendedor que su vendedor no escribió.

Arreglarlo es marcar el mensaje en el origen —una columna `automatico` en `chat_messages`, o el
rol `bot` para lo que no teclea nadie— y tocar las funciones que escriben. No es un cambio de
pantalla: es de esquema y de despliegue, y por eso queda anotado y no hecho de paso.

### Un aviso automático no es un turno (28-ago-2026)

`esperaRespuesta` miraba el **último mensaje** del hilo. Con eso, esta conversación salía de los
pendientes:

```
Cliente   ¿en cuánto tiempo me llega?
Kevin     ¡Hola Rosa! Confirmo tu pedido…
Cliente   Listo, adelanté la mitad          ← el turno es del cliente
Sistema   Adelanto verificado               ← y esto lo tapaba
```

El pago entró, el sistema lo anunció, y el pedido se leyó como si la tienda ya hubiera
contestado. **Desapareció de la lista con la pregunta intacta**, que es la peor manera de
fallar: en silencio.

Ahora el turno lo decide la última **persona** —comprador, alguien del equipo, o el bot—. Los
del sistema siguen viéndose en la fila: son el contexto de *qué tipo de contacto hubo* (una
llamada, un pago, una guía). Solo no deciden de quién es el turno.

### Y su espejo: "Esperando respuesta"

Si "Sin responder" es la deuda que tenemos, faltaba la otra mitad del trabajo: **contestamos y
el cliente no volvió**. Ese es el pedido que hay que empujar —volver a llamar, mandar el
recordatorio— antes de que se enfríe.

Con una condición que lo hace útil: **solo pedidos abiertos**. En uno entregado o caído nadie
espera nada, y meterlos llenaría la lista de pedidos terminados. De ahí `pedidoAbierto` en
`order-tracking.ts`, junto a `estaVivo` — que se mudó ahí desde `store-orders` (y se reexporta
para no tocar a quien ya lo usaba): es una pregunta sobre el PEDIDO, no sobre quién lo lee, y un
módulo de lógica pura no debería cargar con React y el generador del demo para preguntar por un
`status`.

Las dos listas se excluyen por construcción —el turno es de uno o del otro— y las dos ordenan
por el **silencio**: cuánto lleva el hilo sin que hable una persona. La más callada arriba.

Solo la deuda NUESTRA lleva color: si los dos lados se pintan de rojo, el rojo deja de querer
decir "esto te toca a ti" (§6.1).

## El pipeline, revisado (28-ago-2026)

El eje llevaba meses describiendo el checkout de hace un año. Cuatro cambios, y ninguno es
cosmético: cada uno le quita al tablero una columna que mentía o le agrega una que faltaba.

```
 👀 Curiosos │ 📋 Pedido creado → 🔎 Validando → 💰 Confirmado │ 🧾 Registrado → 🏬 En origen →
  (no es un  │                                        ▲        │  🚚 En tránsito → 📍 En destino →
    pedido)  │                            ahí está la plata    │  ✅ Entregado
             │                                                 └── manda el courier
                        ⚠️ No entregado · ❌ Cancelado · 🚫 Anulado (cierres, al final)
```

### 👀 Curiosos: la columna que ya existía en la base y nadie miraba

`checkout_drafts` guarda desde hace meses al que llenó el formulario a medias. **El checkout lo
escribía y ahí se quedaba.** Ahora es la primera columna.

Un curioso es quien dejó **DNI y WhatsApp** y no siguió. Los dos datos son el filtro, y no por
capricho: con el DNI se le crea la cuenta, con el WhatsApp se le escribe —el fallback y el
masivo salen por ahí—. Sin uno de los dos la fila no se puede accionar, y una columna llena de
filas sobre las que no se puede hacer nada enseña a ignorar la columna entera.

De un curioso **se sabe qué producto miró**. **No** necesariamente el distrito ni la agencia:
esos campos van después en el formulario, y quien se fue antes no los dejó. La tarjeta lo dice
—`sin distrito`— en vez de rellenarlo; el área comercial lo completa a mano al convertirlo, y
saber a quién le falta qué es justamente lo que decide a quién llamar primero.

Sigue **fuera de `order_sessions`**, por la misma razón que lo sacó de ahí el día que se creó la
tabla: contaminaría el CRM y el round-robin le asignaría un vendedor a cada lead que nunca
compró. Se lee aparte (`get-store-drafts` → `useStoreDrafts`) y el tablero lo pinta como lo que
es: gente por llamar. Sin etapa, sin chat, y **sin suma de plata** — un curioso no debe nada, y
ponerle precio a lo que nadie pidió infla el número que decide la operación.

La columna se muestra **siempre, incluso vacía**: en cero significa "nadie abandonó el
formulario", y esconderla haría que un embudo con fugas se vea igual que uno sin ellas.

### 💰 Confirmado: donde está la plata (y donde se atasca)

El emoji era 📞. La llamada es el **medio**; lo que pasó en esa columna es que **entró plata**, y
es el hecho —no el medio— el que decide si esto se despacha. De ahí el 💰.

Es también donde ahora se acumula lo que **pagó pero el API de Shalom u Olva rechazó**. Sin
`preparando` en medio, ese pedido se ve exactamente por lo que es: plata cobrada que todavía no
tiene guía. Antes se escondía en una columna que decía "se está empacando" — que era, además,
la única etapa del eje que nadie podía verificar.

Y esos llevan chip propio: **⚠️ Guía manual** (`esperaGuiaManual`, `shalom_order_status ===
'FAILED'`). Es el atasco más caro del tablero y el más invisible, porque en la columna se lee
igual que un pedido recién cobrado — y son cosas distintas: uno espera a la máquina, el otro
espera a **una persona que no sabe que le toca**. La alerta pregunta por el rechazo, no por "no
tiene guía": un pedido recién cobrado tampoco la tiene, y marcarlos a todos convertiría el chip
en decoración.

### El anillo: cuánto de este pedido ya está cobrado

De `confirmado` en adelante cada pedido lleva un anillo. Lleno = pagado entero; medio = falta
cobrar el saldo; vacío = no ha entrado nada verificado.

Un anillo y no un número, porque con cincuenta pedidos en una columna la pregunta no es "cuánto
adelantó este" sino **a cuál corro primero** — y una fracción se compara de un vistazo, un monto
no. Se ve en el **tablero** y al **abrir el chat**, que son los dos sitios donde se decide.

Solo cuenta lo que 360pay cruzó (`cobradoDelPedido`, `payment_verification === 'MATCHED'`). Un
anillo lleno con un adelanto declarado y sin verificar sería la peor mentira posible, porque es
justo la que hace despachar.

Y arranca en `confirmado`, no antes: en las dos primeras columnas no hay nada cobrado que
mostrar, y un anillo vacío en cada tarjeta enseña a ignorarlo justo donde después importa. La
frontera se calcula contra `COLUMNAS` (`conPlataEnJuego`), no con una lista aparte.

### 📦 Preparando: fuera del eje

No describía un hecho verificable. Nadie marca "ya lo empaqué", el comprador que veía ese punto
encendido no sabía nada que no supiera antes, y lo que de verdad separa cobrar de despachar es
otra cosa: **que exista la guía** — que ya es su propia columna (`registrado`).

No se borra de la base. El CHECK de `stage` la sigue aceptando y hay miles de filas con ese
valor: se **traduce**. `stageVigente()` en `order-stages.ts` la lee como `confirmado`, que es lo
que esos pedidos son —cobrados y sin guía—.

> Es la diferencia entre normalizar **lo desconocido** y normalizar **lo viejo**, y confundirlas
> costaba caro: `toStage` manda lo desconocido a `nuevo`, y con eso un `preparando` guardado en
> marzo se pintaba como recién creado. Peor en el selector del vendedor: con la etapa fuera de
> la lista, `indexOf` daba −1 y el botón "avanzar" ofrecía la **primera** etapa como siguiente.
> O sea que el botón de avanzar retrocedía.

Consecuencia de operación: **ya no hay entrega automática a Soporte** — la etapa que la
disparaba no existe. Logística se queda con el pedido desde que entra la plata hasta que sale el
paquete, que es justo el tramo donde su trabajo ocurre. A Soporte se le sigue pudiendo invitar
al chat.

### 🚫 Anulado: el pedido que nunca fue una venta

Un **cancelado** es una venta que existió y se perdió: se arrepintió, no contestó, se cayó el
pago. Duele, y **tiene que doler** — cuenta en la conversión, que es el número con el que la
marca decide cuánto invertir.

Un **anulado** nunca fue una venta: el pedido de prueba, el dedazo, el formulario enviado dos
veces. Contarlo junto al cancelado ensucia justo ese número — y como se hace más seguido de lo
que uno cree (cada demo, cada prueba de despliegue), el ruido no es marginal.

Por eso son **dos preguntas y no una**:

| | ¿se ve en las vistas vivas? | ¿cuenta en las estadísticas? |
|---|---|---|
| `active` | sí | sí |
| `cancelado` | no (columna aparte) | **sí** |
| `anulado` | no (columna aparte) | **no** (`contable()`) |
| `no_entregado` | **sí** | **sí** — es la mitad de la tasa de entrega |

Se pone y se quita desde el detalle del pedido (`order-manage`, acciones `anular` / `restore`).
Desandarlo importa: el estado se pone justamente cuando alguien se equivocó, y un botón que no
se puede deshacer se usa menos de lo que hace falta.

## El mapa que sí tiene un hecho detrás: dónde se entrega (28-ago-2026)

En el sitio que dejó En vivo —y en el espacio vacío que la libreta de clientes tenía al
costado— va el Perú con **un punto por distrito, del tamaño de lo que se entregó ahí**.

La diferencia con el mapa que reemplaza no es de datos, es de naturaleza. Aquel pintaba una
posición que nadie reporta; este pinta un hecho consumado: **un pedido entregado en Chimbote
estuvo en Chimbote**. Y la pregunta que responde no la respondía ninguna pantalla del panel —
*¿dónde está la demanda?*— aunque el dato estuviera en la base desde el primer pedido.

### Sobre lo ENTREGADO, no sobre lo pedido

Un distrito con veinte pedidos y cinco entregas no es un buen distrito: es un problema de
logística disfrazado de demanda. Es la misma definición de "me compró" que usa el LTV de la
libreta (`list-clients`), y por eso los dos números de esta pantalla cuadran entre sí.

Un pedido entregado se cobró entero —el saldo se paga en la puerta o en el mostrador— así que
lo facturado es el **valor** del pedido, no el adelanto verificado. Es el único sitio del panel
donde esa distinción se resuelve al revés que en el tablero, y por eso está dicho en el código.

### Dónde cae cada pedido

| Cómo recibe | De dónde sale el distrito |
|---|---|
| Recojo en agencia | **la SEDE** — trae distrito, departamento y coordenadas exactas |
| A domicilio | la dirección escrita, leída contra el padrón del INEI, colocada en el centroide del distrito |

La sede manda sobre la dirección, siempre. En un pedido por agencia el `address` es el distrito
del **comprador**, no el de la sede donde recoge: un pedido de Chaclacayo que se recoge en
Huaycán se contaría en Chaclacayo. Es la misma trampa que ya documentaba `ubicacion.ts`, y la
razón de que la regla viva UNA vez (`ubicadorDe` en `mapa-entregas.ts`) — la usa la pantalla y
la usa el demo, así que no puede pasar que el mapa de ejemplo se vea bien y el real salga vacío.

`address` no tiene formato fijo: el checkout lo arma distinto en cada rama (`addressOf` en
OrderService), y en dos de las cuatro **no lleva departamento**. Partir por comas y asumir una
posición falla en tres. Lo que sí es estable es que el nombre del distrito está escrito ahí, así
que se busca contra el padrón de atrás hacia adelante. Los homónimos —hay un Miraflores en Lima
y otro en Arequipa— se desempatan con el resto de la dirección, y **si no se puede desempatar no
se adivina**: ese pedido va al conteo de "sin ubicar", que la pantalla muestra. Un punto en el
distrito equivocado es peor que un punto que falta — el que falta se ve como falta, el
equivocado se lee como dato.

### El tamaño del punto

Por **raíz** del conteo, no proporcional. Lo que el ojo lee como cantidad es el área: con el
radio proporcional, un distrito con el cuádruple de pedidos se ve dieciséis veces más grande y
el mapa miente a favor de Lima — que ya concentra bastante sin ayuda.

### El filtro

De **producto**, porque es la pregunta que cambia una decisión: dónde funciona cada cosa no es
lo mismo que dónde funciona la marca. Y al abrir un distrito, el desglose al revés — qué se
entrega ahí, con su monto —, que es lo que decide qué stock mandar a esa zona.

### Por qué solo en escritorio

En un teléfono no hay espacio libre que aprovechar, y el país entero con sus distritos en 390 px
no es un mapa, es una mancha. Ahí la pantalla sigue siendo la libreta.

### La agregación

`delivery-map` **no resuelve geografía**: el catálogo de las 911 sedes y el padrón viven en el
front y se cargan diferidos, y traerlos a la Edge Function sería una segunda copia que se
desincroniza. La función agrupa por el sitio CRUDO —sede, o dirección escrita— cruzado con
producto, y el panel lo convierte en distrito.

Agrupar en el servidor sí importa: una tienda con meses de historia tiene miles de pedidos
entregados y unos cientos de combinaciones sitio × producto. Es la diferencia entre megabytes y
decenas de kilobytes. Se leen las filas y se juntan en Deno en vez de con un `GROUP BY` —la
librería no lo expone y una función SQL exigiría una migración para una pantalla—, con un techo
de 20.000; cuando lo toca, la respuesta lo dice y la pantalla presenta el total como un piso en
vez de como el total.

## Encontrar uno, y no perderlo (28-ago-2026)

Dos cosas del tablero que no se notan hasta que la tienda tiene cien pedidos vivos.

### El buscador: rebanar no es encontrar

El filtro de Pedidos ya tenía desplegables —quién atiende, qué producto, qué fechas— y
todos hacen lo mismo: **rebanar**. Ninguno servía para el gesto contrario, que es el que
más se hace: *llamó Rosa Sánchez y quiero SU pedido*.

Son dos gestos distintos y por eso son dos controles distintos. El buscador va primero en
la barra, porque quien llega con un nombre o una guía en la mano no viene a rebanar.

**Qué se busca**, que es la decisión de verdad: **con qué llega uno a la pantalla**.

| Campo | Cuándo lo tienes en la mano |
|---|---|
| nombre del comprador | llamó, o escribió |
| N° de pedido (`ORD-…`) | el cliente lo está leyendo de su pantalla |
| DNI | su identidad en Kross — junta sus pedidos aunque cambie de teléfono |
| teléfono | es de donde viene la llamada |
| N° de guía | por lo que pregunta el courier |

El **producto no está**, y no es un olvido: ya tiene su desplegable al lado. Meterlo haría
que escribir "faja" devuelva media tienda desde un control que promete encontrar uno.

Se compara **sin acentos, sin mayúsculas y sin separadores**: quien dicta un teléfono lo
dice "912 345 678", quien copia un pedido trae `ORD-17563…` y quien escribe un apellido no
pone la tilde. Sin normalizar, esas tres formas de escribir lo mismo no encuentran nada — y
un buscador que no encuentra se deja de usar a la segunda.

Y por **términos**, no por la frase entera: "perez ana" encuentra a Ana Pérez igual que
"ana perez". Uno no recuerda en qué orden estaba escrito el nombre. Todos los términos
tienen que estar (Y, no O): con OR, escribir dos palabras devolvería MÁS resultados que
escribir una, que es lo contrario de lo que uno espera al seguir tecleando.

> Detalle que solo se ve al probarlo: los campos se juntan separados por `|`. Pegados y
> normalizados, `ROSASANCHEZ` + `ORD1756…` serían un solo texto donde un `ZORD` encontraría
> un pedido que no dice eso en ninguna parte.

**Vive en el filtro compartido** (`pedidos-filtro.ts`), no en el Tablero, por la misma
razón que todo lo demás de esa barra: Lista, Tablero y Resumen son la misma lista mirada
distinto. Un buscador solo en el Tablero haría que el Resumen contara pedidos que la
pantalla de al lado no está mostrando. De regalo, la Lista también busca.

**El DNI no venía en la respuesta.** `get-store-sessions` traía nombre y teléfono pero no
el documento, que vive en `buyers`. Se agrega en una **consulta aparte** y no embebido
(`buyers ( document_number )`), aunque el embebido sería una línea: PostgREST lo resuelve
por la clave foránea, y la de `order_sessions.buyer_id` se creó con
`ADD COLUMN IF NOT EXISTS … REFERENCES`, que **no hace nada si la columna ya existía**. No
hay forma de saber desde el código si esa constraint está en producción, y si no estuviera,
el embebido devolvería 400: **el panel entero se quedaría sin pedidos por querer enseñar un
DNI**. Un `IN` sobre ochenta ids no depende de ninguna constraint, y si falla se pierde
poder buscar por DNI, no la lista.

### El puntero: el borde marcado solo sirve si se ve

Abrir un pedido marca su borde para no perder el sitio al cerrar el cajón. Pero el tablero
scrollea en **dos ejes** —nueve columnas de ancho, treinta tarjetas de alto— y basta
arrastrar un poco para que el pedido abierto quede fuera de la pantalla, sin nada que diga
hacia dónde.

En la barra de filtros, pegado a la derecha, está **Ir al pedido seleccionado**. Tocarlo lo
trae al centro de la pantalla.

Tres decisiones que lo hacen usable:

- **Está siempre que haya un pedido seleccionado en pantalla**, no solo cuando se pierde de
  vista. Vive en una barra, y un control que aparece y desaparece dentro de una barra se lee
  como un error de la barra: uno aprende dónde están las cosas y espera encontrarlas ahí.
  Lo que cambia es el **énfasis** — apagado mientras el pedido está a la vista, encendido y
  con una flecha cuando no.
- **La flecha apunta al eje donde está MÁS lejos.** Un pedido un poco abajo y mucho a la
  izquierda se encuentra yendo a la izquierda; una flecha hacia abajo mandaría a buscar
  donde no está.
- **Pegado a la derecha del todo** (`ml-auto`), separado de los desplegables: no es un
  filtro y no debe leerse como uno más de la fila.

Vive en la barra y no en la pantalla que pinta la fila. El nodo sube hasta `PedidosPage`,
que es el único sitio donde la barra, el Tablero y la Lista se ven a la vez; en Resumen no
hay fila que entregar, así que el botón no sale sin que ninguna de las pantallas tenga que
saber que existe. **El Tablero y la Lista lo usan igual** — el mismo botón, el mismo hook,
la misma flecha.

"Se ve" se mide **por área** y con un mínimo del 35 %: una tarjeta asomando un píxel por el
borde está técnicamente visible y en la práctica no se ve. La geometría vive aparte
(`fuera-de-vista.ts`) justamente para poder probarla sin un navegador; el componente solo
pone el observador.

Dos mecanismos y no uno, porque cada uno tapa el hueco del otro:

| | Ve | No ve |
|---|---|---|
| `IntersectionObserver` | que la tarjeta se mueva sin que nadie scrollee (cambió el layout) | pasar de "fuera por la izquierda" a "fuera por arriba" — no cruza ningún umbral |
| `scroll` + `resize` | eso mismo | un cambio de layout sin scroll |

Los dos pasan por la misma medición, limitada a **una por cuadro** (`requestAnimationFrame`)
y guardando **solo cuando la dirección cambia**. Sin lo segundo, cada evento de scroll
crearía un objeto nuevo y repintaría las cien tarjetas del tablero sesenta veces por
segundo — el estado se devuelve idéntico para que React se salte el render.

### El bug que el puntero destapó: dos cajas peleándose

La primera versión avanzaba **unos píxeles por clic**. Hacían falta cincuenta para llegar.

No era del puntero: era de `ScrollHorizontal`, que arrastra dos contenedores a la vez —el
riel de 10 px de arriba y la caja de verdad— y los mantiene sincronizados copiándose la
posición en el `onScroll` del otro. Ahí había escrito que *"no hace falta guardia contra el
rebote: asignar el mismo `scrollLeft` no dispara otro evento, así que el ping-pong se corta
solo"*.

Cierto **mientras el que mueve es un dedo**. Deja de serlo en cuanto la caja se mueve sola:

1. `scrollIntoView` arranca un desplazamiento suave. La caja avanza y dispara su evento.
2. Se copia esa posición al riel. El evento del riel llega **un cuadro después**, cuando la
   animación ya avanzó más.
3. Los valores ya no coinciden, así que se le escribe `scrollLeft` a la caja — y **escribir
   `scrollLeft` cancela la animación en curso** y la devuelve a la posición vieja.

Cada clic: avanza un poco, rebota, se para.

La guardia es de una línea —quien recibe un ajuste sabe que el evento que le va a llegar no
es del usuario, y lo deja pasar sin devolverlo— pero la regla vive en `scroll-espejo.ts`,
fuera del componente, porque es **lo único de todo esto que se puede probar sin un
navegador**: la prueba corre la secuencia de eventos que dispara un desplazamiento suave y
comprueba que a la caja no se le escribe nunca.

### La Lista pinta de a cien (28-ago-2026)

Una bandeja se lee de arriba abajo hasta que se acaba el tiempo, así que pintar mil filas
para que alguien mire quince es trabajo que el navegador hace para nadie. Se pintan cien y
se suman cien más al bajar.

**Sin botones de página**, y no por moda: en una bandeja, "siguiente" obliga a decidir
cuándo dejar de leer, y lo que uno quiere es seguir leyendo. El centinela del final pide las
siguientes con 400 px de anticipación, así que las filas ya están cuando el scroll llega —
pedirlas al tocar el fondo se ve como un tirón. Y **solo existe mientras falten filas**: un
centinela sin nada que cargar volvería a estar visible al montarse y pediría más para
siempre.

La ventana se guarda **etiquetada con la vista** que la pidió, así que cambiar de vista
vuelve a cien sin un efecto que lo limpie un render tarde — que es el render en el que se
verían trescientas filas de la vista nueva.

**La fila marcada siempre se pinta**, esté en la página que esté. Es a la que lleva *Ir al
pedido seleccionado*, y para centrarla tiene que existir en la pantalla: si el pedido
abierto es el número 340 y solo hay cien pintadas, no hay nada a lo que ir. La ventana se
estira hasta alcanzarlo (`cuantasPintar`). No es un caso raro — es justo lo que pasa cuando
uno abre un pedido, se va a otra cosa y vuelve.

### Y esté en la vista que esté

La página no era el único sitio donde se podía perder. **Cada vista recorta distinto**: si el
pedido abierto está en "Sin responder" y uno se fue a "Favoritos", en la pantalla no hay
ninguna fila a la que llevarlo. El botón se quedaba quieto y parecía roto.

Ahora, al pulsarlo, **cambia de vista si hace falta**. Se busca la primera vista que lo
contenga (`vistaQueContiene`), o sea la más específica: si está sin responder Y es favorito,
va a "Sin responder", que es la que dice por qué hay que mirarlo. Nunca falla — "Chats
recientes" no recorta nada, así que siempre hay dónde encontrarlo.

Dos cosas tuvieron que moverse para eso:

- **La vista subió a `PedidosPage`**, con el modo y el filtro. Quien pinta el botón tiene que
  poder cambiarla; quien la tenía estaba una capa más abajo.
- **El desplazamiento aprendió a esperar.** Al cambiar de vista, la fila todavía no existe
  cuando el clic termina. La petición queda anotada y se cumple en cuanto el nodo aparece, un
  instante después (`usePunteroAlMarcado`). De regalo, también funciona cuando la fila aún no
  ha llegado porque la lista estaba cargando.

El tope del servidor subió de **80 a 500** el mismo día (`get-store-sessions`). Con 80, el
panel enseñaba una rebanada sin decirlo: una tienda que despacha cien al día perdía de vista
lo de anteayer, y el filtro de "30 días" contaba sobre lo que había llegado, no sobre lo que
hay. Ese era el costo caro — el `limit` se aplica **antes** de filtrar por estado, así que
cortar bajo también decide QUÉ entra.

500 filas con su chat son unos cuantos cientos de kilobytes: caro para pedirlo en cada
pantalla, barato una vez por carga. Cuando una marca lo pase de largo, lo que toca no es
subirlo otra vez — es paginar en el servidor con un cursor por `created_at`.

### Y se fue el buscador de la Lista

La Lista tenía su propia caja de búsqueda por nombre y teléfono. Desde que el buscador de la
barra encuentra por nombre, N° de pedido, DNI, teléfono y guía, aquella pasó a ser un
subconjunto estricto de esta. Dos cajas de búsqueda en la misma pantalla, una peor que la
otra, es peor que una sola.

## El mismo pedido, dos nombres (28-ago-2026)

La cabecera del chat mostraba **`ESTADO: En camino`**, sin emoji, mientras el tablero ponía
ese mismo pedido en **🚚 En tránsito**.

No era un descuido de redacción: eran dos ejes. La barra del chat pintaba el `stage` crudo
—el reloj del equipo— con una lista de nombres escrita ahí mismo, y el tablero pintaba la
COLUMNA, que funde el reloj del equipo con el del courier (ver [El eje del
pedido](#el-eje-del-pedido-dónde-termina-lo-nuestro-y-empieza-el-courier)). Un pedido que
Shalom ya reporta `EN_TRANSITO` está en tránsito aunque nadie del equipo haya tocado nada, y
el chat decía lo que decía el reloj que no manda.

Ahora la barra muestra el **paso del eje** (`pasoActual`), que es lo mismo que pinta el
tablero.

Y con el MISMO nombre, que fue el segundo hallazgo: las etiquetas se especializaban con el
courier —"Registrado en Shalom", "En agencia de Shalom", "En agencia de destino"—. Se leían
bien de a uno y mal de a cien: el tablero decía **En origen** y la cabecera del mismo pedido
decía **En agencia de Shalom**, obligando a traducir entre dos pantallas que hablan de lo
mismo. De qué courier es ya lo dice la barra del envío, que está dos tarjetas más abajo. Un
solo juego de nombres: el del tablero.

Y los nombres salen de **una sola definición**: `PASOS` en `order-tracking.ts`, de donde
`COLUMNAS` ahora se deriva en vez de repetirlos. El detalle del pedido tira del mismo sitio.
Tres pantallas nombrando lo mismo, escrito una vez.

> Lo que se VE y lo que se MUEVE siguen siendo cosas distintas, y ahí estaba la trampa: el
> botón *avanzar* sigue moviendo el `stage`, porque las fases del courier no son nuestras
> para marcarlas. Lo único que cambió es que el estado que se lee es el del eje completo.

### Los tres cierres, juntos y al final

"No entregado" estaba suelto en la fila del estado, **pegado al botón de avanzar** — que es
justo su contrario. Ahí se pulsa por error.

Es un cierre, no un paso: termina el pedido igual que cancelarlo o anularlo. Así que se fue
abajo con los otros dos, los tres en rojo y del mismo tamaño, que es donde uno busca las
cosas que no se deshacen. La regla de cuándo se ofrece no cambió: solo desde `confirmado` —
antes de que el pedido salga al mundo, lo que corresponde es cancelar, no "no entregar".

## Un adelanto, un pago total y un saldo son tres cosas (28-ago-2026)

La columna del pedido decía el mismo monto **tres veces**: en la ficha del cliente
("Adelanto de S/ 90 verificado"), en un panel propio debajo ("ADELANTO · S/ 90 · ✓
VERIFICADO") y otra vez en el recuadro verde de "Pagó con Yape (360pay)". Tres sitios
diciendo lo mismo son tres sitios donde puede decirse distinto — y ya lo decían: la ficha
del cliente leía `advance_amount` a secas, el panel leía el monto y el estado por separado y
solo el recuadro verde cruzaba contra la operación bancaria. El pedido de la sesión fue
directo: *todo lo relacionado a la operación efectuada con éxito y el monto en cuestión debe
ir en ese recuadro verde*.

Así quedó. La ficha del cliente responde **quién es** —nombre, ubicación, DNI, WhatsApp, si
recibe push— y no habla de plata. El panel de "adelanto verificado" se borró
(`components/checkout/payment/AdvancePanel.tsx`). Lo que entró se cuenta en un solo sitio.

### Y son tres, no uno

El recuadro verde asumía una sola forma de cobrar. En la operación real hay tres, y
confundirlas cuesta plata:

| | Cuándo | Qué deja | Qué suelta |
|---|---|---|---|
| **Adelanto** | al cerrar el checkout | un saldo pendiente | el despacho |
| **Pago total** | al cerrar el checkout | nada | el despacho |
| **Saldo** | después, cuando ya hay guía | nada | **la clave de recojo** |

Adelanto y pago total son **la misma operación con distinto monto**, así que no llevan campo
aparte: se distinguen por lo que dejan pendiente. Si el primer cobro cubre el precio entero
no es un adelanto, es *el* pago — y llamarlo adelanto haría buscar un saldo que no existe
(`cobrosDelPedido` en `lib/order-money.ts`).

El **saldo** sí es otra operación: ocurre días después, tiene su propio cupón, su propio
número de operación bancaria y su propia fecha. Por eso son **dos recuadros verdes separados
y no una suma**. Un "pagado S/ 180" borra lo único que un reclamo necesita saber: *cuál de
los dos*. Vive en columnas propias (`saldo_amount`, `saldo_verification`, `saldo_matched_at`,
`saldo_event_id`, `pay360_saldo_coupon_id`, `pay360_saldo_consumer_code` — bloque §31 de
`setup-kross.sql`), y `get-session` arma su rastro con el mismo helper que el del adelanto,
llamado dos veces.

Cada tarjeta se pinta **verde cuando entró y ámbar mientras el cupón está emitido y sin
pagar**. No es un matiz de color: un cupón emitido no es plata, y despachar leyendo el monto
de un cupón sin pagar es el error caro que esta pantalla existe para evitar.

### El saldo se cobra solo

Antes, el saldo lo perseguía el asesor por el chat. Ahora, cuando el pedido ya tiene guía, al
comprador le aparece un botón que abre su Yape con el monto exacto; 360pay avisa por webhook
y el sistema valida sin que nadie mire nada. El acuse le entrega la clave de recojo.

Cuándo se ofrece ese botón es una regla de **plata**, no de pantalla, así que vive en
`order-money.ts` (`puedePagarSaldo`) y no en el componente que lo pregunta:

- queda saldo — adelantó una parte, no pagó todo;
- **el adelanto ya está cruzado**;
- la tienda cobra en línea (`payment_provider === '360PAY'`). Prometer un botón que no cobra
  es peor que no ponerlo: sin pasarela, el saldo lo coordina el asesor por el chat.

La segunda condición es la que no se adivina mirando: en 360pay **el código de pago
identifica al CLIENTE, y el banco cobra siempre el cupón pendiente más antiguo**. Con el
adelanto emitido y sin pagar, quien viene a pagar su saldo termina pagando el adelanto — por
otro monto. Por eso el cupón de saldo se niega en el servidor también (`advance_not_paid` en
`pay360-coupon`), y no solo escondiendo el botón: el cliente que no ve el botón no es el
único que puede llegar a esa función.

Dos cosas más que el saldo **no** hace, a propósito:

- **no mueve la etapa.** Cobrar no es entregar. El pedido sigue donde el courier lo tenga; lo
  que cambia es que ya no debe nada.
- **no dispara otro `Purchase` de CAPI.** La conversión se cuenta una vez, en el primer cobro.
  Contarla dos veces por el mismo pedido le rompería el ROAS a la marca en su propio Events
  Manager.

### Y el anillo solo se llena con plata que pasó por la pasarela

[El anillo](#el-anillo-cuánto-de-este-pedido-ya-está-cobrado) suma ahora las dos operaciones
cruzadas —adelanto (o pago total) y saldo—, y **solo** esas. Un comercio puede acordar por el
chat cobrar el resto por transferencia, en efectivo en la puerta o como sea, y mover el pedido
a Entregado: eso **no** llena el anillo.

No es una omisión, es la definición: de esa plata no tenemos rastro, y decir que lo tenemos es
la única mentira que `order-money.ts` no se puede permitir. **Entregar el pedido no lo cobra;
cobrar lo cobra.** Un anillo que se llenara al mover la etapa mediría el ánimo del vendedor,
no la caja — y el anillo existe justo para responder cuánta plata está adentro y cuánta
todavía depende de que alguien aparezca.
### Y se puede preguntar al revés: quiénes pagaron qué

El anillo y las tarjetas verdes lo dicen **pedido por pedido**. Faltaba la pregunta al revés,
que es la que se hace un lunes por la mañana: *¿cuáles van por cada camino?* Para responderla
había que abrir el tablero y contar anillos a ojo, columna por columna.

Ahora hay un desplegable al lado del de productos —**Todos los pagos · Sin cobrar · Solo
adelanto · Pago total · Adelanto y saldo**— que rebana igual que él. Va después porque la
pregunta llega después: primero qué se vende, luego cómo se cobró.

Lo que responde cada opción:

- **Solo adelanto** — adelantaron una parte y todavía deben.
- **Pago total** — pagaron el precio entero de una. No hay nada que cobrar después.
- **Adelanto y saldo** — pagaron el saldo en una segunda operación: **los que hicieron los dos
  pagos**, que es la lista que no existía en ninguna pantalla.

> Al salir, este filtro etiquetaba el pedido **por operación**, así que quien adelantó y
> después pagó su saldo caía en *Adelanto* y en *Saldo* a la vez. Duró un día: marcar solo
> *Adelanto* devolvía también a los que ya no deben nada, que es lo contrario de la pregunta.
> Ahora cada pedido cae en una sola casilla, con el nombre de la combinación — ver [tres
> formas hasta dar con la buena](#y-el-filtro-de-pagos-tres-formas-hasta-dar-con-la-buena).

Y **solo cuenta lo que cruzó la pasarela**, la misma regla del anillo: un cupón emitido y sin
pagar no es un pago. El desplegable dice *pagos*, y listar ahí lo que todavía no entró es
exactamente el error que hace despachar de más.

Se ofrece solo cuando hay más de una forma de cobro en la lista, como el de vendedores y el de
productos: con todos los pedidos cobrados igual, ese desplegable no rebana nada y solo estorba.

> Vive en la barra de filtros, o sea que también está en Lista y en Resumen. Es a propósito y
> es la regla de esta pantalla desde el principio: Lista, Tablero y Resumen son la misma lista
> mirada distinto, y un filtro por modo haría que el tablero de "esta semana" y el resumen de
> "todo" convivan sin que nada avise que están contando cosas distintas.

### Y la tienda de ejemplo cobra el saldo

El demo no tenía saldos: todos sus pedidos habían hecho una sola operación. Con eso, media
pantalla nueva no se podía enseñar —el segundo recuadro verde, el anillo lleno, la opción
*Saldo* del filtro— justo en la tienda que existe para enseñar la herramienta.

Ahora un pedido del demo paga el saldo cuando **puede pagarlo de verdad**: queda algo por
cobrar, el adelanto ya cruzó y hay guía. Las mismas tres condiciones que `puedePagarSaldo`, no
una moneda al aire — un demo que generara un saldo sobre un adelanto sin cruzar enseñaría una
pantalla que en producción no puede ocurrir.

Y no lo paga todo el mundo, que es el punto: **quedan entregados con el anillo a medias**, los
que arreglaron el resto con el comercio por fuera. Si en el demo todos pagaran el saldo, un
anillo lleno no significaría nada — hace falta el contraste para que se vea qué está midiendo.
También hay unos cuantos con el cupón emitido y sin pagar, que son los ámbar: sin ellos no se
ve que un cupón **no** es plata que entró.
## Marcar de a varios, y el upsell que mueve el anillo (28-ago-2026)

### Los filtros eran de a uno, y la pregunta nunca lo es

Vendedor, producto y pago se elegían de a uno. La pregunta de verdad casi nunca es de a uno:
*los de Kevin y Milagros*, *las dos fajas*, *los que adelantaron y los que pagaron todo*. Con
un valor único había que mirar dos veces y sumar de cabeza — justo lo que un filtro existe
para evitar.

Los tres son ahora de marcar varias casillas. **Nada marcado = todos**, así que desmarcar la
última equivale a quitar el filtro; no hace falta una casilla de "Todos" que se apague sola al
marcar otra, que confunde más de lo que ayuda.

Entre casillas del mismo filtro es **O** —Kevin *o* Milagros—; entre filtros distintos sigue
siendo **Y** —los de Kevin *y* de las fajas—. Es la única lectura que no sorprende: dentro de
una pregunta se suman respuestas, y dos preguntas se acumulan.

Y el globito cuenta **preguntas puestas, no casillas marcadas**: tres productos marcados son
un filtro, no tres.

> No es un `<select multiple>`. Ese control se pinta como una caja con scroll de cinco filas y
> no dice cuántas cosas hay marcadas sin abrirla. Acá el botón cerrado ya lo dice —"Kevin",
> "2 productos"—, que es lo que uno lee de pasada para no creer que la tienda dejó de vender.

### Y el filtro de pagos: tres formas hasta dar con la buena

Este filtro se equivocó dos veces antes de quedar bien, y las dos veces por lo mismo: **pedía
componer en vez de elegir**.

**Primera forma — una etiqueta por operación.** Quien adelantó y después pagó su saldo salía en
*Adelanto* **y** en *Saldo*. Marcar *Adelanto* —la pregunta de verdad, la de a quién hay que
cobrarle— devolvía entonces también a los que ya no deben nada.

**Segunda forma — casillas de estado, con los nombres de las operaciones.** El pedido pasó a
caer en una sola casilla, que era lo correcto, pero las casillas seguían llamándose *Adelanto*,
*Total* y *Saldo*. Con *Adelanto* ✓ y *Saldo* ✓ marcados salía un pedido con **un** recuadro
verde al lado de otro con **dos**, y eso se lee como "los que hicieron las dos cosas" cuando lo
que devuelve es la unión. El nombre prometía una intersección que el filtro no hacía.

**La forma buena — la casilla se llama como la combinación.** Cuatro, y las cuatro **parten la
lista**: todo pedido está en exactamente una, y las cuatro suman el total.

| Casilla | Qué es | La decisión que desbloquea |
|---|---|---|
| **Sin cobrar** | no entró nada por la pasarela | perseguir el yapeo, o anular |
| **Solo adelanto** | adelantó y **todavía debe** | a quién le cobro el saldo |
| **Pago total** | pagó el precio entero de una | despachar, nada pendiente |
| **Adelanto y saldo** | adelantó **y después pagó** | despachar; le costó dos operaciones |

La casilla es la **última operación que cruzó** (`estadoDeCobro`), que es justo lo que significa
"en qué quedó". Un cupón de saldo emitido y sin pagar no la mueve: sigue siendo *Solo adelanto*,
porque sigue debiendo.

#### Por qué no un interruptor Y/O

Era la salida obvia y es la equivocada, por dos razones:

1. Sobre casillas que no se pisan, **una Y siempre da vacío**: ningún pedido está en dos a la
   vez. Sería un modo roto ocupando sitio en la barra.
2. **No hace falta.** Como las cuatro parten la lista, cualquier pregunta con Y y O sobre las
   operaciones es una suma de casillas:

   | La pregunta | Se marca |
   |---|---|
   | los que tienen un adelanto | Solo adelanto + Adelanto y saldo |
   | los que pagaron el saldo | Adelanto y saldo |
   | los que no deben nada | Pago total + Adelanto y saldo |
   | los que deben algo | Sin cobrar + Solo adelanto |

Elegir de una lista con nombres no se equivoca. Componer con operadores sí — y el error no
avisa: devuelve una lista creíble y de más, que es como este filtro se equivocó las dos veces
anteriores.

### Y cada casilla dice cuántos son

En el desplegable, cada opción lleva su cuenta. Es media respuesta antes de marcar nada: leer
*Solo adelanto 46 · Adelanto y saldo 26* ya dice dónde está el trabajo del día, sin filtrar y
volver.

En pagos las cuentas **suman el total**, porque las casillas parten la lista — o sea que se
pueden leer juntas sin miedo a contar un pedido dos veces. En vendedor y producto es lo mismo
por otra razón: un pedido tiene un solo vendedor y un solo producto.

### El upsell: el anillo se mide contra el total de hoy

Si al pedido se le agrega un producto —en el chat, o armándolo en logística—, lo ya cobrado
deja de ser lo mismo *en proporción*. Un pedido de S/150 pagado entero al que se le suman S/80
no está pagado entero: está pagado en dos tercios y debe S/80.

Eso ya funciona solo, y vale la pena decir por qué: **`product_price` es el total del carrito,
no el precio de un producto**. El servidor lo reescribe con la suma de `items` cada vez que el
carrito cambia (`accept_offer`, `set_qty`, `remove_item` en `order-manage`), así que el anillo,
el saldo y el botón de pagar se acomodan sin que nadie recalcule nada. Por eso `valorDelPedido`
lee esa columna en vez de sumar los `items` otra vez: una segunda forma de calcular el mismo
total es una segunda forma de que dé distinto.

Dos consecuencias que caen solas y son correctas:

- un **pago total pasa a ser un adelanto** en cuanto el pedido vuelve a deber algo. Seguir
  llamándolo total sería decir que no falta cobrar nada;
- el **botón de pagar el saldo reaparece** por la diferencia nueva, y 360pay la cobra igual que
  cualquier otro saldo.

### Lo que no cabía en el mismo pedido, y por qué ahora sí

Lo que **no** funcionaba era llegar hasta ahí. Al aceptar una oferta, el pedido se partía en
dos salvo en dos etapas: la regla era `stage === 'nuevo' || stage === 'confirmado'`, escrita
dentro del `if` que la usaba.

La pregunta de verdad no es en qué etapa está: es **¿la caja todavía está acá?** Y así deja
fuera dos casos que sí caben:

- **`validando`** — el yapeo no cuadra todavía; la caja ni se ha tocado;
- **`registrado`** — la guía existe pero el paquete **sigue en la tienda**. Es justo el momento
  en que se arma el pedido, o sea cuando más se agrega algo.

Un upsell en cualquiera de los dos abría un pedido paralelo, con su propio envío por cobrar:
la manera cara de resolverlo.

Ahora la regla vive en `_shared/upsell.ts` con su nombre —`cabeEnElMismoPaquete`— y pregunta a
las **dos agujas del eje**, porque con una sola no alcanza: la guía se emite *antes* de
entregarle el paquete al courier, así que hay `registrado` que ya salieron y `en_camino` que
nadie ha movido. Cabe cuando la etapa dice que el paquete sigue en la tienda **y** el courier
todavía no ha reportado nada.

Pasado eso, se sigue abriendo un pedido aparte, y no es una limitación que convenga quitar:
nadie puede meter un producto en un paquete que ya está viajando, y decir que sí es prometer
una entrega que no va a ocurrir.

### Y la tienda de ejemplo tiene upsells

Sin ninguno, el anillo parecería tener tres posiciones —vacío, mitad, lleno— cuando lo que
enseña es una proporción. Ahora una parte de los pedidos del demo lleva un producto agregado
después del adelanto, así que se ven anillos en fracciones raras: 150 de 230.

Ninguno mezcla upsell con saldo cobrado, a propósito: el saldo se cobra contra el total del
momento, y un dato de ejemplo con las dos cosas encima enseñaría una cuenta que no cuadra.
## El chat nombraba la etapa por su cuenta (29-ago-2026)

La cabecera del pedido ya pintaba el paso del EJE —eso se arregló ayer—, pero el botón de al
lado seguía sacando "lo que sigue" de la lista **cruda** de la base
(`nuevo · validando · confirmado · en_camino · entregado`). Dos listas en la misma fila, y se
notaba:

- un pedido por agencia en **Registrado** tenía de botón **"✅ Entregado"**, saltándose En
  origen, En tránsito y En destino de un dedazo;
- uno en **Confirmado** ofrecía **"🚚 En camino"**, que en un pedido por agencia no es ni un
  paso de su línea: ahí la palabra es *En tránsito*, y antes va *Registrado*.

Ahora lo que sigue sale de `siguientePaso()`, que camina **la línea de ese pedido**
(`pasosDelPedido`) — la misma que pinta el tablero. Un pedido por agencia nunca ofrece "En
camino"; uno a domicilio nunca ofrece "Registrado". No están en sus líneas.

### Y de paso: quién mueve cada paso

Al calcular lo que sigue apareció la pregunta que la pantalla nunca hacía: **¿ese paso es
nuestro?** Son tres dueños distintos y el panel los trataba igual:

| Dueño | Pasos | Cómo se mueve |
|---|---|---|
| **equipo** | Pedido creado · Validando · Confirmado · En camino · Entregado | lo marca una persona (`stage`) |
| **guía** | Registrado | se enciende al registrar la guía |
| **courier** | En origen · En tránsito · En destino | lo reporta Shalom u Olva |

Los dos últimos **se dicen, no se pulsan**: un botón para algo que no movemos promete un hecho
que no tenemos. Donde antes había un botón equivocado ahora se lee *"Sigue 🏬 En origen · lo
reporta SHALOM"* — que además dice dónde mirar, porque la caja de registrar la guía está tres
tarjetas más abajo.

> Se pregunta a las dos agujas y con eso basta, igual que en el resto del eje: la guía se emite
> **antes** de entregarle el paquete al courier, así que hay `registrado` que ya salieron.

## Una tienda de ejemplo que se deja tocar (29-ago-2026)

El demo se veía pero no se movía. Avanzar de etapa, cambiar una cantidad o escribir en el chat
llamaban al servidor, y ahí no existe ningún pedido `demo-…`: el vendedor que estaba enseñando
la herramienta se llevaba un **"No se pudo cambiar el estado"** en plena demostración. Que es
el peor momento posible — la pantalla que existe para vender el producto fallando delante del
cliente.

Ahora los cambios se guardan **encima** del generador, en `demo/cambios-demo.ts`. Tres reglas,
y las tres son el porqué del archivo:

1. **No tocan el generador.** La tienda de ejemplo se sigue armando igual, determinista, y esto
   es un parche que se le aplica al leerla. Un cambio que mutara el generador contagiaría los
   totales del panel y ya nadie podría comparar dos pantallas.
2. **Viven en el dispositivo**, como el favorito, el tema y el propio interruptor del demo. Se
   puede cerrar el navegador a media presentación y seguir donde iba.
3. **Se van con el demo.** Apagarlo los borra, y la barra de arriba tiene un **Reiniciar** que
   hace lo mismo sin salir. Al volver, la tienda de ejemplo está otra vez como el primer día:
   no hay estado acumulado que ensucie la próxima demo.

### Qué se puede mover

| Gesto | Qué pasa |
|---|---|
| **Avanzar de etapa** | camina el eje completo: la guía se inventa, las fases del courier se marcan |
| **Cantidad + / −** | recalcula el total del pedido, como hace `order-manage` con `items` |
| **Quitar un producto** | igual, con la misma regla: no se puede quitar el único |
| **Enviar una oferta** | la manda **y el cliente la acepta**: el producto entra, el total sube |
| **Escribir en el chat** | el mensaje queda y sigue ahí al volver |
| **Anular · cancelar · recuperar · nota · marcar respondido** | como en la tienda de verdad |

El **avanzar** del demo es distinto del de la tienda real, y es legítimo: allá `registrado` lo
enciende la guía y `en origen` lo reporta Shalom, así que el panel no los ofrece. En el demo no
hay guía ni courier — **los hacemos nosotros**, que es justamente lo que hay que poder enseñar.
La guía se inventa con el mismo formato de seis dígitos, y del reloj y no de `Math.random`: en
el demo nada es al azar, ni siquiera una guía inventada de un clic.

La **oferta aceptada de una** también es una decisión, no un atajo. En la tienda de verdad son
dos momentos con una persona en medio; acá no hay nadie del otro lado, y una oferta esperando
para siempre no enseña nada. Lo que hay que poder mostrar es el pedido creciendo: el total
sube y **el anillo baja**, porque el adelanto ya no lo cubre. Se escriben los dos mensajes que
escribiría el servidor, con sus mismos textos, para que la conversación se lea igual que una de
verdad.

### Lo que el demo NO puede hacer, y por qué

- **El comprador no contesta.** Lo que escribe el vendedor queda escrito; una respuesta del
  cliente sería inventar un mensaje que nadie mandó, y este panel se usa para decidir sobre
  plata. La mitad honesta se enseña; la otra no se finge.
- **No se puede grabar una llamada.** La grabación la produce LiveKit desde una sala real. El
  demo ya trae llamadas con su audio de ejemplo en la conversación generada — se pueden
  reproducir— pero una llamada nueva necesita las dos puntas.
- **No cobra.** Ninguna pasarela se toca: el anillo del demo se mueve porque cambia el total del
  pedido, no porque entre plata.

### Dónde se enchufa

Una sola puerta por gesto, que es lo que evita tener dos caminos que mantener:

- `OrderDetailModal.post` — todo lo que cambia el pedido desde el detalle. Si es un pedido de
  ejemplo responde `ejecutarEnDemo` con la **misma forma** (`Response`) que traería el
  servidor, así que abajo no cambia nada.
- `StageSelector.push` — avanzar de etapa.
- `handleSend` y el envío de ofertas — el chat.
- `useStoreOrders` y `pedidoDemoPorToken` — la lectura. El tablero se recalcula en el mismo
  render en que se mueve la etapa, así que el pedido **cambia de columna a la vista**, que es
  media demo.
## La columna del pedido deja de repetir, y el hilo gana una segunda voz (29-ago-2026)

### La etapa estaba dos veces, y una de las dos mentía

La tarjeta "Tu pedido" abría con **Estado**, y arriba, en la misma pantalla, ya estaba la fila
del estado con su botón de avanzar. Repetir no era lo peor: la de arriba pinta el **paso del
eje** ("Registrado") y la de abajo pintaba el `stage` crudo ("En camino") — el mismo pedido con
dos nombres a diez centímetros de distancia. Se fue la de abajo, que es la que no tiene botón.

### "Te atiende" nombraba a uno, y en el chat escriben varios

Decía el asignado y nada más. Pero al pedido se invita a Despacho, a Soporte, y esa lista no
estaba en ninguna parte de la columna. No es decorativa: dice **quién puede leer la
conversación**, que es justo lo que uno necesita saber antes de escribir algo interno.

Ahora es **Asignado**, con todos los que participan y un **+ Invitar** al lado. Y la invitación
lleva un porqué:

> **¿Para qué lo invitas?** — el texto se guarda como comentario interno etiquetando al
> invitado. Invitar a alguien sin decirle a qué lo obliga a leerse el hilo entero para adivinar
> qué le tocaba, o a preguntar por fuera; y lo que se pregunta por fuera no vuelve al pedido.

### Comentarios internos: el mismo hilo, dos audiencias

Un pedido tiene una conversación **con** el comprador y otra **sobre** el comprador. La segunda
no tenía dónde: se hacía por el WhatsApp del equipo, en la llamada, o no se hacía. Lo que se
pierde ahí es lo caro — *"a este ya lo llamé dos veces"*, *"el pago no cuadra, ojo antes de
despachar"*— porque no vive al lado del pedido y el siguiente que lo abre no lo sabe.

Va en el **mismo hilo**, a propósito: una pestaña aparte de notas internas es una pestaña que
nadie abre. El contexto sirve leído al lado de lo que pasó.

En el redactor hay un **candado** que cambia el modo. No es una casilla escondida en un menú:
el campo cambia de aspecto —fondo ámbar, borde punteado, otro *placeholder*— porque el error
caro no es olvidar comentar, es **escribirle al cliente creyendo que comentabas**. Lo que se ve
tiene que decirlo. Y el comentario se pinta centrado, con candado y sin forma de burbuja: si se
pareciera a un mensaje, alguien acabaría respondiéndole al cliente por ahí.

Con `@` se etiqueta a alguien de la tienda. Se busca por nombre **y por rol** —quien escribe
"despacho" busca a quien despacha, no un nombre— y se guardan los `auth_user_id`, no el texto:
un `@Renzo` deja de apuntar a nadie en cuanto Renzo cambia de nombre. Un `@` que no corresponde
a nadie no se resalta ni se guarda; es texto. El buscador solo aparece en modo interno:
etiquetar compañeros en un mensaje que lee el cliente no significa nada y le enseña nombres de
gente que no conoce.

#### Los tres candados, y por qué hacen falta los tres

Esto es lo que convierte "comentario interno" en una garantía y no en un color. `visibility` ya
existía en `chat_messages` para los mensajes de sistema, y **la columna no esconde nada por sí
sola**:

1. **Al leer.** Quien decide era `get-session`, y le bastaba con `?viewer=seller` **en la
   URL** — que el comprador puede escribir, porque el token del pedido es suyo. Estaba anotado
   como deuda mientras detrás solo hubiera campos internos; con comentarios detrás pasa a ser
   otra cosa. Ahora lo interno exige un **JWT de vendedor verificado** contra `sellers`, y el
   panel manda su sesión en vez de la anon key. Falla en cerrado: sin JWT no hay comentarios
   internos para nadie, que es preferible a enseñárselos a quien no debe.
2. **Al llegar.** El canal `order:<id>` es el del **comprador**: su chat está suscrito y pinta
   lo que llegue. Un comentario mandado por ahí se le aparecería en vivo — peor que poder
   leerlo, porque no hay ni que buscarlo. De lo interno viaja solo el aviso de que hay algo
   nuevo, sin cuerpo, y el panel vuelve a pedir el hilo por la puerta que sí verifica.
3. **Al avisar.** Un comentario interno **no manda push ni WhatsApp**. Sería el mismo error por
   la puerta de atrás: el cuerpo del mensaje va dentro de la notificación.

### Las etiquetas eran cuatro y dos eran etapas disfrazadas

*Cancelado* y *Anulado* ya son el `status` del pedido: tienen sus propios botones abajo, con su
confirmación, y mueven la conversión. Ponerlos también como nota dejaba marcar "Cancelado" sin
cancelar nada — un pedido que se veía cancelado y seguía vivo en el tablero.

Una etiqueta no es una etapa: la etapa dice **dónde** está el pedido y la mueve el eje; la
etiqueta dice **qué le pasa**, convive con cualquier etapa y la pone una persona. Las cuatro
que quedan son las que cambian lo que uno hace hoy:

| Etiqueta | Qué dice | Color |
|---|---|---|
| **No contesta** | hay que insistir por otro canal | ámbar |
| **Reprogramado** | pidió otra fecha; no es que no conteste | gris marcado |
| **Datos incompletos** | falta dirección, referencia o DNI: **no sale** hasta que alguien lo complete | rojo |
| **Recuperado** | se cayó y volvió. Es la que dice si insistir sirve | lima |

Sigue el §6.1 del manual: uno lima, uno rojo, uno ámbar y uno gris. Si todas llevaran color,
ninguna resaltaría.

Y ahora **se ve cuál está marcada**, que era el problema de verdad: el gris de una etiqueta
encendida (`--surface-3` + `--text-muted`) y el de una apagada (`--surface-3` +
`--text-faint`) se distinguen a la lupa, no de un vistazo. Encendida = rellena; apagada = solo
contorno. Guardar no pregunta nada: una etiqueta se pone y se quita de un toque, y se deshace
con otro — al revés que cancelar o anular, que no se deshacen y por eso sí preguntan.

## La nota interna se ve como una nota (29-ago-2026)

Salió con candado y fondo gris, y se leía como un aviso de sistema. Tres arreglos que en el
fondo son el mismo: **que parezca lo que es.**

- El icono es una **libreta con lápiz**, no un candado. El candado hablaba del permiso; lo que
  uno hace ahí es *anotar*.
- El campo y la burbuja se pintan de **post-it**. `--warn-*` en este sistema es **gris** —el
  §6.1 reserva el color para lo que cierra bien y lo que exige acción—, así que lo que salió no
  era ámbar: era el mismo gris de todo lo demás. La nota tiene ahora su propia superficie
  (`--nota-*`), y no compite con los estados porque **no es un estado**: es otra clase de
  contenido, la única que se escribe para el equipo y no para el cliente.
- La cabecera dice **"Nota interna"** y se acabó. Antes añadía *"el cliente no lo ve"* en cada
  una: el papel amarillo ya lo dice, y repetirlo en cada nota es gritar lo evidente.

### El `@` ofrece a los del pedido, no a la tienda entera

Etiquetar a alguien que no puede leer el hilo es escribirle a una pared: le llega una mención a
una conversación que no ve. Así que el buscador sale de `participants` —los que están en el
pedido— y para traer a alguien de fuera está **Invitar**, que es lo que le da acceso. En cuanto
entra, ya se le puede etiquetar.

Son dos listas distintas y por eso se calculan aparte: el `@` ofrece a **quien ya está**, y el
invitador a **quien todavía no**.

### El invitador salía vacío

Dos causas, y las dos daban la misma pantalla:

- **En el demo**, porque consultaba `sellers` con `store_id = 'demo'` — el equipo de la tienda
  de ejemplo lo arma el generador, no la base. Sin nadie a quien invitar, invitar-con-nota no se
  podía enseñar. Ahora en demo el equipo sale del generador, y **invitar funciona ahí también**:
  suma el participante, deja el aviso y escribe la nota, igual que el servidor.
- **En una tienda real**, porque filtraba con `.eq('active', true)` y las filas viejas tienen
  `active` en NULL — que en Postgres **no** es `= true`. Dejaba fuera a media tienda sin que
  nada lo dijera. Ahora se filtra solo a quien está apagado a propósito (`active !== false`).

Y la nota de la invitación se pide como lo que es: *"Nota interna para este miembro"*, sobre el
mismo papel amarillo. No hace falta explicar quién la ve.

### Y una nota interna no es una respuesta

Esto lo destapó el `tsc` al pedir `visibility` en el tipo, y era el bug más caro de los cuatro:
la bandeja decide de quién es el turno por el último mensaje de una persona, y una nota interna
lleva `sender_role: 'seller'`. O sea que **dejar una nota sacaba el pedido de "Sin responder"**
con la pregunta del cliente intacta — la lista decía que alguien contestó y nadie contestó.

Es la misma trampa que ya tenían los mensajes de sistema ("un aviso automático no responde una
pregunta"), y peor, porque esta viene firmada por una persona.

La bandeja cuenta **la conversación con el comprador**, así que las notas internas no entran:
ni en el turno, ni en la vista previa de la fila —donde se leerían como si se le hubiera escrito
a él—. Una sola regla (`conversacion()`) para las dos cosas.

## Dos audiencias, dos borradores (29-ago-2026)

El redactor es uno y las audiencias son dos, y lo escrito **cruzaba de una a la otra**: se
empieza media nota, se toca el interruptor por costumbre, se pulsa enviar — y al cliente le
llega *"ya lo llamé dos veces y no contesta"*, por push y por WhatsApp. Ese error no se
deshace, y es exactamente el que esta pantalla existe para evitar.

Ahora hay **un borrador por audiencia**: cambiar de modo vacía el campo y devuelve lo que
hubiera de ese lado. Nada se pierde, y lo que se envía es siempre lo que se escribió *ahí*.
Vive en `lib/comentario-interno.ts` con su nombre, porque es una regla de seguridad y no un
detalle del componente — incluso al fallar un envío, el texto vuelve al borrador de **su**
audiencia y no al que esté puesto en ese momento.

### El botón de guardar no se veía

En modo nota, el botón usaba `--nota-fg` de fondo y `--nota-bg` de icono. En claro funciona;
en oscuro `--nota-bg` es un **velo translúcido**, así que el icono se pintaba transparente
sobre amarillo: un círculo liso. Lo que faltaba era el token del par —`--nota-on`, lo único
que se lee encima del amarillo— que es distinto en cada tema y por eso no se podía derivar del
otro.

## Invitar es en dos pasos, y la nota es obligatoria (29-ago-2026)

La nota estaba **arriba** de la lista, así que quedaba en blanco casi siempre: uno abre eso
para invitar a alguien, no para redactar. Y el invitado llegaba a un hilo de cuarenta mensajes
sin saber qué le tocaba.

Ahora primero se elige **a quién** y recién después aparece el **por qué**, con el botón
apagado hasta que diga algo. La pregunta llega cuando ya se sabe la respuesta —*"a Renzo… ¿para
qué?"*— en vez de antes de saber a quién.

Que sea obligatoria es la decisión de fondo: la nota queda en el hilo como nota interna,
etiquetando al invitado y **firmada por quien invita**, así que todo el que entra sabe por qué
se le convocó y de parte de quién. Una invitación sin eso es una notificación que obliga a
adivinar.

> Cerrar el invitador lo deja como estaba. Sin eso, reabrirlo enseña la nota escrita para
> **otra** persona — y esa nota se manda etiquetándola.

## En el demo se firma como Dueño (29-ago-2026)

Quien presenta la herramienta la enseña como **dueño de la tienda**, no con el cargo que tenga
en Kross: lo que el cliente que mira tiene que ver es su propio negocio, y *"Admin"* es una
palabra nuestra. Así que en la tienda de ejemplo todo lo que se escribe —mensajes, notas
internas, invitaciones— va firmado como **Dueño** (`ROL_DEMO`).

Solo cambia la etiqueta, no los permisos: el demo no toca la base, así que no hay nada que
permitir ni que negar.

## Quién manda en un pedido (29-ago-2026)

Un pedido tiene **un responsable** y, alrededor, gente invitada que también escribe. Esas
reglas estaban repartidas —una parte en la pantalla, otra en el servidor, y la de reasignar en
ninguna— y al juntarlas salieron tres huecos.

Ahora viven en `supabase/functions/_shared/equipo-pedido.ts`, que es lo único del repo que
necesitan **los dos lados con la misma respuesta**. `permisos.ts` dice qué puede alguien en la
TIENDA; esto dice qué puede en ESTE pedido, que es otra pregunta: un supervisor toca cualquier
pedido, y el responsable solo el suyo.

| | Quién |
|---|---|
| **Escribir** | el responsable y los invitados, en turno; quien administra, siempre |
| **Invitar** | cualquiera que escriba |
| **Sacar a alguien** | quien lo invitó, **el responsable**, o quien administra |
| **Pasar el pedido** | **el responsable** o quien administra |

### Invitar lo puede cualquiera que escriba

Es la decisión de fondo y va a contramano de lo que uno esperaría de una jerarquía: quien está
atendiendo es quien descubre que necesita a Logística. Obligarlo a pedírselo al supervisor
añade un salto que se termina haciendo por WhatsApp — justo lo que este panel existe para sacar
del WhatsApp.

Y no es peligroso: invitar suma a alguien de la **misma tienda** a un chat que ya podría leer
entrando por el panel. Lo que sí cambia de manos —el pedido— pide más.

### Pasar el pedido: el botón que no existía

El responsable solo cambiaba **solo**, al avanzar de etapa (`confirmado` → Logística,
`en_camino` → Motorizado). Así que rotar turnos, repartir carga o cubrir una baja no tenía
botón: la única salida era avanzar la etapa —o sea mentir sobre dónde está el pedido— o entrar
a la base a mano.

Ahora lo puede hacer **el responsable** —soltarlo cuando no da abasto— y **quien administra**
—el supervisor que reparte—. Un invitado no: entró a ayudar, no a quedarse con el pedido de
otro.

Con **nota obligatoria**, como la invitación. Un pedido que cambia de dueño sin explicación es
un pedido que el siguiente empieza de cero, y el contexto que se pierde ahí es el que termina
preguntándole otra vez al cliente lo que ya había contestado. Al comprador se le dice quién lo
atiende ahora —enterarse por el nombre que firma el próximo mensaje es peor— y **el anterior se
queda dentro**: lleva el contexto, y lo normal es que el nuevo le pregunte algo.

### Y el traspaso automático ya no borra a los invitados

Al ceder el pedido a Logística, el código hacía `invited_seller_ids: []` — *"el nuevo dueño
empieza limpio"*. Era al revés: el momento en que el pedido cambia de manos es cuando más falta
hace saber quién venía acompañándolo. A Soporte se le invitó porque el cliente tenía un
problema, y ese problema no se resuelve porque el paquete avance.

### Sacar a alguien: faltaba el responsable

Solo podía quien lo invitó (o un admin). Con eso, un invitado por alguien que ya no está en la
empresa se quedaba dentro **para siempre**: el único que podía sacarlo era justo el que se fue.
Ahora también el responsable — es su pedido. Y al responsable **no se le saca**: para eso se
pasa el pedido, que es lo que deja a alguien respondiendo por él.

### La puerta, no la manija

`invite` y `expel` decidían con `by_seller_id` **del cuerpo de la petición**: o sea con lo que
el que llama dijera de sí mismo. Ocultar el botón no protege nada — un POST pasa igual.

Las tres acciones de equipo piden ahora el **JWT del vendedor**, y de ahí sale quién es
(`quienLlama`), incluida la comprobación de que sea de **esta** tienda: admin de la suya no es
admin de la de al lado. `by_seller_id` se fue del todo.

> Con una excepción que costó descubrir al día siguiente: quien administra **la plataforma**
> no es "otra tienda". Su `store_id` es `platform` —una casa sin pedidos— así que esa
> comprobación, tal cual quedó escrita acá, dejaba al dueño y a los operadores de Kross sin
> poder invitar, reasignar ni expulsar en **ningún** pedido. Justo a quienes entran a una
> marca para desatascarla. Ver la sección de abajo.

Las demás acciones siguen con la anon key a propósito: `accept_offer` y `cancel` los llama el
**comprador** desde su chat, y exigirles un JWT de vendedor las rompería.

## La plataforma es un lugar, no una casilla (29-ago-2026)

Los operadores de Kross no podían entrar. En `krossclub.app` el login les respondía
*"Ingresa desde el sitio de tu marca (tumarca.krossclub.app)"* — y no tienen marca: trabajan
en la plataforma. El candado no lo podía abrir el que lo sufría.

### Qué pasó

`platform` es la tienda que no vende: la casa de quien opera Kross. Ese dato estaba en la
fila desde siempre. Pero para saber si alguien administraba la plataforma se preguntaba por
**otra cosa**: `is_super_admin`, una bandera aparte que había que acordarse de encender.

Y no se encendió. Los operadores se dieron de alta desde el panel —que ya la mandaba— cuando
la Edge Function desplegada todavía no la leía: **Vercel sale solo al mergear, las funciones
las despliega una persona.** Entre un momento y el otro, cada alta guardó una fila que estaba
en la plataforma sin administrarla. Nadie lo vio, porque no falla al crear: falla al entrar,
días después y en otra pantalla.

### Qué cambió

El alcance deja de ser un dato que se recuerda y pasa a ser uno que se deduce:

```
administra la plataforma  =  is_super_admin  OR  (store_id = 'platform' AND is_admin)
```

Vive en `supabase/functions/_shared/alcance.ts` — el segundo archivo, después de
`equipo-pedido.ts`, que leen **el panel y el servidor con la misma respuesta**. Y esa es la
parte que importa: la pregunta se hace en el login, en el menú, en la impersonación y en once
Edge Functions. Si las dos mitades contestaran distinto, el resultado no sería un error — sería
un panel que se ve bien y no hace nada: Tiendas en el menú, y cada lista vacía.

Es el mismo movimiento que este documento viene repitiendo: **juntar dos copias de una
definición saca a la luz un fallo que solo sobrevivía estando separadas.** Acá salieron dos —
el login, que era el síntoma, y `quienLlama`, que llevaba un día dejando al propio dueño sin
poder invitar a nadie en ningún pedido.

### Lo que NO cambió

El otro eje. El alcance dice **hasta dónde llega** (su tienda, o todas); `is_operator` dice
**qué no puede** dentro de ese alcance. Un operador de la plataforma entra a cualquier tienda
y sigue sin poder apagarla, borrarle un producto o nombrar administradores. Y **entrar** a una
marca sigue bajando el alcance a esa marca a propósito: desde dentro no se ofrece lo que ahí
no va.

### El segundo round: no era la bandera, era el alta entera

La regla nueva no los dejó entrar. La consulta a la base lo explicó de una: Paolo y Diego
estaban en `platform` con `is_admin = false`, `is_operator = false` y `role_label =
'Logística'`. **Nunca fueron operadores en la base.** Las tres columnas juntas son la huella
exacta de la función vieja: el panel mandó `is_operator: true`, la `admin-team` desplegada no
conocía ese campo, escribió `role_label` tal cual y dejó las banderas apagadas.

O sea que el diagnóstico del mecanismo era correcto —panel por delante de la función— y el
daño, mayor de lo que se supuso: no se perdió una bandera, se perdió el nivel entero.

Y ahí apareció el agujero de verdad, que no es un bug sino una **ausencia**: el nivel solo se
podía dar **al crear**. Una cuenta que nacía a medias no se podía enderezar desde ninguna
pantalla — el único arreglo era entrar a la base. Un producto que necesita SQL para deshacer
lo que su propio formulario hizo mal tiene un hueco, no un incidente.

Tres cosas, entonces:

1. **Cambiar el nivel de alguien que ya existe** — *Equipo → la persona → Nivel*, con los tres
   niveles y lo que significa cada uno **en esa tienda** (en la plataforma "cualquier tienda";
   en una marca, "esta tienda"). No a uno mismo: bajarse deja la tienda sin quien administre.
2. **Comprobar contra la fila, no contra la respuesta.** Un `ok` de una función vieja no
   significa que se haya escrito todo. Después de crear o cambiar el nivel el panel relee
   `sellers` y, si falta algo, lo dice **y nombra la causa**: *"la función admin-team está
   desplegada en una versión vieja"*. Es el aviso que habría convertido una semana en un
   minuto.
3. **Un mensaje de login que sirva.** A quien SÍ es del equipo de Kross, mandarlo *"al sitio de
   tu marca"* es mandarlo a una dirección que no existe. Ahora se le dice lo que le pasa —le
   falta nivel— y quién lo arregla.

Las banderas de cada nivel se escriben en `_shared/nivel.ts`, un solo sitio para el alta y
para el cambio; `permisos.ts` las lee delegando ahí mismo. **Tercera vez en dos días que juntar
las dos copias de una definición saca a la luz lo que solo sobrevivía estando separadas** — y
esta vez lo que salió no fue un fallo, fue una pantalla que faltaba.

## Dónde está la línea del operador (29-ago-2026)

El operador nació con tres candados: no apagar una tienda, no borrar un producto, no nombrar
administradores. Puestos de golpe, por la duda razonable de "esto no se deshace". Con el rol ya
funcionando, dos de los tres resultaron ser fricción y no seguridad.

**Una marca que no paga se apaga el mismo día. Un producto mal cargado se borra.** Son trabajo
de operar. Tener que despertar a un administrador para cualquiera de las dos convierte al
operador en un ayudante — y el rol existe justamente para que la plataforma se opere sin
depender de nadie. Además el argumento del "no se deshace" no aguantaba: apagar una tienda se
deshace tocando el mismo botón, y el que de verdad no se deshace —borrar un producto— también
lo hace un admin sin más ceremonia que un clic.

Queda **uno**, y es el único que hacía falta: **nombrar es repartir mando, no operar.** Sin ese
candado el nivel entero es decorativo. Un operador que puede crear administradores se crea uno
y entra con él, o se asciende a sí mismo; lo que no podía hacer lo hace igual dando un rodeo.
Una restricción que el restringido puede levantar no es una restricción, es un cartel.

### Y de tres candados a una pregunta

Lo que se fue con ellos importa tanto como lo que se quedó. Había un `puedeBorrar` que tapaba
las tres cosas a la vez y un `puedeNombrarAdmins` que era su alias. Con dos de las tres
levantadas, `puedeBorrar` pasaba a ser idéntico a `puedeAdministrar`: dos nombres para la misma
pregunta, esperando a que alguien los tocara por separado.

Así que no se invirtió una bandera, se **borró un concepto**. Hoy `is_operator` se pregunta en
un solo sitio del panel —`puedeNombrarAdmins`— y tiene una sola gemela en el servidor
(`admin-team`). Tres candados que caducan a ritmos distintos son tres oportunidades de que uno
se quede puesto sin que nadie recuerde por qué; ya pasó con dos de ellos en una semana.

**Y el texto siguió al permiso.** `LIMITES_OPERADOR` era una lista de tres que la pantalla
unía con comas; ahora es `LIMITE_OPERADOR`, una frase. La descripción del rol en *Equipo* dice
lo que el rol hace —entra a cualquier tienda, la crea, la edita, la enciende y la apaga— en vez
de enumerar lo que no. Prometer un límite que el código ya no aplica es peor que no tener el
límite.

## Suplantar es una vista, no una identidad (29-ago-2026)

Uxbriel entra como Paolo, el menú le ofrece **Tiendas**, toca, y le sale *"Solo el
administrador gestiona la marca."* Una sección que se ofrece y no abre.

La línea era esta:

```
if (!isAdmin || impersonating) return <p>Solo el administrador gestiona la marca.</p>
```

Y el `impersonating` no era paranoia: era un parche honesto a un problema real. Esa pantalla
—la única del panel que lo hacía— leía al vendedor **REAL** (`real`) mientras las demás leen a
quien estás actuando (`effective`). Con suplantación activa habría enseñado los datos de uno
con el nombre de otro en la cabecera, así que se bloqueaba entera. El parche tapaba el síntoma
y dejaba el desajuste debajo.

Lo caro no fue el cartel, fue lo que el cartel impedía. **Las dos únicas razones por las que
existe "Entrar" chocaban con él:**

- entrar **como alguien** para ver lo que ve — que es lo que Uxbriel intentó con Paolo;
- entrar **a una marca** para configurarla — que es la razón número uno para entrar, y estaba
  dicho así en un comentario de esta misma pantalla, tres líneas más abajo del bloqueo.

### Las dos preguntas

Suplantar es **una vista**. El objeto de suplantación vive en `localStorage`, o sea que lo
escribe el usuario: no puede decidir permisos, y nunca los ha decidido — el servidor mira el
JWT. Así que son dos preguntas distintas y la pantalla estaba haciendo una sola:

| | Quién responde |
|---|---|
| qué se **puede** | el servidor, con el JWT del vendedor real |
| qué se **muestra** | la pantalla, siguiendo a `effective` |

`vistaDeTiendas` las cruza con una Y. Es seguro por una razón que conviene dejar escrita:
**actuar solo rebaja.** Solo se entra como alguien que ya está dentro del alcance propio, así
que la intersección jamás amplía nada — como mucho enseña de menos, que es exactamente lo que
se quiere. Sus pruebas dicen justo eso: ninguna de las dos mitades puede ampliar por su cuenta.

### Y un nombre que era la mitad del bug

La pantalla tenía un `isSuper` que significaba *"el servidor dijo que el vendedor real tiene
alcance de plataforma"* y se usaba como si significara *"lo que estoy viendo tiene mando de
plataforma"*. Dos cosas distintas con un nombre. Ahora son `superEnServidor` y `plataforma`, y
en cuanto se separan queda a la vista que la segunda es la que pinta.

Con eso, entrar como Paolo enseña las tiendas; y entrar a una marca enseña **esa** marca, con
el mando de una marca: sin crear tiendas, sin apagarlas, sin subdominio. Se salió de la
plataforma, así que los botones de la plataforma no se ofrecen.

## Ver también

- Contrato del estado compartido: [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md#estado-central-compartido--merchantcustomersession)
- Qué está vivo hoy: [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md)
