// ─── El enlace del afiliado, desde que se pisa hasta que hay tienda ──────────
//
// El afiliado reparte `krossclub.app/?ref=<codigo>`. Entre ese clic y el
// momento en que existe una tienda pasan días: el comerciante mira la web, se
// va, vuelve por Google, pregunta por WhatsApp y recién entonces se da de alta.
// Si el código solo viviera en la URL, la atribución se perdería en el primer
// clic a otra página — y el afiliado que hizo el trabajo no cobraría.
//
// Así que el código se guarda en el dispositivo hasta que el lead se manda
// (`web-order`), y de ahí en adelante vive en la base (§51.b del esquema).
//
// **Primer toque gana**, y es la regla que hace que el programa se pueda
// explicar en una frase: *si tú lo trajiste, es tuyo*. Con último toque, un
// afiliado que pauta sobre la marca se lleva los referidos que otro trabajó a
// mano — y a los dos les parece justo lo contrario, que es la peor forma de
// tener esta discusión. La ventana es de 90 días: pasado eso el toque venció y
// el siguiente empieza de cero.
//
// ⚠️ Esto NO es una llave y no decide nada por sí solo: quien atribuye la
// tienda es `manage-store`, contra la tabla de afiliados. Alguien que se
// escriba un código a mano en su propio `localStorage` consigue atribuirse un
// lead a un afiliado que existe — que es exactamente lo que consigue abriendo
// el enlace de ese afiliado.

import { codigoDeLaUrl } from '../../supabase/functions/_shared/afiliados.ts'

const CLAVE = 'kross-ref'

/** Cuánto dura un toque. Tres meses es el ciclo de decisión de un comerciante
 *  que está evaluando cambiar de herramienta; menos deja fuera al que se lo
 *  pensó, más convierte el crédito en una renta vitalicia por un clic. */
export const VENTANA_DIAS = 90

interface Toque {
  codigo: string
  /** Cuándo se pisó el enlace, en milisegundos. */
  at: number
}

function leer(): Toque | null {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return null
    const t = JSON.parse(raw) as Partial<Toque>
    if (typeof t?.codigo !== 'string' || !t.codigo) return null
    if (typeof t?.at !== 'number' || !Number.isFinite(t.at)) return null
    return { codigo: t.codigo, at: t.at }
  } catch {
    // Incógnito, storage bloqueado o un JSON corrupto de una versión anterior.
    // Sin toque se sigue navegando igual: esto nunca puede romper la web.
    return null
  }
}

const vencido = (t: Toque, ahora: number): boolean =>
  ahora - t.at > VENTANA_DIAS * 86_400_000

/**
 * Anota el código que trae la URL, si trae uno.
 *
 * Devuelve el código que queda vigente después de mirar —que puede ser el que
 * ya estaba—. Se llama una vez al arrancar la web pública.
 */
export function anotarReferido(url: string, ahora = Date.now()): string | null {
  const nuevo = codigoDeLaUrl(url)
  const previo = leer()
  const vigente = previo && !vencido(previo, ahora) ? previo : null

  // Primer toque gana: mientras el anterior siga vigente, un enlace nuevo no lo
  // pisa. Solo se escribe cuando no hay nada vigente que respetar.
  if (vigente) return vigente.codigo
  if (!nuevo) return null

  try {
    localStorage.setItem(CLAVE, JSON.stringify({ codigo: nuevo, at: ahora } satisfies Toque))
  } catch { /* sin storage el toque vale para esta pestaña y nada más */ }
  return nuevo
}

/** El código vigente, o `null`. Lo que se le adjunta al lead. */
export function referidoActual(ahora = Date.now()): string | null {
  const t = leer()
  if (!t || vencido(t, ahora)) return null
  return t.codigo
}

/** Lo borra. Se llama cuando el lead ya se mandó: a partir de ahí la
 *  atribución vive en la base, y dejarlo acá haría que el siguiente pedido
 *  desde el mismo navegador —otro comerciante, la misma laptop del contador—
 *  arrastrara un afiliado que no lo trajo. */
export function olvidarReferido() {
  try { localStorage.removeItem(CLAVE) } catch { /* nada que borrar */ }
}
