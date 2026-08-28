// ─── Dibujar el Perú ─────────────────────────────────────────────────────────
//
// Se llamaba `live-map.ts` y traía además las reglas del mapa de pedidos EN
// VIVO —dónde va el paquete entre dos sedes, cómo va su pago—. Ese mapa se
// eliminó (28-ago-2026): mostraba cajas moviéndose sobre líneas rectas que no
// son rutas, y la pregunta que decía responder —"¿dónde está la plata que ya
// salió?"— la responde mejor el Tablero, donde además se puede actuar.
//
// Lo que sobrevive es lo único que no dependía de esa pantalla: la proyección
// del país sobre un lienzo. La usa el mapa de entregas por distrito, y la usará
// cualquier otro que venga.
//
// Los datos del territorio viven en `src/data/coverage/` y se cargan con
// `import()` diferido: silueta, celdas de provincia y departamento, y los
// centroides por distrito. Ninguna pantalla depende de un proveedor de mapas.

export interface Caja { minLng: number; maxLng: number; minLat: number; maxLat: number }

/**
 * Proyección plana del país sobre el lienzo. A escala nacional hay que
 * corregir la longitud por el coseno de la latitud o el Perú sale gordo.
 */
export function proyector(caja: Caja, ancho: number, alto: number) {
  const latMedia = (caja.minLat + caja.maxLat) / 2
  const kx = Math.cos((latMedia * Math.PI) / 180)
  const escala = Math.min(
    ancho / ((caja.maxLng - caja.minLng) * kx),
    alto / (caja.maxLat - caja.minLat),
  )
  return {
    x: (lng: number) => (lng - caja.minLng) * kx * escala,
    y: (lat: number) => (caja.maxLat - lat) * escala,
    escala,
  }
}

/** El camino SVG de un anillo de coordenadas ya proyectado. */
export function caminoDe(
  anillo: number[][],
  x: (lng: number) => number,
  y: (lat: number) => number,
): string {
  return anillo.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ') + ' Z'
}
