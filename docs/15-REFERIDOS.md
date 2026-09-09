# 15 · Referidos — un nivel, pagado con lo que Kross gana de la referida

> **Fecha: 09-set-2026.** Documento de decisión, no de código. Responde a una pregunta
> concreta: con la suscripción en **US$67/mes**, ¿conviene repartir **S/0.20 por cada cobro
> Yape** (Flow o 360pay) de la tienda referida a los clientes activos que la trajeron, en un
> solo nivel? ¿Es atractivo para el que refiere y para Kross, y qué habría que cambiar?
>
> Cada cifra sale del repo: la tarifa y el costo de los rieles de
> `supabase/functions/_shared/comision.ts` (`07-CONTRATO-360PAY.md` §9), la tienda de
> ejemplo de `src/lib/demo/tienda-demo.ts` y la tasa medida de Flow de
> `ESTADO-OPERATIVO.md` (08-set-2026). Todo se recalcula con
> `node scripts/simular-referidos.mjs` (acepta `TC=` y `SUB_USD=` por entorno).
> Lo que es supuesto y no medición se dice.

---

## 0. Veredicto en una página

1. **Lo que Kross gana de una tienda no es la suscripción: es el cobro.** Una tienda de 30
   pedidos/día deja S/213 netos de suscripción y entre S/912 y S/1,362 netos de margen de
   cobro al mes, según la tasa de Flow. La suscripción es el 14–19 %. Cualquier programa de
   referidos se paga —y se juzga— contra el margen de cobro, no contra los US$67.
2. **El S/0.20 es barato en agregado y caro en el cobro.** Sobre una referida entera cuesta
   entre el 8 y el 14 % de lo que Kross gana con ella. Pero sobre un cobro de S/45 a S/60 —el
   adelanto de un producto de S/89 a S/129, que es donde más adelantos caen— el margen neto
   con la tasa **medida** de Flow (5.5 %) es de S/0.41 a S/0.45, y S/0.20 se lleva **la
   mitad**. Con la tasa del **contrato** (3.5 %) se lleva el 14 %. La tasa de Flow decide si
   el S/0.20 es un residual razonable o la mitad del negocio en la franja más poblada.
3. **Para el que refiere, «S/0.20 por cobro» no dice nada hasta que la referida es grande.**
   Una referida de 10 pedidos/día le deja S/51 al mes; una de 30, S/153; la tienda demo
   (1.000 pedidos/día), S/6,950. Los pares que un cliente puede referir son de su tamaño:
   chicos. Y S/0.20 por cobro no se puede imaginar; **«cinco referidas y tu Kross sale
   gratis»** sí.
4. **Recomendación (§3):** base del **20 % de la suscripción** de cada referida como crédito
   en la del referidor, más **S/0.10 por cobro** sin tope, y la referida entra con el
   **primer mes a mitad de precio**. Paga más que la propuesta a las referidas de menos de
   ~20 pedidos/día (las que de verdad llegan), menos a las grandes (donde S/0.20 sobrepaga),
   le cuesta a Kross entre el 5 y el 15 % de lo que gana con la referida, y resiste la
   incertidumbre de la tasa de Flow: S/0.10 nunca pasa de la cuarta parte del margen de un
   cobro.
5. **Antes de prometer nada, dos deudas que mueven más plata que el S/0.20 (§5):** confirmar
   la tasa de Flow —5.5 % medido contra 3.5 % del contrato **parte o duplica** el margen de
   cobro— y mover el corte de riel, que sigue en S/90 en el código: con 5.5 %, los cobros de
   S/75 a S/89 dejan entre S/0.08 y **−S/0.13** antes de pagarle nada a nadie.

---

## 1. De dónde sale la plata

Kross cobra **5 % + S/1.20** por cobro, IGV incluido, y la misma tarifa en los dos rieles.
Lo que le queda depende del riel: 360pay se queda **S/3.72 planos**; Flow se queda un
porcentaje del monto —**3.5 % + IGV según el contrato**, **5.5 % + IGV según lo que mostró su
panel** en el primer cobro real—. El ruteo manda cada cobro al riel más barato, y el corte es
`3.15 / tasa`: S/90 con 3.5 %, **S/57** con 5.5 %.

### 1.1 El margen de un cobro, por monto

Con IGV. Tres columnas porque hoy conviven tres realidades: la del contrato, la medida, y la
medida **con el corte que sigue en el código** (`CRUCE_DE_RIELES` se deriva del 3.5 %).

