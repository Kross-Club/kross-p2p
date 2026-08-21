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

| # | Pregunta | Frank | Josue |
|---|---|---|---|
| 1 | % agencia vs. domicilio y por qué | 48% Lima · **52% agencia** — Lima confirma más pero llegan más pedidos de provincia | **60% agencia** · 40% Lima |
| 2 | Al subir volumen, ¿qué se rompió primero? | **El % de entrega** | **La rentabilidad** |
| 3 | Adelanto y cómo se cobra hoy | **S/20**, llamando varias veces al día con descuento de próxima compra; seguimiento por cada vendedor si es su lead | **S/30**, 3 etapas de cobro |
| 4 | ¿Boleta por pedido? ¿Quién genera la guía? | Boleta para SUNAT sí; la guía la genera un asistente contable, o uno de logística si es Shalom | Sí |
| 5 | Si cobrar el saldo y emitir la guía fueran automáticos, ¿% por agencia? | Igual — "se confirman igual" (no entendió del todo la pregunta) | **El 100%** |
| 6 | Los que no recogen, ¿cuánto habían adelantado? | S/20 | 80% ⚠️ *dato ambiguo — falta aclarar si es % del valor del pedido* |
| 7 | ¿% que recoge sin insistir? | **73% exacto** | No lo tiene mapeado |

## Qué valida la tesis

1. **Agencia como canal principal.** 52–60% del volumen ya va por agencia. El default
   `home_delivery_enabled = false` para marcas nuevas está donde está el mercado.
2. **Por qué se van a agencia.** Lo primero que se rompe al escalar es el % de entrega
   (Frank) y la rentabilidad (Josue) — los dos argumentos del adelanto diferenciado
   S/20–25 agencia vs. S/30 domicilio provincia (`01-SALES-ENGINE.md` §Los montos).
3. **Los montos del adelanto son los del mercado.** Frank pide S/20 (igual al adelanto
   Shalom de Kross), Josue S/30. El rango S/20–30 de `checkout.config.ts` no es teórico.
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
