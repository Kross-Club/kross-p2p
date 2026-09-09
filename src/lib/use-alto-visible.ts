import { useEffect, useState } from 'react'

// ─── El alto que de verdad se ve ─────────────────────────────────────────────
//
// En iPhone, `100vh` y `100dvh` NO se achican cuando sale el teclado: Safari
// desplaza la página y el campo de texto con su botón de enviar quedan debajo
// del teclado — "no tenía la opción de enviar". `visualViewport` sí sabe cuánto
// queda visible: con el teclado abierto la pantalla se mide con eso y se
// devuelve el scroll al tope, para que el chat siga cabiendo entero.
//
// Devuelve `undefined` mientras el teclado está cerrado: ahí manda el CSS.
export function useAltoVisible(): number | undefined {
  const [alto, setAlto] = useState<number | undefined>(undefined)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const medir = () => {
      const teclado = window.innerHeight - vv.height > 120
      setAlto(teclado ? Math.round(vv.height) : undefined)
      if (teclado) window.scrollTo(0, 0)
    }
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
    }
  }, [])
  return alto
}