| Cobro | Contrato 3.5 % · corte S/90 | Medida 5.5 % · corte S/57 | Medida 5.5 % · corte de hoy S/90 |
|---|---|---|---|
| S/10 | 1.29 Flow | 1.05 Flow | 1.05 Flow |
| S/20 | 1.37 Flow | 0.90 Flow | 0.90 Flow |
| S/45 | 1.59 Flow | 0.53 Flow | 0.53 Flow |
| S/57 | 1.70 Flow | **0.35** Flow | 0.35 Flow |
| S/60 | 1.72 Flow | 0.48 360pay | 0.31 Flow |
| S/65 | 1.77 Flow | 0.73 360pay | 0.23 Flow |
| S/75 | 1.85 Flow | 1.23 360pay | 0.08 Flow |
| S/85 | 1.94 Flow | 1.73 360pay | **−0.07** Flow |
| S/89 | 1.97 Flow | 1.93 360pay | **−0.13** Flow |
| S/90 | 1.98 360pay | 1.98 360pay | 1.98 360pay |
| S/120 | 3.48 360pay | 3.48 360pay | 3.48 360pay |
| S/150 | 4.98 360pay | 4.98 360pay | 4.98 360pay |
| S/180 | 6.48 360pay | 6.48 360pay | 6.48 360pay |

Dos cosas que no son intuitivas y que deciden el programa:

- **El piso no está en los cobros chicos, está en los medianos.** Un cobro de S/10 deja más
  (S/1.05) que uno de S/57 (S/0.35): el S/1.20 fijo cubre el porcentaje de Flow cuando el
  monto es chico, y 360pay se come S/3.72 justo cuando el monto empieza a pesar. La franja
  S/45–S/65 es la del adelanto de un producto de S/89–S/129.
- **Con 5.5 % y el corte en S/90 hay una zona negativa (S/81–S/89).** No es cosa del programa
  de referidos: ya se pierde ahí hoy, en cada cobro. `ESTADO-OPERATIVO.md` lo tiene anotado
  como deuda (*«el cruce se va a ~S/57»*) y esta tabla le pone cifra.

### 1.2 Lo que Kross gana con una tienda, al mes

Tres tiendas referidas. La **demo** es la del panel: 1.000 pedidos/día, productos de S/120,
S/150 y S/180, un 25 % paga el total, el 55 % de los que pagan la mitad paga el saldo en
línea, y el 82 % de los pedidos tiene el adelanto cobrado (es la ventana viva del tablero).
La **típica** y la **chica** son supuestos —productos de S/89, S/129 y S/159, 60 % con
adelanto cobrado— porque la conversión del paso 3 sigue sin medirse
(`ICP Sales/VALIDACION-AGENCIA.md`). Suscripción de US$67 a TC 3.75 = **S/251.25 con IGV,
S/212.92 neto**. Mes de 30 días. Neto de IGV en todo.

| | Chica · 10/día | Típica · 30/día | Demo · 1.000/día |
|---|---|---|---|
| Pedidos al mes | 300 | 900 | 30,000 |
| Cobros Yape al mes (adelantos + saldos en línea) | 254 | 763 | 34,748 |
| Comisión que paga la tienda (5 % + S/1.20) | 1,247 | 3,740 | 195,063 |
| Margen de cobro neto · **Flow 3.5 %** | 454 | 1,362 | 70,866 |
| Margen de cobro neto · **Flow 5.5 %** | 304 | 912 | 55,853 |
| Suscripción neta | 213 | 213 | 213 |
| **Take neto de Kross · 3.5 %** | **667** | **1,575** | **71,079** |
| **Take neto de Kross · 5.5 %** | **517** | **1,125** | **56,066** |

Léase: la suscripción es el **32 %** del take en la tienda chica, el **14–19 %** en la típica
y el **0.3 %** en la demo. El producto que se vende por US$67 vive del cobro.

---

## 2. La propuesta, medida

**A · S/0.20 por cada cobro Yape confirmado de la referida, a suscriptores activos, un solo
nivel.**

| | Chica · 10/día | Típica · 30/día | Demo · 1.000/día |
|---|---|---|---|
| Gana el referidor al mes | S/51 | S/153 | S/6,950 |
| Como parte del take de Kross · 3.5 % | 7.6 % | 9.7 % | 9.8 % |
| Como parte del take de Kross · 5.5 % | 9.8 % | 13.6 % | 12.4 % |
| Referidas así para que su suscripción salga gratis | 4.9 | 1.6 | 0.04 |

Lo que tiene bien, y que la recomendación conserva:

