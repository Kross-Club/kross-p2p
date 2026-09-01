# 07 · Contrato de recaudación con 360pay

> Firmado el **19-ago-2026**. Referencia de trabajo del contrato marco entre
> **360PAY S.A.C.** y **Kross Club**, para no tener que abrir el PDF cada vez
> que una decisión de producto o de código depende de una cláusula.
> El PDF firmado es el documento que vale; esto es el mapa.
>
> **Datos omitidos a propósito:** número de cuenta bancaria, domicilios y
> teléfonos personales. No hacen falta para construir y no deben vivir en un
> repositorio. Están en el PDF.

## 1. Quién es quién (y por qué importa)

El contrato **no** usa los nombres que usamos nosotros. Traducción:

| En el contrato | Quién es de verdad |
|---|---|
| **EL PRESTADOR** | 360PAY S.A.C. — RUC 20616299922 |
| **EL CLIENTE** | **Kross Club.** Firmado a nombre de la persona natural con RUC 10482968622 |
| **LOS COMERCIANTES REFERIDOS** | Las marcas de la PWA: Kross Shop, Gadicaf, y las que vengan |
| **LOS ABONANTES** | Los compradores |

La confusión que hay que evitar: **Kross Club no es un comercio de 360pay**, es
su *canal*. Kross Shop sí es un comerciante referido, aunque el dueño sea el
mismo. Por eso las llaves son de partner (`pt_…`) y no por comercio, y por eso
la responsabilidad de originar bien las transacciones es nuestra (§3.1.a).

## 2. El flujo del dinero — la cláusula que define el producto

La 4.2 es la que hay que tener en la cabeza al tocar cualquier cosa de cobros:

1. El **abonante** paga a 360pay el **monto principal + la COMISIÓN DE EL CLIENTE**.
2. 360pay deposita al **comerciante referido** el **monto principal**.
3. 360pay deposita a **Kross Club** la COMISIÓN DE EL CLIENTE **menos** su propia
   comisión.

Leído así, la comisión **no sale del bolsillo del comercio: se le suma al
comprador**, y el comercio recibe íntegro lo que vendió. Kross Club vive del
diferencial entre las dos comisiones — o sea, **cada cobro es ingreso, no
gasto**.

**Kross no usa ese split.** El cupón se emite por el adelanto y la comisión sale
de ahí, así que el comercio recibe el adelanto menos S/5. Ver §6.

**Plazo de liquidación:** 48 horas hábiles desde la confirmación del pago,
extensible hasta 72 horas adicionales por feriado bancario, caída del sistema o
fuerza mayor (§4.3).

## 3. Tarifario (Anexo III)

> Esto es lo que **360pay** cobra. Lo que **Kross** le cobra al comercio dejó de ser
> lo mismo el 01-sep-2026 — ver §9.

| Concepto | Importe | Quién lo paga |
|---|---|---|
| **COMISIÓN DE EL CLIENTE** | 0.5% incl. IGV, **mínimo S/5.00 incl. IGV** por transacción | El comerciante referido, cobrada vía split |
| **COMISIÓN DE EL PRESTADOR** | **S/3.15 + IGV** por transacción | Kross Club, descontada antes de liquidar |

En la práctica, **el mínimo es la tarifa**: el 0.5% solo supera los S/5.00 a
partir de una transacción de S/1,000. Ningún adelanto de la PWA llega ahí, así
que para todo efecto operativo son **S/5.00 planos por cobro**.

La aritmética cierra exacto contra el primer pago real (cupón `6a87c28e…`):

```
fee_platform  3.72   =  3.15 × 1.18 (IGV)      → se lo queda 360pay
fee_partner   1.28   =  5.00 − 3.72            → se lo queda Kross Club
              ─────
              5.00
```

Así que `fee_partner` **no es un costo**: es el margen de Kross Club por
transacción.

## 4. El escalón de las 3,000 transacciones

A partir del **tercer mes** contado desde la fecha de operatividad, en todo mes
calendario que cierre **por debajo de 3,000 transacciones**:

- la comisión de 360pay sube de S/3.15 a **S/3.82 + IGV** (S/4.51 incl. IGV), y
- se cobra además un fee mensual de **US$ 300**, en soles al TC venta del último
  día del mes.

