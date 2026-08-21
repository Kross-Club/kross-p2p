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