- **Paga solo por actividad real.** Un alta que nunca cobra no cuesta nada. Es la protección
  natural contra el referido de relleno.
- **Escala con el volumen de la referida,** que es lo que a Kross le importa (TPV, como
  dice `14-EVALUACION-KROSS-CLUB.md` §11: *lo que un fondo paga caro es el volumen de pagos
  por los rieles de Kross*).
- **Un solo nivel** es la decisión correcta y no se discute: el multinivel es riesgo
  regulatorio y de reputación en Perú, y la comunidad que vende software es la de
  operadores que se enseñan entre sí (§7.5 del mismo doc), no una red de reclutadores.
- **Solo a suscriptores activos** convierte el programa en una razón para no irse.

Lo que tiene mal:

- **En agregado es barato (8–14 %), en el cobro es fuerte.** Como % del margen neto del
  cobro individual:

  | Cobro | Margen neto · 3.5 % | S/0.20 se lleva | Margen neto · 5.5 % | S/0.20 se lleva |
  |---|---|---|---|---|
  | S/10 | 1.09 | 18 % | 0.89 | 22 % |
  | S/45 | 1.35 | 15 % | 0.45 | **45 %** |
  | S/60 | 1.46 | 14 % | 0.41 | **49 %** |
  | S/65 | 1.50 | 13 % | 0.62 | 32 % |
  | S/90 | 1.68 | 12 % | 1.68 | 12 % |
  | S/129 | 3.33 | 6 % | 3.33 | 6 % |

  Una referida cuyo catálogo sea todo de S/89–S/129 con adelanto a la mitad vive en la
  franja del 45–49 %. Kross seguiría ganando —la suscripción y S/0.21 por cobro— pero el
  programa se habría llevado la mitad del margen de cobro de esa tienda. Con la tasa del
  contrato, nada de esto pasa.
- **No motiva a referir tiendas chicas,** que son las que un cliente conoce. S/51 al mes por
  traer a un par de 10 pedidos/día no mueve a nadie; y «S/0.20 por cobro» exige que el
  referidor imagine cuántos cobros hace una tienda que no es suya.
- **Sobrepaga en las grandes.** S/6,950 al mes de por vida por haber referido a la tienda
  demo es más de lo que ningún vendedor cobraría de comisión recurrente. Es plata que se
  puede mover hacia la base sin que la grande deje de ser un premio.
- **No dice cómo se paga.** Pagar en efectivo a un comercio exige factura suya con IGV,
  detracción si aplica, y un proceso mensual de pagos. Eso hay que decidirlo (§3.2).

---

## 3. La recomendación

### 3.1 Tres piezas

**B · «Refiere y tu Kross sale gratis».**

1. **Base: 20 % de la suscripción de cada referida activa**, como crédito en la suscripción
   del que refiere, cada mes que las dos estén activas. A US$67 son **S/50.25 al mes por
   referida**; con cinco, la suya sale gratis. Es la única pieza que se puede prometer en una
   frase, y se financia con la parte del take que **no** depende de la tasa de Flow.
2. **Variable: S/0.10 por cada cobro Yape confirmado** de la referida (adelanto, saldo o
   extra; Flow o 360pay), sin tope, mientras las dos estén activas. Es la mitad del S/0.20
   porque el piso del margen neto por cobro es S/0.41–S/0.45 con la tasa medida: S/0.10 nunca
   pasa del 25 % del margen de ningún cobro, y en el cobro típico (S/120–S/180 por 360pay)
   es el 2–3 %. Conserva el premio de la referida grande: la demo deja S/3,475 al mes solo
   por esta pieza.
3. **La referida entra con el primer mes a mitad de precio** (S/125.63, una vez). El que
   refiere necesita **algo que regalar**, no solo algo que cobrar: «te paso mi código y tu
   primer mes sale a la mitad» es una frase que se dice en un grupo de WhatsApp de
   operadores; «refiéreme y yo gano S/0.20 por tus cobros» no.

### 3.2 La mecánica (lo que hay que fijar para que no se rompa)

- **Crédito primero, efectivo después.** Lo ganado descuenta la factura del referidor. Solo
  lo que **exceda** su suscripción se paga en efectivo, cada mes, **contra factura** del
  referidor y con un mínimo acumulado de S/100. Un descuento en factura es solo una factura
  más baja: cero papeleo, y el IGV de esa parte deja de existir (el costo neto para Kross es
  un 15 % menor que el nominal). El efectivo, en cambio, sí exige factura y revisión de
  detracción con el contador.