La evaluación es **por mes calendario e independiente**: un mes malo no arrastra
al siguiente, y alcanzar las 3,000 en un mes borra el fee de ese mes entero.

Lo que eso significa para el margen:

| Escenario | Margen por cobro | Fee mensual | Resultado a 3,000 cobros |
|---|---|---|---|
| ≥ 3,000 tx/mes | S/1.28 | — | **+S/3,840** |
| < 3,000 tx/mes | S/0.49 | ≈ S/1,100 | apenas sobre cero |

**El punto de equilibrio está alrededor de 2,250 cobros al mes**, y justo encima
hay un escalón que multiplica el margen por diez. Los dos primeros meses son
gratis de ese riesgo: el ajuste recién aplica desde el tercero.

## 5. Lo que el contrato nos obliga en el código

- **Registro de comerciantes referidos** con razón social, RUC, contacto y
  estado de la relación (§3.1.b). Hoy `stores` no guarda RUC ni razón social —
  **deuda abierta**.
- **Veracidad de lo que transmitimos** (§3.1.a): la responsabilidad de que el
  monto y los datos del cupón sean correctos es nuestra, no de 360pay. Es lo que
  justifica que `pay360-coupon` derive el adelanto en el servidor y lo contraste
  contra la fila antes de emitir, en vez de confiar en lo que manda el front.
- **Ventana de extorno de 48 horas hábiles** (§2.2), y solo mientras los fondos
  no se hayan liquidado al comercio. Después, devolver es problema del comercio.
  Cualquier pantalla de anulación de pedido pagado tiene que decir esto.
- **Contracargos y disputas los gestiona 360pay** (§2.3); nosotros solo damos
  información de la transacción, sin costo.
- **No interferencia** (§7.1): 360pay no puede ofrecerle a nuestras marcas
  servicios sustancialmente similares a los nuestros. Es la cláusula que protege
  el modelo.
- **Los datos de los comerciantes referidos son nuestros** (§8.1), y 360pay solo
  puede usarlos para prestar el servicio, cumplir regulación y prevenir fraude.

## 6. Cómo se cobra la comisión en Kross (decidido)

> Lo de acá sigue vigente en la MECÁNICA —el cupón se emite por el adelanto y la
> comisión la absorbe el comercio, no el comprador—. Lo que cambió es el IMPORTE:
> ya no son S/5 planos, ver §9.

El contrato (§4.2) describe un split donde el abonante paga *principal +
comisión* y el comercio recibe el principal íntegro. **Kross no lo usa así.**

**El `amount` del cupón es lo que paga el comprador, y punto.** Si el adelanto
es S/10, el cupón se emite por S/10 y el comprador ve S/10 en Yape. La comisión
sale de ahí: 360pay le deposita al comercio la suma de sus transacciones menos
S/5 por cada una.

O sea, **la comisión la absorbe el comercio**, no el comprador. Es una decisión
de producto, no una limitación técnica: subirle S/5 al comprador en el momento
del cobro es fricción justo donde más caro sale perderlo. Para el comercio esos
S/5 son el costo de no pagar Aliclik y tener encima la PWA, el chat y el resto
del sistema.

**Consecuencia para el código: ninguna.** `pay360-coupon` ya emite el cupón por
el adelanto derivado y nada más. No hay que sumarle la comisión.

### El piso que esto impone al adelanto

Los S/5 son planos, así que muerden distinto según el monto — y sobre el
adelanto, no sobre el precio del producto:

| Adelanto | Comisión | Le queda al comercio |
|---|---|---|
| S/5 | S/5 | **S/0** |
| S/6 (mitad de un pack de S/12) | S/5 | S/1 |
| S/10 | S/5 | S/5 |
| S/25 | S/5 | S/20 |
| S/50 | S/5 | S/45 |

Debajo de ~S/10 de adelanto, el cobro en línea no le devuelve casi nada al
comercio. Eso no rompe nada —el pedido igual se cierra y el resto se cobra
contraentrega— pero conviene tenerlo presente al armar packs baratos: en un pack
de S/12, cobrar el total por adelantado deja S/7 y cobrar la mitad deja S/1.

