// ─── Quién lleva el paquete a la puerta ──────────────────────────────────────
//
// Kross reparte a domicilio de dos maneras, y son INDEPENDIENTES (15-set-2026):
//
//   · `home_delivery_enabled`  → el motorizado propio de la marca. Vale en todo
//     el país: donde la marca diga que llega, llega.
//   · `courier_lima_enabled`   → un courier tercero que reparte en Lima y
//     Callao. Solo ahí, porque es la zona que ese courier cubre.
//
// Una marca puede tener las dos, una, o ninguna. Con las dos, quién lleva CADA
// pedido lo decide el vendedor en el panel: son costos y plazos distintos y esa
// es una decisión del comercio, no del comprador.
//
// **El comprador ve lo mismo de siempre**: «a la puerta» o «en agencia». La
// empresa que reparte no es una opción suya —no la puede evaluar, no la eligió
// y no cambia lo que paga—, así que ponerla en el checkout solo agrega un tap.
//
// Puro y compartido: lo importan el reducer del checkout, el panel y
// `register-buyer`, para que la pantalla y el servidor digan lo mismo.

/** Cómo se reparte un pedido a domicilio. `null` = todavía sin decidir (la
 *  marca tiene las dos formas) o no aplica (el pedido va por agencia). */
export type Reparto = 'PROPIO' | 'COURIER'

export const REPARTOS: readonly Reparto[] = ['PROPIO', 'COURIER']

export const esReparto = (v: unknown): v is Reparto =>
  typeof v === 'string' && (REPARTOS as readonly string[]).includes(v)

/** Lo que una marca tiene contratado. Los dos campos llegan de `stores`. */
export interface FormasDeReparto {
  home_delivery_enabled?: boolean | null
  courier_lima_enabled?: boolean | null
}

/** Sin región todavía (el comprador no eligió distrito) manda la bandera
 *  general: el courier solo entra cuando ya se sabe que el pedido es de Lima. */
export type Region = 'LIMA' | 'PROVINCIA' | null

/**
 * ¿Esta marca reparte a la puerta en la región de ESTE pedido?
 *
 * La pregunta lleva la región porque el courier es solo de Lima y Callao: una
 * marca con courier y sin motorizado NO ofrece domicilio en Arequipa, y
 * ofrecerlo sería prometer una entrega que nadie va a hacer.
 */
export function ofreceDomicilio(t: FormasDeReparto, region: Region): boolean {
  if (t.home_delivery_enabled === true) return true
  return region === 'LIMA' && t.courier_lima_enabled === true
}

/**
 * Con qué reparto NACE un pedido a domicilio en Lima.
 *
 * Con una sola forma contratada no hay nada que decidir y se fija sola: el
 * vendedor abre el pedido y ya sabe por dónde va. Con las dos queda en `null` a
 * propósito —es una decisión suya, pedido por pedido— y el panel se la pide.
 * `null` también es lo correcto cuando no hay ninguna: ese pedido no va a
 * domicilio.
 */
export function repartoInicial(t: FormasDeReparto): Reparto | null {
  const propio = t.home_delivery_enabled === true
  const courier = t.courier_lima_enabled === true
  if (propio && courier) return null
  if (propio) return 'PROPIO'
  if (courier) return 'COURIER'
  return null
}

/** Las formas entre las que el vendedor puede elegir para un pedido. Vacío o de
 *  un solo elemento = no hay nada que preguntarle. */
export function repartosPosibles(t: FormasDeReparto): Reparto[] {
  const r: Reparto[] = []
  if (t.home_delivery_enabled === true) r.push('PROPIO')
  if (t.courier_lima_enabled === true) r.push('COURIER')
  return r
}

/** Cómo se llama cada forma en el panel. El comprador nunca lee esto. */
export const NOMBRE_DE_REPARTO: Record<Reparto, string> = {
  PROPIO: 'Motorizado propio',
  COURIER: 'Eva Courier (Lima y Callao)',
}
