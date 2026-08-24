// ─── Ranking del select con búsqueda ─────────────────────────────────────────
// El filtro plano (`includes` en orden de dataset) enterraba al distrito más
// probable: tecleando "santiago" salían 24 coincidencias con Santiago de Surco
// en el puesto 23, detrás de 22 distritos rurales homónimos — el dataset viene
// ordenado por departamento alfabético y Amazonas va primero.
//
// Aquí se ordena por CÓMO coincide (empieza-con > palabra > contiene > detail),
// y dentro de cada nivel se respeta el orden de entrada. Ese orden es el prior:
// quien arma las opciones decide qué va primero entre iguales (cercanía por
// geo-IP, Lima metro, cobertura…) sin que este módulo sepa de distritos.

interface Rankable {
  label: string
  detail?: string
}

/** Minúsculas y sin tildes: "María" y "maria" tienen que encontrarse. El filtro
 *  viejo era sensible a acentos y "ancash" no hallaba "Áncash". */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Qué tan bien coincide una opción con lo tecleado. Menor = mejor; -1 = nada.
 *
 *   0 · el nombre empieza con lo tecleado        ("surco" → Surco)
 *   1 · una palabra del nombre empieza con eso   ("surco" → Santiago de Surco)
 *   2 · el nombre lo contiene                     (subcadena interna)
 *   3 · coincide por el detail (provincia, dpto)  ("cusco" → distritos de Cusco)
 */
export function matchTier(option: Rankable, query: string): number {
  const q = fold(query)
  const label = fold(option.label)
  if (label.startsWith(q)) return 0
  if (label.split(' ').some(w => w.startsWith(q))) return 1
  if (label.includes(q)) return 2
  if (fold(option.detail ?? '').includes(q)) return 3
  return -1
}

/**
 * Filtra y ordena las opciones para lo tecleado. Sin query devuelve las
 * primeras `limit` tal cual llegan — el orden de entrada ES la sugerencia.
 * El sort es estable, así que dentro de un mismo tier ese orden se conserva.
 */
export function rankOptions<T extends Rankable>(options: T[], query: string, limit: number): T[] {
  const q = query.trim()
  if (!q) return options.slice(0, limit)
  return options
    .map(o => ({ o, tier: matchTier(o, q) }))
    .filter(r => r.tier >= 0)
    .sort((a, b) => a.tier - b.tier)
    .slice(0, limit)
    .map(r => r.o)
}
