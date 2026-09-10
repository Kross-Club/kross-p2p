// ─── Quién trajo a quién, y cuánto se le debe por eso ────────────────────────
//
// El programa de afiliados tiene tres piezas y **ninguna de las tres cobra ni
// paga**. Este archivo es el que sabe las reglas; quien mueve plata es Stripe
// (que cobra el plan al comercio) y una transferencia a mano (que le paga al
// afiliado). Igual que `comision.ts`: acá no vive el cobrador, vive **el que
// sabe cuánto debió cobrarse**.
//
// Las tres piezas:
//
//   1. **El enlace.** Cada afiliado tiene un código y el código es su enlace:
//      `krossclub.app/?ref=<codigo>`. Quien llega por ahí y termina siendo
//      tienda queda atribuido a ese afiliado — una sola vez y para siempre.
//   2. **La suscripción.** El comercio paga su plan mensual por Stripe. Esa
//      suscripción es la LLAVE de la comisión: sin mes pagado no hay comisión
//      por ese mes, por más transacciones que la tienda haya hecho.
//   3. **La comisión.** S/0.10 por transacción de la tienda referida. No se
//      acumula en ningún contador: se CUENTA de `cobros`, que es donde ya
//      estaba. Ver `contarTransacciones` abajo y §51 del esquema.
//
// ⚠️ **La comisión no sale por Stripe.** Stripe cobra el plan y nada más: no
// hay Connect, no hay transfers, no hay cuentas conectadas. Lo que Stripe
// aporta a este archivo es UN dato —qué meses pagó cada tienda— y ese dato
// entra por `stripe-webhook`. Mezclarlos sería atar el pago al afiliado a la
// disponibilidad de una API que no hace falta para pagarle.
//
// Sin APIs de Deno: lo importan las Edge Functions, vitest y el panel — igual
// que `comision.ts` y `alcance.ts`. Una sola definición, tres consumidores.

// ─── 1. LA TARIFA ────────────────────────────────────────────────────────────

/**
 * Lo que gana el afiliado por CADA transacción de una tienda que trajo.
 *
 * S/0.10 no es un porcentaje disfrazado: es un fijo, y ser fijo es lo que lo
 * hace explicable en una frase —"diez céntimos por venta"— sin que el afiliado
 * tenga que entender el precio del pedido, el riel ni el IGV.
 *
 * **De dónde sale que se puede pagar.** Kross se queda con `margenDeKross()`
 * (`comision.ts`): en el corte de riel, S/1.98 por transacción. S/0.10 es el
 * 5 % de eso. El margen se estrecha en los montos bajos —un cobro de S/10 por
 * Flow deja S/1.29— pero nunca por debajo de la tarifa: incluso ahí quedan
 * S/1.19. El único caso donde el margen es NEGATIVO es un monto bajo cobrado
 * por 360pay, y ese caso lo previene el ruteo por monto (`proveedorPara`), no
 * este archivo.
 */
export const TARIFA_AFILIADO = 0.10

/** El plan que paga el comercio, en dólares y por mes. Vive acá porque es lo
 *  que la pantalla del afiliado le enseña de sus referidos —"paga $67/mes"— y
 *  lo que el panel compara contra lo que Stripe dice que cobró. El precio REAL
 *  de cada suscripción es el de Stripe: este número es el del catálogo, y si
 *  los dos se separan manda Stripe. */
export const PRECIO_PLAN_USD = 67

// ─── 2. EL CÓDIGO, QUE ES EL ENLACE ──────────────────────────────────────────

/**
 * El código del afiliado, normalizado.
 *
 * Minúsculas, sin tildes y sin nada que un enlace tenga que escapar: el código
 * viaja en una URL que alguien dicta por teléfono o pega en una bio de
 * Instagram. Las mismas reglas que el slug de una tienda (`manage-store`), y
 * por la misma razón — solo que acá el espacio de nombres es otro, así que un
 * afiliado PUEDE llamarse igual que una tienda sin que colisionen.
 */