- **Cuenta solo lo que entró:** cobros en `MATCHED`, netos de extornos, del mes calendario.
  La fila ya existe (`cobros`, con `matched_at`, `comision_pen` y `costo_pasarela_pen`); la
  liquidación es una consulta, no una tabla nueva de eventos.
- **Empieza cuando la referida paga su primer mes.** Ni en la prueba ni en el alta: un alta
  que no paga no es una referida.
- **Se apaga cuando cualquiera de las dos deja de estar activa.** Si el referidor vuelve, no
  recupera el histórico: el programa premia quedarse.
- **Un solo nivel y sin auto-referidos.** Mismo RUC, DNI o teléfono no refiere. Una tienda
  solo puede ser referida una vez, por quien la trajo primero.
- **Se ve en el panel.** «Tus referidas: 3 activas · 812 cobros este mes · S/131 a tu favor».
  Lo que no se ve no motiva, y el panel ya cuenta cobros por tienda.
- **La tarifa de la referida no cambia.** El programa se paga del margen de Kross, nunca
  subiendo la comisión de la referida ni del comprador (`07-CONTRATO-360PAY.md` §6 ya
  decidió que la comisión no se le suma al comprador).

### 3.3 Lo que se descartó, y por qué

| Alternativa | Por qué no |
|---|---|
| **% de la comisión que Kross cobra** («te devuelvo el 10 % de lo que le cobro a tu referida») | La comisión es casi toda pasarela. En la típica, 10 % de la comisión son S/374 al mes: el **41 %** del margen de cobro con la tasa medida. Transparente, pero insostenible. |
| **% del margen de Kross** | Robusto —nunca se paga más de una fracción de lo ganado— pero opaco: el referidor no puede verificarlo, y dos cobros iguales pagarían distinto según el riel. El repo ya evita enseñar cifras que el comercio no pueda cotejar (`comision.ts`: *«una comisión estimada al lado de un monto real se leería como medida»*). |
| **Dos escalones por monto** (S/0.20 en cobros ≥ S/90, S/0.10 debajo) | Protege la franja S/45–S/65 igual de bien y conserva el S/0.20 donde el margen es ≥ S/1.68. Es la variante si se quiere mantener el S/0.20 en la comunicación. Cuesta una regla más que explicar; por eso no es la principal. |
| **Descuento en la tarifa del propio referidor** por cada referida | Es lo que más quiere un comercio —su costo grande es la comisión, no la suscripción— pero es un costo sin tope: 0.25 puntos sobre su volumen, no sobre el de la referida. |
| **Bono único por alta** | Atrae altas vacías. El primer mes al 50 % de la referida cumple la misma función y solo cuesta si la referida paga. |
| **Multinivel** | No. Ver §2. |

---

## 4. La simulación: A contra B

Mismos supuestos que §1.2. «Take» es lo que Kross gana con la referida, neto de IGV,
cobro más suscripción. Los pagos al referidor van a valor nominal (como crédito en factura
cuestan un 15 % menos).

### 4.1 Con la tasa del contrato (Flow 3.5 % · corte S/90)

| | Chica · 10/día | Típica · 30/día | Demo · 1.000/día |
|---|---|---|---|
| Take neto de Kross al mes | 667 | 1,575 | 71,079 |
| **A** gana el referidor | **51** · 7.6 % | **153** · 9.7 % | **6,950** · 9.8 % |
| **B** gana el referidor | **76** · 11.3 % | **127** · 8.0 % | **3,525** · 5.0 % |
| B, costo único (primer mes de la referida) | 126 | 126 | 126 |
| Kross se queda al mes · A | 616 | 1,423 | 64,130 |
| Kross se queda al mes · B | 591 | 1,449 | 67,554 |
| Referidas así para suscripción gratis · A / B | 4.9 / 3.3 | 1.6 / 2.0 | 0.04 / 0.07 |

### 4.2 Con la tasa medida (Flow 5.5 % · corte S/57)

| | Chica · 10/día | Típica · 30/día | Demo · 1.000/día |
|---|---|---|---|
| Take neto de Kross al mes | 517 | 1,125 | 56,066 |
| **A** gana el referidor | **51** · 9.8 % | **153** · 13.6 % | **6,950** · 12.4 % |
| **B** gana el referidor | **76** · 14.6 % | **127** · 11.2 % | **3,525** · 6.3 % |
| B, costo único (primer mes de la referida) | 126 | 126 | 126 |
| Kross se queda al mes · A | 466 | 973 | 49,116 |
| Kross se queda al mes · B | 441 | 999 | 52,541 |

### 4.3 Cómo leerla

