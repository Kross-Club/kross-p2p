// ─── SMART LOGISTICS · Geometría de cobertura ────────────────────────────────
// Punto-en-polígono y distancia al borde. Funciones puras, sin dependencias, sin
// React. Las consume CoverageService para decidir si el motorizado llega hasta la
// puerta del comprador. Ver docs/02-SMART-LOGISTICS.md.
//
// Convención de coordenadas: [lng, lat], igual que GeoJSON (NO [lat, lng]).

/** Un punto `[lng, lat]`. */
export type Position = [number, number]

/** Anillo cerrado: el primer y último punto coinciden. */
export type Ring = Position[]

/** Polígono con un contorno exterior y N agujeros (zonas excluidas). */
export interface Polygon {
  outer: Ring
  holes: Ring[]
}

/**
 * ¿Está el punto dentro del anillo? Ray casting horizontal: se cuenta cuántas
 * aristas cruza un rayo que sale del punto hacia +∞ en X. Impar = dentro.
 *
 * Los puntos exactamente sobre el borde son un caso indefinido de este algoritmo
 * (pueden dar dentro o fuera según la arista). No importa aquí: a esa escala la
 * respuesta la decide igual el umbral de BORDERLINE, no el borde exacto.
 */
export function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]

    // ¿La arista cruza la horizontal del punto? Los tests `>` vs `<=` están
    // deliberadamente asimétricos: así un vértice a la altura exacta del rayo se
    // cuenta una sola vez y no se duplica el cruce.
    const crosses = yi > y !== yj > y
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }

  return inside
}

/** Dentro del contorno exterior y fuera de todos los agujeros. */
export function pointInPolygon(point: Position, polygon: Polygon): boolean {
  if (!pointInRing(point, polygon.outer)) return false
  return !polygon.holes.some(hole => pointInRing(point, hole))
}

/** ¿Cae el punto en alguno de los polígonos? */
export function pointInAny(point: Position, polygons: Polygon[]): boolean {
  return polygons.some(p => pointInPolygon(point, p))
}

// ─── Distancia al borde (para detectar zonas limítrofes) ─────────────────────

/** Distancia en metros de un punto a un segmento, proyectando a plano local. */
function distanceToSegmentM(p: Position, a: Position, b: Position): number {
  // A escala de ciudad, aplanar con cos(lat) da un error despreciable y evita
  // trigonometría por cada arista (son miles).
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((p[1] * Math.PI) / 180)

  const px = p[0] * mPerDegLng, py = p[1] * mPerDegLat
  const ax = a[0] * mPerDegLng, ay = a[1] * mPerDegLat
  const bx = b[0] * mPerDegLng, by = b[1] * mPerDegLat

  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  // Segmento degenerado (dos vértices idénticos): distancia al punto.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Distancia en metros al borde más cercano del polígono (contorno o agujero),
 * esté el punto dentro o fuera. Es lo que permite marcar BORDERLINE: un punto
 * dentro pero a 200 m del límite es una promesa de entrega frágil.
 */
export function distanceToEdgeM(point: Position, polygon: Polygon): number {
  let min = Infinity
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const d = distanceToSegmentM(point, ring[j], ring[i])
      if (d < min) min = d
    }
  }
  return min
}

/** La menor distancia al borde entre varios polígonos. */
export function nearestEdgeM(point: Position, polygons: Polygon[]): number {
  return polygons.reduce((min, p) => Math.min(min, distanceToEdgeM(point, p)), Infinity)
}

/** ¿Está el punto dentro del bounding box `[minLng, minLat, maxLng, maxLat]`? */
export function inBbox(point: Position, bbox: [number, number, number, number]): boolean {
  return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3]
}
