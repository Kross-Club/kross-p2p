// ─── Dónde se está entregando ────────────────────────────────────────────────
//
// El mapa de la libreta de clientes: el Perú con un punto por distrito, del
// tamaño de lo que se entregó ahí. Responde la pregunta que ninguna pantalla
// respondía —**dónde está la demanda**— y la responde sobre lo ENTREGADO, no
// sobre lo pedido: un distrito con veinte pedidos y cinco entregas no es un
// buen distrito, es un problema de logística disfrazado de demanda.
//
// Por qué es un módulo aparte y puro: la geografía se resuelve con catálogos
// que se cargan aparte (las sedes de los couriers, el padrón del INEI, los
// centroides) y la pantalla no debería saber de ninguno. Acá viven las reglas;
// quién resuelve cada dirección se le pasa como función.
//
// Todo lo que no se puede ubicar se cuenta aparte y se dice. Un mapa que
// silencia lo que no supo colocar hace creer que el país entero cabe en sus
// puntos.

export interface GrupoEntrega {
  /** `SHALOM` | `OLVA` para recojo; `null` a domicilio. */
  courier: string | null
  /** La sede de recojo. Es el dato bueno: trae distrito Y coordenadas. */
  branch_id: string | null
  /** "Distrito, Provincia, Departamento" — la dirección del pedido a domicilio.
   *  El formato varía según la rama del checkout (ver `addressOf` en
   *  OrderService), y por eso se resuelve contra el padrón y no partiendo por
   *  comas a ciegas. */
  address: string | null
  product_id: string | null
  product_name: string | null
  /** Cuántos pedidos ENTREGADOS de ese producto llegaron a ese sitio. */
  pedidos: number
  /** Cuánto facturaron. En un pedido entregado el saldo se cobró en la puerta o
   *  en el mostrador, así que lo pagado es el valor del pedido —no el adelanto
   *  verificado, que es solo la parte que pasó por 360pay. */
  valor: number
}

/** Un punto del mapa. */
export interface DistritoEntregas {
  /** `DEPARTAMENTO|DISTRITO`, normalizado. */
  key: string
  distrito: string
  departamento: string
  lat: number
  lng: number
  pedidos: number
  valor: number
  /** Qué se entregó ahí, del más vendido al menos. Es la otra mitad de la
   *  pregunta: el filtro de arriba dice dónde funciona UN producto; esto dice
   *  qué funciona en UN distrito, que es lo que decide qué mandar a esa zona. */
  porProducto: { id: string | null; nombre: string; pedidos: number; valor: number }[]
}

export interface Ubicacion {
  distrito: string
  departamento: string
  lat: number
  lng: number
}