- **A y B empatan en ~20 pedidos/día** (503 cobros al mes). Debajo, B paga más al referidor;
  encima, A. B mueve plata de las referidas grandes a las chicas, que son las que un
  cliente refiere. En la demo, A cuesta el doble que B y el referidor igual se lleva
  S/3,525 al mes con B.
- **Para Kross, B cuesta lo mismo o menos que A en todo lo que no sea la tienda chica**, y
  en la chica la diferencia son S/25 al mes sobre un take de S/517–S/667.
- **El año 1 de una típica** con B: S/1,518 pagados al referidor + S/126 regalados a la
  referida = S/1,644, contra S/13,500–S/18,900 de take. Un costo de adquisición del 9–12 %
  del ingreso del primer año, que se paga solo si la referida sigue pagando.
- **Ninguno de los dos se cae con la tasa medida,** pero A vive del cobro y B no: si Flow
  resulta al 5.5 %, A pasa del 9.7 % al 13.6 % del take en la típica; B, del 8.0 al 11.2.

---

## 5. Lo que va antes del programa

Dos números del repo mueven más plata que cualquier S/0.20, y hay que cerrarlos antes de
prometer una comisión de por vida sobre el margen de cobro:

1. **La tasa de Flow.** El contrato dice 3.5 % + IGV; el panel de Flow mostró 5.5 % en el
   primer cobro real (`ESTADO-OPERATIVO.md`, 08-set-2026). La diferencia parte el margen de
   cobro de una tienda típica de S/1,362 a S/912 al mes. Se confirma en la primera
   liquidación (`settlement/getByIdv2`, como ya dice `12-FLOW.md`) o preguntándole a Flow
   qué tasa tiene el one-shot de Yape. Mientras tanto, el simulador y este doc usan **las
   dos**.
2. **El corte de riel.** `COSTO_PASARELA.FLOW.pct` sigue en 3.5 %, así que
   `CRUCE_DE_RIELES` sigue en S/90. Si la tasa real es 5.5 %, cada cobro entre S/57 y S/89
   se está mandando al riel caro, y los de S/81–S/89 dejan margen negativo (tabla §1.1).
   Corregir la constante mueve el corte solo —está derivado a propósito— y cambia
   `src/lib/comision.test.ts`, que fija la tabla del contrato caso por caso.

Y una tercera que no es del cobro: **la suscripción todavía no se cobra**
(`04-CUMPLIMIENTO-WEB.md`: `/pago` → `web-order` *«Todavía no cobra»*). Un crédito sobre una
factura que no existe no es un programa. El orden es: cobrar la suscripción, luego
acreditar contra ella.

---

## 6. Qué habría que construir 🔮

Poco, y casi todo ya tiene dónde vivir:

- **Quién refirió a quién.** `stores.referred_by` (id de la tienda que refirió) y
  `referred_at`. El contrato con 360pay ya obliga a llevar el registro de comerciantes
  referidos con RUC y razón social (`07-CONTRATO-360PAY.md` §5, deuda abierta): es la misma
  tabla, con una columna más.
- **El código de referido** en el alta: la web pública (`/pago` → `web-order`) y `manage-store`
  `create`. Un código por tienda (el slug sirve).
- **La liquidación mensual.** Una función que, por tienda referida, cuente los `cobros`
  `MATCHED` del mes, aplique el 20 % de la suscripción y el S/0.10, y escriba el crédito en
  la factura siguiente. Sin cron nuevo si se corre al emitir la factura.
- **«Tus referidas»** en el panel: activas, cobros del mes, crédito acumulado, y el código
  para compartir. Es la misma vista de Conexiones/Cobros, filtrada.
- **El demo la enseña** (regla de paridad de `CLAUDE.md`): una tienda de ejemplo con dos
  referidas y su crédito del mes.

---

## 7. Preguntas abiertas

- ¿Los US$67 incluyen IGV, y se facturan en soles al tipo de cambio del día? El modelo asume
  que sí y usa TC 3.75 como parámetro.
- ¿De por vida o 12 meses? El modelo asume **mientras las dos estén activas**. A 12 meses el
  costo del año 2 en adelante es cero y el mensaje se debilita («gratis este año»).
- ¿Qué pasa con una referida con tarifa negociada aparte (contrato propio con la pasarela,
  `comision.ts` lo contempla)? Propuesta: el 20 % de la suscripción sí, el S/0.10 no.
- ¿Se cuenta el saldo cobrado por chat o solo el cobro en línea? Solo lo que cruza por la
  pasarela: es lo único que Kross puede contar sin discusión.
