# Validación de la tesis — producto de reparto solo por agencia (Shalom/Olva)

> **Fecha de las entrevistas: 20-ago-2026.** Dos operadores COD reales respondieron el
> mismo cuestionario de 7 preguntas por WhatsApp. Este doc coteja sus respuestas contra
> la tesis construida en `01-SALES-ENGINE.md`, `02-SMART-LOGISTICS.md` y `06-360PAY.md`,
> y registra las decisiones de producto que salieron de esa validación.

## El producto que se valida

Un producto enfocado a **repartir solo con agencias de Shalom/Olva**: sin motorizado
propio ni courier a la puerta. Es la configuración con la que ya opera Kross Shop
(`home_delivery_enabled = false`, solo recojo en agencia, adelanto verificado por 360pay
— ver `ESTADO-OPERATIVO.md`).

## Las respuestas

| # | Pregunta | Frank | Josue | Rousbelt |
|---|---|---|---|---|
| 1 | % agencia vs. domicilio y por qué | 48% Lima · **52% agencia** — Lima confirma más pero llegan más pedidos de provincia | **60% agencia** · 40% Lima | Era **100% agencia**; hoy 70% contraentrega · **30% agencia** |
| 2 | Al subir volumen, ¿qué se rompió primero? | **El % de entrega** | **La rentabilidad** | **La cobranza y las boletas** |
| 3 | Adelanto y cómo se cobra hoy | **S/20**, llamando varias veces al día con descuento de próxima compra; seguimiento por cada vendedor si es su lead | **S/30**, 3 etapas de cobro | ⚠️ *no preguntado — ver pendientes* |
| 4 | ¿Boleta por pedido? ¿Quién genera la guía? | Boleta para SUNAT sí; la guía la genera un asistente contable, o uno de logística si es Shalom | Sí | Sí — lo nombró **espontáneamente** como parte del cuello de botella |
| 5 | Si cobrar el saldo y emitir la guía fueran automáticos, ¿% por agencia? | Igual — "se confirman igual" (no entendió del todo la pregunta) | **El 100%** | ⚠️ *no preguntado — ver pendientes* |
| 6 | Los que no recogen, ¿cuánto habían adelantado? | S/20 | 80% ⚠️ *dato ambiguo — falta aclarar si es % del valor del pedido* | ⚠️ *no preguntado* |
| 7 | ¿% que recoge sin insistir? | **73% exacto** | No lo tiene mapeado | **65%** — y el **100%** necesita llamada previa |

### Rousbelt — el caso que muestra el techo (ago-2026)

El tercer operador no respondió el cuestionario formal, pero su conversación aporta lo
que a los otros dos les falta: **por qué alguien abandona el modelo agencia-only**. Venía
de 100% Shalom/Olva y bajó a 30%:

> «en sí el problema principal fue la de cobranza, no podía como manejarlo porque son
> muchos para pasar boleta o hacer los seguimientos, eso fue el principal problema,
> entonces cuando cambié a 70 contraentrega y 30 shalom, **volví como cuando tenía pocos
> leads que se pueda manejar**»

Y al preguntarle por el recojo:

> «los clientes sí o sí tienes que llamarlo e indicar que se acerque a recoger, **el 100%
> de envíos**, el **65%** si se comprometen a recogen aunque tarden lo recogen, pero el
> resto de **35%** alguien tiene que estar detrás insistiendo»

Tres lecturas:

1. **Su 30% no mide preferencia del comprador — mide su capacidad administrativa.** "Volví
   a lo que se pueda manejar" es un techo operativo, y es exactamente el techo que el
   producto mueve. Es la evidencia más directa de que agencia-only escala con software y
   no con gente.
2. **El 100% que necesita llamada** coincide con el 27% de Frank y su 35%: nadie recoge
   solo. Refuerza la decisión de disparar la cobranza con el tracking (§ Decisiones).
3. **Nombró las boletas sin que se le preguntara**, en la misma frase que la cobranza y al
   mismo nivel. Dos de tres operadores la mencionan como trabajo caro; el tercero también
   la emite. Sube la prioridad de esa oportunidad.

## Qué valida la tesis

1. **Agencia como canal principal.** 52–60% del volumen ya va por agencia. El default
   `home_delivery_enabled = false` para marcas nuevas está donde está el mercado.
2. **Por qué se van a agencia.** Lo primero que se rompe al escalar es el % de entrega
   (Frank), la rentabilidad (Josue) y la cobranza (Rousbelt). Tres respuestas distintas
   al mismo cuello: **el costo por pedido de la operación manual**.
3. ⚠️ **Los montos del mercado son S/20–30 — y Kross ya no cobra eso.** Frank pide S/20 y
   Josue S/30, así que ese rango es real. Pero el adelanto diferenciado por destino
   (S/20 Shalom · S/25 Olva · S/30 domicilio) **se derogó en ago-2026**: hoy es **la mitad
   del pedido**, que sobre un pack de S/189 son S/95 — entre 3 y 5 veces el estándar del
   mercado. Ver la tensión abierta en § Decisiones.
