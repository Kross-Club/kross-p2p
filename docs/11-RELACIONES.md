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

| Hoy | Propuesta |
|---|---|
| Chats · CRM · En vivo · Stats | **Pedidos**, con cuatro modos: Bandeja · Tablero · Mapa · Resumen |
| Clientes · Retención | **Clientes**: la lista real de personas; importar, invitar y campañas viven adentro |
| Llamadas | ✂️ se disuelve — cada grabación vuelve a su pedido (ver abajo) |
| Productos | **Productos** |
| Equipo | **Equipo** |
| Marca | **Marca** |

Cinco entradas para el admin. Para un miembro del equipo, **una**: Pedidos (sus modos ya
respetan el `x-seller-id`, que es el filtro que hoy hace `onlyMine` en cada pantalla por
separado).

Los cuatro modos comparten un solo `fetch` y un solo estado: se pide la lista una vez y cada
modo la pinta distinto. Eso también arregla algo que hoy está mal por accidente — Chats pide
sin cancelados, CRM y Stats con `x-include-cancelled: 1`, y el Mapa filtra por `vaEnElMapa`:
tres definiciones de "los pedidos de la tienda" que no coinciden.

## Lo que falta de verdad #1: la ficha del cliente

Hoy se puede ver el **contacto** de un comprador (`ContactSheet`, tocando el avatar en el
chat) pero no a la **persona**. Ninguna pantalla responde *"¿este señor ya me compró antes?"*
— y esa es la pregunta que decide si se le despacha sin adelanto, si vale la pena el upsell,
y si el reclamo de hoy es de un cliente de tres pedidos o de un desconocido.

El dato ya existe y está a un join: `order_sessions.buyer_id → buyers.id`. `buyers` ya guarda
`score`, `puntos`, `activated_at`, `source`. Falta la pantalla: **Clientes → ficha**, con sus
pedidos, su LTV, sus puntos y su score. Retención deja de ser una sección y pasa a ser la
cabecera de esa lista (recompra, segmentos restock/winback, campañas).

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

`get-recordings` **ya acepta `session_id`** como filtro, así que la pieza de servidor existe.
Lo que falta es que la llamada entre al hilo como lo que es —un evento del pedido, con
duración y audio, igual que ya entran `status_update` y `offer`— y que el archivo completo,
si alguien lo quiere, sea un filtro dentro de Pedidos y no una sección.

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

`/comprador/chats` y `/comprador/chat/:chatId` leen `useKrossStore()`, o sea el seed de
`src/data/seed.ts`: son pantallas mock que nunca ven datos reales, y además cuelgan de
`RequireSellerAuth` (un comprador no entra ahí ni queriendo). El chat real del comprador es
`/p/:token` (`OrderChatPage`) y su lista real es `/mis-pedidos`. Las dos rutas mock se borran.

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
fugas más caras del contraentrega, y hoy **no tiene columna, así que no se puede medir ni
alertar**. La línea de vida ya los trata como pasos separados (`registrado` y `transito`);
lo que falta es que la fase no herede el hito `registrado`, y que `registrado` sea nuestro
—lo escribe `order-manage` en `set_tracking`— y no del courier.

Son cinco pasos en la mitad de abajo, exactamente como los nombraste:
`registrado · en origen · en tránsito · en destino · entregado`.

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
| 1 | Un solo lector de pedidos con una sola definición de "activo" | `src/lib/` (hook nuevo) + las 4 pantallas |
| ~~2~~ | ✅ **Columnas = fases del courier** en CRM, Stats y el chip de Chats | hecho (26-ago-2026) |
| 3 | `registrado` deja de ser `EN_ORIGEN`; chip de antigüedad por `tracking_phase_at` | `_shared/shalom.ts`, `order-tracking.ts`, `CRMPage` |
| 4 | Fusionar Chats/CRM/Mapa/Stats en **Pedidos** con selector de modo | `seller-nav.ts`, las 4 páginas → una |
| 5 | La llamada como evento del hilo (`call_log` en `seller-call-token`, burbuja en el panel) y borrar **Llamadas** | `seller-call-token`, `VendedorPedidoPage`, `LlamadasPage` |
| 6 | **Clientes** de verdad: lista + ficha con historial; Retención adentro | pantalla nueva + `ClientesPage`, `RetencionPage` |
| 7 | Borrar las dos rutas mock del comprador | `App.tsx`, `src/pages/comprador/Chats*` |

El paso 0 ya está: sin él, los pedidos que Kross Shop vende hoy ni siquiera entraban a En
vivo. Los pasos 1 y 2 no cambian nada de lo que se ve y hacen baratos a los que siguen.

## Ver también

- Contrato del estado compartido: [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md#estado-central-compartido--merchantcustomersession)
- Qué está vivo hoy: [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md)
