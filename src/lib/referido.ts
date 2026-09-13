// ─── El enlace del afiliado, desde que se pisa hasta que hay tienda ──────────
//
// El afiliado reparte `krossclub.app/u/48291733`. Entre ese clic y el momento
// en que existe una tienda pasan días: el comerciante mira la web, se va, vuelve
// por Google, pregunta por WhatsApp y recién entonces se da de alta. Si la
// referencia solo viviera en la URL, la atribución se perdería en el primer
// clic a otra página — y el afiliado que hizo el trabajo no cobraría.
//
// Así que se guarda en el dispositivo hasta que el lead se manda (`web-order`),
// y de ahí en adelante vive en la base (§51.b).
//
// ⚠️ **Último toque gana** (§53). Manda el enlace más reciente: quien entre por
// el de otro afiliado queda atribuido a ese otro, aunque antes hubiera pisado
// uno. Es lo contrario de lo que hacía la primera versión, y es una decisión de
// negocio, no un detalle técnico — con primer toque, el afiliado que de verdad
// convenció al comerciante pierde el crédito contra otro cuyo enlace se pisó de
// pasada semanas antes. La ventana es de **30 días**: pasado eso el toque venció
// y no hay nada que reemplazar.
//
// ⚠️ Esto NO es una llave y no decide nada por sí solo: quien atribuye la tienda
// es `manage-store`, contra la tabla de afiliados. Alguien que se escriba una
// referencia a mano en su propio `localStorage` consigue atribuirse un lead a un
// afiliado que existe — que es exactamente lo que consigue abriendo el enlace de
// ese afiliado.

import { refDeLaUrl } from '../../supabase/functions/_shared/afiliados.ts'

const CLAVE = 'kross-ref'

/** Cuánto dura un toque. Un mes es el ciclo de decisión de un comerciante que
 *  está evaluando cambiar de herramienta; más convierte el crédito en una renta
 *  vitalicia por un clic. */
export const VENTANA_DIAS = 30

interface Toque {
  /** `public_id` del enlace nuevo, o el `codigo` de uno anterior. El servidor
   *  resuelve las dos formas. */
  ref: string
  /** Cuándo se pisó el enlace, en milisegundos. */
  at: number
}

function leer(): Toque | null {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return null
    const t = JSON.parse(raw) as Partial<Toque> & { codigo?: unknown }
    // `codigo` es la forma que guardaba la versión anterior. Se acepta al leer
    // para no perder la atribución de quien ya tenía un toque guardado: el
    // servidor resuelve código o public_id indistintamente.
    const ref = typeof t?.ref === 'string' && t.ref ? t.ref
      : typeof t?.codigo === 'string' && t.codigo ? t.codigo
        : null
    if (!ref) return null
    if (typeof t?.at !== 'number' || !Number.isFinite(t.at)) return null
    return { ref, at: t.at }
  } catch {
    // Incógnito, storage bloqueado o un JSON corrupto de una versión anterior.
    // Sin toque se sigue navegando igual: esto nunca puede romper la web.
    return null
  }
}

const vencido = (t: Toque, ahora: number): boolean =>
  ahora - t.at > VENTANA_DIAS * 86_400_000

function guardar(ref: string, ahora: number) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ref, at: ahora } satisfies Toque))
  } catch { /* sin storage el toque vale para esta pestaña y nada más */ }
}

/**
 * Anota la referencia que trae la URL, si trae una.
 *
 * Devuelve la que queda vigente después de mirar. **Un enlace nuevo siempre
 * pisa al anterior**, esté vencido o no (§53): el toque más reciente es el que
 * manda.
 */
export function anotarReferido(url: string, ahora = Date.now()): string | null {
  const nuevo = refDeLaUrl(url)
  if (nuevo) { guardar(nuevo, ahora); return nuevo }

  const previo = leer()
  return previo && !vencido(previo, ahora) ? previo.ref : null
}

/** La referencia vigente, o `null`. Lo que se le adjunta al lead. */
export function referidoActual(ahora = Date.now()): string | null {
  const t = leer()
  if (!t || vencido(t, ahora)) return null
  return t.ref
}

/** Lo borra. Se llama cuando el lead ya se mandó: a partir de ahí la
 *  atribución vive en la base, y dejarlo acá haría que el siguiente pedido
 *  desde el mismo navegador —otro comerciante, la misma laptop del contador—
 *  arrastrara un afiliado que no lo trajo. */
export function olvidarReferido() {
  try { localStorage.removeItem(CLAVE) } catch { /* nada que borrar */ }
}