**Deuda abierta:** hoy nada impide emitir un cupón por debajo de S/5. Un piso
configurable por tienda —o caer a contraentrega puro cuando el adelanto no lo
alcance— evitaría cobros que no le dejan nada al comercio.

## 7. Vigencia y salida

- **12 meses** desde la firma, renovación automática por períodos iguales.
- Cualquiera puede **no renovar** avisando por escrito con **30 días** de
  anticipación.
- Cualquiera puede **resolver sin causa** con 30 días calendario, **sin
  penalidad**. No hay lock-in.
- Al terminar: las transacciones en curso se liquidan igual, y 360pay paga todo
  lo pendiente en **5 días hábiles**.
- **Tope de responsabilidad:** lo liquidado entre las partes en los 12 meses
  previos al hecho, salvo dolo o culpa inexcusable.
- Cualquier cambio de tarifas exige **adenda firmada por ambas partes** (§4.6).
  No pueden subir la comisión unilateralmente.

## 8. Contactos comerciales

| | |
|---|---|
| 360pay — comercial | Edgar Huamaní · edgar@neonvts.com |
| 360pay — representante legal | Gonzalo Antonio Rosselló Monaco |
| Plataforma | https://console.360pay.pe |
| Canales habilitados | BCP, BBVA, Scotiabank, Interbank y **Yape** |

La liquidación entra a una cuenta corriente en soles del BCP a nombre del
firmante. El número está en el PDF, no aquí.

## 9. La tarifa de Kross (01-sep-2026)

Hasta acá Kross no tenía precio propio: al comercio se le descontaba el tarifario de 360pay
tal cual —S/5.00 planos— y el margen era el residuo del split (S/1.28). Con **Flow Pagos**
entrando como segundo riel (3.5% + IGV) el costo deja de ser plano, así que la tarifa pasa
a ser de Kross y la misma en los dos:

> **5% del cobro + S/1.20**, IGV incluido.

**Igual para todos los comercios, y no es una simplificación.** Quien cobra es la pasarela
—descuenta vía split y consigna la parte de Kross directo—, así que un precio por tienda se
negocia en el contrato de esa tienda con la pasarela, no en una columna de `stores`. Una
columna por tienda daría a entender que el panel puede cambiar lo que la pasarela descuenta,
y no puede.

### Por qué S/1.20 y no S/1.00

El 5% le gana al 4.13% de Flow por apenas 87 puntos básicos, así que **casi todo el piso lo
pone la parte fija**. Y con IGV incluido esa parte se divide entre 1.18 antes de quedar:

| Parte fija | Piso bruto | Piso **neto de IGV** |
|---|---|---|
| S/1.00 | 1.00 | 0.85 |
| **S/1.20** | 1.20 | **1.017** ✅ |

El objetivo era un sol de margen mínimo. S/1.00 no lo daba; S/1.20 sí.

### El corte de riel: S/90.00 exactos

| Riel | Costo por transacción |
|---|---|
| 360pay | **S/3.72** planos (S/3.15 + IGV) · **S/4.51** si el mes cierra bajo 3,000 tx |
| Flow Pagos | **4.13%** del monto (3.5% + IGV) |

Se cruzan en `3.15 / 0.035 = 90`, y el resultado **no depende del IGV**: multiplica a los dos
lados y se cancela. Así que la regla es **`≥ S/90 → 360pay, menos → Flow`**, y parte justo en
el empate: a S/90 los dos rieles dejan el mismo margen, o sea que el ruteo no crea ningún
salto. (En un mes penalizado a S/4.51 el corte se movería a S/109.)

### La tabla

| Monto | Kross cobra | Riel | Costo | **Margen** | El comercio recibe | (antes, S/5) |
|---|---|---|---|---|---|---|
| S/5 | 1.45 | Flow | 0.21 | **1.24** | 3.55 | 0.00 |
| S/10 | 1.70 | Flow | 0.41 | **1.29** | 8.30 | 5.00 |
| S/25 | 2.45 | Flow | 1.03 | **1.42** | 22.55 | 20.00 |
| S/50 | 3.70 | Flow | 2.07 | **1.63** | 46.30 | 45.00 |
| S/89 | 5.65 | Flow | 3.68 | **1.97** | 83.35 | 84.00 |
| **S/90** | 5.70 | **360pay** | 3.72 | **1.98** | 84.30 | 85.00 |
| S/100 | 6.20 | 360pay | 3.72 | **2.48** | 93.80 | 95.00 |
| S/180 | 10.20 | 360pay | 3.72 | **6.48** | 169.80 | 175.00 |
| S/300 | 16.20 | 360pay | 3.72 | **12.48** | 283.80 | 295.00 |

