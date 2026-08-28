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
| **En vivo** (`MapaVivoPage`) | `get-store-sessions` | proyecta origen/destino sobre el mapa del país |
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
| Chats · CRM · En vivo · Stats | **Pedidos**, con cuatro modos: Bandeja · Tablero · En vivo · Resumen | ✅ 27-ago-2026 |
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
| Chats · En vivo | `!effective.is_admin` |
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

⚠️ **El precio, anotado para cuando importe:** el `limit(80)` del servidor se aplica **antes**
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
     NUESTRO — lo mueve una persona      │      DEL COURIER — lo mueve la API
 nuevo → validando → confirmado → preparando │ registrado → en origen → en tránsito → en destino → entregado
                                        ▲
                              la costura: existe la guía
```

Antes de la costura todo es **intención**: lo que nosotros decidimos que pasó. Después es
**observación**: lo que un tercero reporta. Son dos naturalezas distintas, y de ahí sale la
regla operativa:

> **Nadie mueve a mano un paso del que hay reporte.**

Por eso no son la misma columna en la BD (`stage` lo escribe una persona, `tracking_phase` lo
escribe un job) pero **sí son la misma línea en la pantalla**.

### Esto ya está construido — y el CRM es el único que no lo usa ✅🟡

`src/lib/order-tracking.ts` → `pasosDelPedido()` **ya funde los dos relojes en una sola
línea**: por agencia arma `… preparando → registrado en {courier} → en tránsito → en agencia
de destino → entregado`, y ya tiene la regla de desempate correcta —
`Math.max(indicePorStage, indicePorFase)`: si los relojes discrepan gana el que va más
adelante, porque que Shalom diga EN_TRANSITO cuando nadie marcó "despachado" significa que el
paquete salió, no que no salió.

| Pantalla | ¿Usa la línea fundida? |
|---|---|
| `OrderTrackingMap` (chat, comprador y vendedor) | ✅ `pasosDelPedido` |
| **En vivo** (`MapaVivoPage`) | ✅ `pasoActual` + `courierDelPedido` |
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
| `stage` | una persona del equipo | hasta `preparando` |
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

### CRM y En vivo son la misma función con distinta proyección

Mismo dato, misma fase, dos geometrías:

| | Eje | Responde |
|---|---|---|
| **CRM** | la fase en un eje abstracto (columnas) | ¿cuántos hay atorados en cada paso, y quién los destraba? |
| **En vivo** | la fase en el eje geográfico real | ¿dónde está físicamente mi plata? |

No es una analogía. `live-map.ts` → `avanceDelPaquete()` es literalmente la misma escala:

```
EN_ORIGEN 0.1  ·  EN_TRANSITO 0.5  ·  EN_DESTINO 0.9  ·  ENTREGADO 1
```

**El mapa ya es un kanban tumbado sobre el Perú.** Que CRM y En vivo sean dos modos de la
misma pantalla deja de ser un ahorro de menú: son la misma función proyectada distinto.

Y como `MapaVivoPage` ya resuelve el **origen por producto** (`origenPorProducto`), En vivo
también responde una tercera pregunta que el kanban no puede: *¿de qué producto tengo más
plata en el aire, y saliendo de qué sede?*

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

`stage` se queda. Es el dueño de la mitad de arriba (`nuevo`, `validando`, `confirmado`,
`preparando`) y del cierre de fracaso `no_entregado` — que lo marca una persona y **ningún
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

1. `pasosDelPedido` le da la línea de **domicilio** (`… preparando → en camino → entregado`)
   a un pedido que va por Shalom → las fases del courier **nunca se muestran**, ni al
   vendedor ni al comprador (`OrderTrackingMap`).
2. `vaEnElMapa` (`live-map.ts`) devuelve `false` → **ese pedido nunca aparece en En vivo.**

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

**En vivo** no se toca: ahí el mapa sí responde algo —dónde está la plata que ya salió, todos
los pedidos a la vez— y por eso es un modo propio.

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

## Ver también

- Contrato del estado compartido: [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md#estado-central-compartido--merchantcustomersession)
- Qué está vivo hoy: [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md)
