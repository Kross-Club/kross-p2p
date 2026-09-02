// ─── Lo que cobra Kross, y lo que le cuesta cobrarlo ─────────────────────────
//
// Hasta hoy Kross no tenía precio propio: al comercio se le descontaba **la
// tarifa de 360pay tal cual** —S/5.00 planos— y el margen de Kross era el
// residuo del split (S/1.28). Eso tenía dos problemas, y el primero está
// anotado como deuda abierta desde el contrato:
//
//   · sobre un adelanto de S/5, los S/5 de comisión se lo llevaban ENTERO y al
//     comercio no le quedaba nada (`docs/07-CONTRATO-360PAY.md` §6);
//   · el margen no escalaba: un pedido de S/300 dejaba el mismo S/1.28 que uno
//     de S/10.
//
// Con una segunda pasarela —Flow Pagos, 3.5% + IGV— el costo deja de ser plano,
// así que la tarifa de Kross tiene que ser **suya**, igual en los dos rieles.
//
// ⚠️ **Este archivo NO cobra.** Quien cobra es la pasarela: descuenta la
// comisión vía split y consigna la parte de Kross directo. O sea que acá no
// vive el cobrador, vive **el que sabe cuánto debió cobrarse** — que sirve para
// dos cosas distintas y las dos importan:
//
//   1. enseñarle al comercio lo que recibe, antes de que el evento llegue;
//   2. **detectar que la pasarela se desvió de la tarifa.** Si lo calculado no
//      coincide con lo que el evento dice que se descontó, el config del
//      business quedó con la tarifa vieja — y eso hoy no lo avisaría nadie.
//
// La tarifa **no es configurable por comercio**, y no es una simplificación: si
// una tienda merece menos por el volumen que mueve, eso se negocia en su
// contrato con la pasarela, no en una columna de `stores`. Una columna por
// tienda daría a entender que el panel puede cambiar lo que la pasarela
// descuenta, y no puede.
//
// Sin APIs de Deno: se importa desde las Edge Functions, desde vitest y desde
// el panel — igual que `cobros.ts`.

export const IGV = 1.18

/**
 * La tarifa de Kross al comercio. **IGV incluido**, y es el precio final.
 *
 * El S/1.20 fijo no es un número redondo por gusto: el objetivo era margen
 * mínimo de un sol y, con IGV incluido, el fijo se divide entre 1.18 antes de
 * quedar. Con S/1.00 el piso real caía a S/0.88; con S/1.20 queda en **S/1.017
 * neto**, que es el sol que se buscaba.
 *
 * El 5% le gana al 4.13% de Flow por apenas 87 puntos básicos, así que **casi
 * todo el piso lo pone la parte fija**. Bajarla es bajar el piso, no ajustarlo.
 */
export const TARIFA_KROSS = { pct: 0.05, fijo: 1.20 }

export type Proveedor = '360PAY' | 'FLOW'

/** Los rieles que cobran en línea. `payment_provider` solo puede valer uno de
 *  estos o NULL (sin cobro en línea: el adelanto lo coordina un asesor). */
export const RIELES: readonly Proveedor[] = ['360PAY', 'FLOW'] as const

/** Cómo se llama cada riel para el COMERCIO. Es con quién habla cuando un cobro
 *  se discute, así que sí se nombra — al comprador no, a Ventas sí. Vive acá y
 *  no en la tarjeta que lo pinta porque es un dato del dominio: el día que haya
 *  un tercer riel, el nombre se agrega donde se agrega el riel. */
export const NOMBRE_RIEL: Record<Proveedor, string> = { '360PAY': '360pay', FLOW: 'Flow' }

/**
 * ¿Este pedido cobra en línea?
 *
 * Es la única lectura de `payment_provider` que debería existir en el front.
 * Antes era `=== '360PAY'` escrito en tres sitios, y agregar un riel obligaba
 * a acordarse de los tres — el que se olvidara dejaría a los pedidos de Flow
 * sin botón de pagar el saldo, en silencio.
 */
export function esRielEnLinea(p: string | null | undefined): p is Proveedor {
  return (RIELES as readonly string[]).includes(String(p ?? ''))
}

/**
 * Qué riel le toca a este cobro, de entre los que la tienda tiene ENCENDIDOS.
 *
 * `proveedorPara` dice cuál conviene; esta dice cuál se puede. Con los dos
 * encendidos manda el corte de S/90; con uno, ese; sin ninguno, `null` — el
 * pedido se cierra igual y el adelanto lo coordina un asesor. Nunca elige un
 * riel apagado: un `'FLOW'` sin comercio dado de alta deja al comprador con
 * un pedido creado y sin forma de pagarlo.
 */
export function rielPara(
  monto: number | string, habilitados: readonly Proveedor[],
): Proveedor | null {
  if (habilitados.length === 0) return null
  const preferido = proveedorPara(monto)
  if (habilitados.includes(preferido)) return preferido
  return habilitados[0]
}

/**
 * Lo que cada riel se queda por transacción, con IGV para poder compararlos.
 *
 * Los números se escriben **como los escribe el contrato** (`3.15 * IGV`, no
 * `3.72`) para que leídos contra el Anexo III se vean iguales. Quien tenga que
 * verificarlos va a tener el PDF al lado, no una calculadora.
 */
export const COSTO_PASARELA: Record<Proveedor, { pct: number; fijo: number }> = {
  // Plano, sin importar el monto. Es el S/3.15 + IGV del Anexo III.
  '360PAY': { pct: 0, fijo: 3.15 * IGV },
  // Puro porcentaje: 3.5% + IGV.
  'FLOW': { pct: 0.035 * IGV, fijo: 0 },
}