Para el comercio la tarifa nueva es **más barata que la vieja hasta S/76** y más cara arriba.
Es el intercambio correcto, y **cierra la deuda abierta de §6**: con S/5 planos, un adelanto de
S/5 le dejaba S/0 al comercio; ahora le deja S/3.55.

### ⚠️ Tres cosas que NO están resueltas

**1. La pasarela tiene que estar configurada con esta tarifa.** Como el que cobra es 360pay,
aplicarla significa reconfigurar el `config` del business (`commission_fixed_amount` /
`commission_tiers[]`, `06-360PAY.md` §6.d). Tres preguntas para Edgar que el OpenAPI no
responde: ¿se puede **actualizar** el config de un business ya creado, o solo se fija al alta
—Kross Shop ya existe con la tarifa vieja—? ¿`commission_tiers[]` soporta **porcentaje +
fijo**? ¿El mínimo de S/5.00 se aplica del lado del servidor?

**2. El mínimo de S/5.00 del Anexo III muerde bajo S/76.** `5% + S/1.20` iguala los S/5 justo
en S/76, así que por debajo 360pay le seguiría descontando S/5.00 al comercio aunque la tarifa
diga S/2.45. En la zona que el corte le deja a 360pay (≥S/90) la tarifa es siempre ≥S/5.70 y el
mínimo nunca muerde: **la tarifa nueva es coherente con el contrato solo si los cobros chicos
se van a Flow.** Mientras Flow no exista se calcula y se muestra, pero se sigue liquidando a
S/5. Bajarlo antes exige adenda firmada (§4.6).

**3. El escalón de las 3,000 se auto-inflige.** El corte manda casi todo a Flow —casi ningún
adelanto llega a S/90—, así que 360pay cerraría todos los meses bajo 3,000 y desde el tercer
mes cobraría los US$300 (§4). Perseguir las 3,000 es peor que pagarlos: mandar un cobro de S/10
a 360pay en vez de Flow cuesta S/3.31 extra, y llegar a 3,000 así costaría ~S/9,000 para
ahorrar ~S/1,100. **Hay que renegociarlo con Edgar antes de noviembre**, o preparar la
no-renovación — el contrato no tiene lock-in (30 días, sin penalidad, §7).

### Dónde vive en el código

`supabase/functions/_shared/comision.ts` — la tarifa, el costo de cada riel y el corte, en un
solo sitio y sin efectos de red. Fijado en `src/lib/comision.test.ts` (**36 tests**), incluida
la tabla de arriba caso por caso.

⚠️ **Ese archivo NO cobra.** Cobra la pasarela; acá vive *el que sabe cuánto debió cobrarse*, y
sirve para dos cosas: enseñarle al comercio lo que recibe, y **detectar que la pasarela se
desvió de la tarifa**. Si lo calculado no coincide con lo descontado, el config del business
quedó con la tarifa vieja — y eso hoy no lo avisaría nadie.

Lo que se le descontó a cada cobro se guarda en su fila (`cobros.comision_pen` /
`costo_pasarela_pen`, bloque §38), **sacado del evento y no del cálculo**: `fee_platform +
fee_partner` es lo que de verdad se descuenta de la liquidación. Si el evento no trae desglose
quedan en NULL y la tarjeta no pinta la línea — una comisión estimada al lado de un monto real
se leería como medida, y es justo el número que se discute cuando una liquidación no cuadra.

Van por cobro y no por pedido porque **con tarifa `% + fijo` la parte fija se paga dos veces**
en un pedido partido en adelanto + saldo. Es correcto —son dos operaciones bancarias— pero
tiene que estar en el tarifario que se le enseña al comercio, o es el primer reclamo que llega.