export function normalizarCodigo(raw: string): string {
  return (raw ?? '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

/**
 * Los que no se pueden dar, porque ya significan otra cosa en una URL nuestra.
 *
 * Corto a propósito: el código vive en `?ref=`, no en el host, así que no
 * compite con los subdominios. Lo que sí tapa son las palabras que alguien
 * usaría para hacerse pasar por la plataforma en una captura de pantalla.
 */
const CODIGOS_RESERVADOS = new Set(['kross', 'krossclub', 'admin', 'api', 'www', 'app', 'soporte'])

/** ¿Sirve como código? Tres caracteres es el piso: con dos, dos afiliados que
 *  se llamen parecido se pisan y el enlace deja de ser de quien cree. */
export function esCodigoValido(codigo: string): boolean {
  const c = normalizarCodigo(codigo)
  return c.length >= 3 && c === codigo && !CODIGOS_RESERVADOS.has(c)
}

/**
 * El enlace que se le entrega al afiliado.
 *
 * ABSOLUTO y no relativo, al revés que `enlaces.ts`: los del pedido se abren
 * dentro del subdominio de la marca y ahí lo relativo es la gracia. Este se
 * pega en una bio, se manda por WhatsApp y se dicta — tiene que llevar el
 * dominio escrito o no es un enlace, es una ruta.
 */
export function enlaceDeAfiliado(codigo: string, apex = 'krossclub.app'): string {
  return `https://${apex}/?ref=${encodeURIComponent(codigo)}`
}

/**
 * El código que trae una URL, o `null`.
 *
 * Lee `?ref=` y lo normaliza, porque nadie escribe el enlace dos veces igual:
 * quien lo comparta a mano va a mandar `?ref=Jhoann` tarde o temprano, y ese
 * visitante tiene que quedar atribuido igual. Normalizar en la puerta es lo que
 * evita tener dos afiliados que son el mismo.
 */
export function codigoDeLaUrl(url: string): string | null {
  try {
    const ref = new URL(url, 'https://krossclub.app').searchParams.get('ref')
    if (!ref) return null
    const c = normalizarCodigo(ref)
    return c.length >= 3 ? c : null
  } catch {
    return null
  }
}

// ─── 3. EL MES ───────────────────────────────────────────────────────────────
//
// Todo lo que se liquida se liquida POR MES, y el mes se escribe `YYYY-MM`.
// Es texto y no una fecha a propósito: un periodo no es un instante, y
// guardarlo como `date` obliga a acordarse de que "en realidad es el día 1" en
// cada consulta que lo toca.
//
// ⚠️ **El mes es el de Lima, no el de UTC.** Una venta del 31 a las 20:00 en
// Lima es del 1 a las 01:00 en UTC, y contarla en el mes siguiente le mueve la
// comisión a otro periodo — el afiliado ve un número que no cuadra con lo que
// vendió su tienda. Perú no tiene horario de verano desde 1994, así que el
// desfase es fijo: UTC-5, siempre.

/** Cuántas horas hay que restarle a UTC para estar en Lima. Constante desde
 *  1994: Perú no mueve el reloj. */
export const HORAS_LIMA = -5

const dosDigitos = (n: number): string => String(n).padStart(2, '0')

/** El mes de Lima al que pertenece un instante. `2026-09`. */
export function periodoDe(cuando: Date | string): string {
  const d = cuando instanceof Date ? cuando : new Date(cuando)
  if (Number.isNaN(d.getTime())) throw new RangeError(`fecha inválida: ${String(cuando)}`)
  const lima = new Date(d.getTime() + HORAS_LIMA * 3600_000)
  return `${lima.getUTCFullYear()}-${dosDigitos(lima.getUTCMonth() + 1)}`
}

/** ¿Está bien escrito? Se valida porque el periodo llega por la API desde el
 *  panel, y un `?periodo=drop` que se concatene en una consulta no es gracioso.
 *  (Aunque se pase parametrizado: lo que un formato inválido produce es un
 *  rango absurdo y una liquidación en cero que nadie sabe explicar.) */
export function esPeriodo(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

/**
 * El rango UTC que hay que consultar para ese mes de Lima.
 *
 * Medio abierto —`desde <= t < hasta`— porque es la única forma de partir el
 * tiempo sin dejar un hueco ni contar dos veces el último milisegundo. Un
 * `between` con `hasta` inclusivo cuenta la venta de las 23:59:59.999 en los
 * dos meses.
 */
export function rangoDelPeriodo(periodo: string): { desde: string; hasta: string } {
  if (!esPeriodo(periodo)) throw new RangeError(`periodo inválido: ${String(periodo)}`)
  const [a, m] = periodo.split('-').map(Number)
  // Medianoche de Lima expresada en UTC: el día 1 a las 00:00 -05:00 son las
  // 05:00 UTC del mismo día.
  const inicio = Date.UTC(a, m - 1, 1, -HORAS_LIMA)
  const fin = Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, -HORAS_LIMA)
  return { desde: new Date(inicio).toISOString(), hasta: new Date(fin).toISOString() }
}

/** El mes anterior. Para la liquidación, que siempre cierra el que pasó. */
export function periodoAnterior(periodo: string): string {
  if (!esPeriodo(periodo)) throw new RangeError(`periodo inválido: ${String(periodo)}`)
  const [a, m] = periodo.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${dosDigitos(m - 1)}`
}

/** Cómo se le dice a un periodo en pantalla: «setiembre 2026». */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
export function nombreDelPeriodo(periodo: string): string {
  if (!esPeriodo(periodo)) return periodo
  const [a, m] = periodo.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

// ─── 4. LA SUSCRIPCIÓN, QUE ES LA LLAVE ──────────────────────────────────────
//
// La pregunta que hay que responder no es *"¿esta tienda está suscrita HOY?"*
// sino *"¿esta tienda tenía el mes pagado CUANDO hizo esta venta?"*. Son
// distintas y la diferencia es plata de alguien:
//
//   · Con la pregunta de hoy, una tienda que cancela el 28 le borra al afiliado
//     las 400 transacciones que hizo del 1 al 27. El afiliado trabajó y no
//     cobra.
//   · Con la pregunta de hoy al revés, una tienda que se suscribe el 28 le
//     regala al afiliado las 400 transacciones que hizo SIN plan.
//
// Por eso lo que se guarda no es un estado, son PERIODOS PAGADOS: una fila por
// factura pagada en Stripe, con el rango que esa factura cubre (`invoice.paid`
// trae `lines[].period`). Una transacción cuenta si cae dentro de alguno.
//
// El estado de hoy (`store_subscriptions.status`) también se guarda, pero para
// otra cosa: para pintar el semáforo del panel y para saber a quién hay que
// llamar. **No decide comisiones.**

/** Un tramo pagado. Fechas ISO en UTC, tal como vienen de Stripe. */
export interface PeriodoPagado {
  inicio: string
  fin: string
}

/**
 * ¿Esta fecha cae dentro de algún tramo pagado?
 *
 * Medio abierto igual que `rangoDelPeriodo`, y por lo mismo: los tramos de
 * Stripe son consecutivos —el `fin` de uno es el `inicio` del siguiente— así
 * que con el extremo cerrado la renovación contaría doble.
 */
export function cubierta(periodos: readonly PeriodoPagado[], cuando: string): boolean {
  const t = Date.parse(cuando)
  if (Number.isNaN(t)) return false
  return periodos.some(p => {
    const a = Date.parse(p.inicio); const b = Date.parse(p.fin)
    return !Number.isNaN(a) && !Number.isNaN(b) && t >= a && t < b
  })
}

/**
 * El estado de la suscripción, en las palabras del panel.
 *
 * Los estados de Stripe son ocho y tres de ellos significan lo mismo para
 * nosotros. Se traducen acá y no en la pantalla para que el panel del afiliado
 * y el del admin no puedan discrepar sobre si una tienda está al día.
 *
 * `en_gracia` es `past_due`: Stripe todavía está reintentando la tarjeta. La
 * tienda sigue operando y el mes en curso todavía puede terminar pagándose, así
 * que no se apaga nada — pero se avisa, porque es a quien hay que llamar.
 */
export type EstadoSuscripcion = 'activa' | 'prueba' | 'en_gracia' | 'cancelada' | 'sin_suscripcion'

export function estadoDeSuscripcion(status: string | null | undefined): EstadoSuscripcion {
  switch (status) {
    case 'active':             return 'activa'
    case 'trialing':           return 'prueba'
    case 'past_due':
    case 'unpaid':             return 'en_gracia'
    case 'canceled':
    case 'incomplete_expired': return 'cancelada'
    // `incomplete` es una suscripción que nunca llegó a cobrar el primer pago:
    // existe en Stripe y no existe para nosotros.
    case 'incomplete':
    case null:
    case undefined:            return 'sin_suscripcion'
    default:                   return 'sin_suscripcion'
  }
}

export const ROTULO_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  activa: 'Al día',
  prueba: 'En prueba',
  en_gracia: 'Pago rechazado',
  cancelada: 'Cancelada',
  sin_suscripcion: 'Sin plan',
}

// ─── 5. LA COMISIÓN ──────────────────────────────────────────────────────────

/** A dos decimales. La misma razón que en `comision.ts`: acá no se pinta, se
 *  liquida — y lo que se liquida se transfiere. */
const redondear = (n: number): number => Math.round(n * 100) / 100

/** Lo que se le debe al afiliado por N transacciones. */
export function comisionDeAfiliado(transacciones: number, tarifa = TARIFA_AFILIADO): number {
  const n = Math.max(0, Math.floor(Number(transacciones) || 0))
  return redondear(n * tarifa)
}

/** Lo que una tienda referida aportó en un mes. Una fila por tienda. */
export interface AporteDeTienda {
  store_id: string
  nombre: string
  /** Transacciones del mes que además caen dentro de un tramo pagado. Es el
   *  número que se multiplica. */
  transacciones: number
  /** Transacciones que NO cuentan porque **la referida** no tenía plan esa
   *  fecha. Se enseña, no se esconde: un afiliado que ve "300 ventas, 0
   *  comisión" sin explicación asume que el sistema le robó. Con este número la
   *  conversación es "tu tienda no pagó el plan", que es la verdad y además es
   *  lo único que él puede destrabar. */
  sin_plan: number
  /**
   * Transacciones que no cuentan porque **el afiliado-tienda** no tenía SU plan
   * al día (§52). La referida sí lo tenía: la que falló fue la de arriba.
   *
   * Es un número aparte de `sin_plan` y no una suma con él, porque las dos
   * cifras mandan a llamar a personas distintas. Juntarlas dejaría al
   * comerciante reclamándole a su referido por algo que tiene que arreglar él.
   * Siempre 0 para un afiliado de fuera, que no tiene plan que vencer.
   */
  sin_mi_plan: number
  estado: EstadoSuscripcion
}

export interface Liquidacion {
  periodo: string
  transacciones: number
  sin_plan: number
  sin_mi_plan: number
  monto: number
  tiendas: AporteDeTienda[]
}

/**
 * La liquidación de un afiliado en un mes.
 *
 * Pura y sin base de datos: recibe las filas ya contadas y arma el total. Así
 * la misma función la usan la Edge Function que liquida y la pantalla que
 * enseña el mes en curso, y no hay dos aritméticas.
 */
export function liquidacionDe(
  periodo: string, tiendas: readonly AporteDeTienda[], tarifa = TARIFA_AFILIADO,
): Liquidacion {
  const suma = (f: (t: AporteDeTienda) => number) =>
    tiendas.reduce((s, t) => s + Math.max(0, f(t)), 0)
  const transacciones = suma(t => t.transacciones)
  return {
    periodo,
    transacciones,
    sin_plan: suma(t => t.sin_plan),
    sin_mi_plan: suma(t => t.sin_mi_plan),
    monto: comisionDeAfiliado(transacciones, tarifa),
    tiendas: [...tiendas].sort((a, b) => b.transacciones - a.transacciones),
  }
}

// ─── 6. QUIÉN ESTÁ DEBAJO DE QUIÉN ───────────────────────────────────────────
//
// Un afiliado puede reclutar afiliados, y el árbol se guarda entero: `referred_by`
// apunta a quien lo trajo. Lo que HOY no hace es pagar por el segundo nivel —la
// comisión es de nivel 1 y punto—, y esa es una decisión del negocio, no una
// limitación del esquema: el día que se abra, el árbol ya está escrito.
//
// Guardar el árbol sin pagarlo tiene un valor que no es especulativo: es lo que
// permite responder "¿de dónde salió esta tienda?" tres saltos hacia arriba
// cuando hay que auditar una atribución, y es lo que le enseña a un afiliado a
// quién reclutó.
//
// ⚠️ **Un árbol guardado en una columna puede tener ciclos.** `referred_by` es
// una FK a la misma tabla: nada en Postgres impide que A traiga a B y B traiga
// a A —basta un `update` mal hecho desde el panel—, y una función recursiva que
// no lo contemple cuelga el servidor. Se contempla acá, una vez, en vez de en
// cada sitio que recorre el árbol.

export interface NodoDeAfiliado {
  id: string
  codigo: string
  nombre: string
  referred_by: string | null
}

export interface RamaDeAfiliado<T extends NodoDeAfiliado> {
  afiliado: T
  nivel: number
  hijos: RamaDeAfiliado<T>[]
}

/**
 * El árbol completo, listo para pintar.
 *
 * Los huérfanos —los que apuntan a un `referred_by` que no está en la lista—
 * suben a la raíz en vez de desaparecer. Pasa de verdad: la pantalla de UN
 * afiliado recibe su rama, no la tabla entera, así que su propio padre no viene
 * en la lista. Desaparecerlos dejaría una pantalla en blanco sin error.
 */
export function arbolDeAfiliados<T extends NodoDeAfiliado>(afiliados: readonly T[]): RamaDeAfiliado<T>[] {
  const porId = new Map(afiliados.map(a => [a.id, a]))
  const hijosDe = new Map<string, T[]>()
  const raices: T[] = []

  for (const a of afiliados) {
    const padre = a.referred_by && porId.has(a.referred_by) ? a.referred_by : null
    if (!padre) { raices.push(a); continue }
    const lista = hijosDe.get(padre)
    if (lista) lista.push(a)
    else hijosDe.set(padre, [a])
  }

  // `vistos` es el corta-ciclos: un afiliado entra al árbol UNA vez. Con A→B→A,
  // el segundo A se corta y la rama termina — sin él, esta función no vuelve.
  const vistos = new Set<string>()
  const ramaDe = (a: T, nivel: number): RamaDeAfiliado<T> => {
    vistos.add(a.id)
    const hijos = (hijosDe.get(a.id) ?? [])
      .filter(h => !vistos.has(h.id))
      .map(h => ramaDe(h, nivel + 1))
    return { afiliado: a, nivel, hijos }
  }

  const arbol = raices.filter(r => !vistos.has(r.id)).map(r => ramaDe(r, 0))
  // Lo que quedó fuera por un ciclo cerrado entre no-raíces (A→B→A sin raíz que
  // los alcance) se cuelga de la raíz: mejor plano que invisible.
  for (const a of afiliados) if (!vistos.has(a.id)) arbol.push(ramaDe(a, 0))
  return arbol
}

/** El árbol aplanado, en el orden en que se lee. Lo que consume una tabla. */
export function aplanarArbol<T extends NodoDeAfiliado>(
  ramas: readonly RamaDeAfiliado<T>[],
): { afiliado: T; nivel: number }[] {
  const filas: { afiliado: T; nivel: number }[] = []
  const bajar = (r: RamaDeAfiliado<T>) => {
    filas.push({ afiliado: r.afiliado, nivel: r.nivel })
    r.hijos.forEach(bajar)
  }
  ramas.forEach(bajar)
  return filas
}

/**
 * Los ids de todos los que cuelgan de uno, a cualquier profundidad.
 *
 * No sirve para pagar —la comisión es de nivel 1— sino para MIRAR: es lo que
 * responde "enséñame todo lo que hay debajo de este afiliado". Con el mismo
 * corta-ciclos, por la misma razón.
 */
export function descendientesDe(
  afiliados: readonly NodoDeAfiliado[], raiz: string,
): string[] {
  const hijosDe = new Map<string, string[]>()
  for (const a of afiliados) {
    if (!a.referred_by) continue
    const lista = hijosDe.get(a.referred_by)
    if (lista) lista.push(a.id)
    else hijosDe.set(a.referred_by, [a.id])
  }
  const vistos = new Set<string>([raiz])
  const salida: string[] = []
  const cola = [...(hijosDe.get(raiz) ?? [])]
  while (cola.length) {
    const id = cola.shift()!
    if (vistos.has(id)) continue
    vistos.add(id)
    salida.push(id)
    cola.push(...(hijosDe.get(id) ?? []))
  }
  return salida
}

/**
 * ¿Poner a `nuevoPadre` encima de `hijo` cerraría un ciclo?
 *
 * La pregunta que hay que hacerse ANTES de guardar, y el único sitio donde el
 * ciclo se puede evitar de verdad: una vez escrito, lo de arriba lo tolera pero
 * el árbol ya está mal. Lo enforza `afiliados` (la Edge Function); el panel lo
 * pregunta para no ofrecer lo que va a ser rechazado.
 */
export function cerrariaCiclo(
  afiliados: readonly NodoDeAfiliado[], hijo: string, nuevoPadre: string | null,
): boolean {
  if (!nuevoPadre) return false
  if (nuevoPadre === hijo) return true
  return descendientesDe(afiliados, hijo).includes(nuevoPadre)
}

/**
 * Los pedazos del mes que la tienda tenía pagados, recortados y FUSIONADOS.
 *
 * Es lo que convierte "¿estaba al día?" en algo que se puede contar con el
 * índice: en vez de traer las 40.000 transacciones del mes para mirarlas una
 * por una, se sacan los rangos cubiertos y se le pide a Postgres un `count` por
 * rango. Una tienda de mil pedidos al día no cabe en la memoria de una Edge
 * Function; tres `count` sí.
 *
 * **Fusionar no es un lujo.** Dos tramos que se solapan —pasa con un cambio de
 * plan a mitad de mes: Stripe emite el prorrateo Y la factura nueva, y los dos
 * cubren los mismos días— harían que las transacciones de esos días se contaran
 * DOS veces. El afiliado cobraría de más y el desglose no cuadraría con nada.
 */
export function tramosDelPeriodo(
  periodos: readonly PeriodoPagado[], desde: string, hasta: string,
): { desde: string; hasta: string }[] {
  const a0 = Date.parse(desde); const b0 = Date.parse(hasta)
  if (Number.isNaN(a0) || Number.isNaN(b0) || b0 <= a0) return []

  const recortados = periodos
    .map(p => ({ a: Date.parse(p.inicio), b: Date.parse(p.fin) }))
    .filter(p => !Number.isNaN(p.a) && !Number.isNaN(p.b))
    .map(p => ({ a: Math.max(p.a, a0), b: Math.min(p.b, b0) }))
    .filter(p => p.b > p.a)
    .sort((x, y) => x.a - y.a)

  const fusionados: { a: number; b: number }[] = []
  for (const p of recortados) {
    const ultimo = fusionados[fusionados.length - 1]
    // `>=` y no `>`: dos tramos pegados (el fin de uno es el inicio del otro,
    // que es como Stripe encadena las renovaciones) son UN rango continuo. Con
    // `>` quedarían dos, y el resultado sería el mismo total en dos consultas
    // en vez de una — correcto pero el doble de caro, todos los meses.
    if (ultimo && p.a <= ultimo.b) ultimo.b = Math.max(ultimo.b, p.b)
    else fusionados.push({ ...p })
  }
  return fusionados.map(p => ({
    desde: new Date(p.a).toISOString(), hasta: new Date(p.b).toISOString(),
  }))
}

/**
 * Los días en que **los dos** planes estaban al día (§52).
 *
 * Cuando el afiliado es una tienda, su propia suscripción es una segunda
 * condición: mientras él no pague su plan de Kross, sus referidas no le generan
 * comisión. La transacción cuenta solo si cae dentro de los tramos pagados de
 * la referida **y** dentro de los suyos.
 *
 * Es la misma regla de §51 aplicada un nivel más arriba, y por la misma razón:
 * la comisión es una parte del margen de un mes que Kross efectivamente cobró.
 * Si el que se lleva la parte dejó de pagar, ya no hay relación de la que salga.
 *
 * Las dos listas llegan **recortadas al mes y fusionadas** (`tramosDelPeriodo`),
 * así que basta un barrido en paralelo: sin solapes internos, los dos punteros
 * solo avanzan.
 */
export function interseccionDeTramos(
  a: readonly { desde: string; hasta: string }[],
  b: readonly { desde: string; hasta: string }[],
): { desde: string; hasta: string }[] {
  const salida: { desde: string; hasta: string }[] = []
  let i = 0; let j = 0
  while (i < a.length && j < b.length) {
    const ai = Date.parse(a[i].desde); const af = Date.parse(a[i].hasta)
    const bi = Date.parse(b[j].desde); const bf = Date.parse(b[j].hasta)
    const desde = Math.max(ai, bi)
    const hasta = Math.min(af, bf)
    if (hasta > desde) {
      salida.push({ desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString() })
    }
    // Avanza el que cierra primero: el otro todavía puede cruzarse con el
    // siguiente de esta lista.
    if (af < bf) i++
    else j++
  }
  return salida
}