/**
 * Lo que 360pay cobra en un mes que cierra **bajo 3,000 transacciones**, desde
 * el tercer mes de operatividad (`docs/07-CONTRATO-360PAY.md` §4). Además de
 * subir el fijo, ese mes trae un fee de US$300.
 *
 * Está acá y no en un comentario porque **mueve el corte de riel**: con S/4.51
 * el empate deja de estar en S/90 y se va a S/109.
 */
export const COSTO_360PAY_PENALIZADO = 3.82 * IGV

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * A dos decimales, no al sol.
 *
 * `soles()` de `order-money.ts` redondea al sol para PINTAR, y ahí está bien:
 * los céntimos no cambian ninguna decisión del panel. Acá no se pinta, se
 * liquida — una comisión redondeada al sol se separaría de lo que la pasarela
 * descuenta de verdad, y el control de desvío empezaría a saltar solo.
 */
const redondear = (n: number): number => Math.round(n * 100) / 100

/** Lo que se le descuenta al comercio por este cobro. */
export function comisionDeKross(monto: number | string, tarifa = TARIFA_KROSS): number {
  return redondear(Math.max(0, num(monto)) * tarifa.pct + tarifa.fijo)
}

/** Lo que se queda el riel. `penalizado` solo aplica a 360pay. */
export function costoDePasarela(
  monto: number | string, proveedor: Proveedor, penalizado = false,
): number {
  if (proveedor === '360PAY') {
    return redondear(penalizado ? COSTO_360PAY_PENALIZADO : COSTO_PASARELA['360PAY'].fijo)
  }
  const c = COSTO_PASARELA[proveedor]
  return redondear(Math.max(0, num(monto)) * c.pct + c.fijo)
}

/** Lo que le queda a Kross. Puede ser NEGATIVO si el riel es el equivocado —
 *  un cobro de S/10 por 360pay cuesta S/3.72 y solo deja S/1.70 de comisión. */
export function margenDeKross(
  monto: number | string, proveedor: Proveedor, penalizado = false,
): number {
  return redondear(comisionDeKross(monto) - costoDePasarela(monto, proveedor, penalizado))
}

/**
 * El monto donde los dos rieles cuestan lo mismo: **S/90.00 exactos**.
 *
 * Y es exacto de verdad, no aproximado: `3.15 / 0.035 = 90`, porque el IGV
 * multiplica a los dos lados y se cancela. O sea que el corte **no depende de
 * cómo se declare el IGV**, que es justo lo que uno esperaría que lo moviera.
 *
 * Se deriva en vez de escribirse `90` para que cambiar una tarifa mueva el
 * corte solo. (El redondeo es necesario: en punto flotante la división da
 * 89.99999999999999.)
 */
export const CRUCE_DE_RIELES = redondear(
  COSTO_PASARELA['360PAY'].fijo / COSTO_PASARELA.FLOW.pct,
)

/**
 * Qué riel CONVIENE para este monto, sin mirar cuáles están encendidos.
 *
 * Devuelve el preferido; `rielPara` es la que cae al que la tienda tenga. Lo
 * consume `register-buyer` al registrar el pedido — es el único sitio donde
 * se decide el riel, y se decide por el monto del ADELANTO. El saldo y los
 * extras del mismo pedido van por el riel del pedido (ver `docs/12-FLOW.md`).
 *
 * El corte es `>=` y no `>`: a S/90 los dos cuestan igual, y el empate se
 * resuelve hacia el riel plano porque de ahí para arriba solo mejora.
 */
export function proveedorPara(monto: number | string): Proveedor {
  return num(monto) >= CRUCE_DE_RIELES ? '360PAY' : 'FLOW'
}

// ─── Lo que DE VERDAD se descontó ────────────────────────────────────────────
//
// Todo lo de arriba es la expectativa. Lo que pasó lo dice el evento de la
// pasarela, y esa es la cifra que se guarda: el comercio tiene derecho a ver lo
// que le descontaron, no lo que nuestra tabla cree.
//
// La identidad está verificada contra el primer pago real (cupón `6a87c28e…`,
// `docs/06-360PAY.md` §17.c): `fee_platform 3.72 + fee_partner 1.28 = 5.00`.

export interface DesgloseDeCobro {
  /** Lo que pagó el comercio: la comisión completa. */
  comision: number
  /** La parte que se quedó el riel. El resto es margen de Kross. */
  costo: number
}

/**
 * El desglose que trae el evento, o `null` si no vino.
 *
 * **`null` es una respuesta legítima y no se rellena con el cálculo.** Confundir
 * una comisión medida con una estimada es exactamente el error que
 * `order-money.ts` no se permite con el dinero —"un adelanto declarado no es
 * plata que entró"— y `vigencia-de-cupon.ts` ya trata el "no lo sé" como un
 * estado propio. Con `null`, la tarjeta no pinta la línea; con un número
 * inventado, pintaría una mentira que nadie podría distinguir.
 */
export function desgloseDelEvento(
  feePlataforma: unknown, feeSocio: unknown,
): DesgloseDeCobro | null {
  if (typeof feePlataforma !== 'number' || !Number.isFinite(feePlataforma)) return null
  if (typeof feeSocio !== 'number' || !Number.isFinite(feeSocio)) return null
  return { comision: redondear(feePlataforma + feeSocio), costo: redondear(feePlataforma) }
}

/**
 * ¿La pasarela está cobrando algo distinto de la tarifa?
 *
 * Es el único aviso de que el config del business quedó con la tarifa vieja.
 * Tolera **un céntimo** porque los dos lados redondean por su cuenta y una
 * diferencia de redondeo no es un desvío.
 */
export function hayDesvio(esperado: number, real: number): boolean {
  return Math.round(Math.abs(esperado - real) * 100) > 1
}
