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

## Orden de ejecución

De lo más barato a lo más caro. Cada paso deja la app usable; ninguno depende del siguiente.

| # | Paso | Toca |
|---|---|---|
| 1 | Un solo lector de pedidos con una sola definición de "activo" | `src/lib/` (hook nuevo) + las 4 pantallas |
| 2 | Fusionar Chats/CRM/Mapa/Stats en **Pedidos** con selector de modo | `seller-nav.ts`, las 4 páginas → una |
| 3 | La llamada como evento del hilo (`call_log` en `seller-call-token`, burbuja en el panel) y borrar **Llamadas** | `seller-call-token`, `VendedorPedidoPage`, `LlamadasPage` |
| 4 | **Clientes** de verdad: lista + ficha con historial; Retención adentro | pantalla nueva + `ClientesPage`, `RetencionPage` |
| 5 | Borrar las dos rutas mock del comprador | `App.tsx`, `src/pages/comprador/Chats*` |

El paso 1 no cambia nada de lo que se ve y es el que hace baratos a todos los demás.

## Ver también

- Contrato del estado compartido: [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md#estado-central-compartido--merchantcustomersession)
- Qué está vivo hoy: [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md)