4. **El cobro manual del adelanto es el proceso más caro en gente.** Llamadas varias
   veces al día por vendedor (Frank), 3 etapas de cobro (Josue). El cupón 360pay con
   cruce automático (`06-360PAY.md`) reemplaza exactamente eso.
5. **El adelanto filtra bromistas pero no garantiza el recojo.** Los que no recogen ya
   habían pagado (S/20 Frank). Frank persigue al **27%** de sus compradores para que
   recojan; Josue ni siquiera tiene la métrica. El seguimiento del recojo es producto,
   no operación.

## Decisiones tomadas (21-ago-2026)

### El saldo NO se cobra en línea: se cobra guiado por el tracking de la agencia

La pregunta 5 mostró el unlock (Josue mandaría el 100% por agencia con saldo + guía
automáticos), pero la decisión es **no** montar un segundo cobro en línea. En su lugar:

- **Integración con el API de Shalom y de Olva** para leer los **estados de tracking**
  del envío: **en origen → en tránsito → en destino**.
- Cada transición de estado alimenta el pedido (el contrato vive en
  `MerchantCustomerSession`, ver `00-CORE-ARCHITECTURE.md`) y dispara la etapa de
  cobranza que corresponde.
- **La cobranza del saldo es con llamadas y plantillas de WhatsApp**, no con pasarela:
  al pasar a *en destino* ("tu paquete ya está en la agencia X") se dispara la plantilla
  de recojo/cobro y el pedido entra a la cola de llamadas del vendedor. La
  infraestructura ya existe: plantillas por WABA con mapeo de variables
  (`list-wa-templates` / `send-wa-template`) y llamadas LiveKit con grabación.
- Esto además le da **la métrica de recojo nativa** (pedidos *en destino* vs.
  *entregados*) que Frank sigue a mano (73%) y Josue no tiene.

Detalle técnico y pendientes en `02-SMART-LOGISTICS.md` §3.

### ⚠️ Tensión abierta: el adelanto de Kross está 3–5× por encima del mercado

No es una decisión tomada sino un riesgo que la validación destapó y que **no está
medido**.

| | Adelanto |
|---|---|
| Frank | S/20 |
| Josue | S/30 |
| **Kross (mitad de un pack de S/189)** | **S/95** |

El motivo del cambio fue de unidad económica y es sólido: la comisión de 360pay es plana
(S/3.72), así que sobre S/5 se lleva el **74%** del cobro y sobre S/95 el **3.9%**. Un
adelanto chico no paga la pasarela.

Lo que **no** está probado es la otra mitad del argumento — que un adelanto grande produce
compromiso de recojo. **La evidencia disponible apunta en contra**: los compradores de
Frank que no recogen ya habían pagado sus S/20, y Rousbelt necesita llamar al 100% igual.
Si el adelanto no mueve la tasa de recojo, S/95 es solo fricción de conversión.

Las dos lecturas posibles, y ninguna descartada:

- **A favor:** S/20 es simbólico y S/95 no; nadie abandona S/95 en un mostrador. Es
  justamente lo que los operadores nunca probaron porque cobrar montos altos a mano es
  inviable.
- **En contra:** el comprador COD adelanta poco por definición, y pedirle la mitad mata la
  conversión antes de llegar al recojo.

**Cómo se resuelve:** con los pedidos de Kross Shop, comparando conversión del paso 3 y
tasa de recojo contra el 73% de Frank. Es la primera métrica a mirar cuando haya volumen.

### Guía y boleta: demanda confirmada, sigue abierta

Ambos emiten boleta por pedido (SUNAT) y la guía la genera personal dedicado (asistente
contable / logística / Shalom). Hoy la tesis solo contempla 🔮 "etiquetas/datos
formateados para agencias" (`02-SMART-LOGISTICS.md` §3) — formatear datos no es emitir
la guía, y la boleta electrónica no figura. Queda como oportunidad priorizable, no como
decisión tomada.

## Pendientes de la validación

- [ ] Aclarar con Josue qué significa su "80%" de la pregunta 6.
- [ ] Medir la tasa de recojo propia cuando el tracking por API esté vivo (hoy el
      benchmark es el 73% de Frank).
- [ ] Segunda pasada de la pregunta 5 con Frank — reformulada, porque su "se confirman
      igual" sugiere que no la entendió; para su perfil el pitch es ahorro de horas de
      vendedor y % de recojo, no cambio de mix.
- [ ] **Completar el cuestionario con Rousbelt** — le faltan las preguntas 3, 5 y 6. La 6
      es la más valiosa de las tres: *«de los que no recogen, ¿cuánto habían adelantado?»*
      decide la tensión de arriba. La 5 (*«si cobrar y emitir la guía fueran automáticos,
      ¿qué % mandarías por agencia?»*) es la que mide el valor directo: él ya declaró su
      línea base —65% recoge, 35% hay que perseguir— **antes** de la prueba, que es la
      clase de dato que después no se puede discutir.
- [ ] Medir conversión del paso 3 con adelanto = mitad, contra el estándar S/20–30 del
      mercado. Hoy la política se sostiene solo en la aritmética de la comisión.