const sinAcento = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export const normalizar = (s: string | null | undefined): string =>
  sinAcento(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/** Departamento y distrito bastan: el padrón no tiene dos distritos con el
 *  mismo nombre dentro de un departamento, y es la misma llave que usan los
 *  centroides. */
export const claveDistrito = (departamento: string, distrito: string): string =>
  `${normalizar(departamento)}|${normalizar(distrito)}`

/**
 * Un nombre de sitio, escrito como se escribe.
 *
 * Los catálogos de los couriers vienen EN MAYÚSCULAS y el padrón del INEI en
 * capitalización normal. Mezclados en una misma lista —"LA VICTORIA" encima de
 * "Lima"— se leen como dos clases de dato, y la de mayúsculas grita.
 *
 * Las palabras cortas de enlace van en minúscula, salvo al principio: "San Juan
 * de Lurigancho", no "San Juan De Lurigancho".
 */
const ENLACES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'EL'])
export function titulo(s: string): string {
  return s.trim().split(/\s+/).map((w, i) => {
    const u = w.toUpperCase()
    if (i > 0 && ENLACES.has(sinAcento(u))) return w.toLowerCase()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

// ─── Leer un distrito de una dirección escrita ───────────────────────────────
//
// `address` no tiene un formato fijo: el checkout lo arma distinto en cada rama
// (`addressOf` en OrderService).
//
//   Lima, domicilio    → "Av. Larco 123, Miraflores"        (sin departamento)
//   Lima, agencia      → "Miraflores, Lima"
//   Provincia domicilio→ "Jr. Union 44, Aramango, Bagua"    (sin departamento)
//   Provincia agencia  → "Aramango, Bagua, Amazonas"
//
// Partir por comas y asumir una posición falla en tres de los cuatro. Lo que sí
// es estable es que **el nombre del distrito está ahí escrito**, así que se
// busca contra el padrón: se recorren las partes de la última a la primera y
// gana la primera que sea un distrito conocido.
//
// Los homónimos —hay un Miraflores en Lima y otro en Arequipa— se desempatan
// con el resto de la dirección: si otra parte nombra la provincia o el
// departamento de uno de los candidatos, ese gana. Si no se puede desempatar,
// **no se adivina**: se devuelve `null` y el pedido va al conteo de "sin
// ubicar". Un punto en el distrito equivocado es peor que un punto que falta —
// el que falta se ve como falta, el equivocado se lee como dato.

export interface DistritoPadron {
  department: string
  province: string
  district: string
}

/** Índice del padrón por nombre de distrito. Se arma una vez y se reutiliza. */
export function indicePadron(padron: DistritoPadron[]): Map<string, DistritoPadron[]> {
  const idx = new Map<string, DistritoPadron[]>()
  for (const d of padron) {
    const k = normalizar(d.district)
    const ya = idx.get(k)
    if (ya) ya.push(d)
    else idx.set(k, [d])
  }
  return idx
}

export function distritoDeDireccion(
  address: string | null | undefined,
  idx: Map<string, DistritoPadron[]>,
): DistritoPadron | null {
  const partes = (address ?? '').split(',').map(p => normalizar(p)).filter(Boolean)
  if (!partes.length) return null

  // De atrás hacia adelante: la parte más específica —la calle— va primero y es
  // justamente la que nunca es un distrito.
  for (let i = partes.length - 1; i >= 0; i--) {
    const candidatos = idx.get(partes[i])
    if (!candidatos?.length) continue
    if (candidatos.length === 1) return candidatos[0]

    // Homónimos: que otra parte de la dirección nombre su provincia o su
    // departamento. `otras` excluye la parte que dio el nombre para que un
    // distrito llamado igual que su provincia (Arequipa, Ica, Tacna…) no se
    // desempate consigo mismo.
    const otras = partes.filter((_, j) => j !== i)
    const gana = candidatos.filter(c =>
      otras.includes(normalizar(c.province)) || otras.includes(normalizar(c.department)))
    if (gana.length === 1) return gana[0]
    return null
  }
  return null
}

// ─── Dónde cae cada grupo ────────────────────────────────────────────────────

export interface CatalogosGeo {
  /** Sede → dónde está. Llave `COURIER:id`, igual que `pointKey` en
   *  AgencyService: los ids solo son únicos DENTRO de cada courier — Shalom
   *  tiene una sede "4" y Olva también. */
  sedes: Map<string, Ubicacion>
  padron: Map<string, DistritoPadron[]>
  /** Centroide por `DEPARTAMENTO|DISTRITO`. Solo existen los ~380 distritos
   *  donde algún courier tiene sede, que es donde se entrega. */
  centroides: Record<string, { lat: number; lng: number }>
}

/**
 * El resolutor de geografía del mapa. Vive acá y no en la pantalla porque el
 * demo y la pantalla tienen que ubicar EXACTAMENTE igual: con dos copias, el
 * mapa de ejemplo podría verse bien mientras el real deja todo sin ubicar.
 *
 * **La sede manda sobre la dirección.** En un pedido por agencia el `address`
 * es el distrito del COMPRADOR, no el de la sede donde recoge: un pedido de
 * Chaclacayo que se recoge en Huaycán se contaría en Chaclacayo (la misma
 * trampa que documenta `ubicacion.ts`).
 *
 * Sin centroide no se coloca. Se podría caer al centro de la provincia o del
 * departamento —`getDistrictCenter` lo hace, y para ordenar agencias por
 * cercanía está bien— pero acá pondría un punto rotulado con el nombre de un
 * distrito en un sitio donde ese distrito no está. Mejor contarlo en "sin
 * ubicar" y decirlo.
 */
export function ubicadorDe(cat: CatalogosGeo): (g: GrupoEntrega) => Ubicacion | null {
  // El catálogo de los couriers escribe los distritos EN MAYÚSCULAS y sin
  // tildes ("BRENA"); el padrón los tiene bien escritos. Cuando el nombre existe
  // en el padrón del mismo departamento, gana el padrón. Cuando no —los
  // couriers tienen sedes con nombres suyos, "ATE-VITARTE", "CERCADO LIMA"— se
  // capitaliza lo que hay, para que la lista no mezcle dos tipografías.
  const bonito = (distrito: string, departamento: string): { distrito: string; departamento: string } => {
    const canon = cat.padron.get(normalizar(distrito))
      ?.find(d => normalizar(d.department) === normalizar(departamento))
    return canon
      ? { distrito: canon.district, departamento: canon.department }
      : { distrito: titulo(distrito), departamento: titulo(departamento) }
  }

  return (g: GrupoEntrega): Ubicacion | null => {
    if (g.courier && g.branch_id) {
      const sede = cat.sedes.get(`${g.courier}:${g.branch_id}`)
      if (sede) return { ...sede, ...bonito(sede.distrito, sede.departamento) }
    }
    const d = distritoDeDireccion(g.address, cat.padron)
    if (!d) return null
    const c = cat.centroides[claveDistrito(d.department, d.district)]
    return c ? { distrito: d.district, departamento: d.department, lat: c.lat, lng: c.lng } : null
  }
}

// ─── Del grupo al punto ──────────────────────────────────────────────────────

export interface MapaDeEntregas {
  distritos: DistritoEntregas[]
  /** Lo que no se pudo colocar en el mapa. Se cuenta y se dice: un total en la
   *  esquina que no cuadra con la suma de los puntos destruye la confianza en
   *  toda la pantalla. */
  sinUbicar: { pedidos: number; valor: number }
  pedidos: number
  valor: number
}

/**
 * Junta los grupos en puntos de distrito.
 *
 * `ubicar` es lo que sabe de geografía —resuelve la sede o la dirección— y vive
 * afuera: acá no se importa ningún catálogo, y por eso esto se puede probar sin
 * cargar 260 KB de JSON.
 */
export function agruparPorDistrito(
  grupos: GrupoEntrega[],
  ubicar: (g: GrupoEntrega) => Ubicacion | null,
): MapaDeEntregas {
  const porDistrito = new Map<string, DistritoEntregas>()
  const sinUbicar = { pedidos: 0, valor: 0 }
  let pedidos = 0
  let valor = 0

  for (const g of grupos) {
    pedidos += g.pedidos
    valor += g.valor
    const u = ubicar(g)
    if (!u) {
      sinUbicar.pedidos += g.pedidos
      sinUbicar.valor += g.valor
      continue
    }
    const key = claveDistrito(u.departamento, u.distrito)
    let d = porDistrito.get(key)
    if (!d) {
      d = {
        key, distrito: u.distrito, departamento: u.departamento,
        lat: u.lat, lng: u.lng, pedidos: 0, valor: 0, porProducto: [],
      }
      porDistrito.set(key, d)
    }
    d.pedidos += g.pedidos
    d.valor += g.valor

    const linea = d.porProducto.find(p => p.id === g.product_id)
    if (linea) {
      linea.pedidos += g.pedidos
      linea.valor += g.valor
    } else {
      d.porProducto.push({
        id: g.product_id,
        nombre: g.product_name ?? 'Sin producto',
        pedidos: g.pedidos,
        valor: g.valor,
      })
    }
  }

  // De mayor a menor: el orden decide quién se pinta encima cuando dos puntos
  // se solapan, y el que manda es el chico — si no, Lima tapa a Callao.
  const distritos = [...porDistrito.values()].sort((a, b) => b.pedidos - a.pedidos)
  for (const d of distritos) d.porProducto.sort((a, b) => b.pedidos - a.pedidos)
  return { distritos, sinUbicar, pedidos, valor }
}

/** Los productos que aparecen en el mapa, del más entregado al menos. Es lo que
 *  llena el filtro: un filtro con opciones que no existen en el dato enseña a
 *  desconfiar de él. */
export function productosDe(grupos: GrupoEntrega[]): { id: string; nombre: string; pedidos: number }[] {
  const m = new Map<string, { id: string; nombre: string; pedidos: number }>()
  for (const g of grupos) {
    if (!g.product_id) continue
    const ya = m.get(g.product_id)
    if (ya) ya.pedidos += g.pedidos
    else m.set(g.product_id, { id: g.product_id, nombre: g.product_name ?? 'Producto', pedidos: g.pedidos })
  }
  return [...m.values()].sort((a, b) => b.pedidos - a.pedidos)
}

/** `null` = todos. Filtrar acá y no al pintar mantiene el total, el mapa y la
 *  lista contando exactamente lo mismo. */
export function filtrarPorProducto(grupos: GrupoEntrega[], productId: string | null): GrupoEntrega[] {
  return productId ? grupos.filter(g => g.product_id === productId) : grupos
}

/**
 * El radio del punto, por RAÍZ del conteo.
 *
 * Es el ÁREA la que se lee como cantidad, no el radio: escalando el radio en
 * proporción directa, un distrito con el cuádruple de pedidos se ve dieciséis
 * veces más grande y el mapa miente a favor de Lima.
 *
 * `min` rompe esa proporción a propósito en el extremo de abajo: un distrito de
 * un pedido saldría de medio píxel y no se vería. Un punto exacto que nadie
 * puede ver informa menos que uno mínimo que sí.
 */
export function radioDe(pedidos: number, maximo: number, min = 3, max = 22): number {
  if (pedidos <= 0 || maximo <= 0) return 0
  return min + (max - min) * Math.sqrt(Math.min(1, pedidos / maximo))
}
