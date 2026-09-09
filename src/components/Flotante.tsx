// ─── Una imagen de la marca, meciéndose ──────────────────────────────────────
//
// Vivía dentro de `BuyerLoginPage` y salió de ahí el 09-set-2026, cuando la
// misma imagen empezó a enmarcar también el pedido confirmado. Dos copias del
// mismo vaivén se despegan a la primera corrección —una queda con la sombra
// vieja, la otra sin `pointer-events`— y el comprador ve dos pantallas que se
// mueven distinto sin ninguna razón.
//
// Dónde va cada una NO se decide acá: lo dicen los sitios de `lib/degradado.ts`
// (`SITIOS_FLOTANTES` en el acceso, `ESQUINAS_DEL_PEDIDO` en el pedido). Este
// componente solo pinta el archivo en el sitio que le den.

import type { SitioFlotante } from '../lib/degradado'

/**
 * Una de las imágenes que la marca subió, meciéndose en bucle.
 *
 * En el acceso son tres: la del costado va DEBAJO de la tarjeta y es la que se
 * ve a través del vidrio —sin nada detrás, un `backdrop-filter` no se distingue
 * de un fondo plano—, y las otras dos pasan por delante mordiendo el borde, que
 * es lo que da la profundidad. En el pedido confirmado es una sola, repetida y
 * volteada en las dos esquinas de arriba.
 *
 * `aria-hidden` y `alt` vacío: son decoración. Un lector de pantalla leyendo
 * «imagen» tres veces antes del campo del DNI estorba y no informa de nada.
 */
export default function Flotante({ src, sitio }: { src: string; sitio: SitioFlotante }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      className="k-flota absolute select-none"
      style={{
        ...sitio.estilo,
        zIndex: sitio.detras ? 1 : 3,
        // Una imagen que flota no puede comerse el toque de un botón.
        pointerEvents: 'none',
        // El filtro le da peso al producto sobre el color: sin sombra, un PNG
        // recortado se ve pegado encima y no flotando.
        filter: 'drop-shadow(0 18px 28px rgba(0,0,0,0.28))',
        ['--ritmo' as string]: `${sitio.ritmo}s`,
        ['--altura' as string]: `${sitio.altura}px`,
        ['--deriva' as string]: `${sitio.deriva}px`,
        ['--giro' as string]: `${sitio.giro}deg`,
        // El espejo va DENTRO de la animación (`k-flotar`), porque el vaivén
        // también es `transform` y el último en aplicarse gana.
        ...(sitio.espejo ? { ['--espejo' as string]: '-1' } : {}),
      }}
    />
  )
}
