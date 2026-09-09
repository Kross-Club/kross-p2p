import { useCallback, useEffect, useState } from 'react'
import { claveDePregunta, proximoVencimiento, usadasVigentes } from './preguntas-rapidas'
import type { PreguntaRapida } from './preguntas-rapidas'

// ─── Qué preguntas rápidas se tocaron hace poco, en ESTE pedido ──────────────
// Vive en el dispositivo (`localStorage` por token): recargar la página no
// vuelve a encender lo que se acaba de tocar. Las reglas —cinco minutos, la
// marca es de la pregunta con su respuesta— son puras y están en
// `preguntas-rapidas.ts`; acá solo se guardan y se vencen. Lo que devuelve
// son SOLO las marcas vivas: se podan al leer, al marcar y con un temporizador
// al vencer la más próxima, así el componente no tiene que mirar el reloj.

const clave = (token: string) => `kross-preguntas:${token}`

function leer(token: string): Record<string, number> {
  try {
    const crudo = localStorage.getItem(clave(token))
    const v: unknown = crudo ? JSON.parse(crudo) : {}
    return usadasVigentes(v && typeof v === 'object' ? (v as Record<string, number>) : {}, Date.now())
  } catch {
    return {}
  }
}

function guardar(token: string, usadas: Record<string, number>) {
  try {
    if (Object.keys(usadas).length === 0) localStorage.removeItem(clave(token))
    else localStorage.setItem(clave(token), JSON.stringify(usadas))
  } catch {
    // Sin almacenamiento (navegación privada, cuota): la marca vive en memoria.
  }
}

export function usePreguntasUsadas(token: string) {
  const [estado, setEstado] = useState(() => ({ token, usadas: leer(token) }))

  // Otro pedido en la misma pantalla: lo suyo, no lo del anterior. Se ajusta
  // en el render (patrón de React para estado derivado de una prop), no en un
  // efecto: React descarta este pintado y vuelve a entrar con lo nuevo.
  if (estado.token !== token) setEstado({ token, usadas: leer(token) })
  const usadas = estado.usadas

  useEffect(() => { guardar(token, usadas) }, [token, usadas])

  // Al vencer la espera más próxima se recalcula: el botón se enciende solo.
  useEffect(() => {
    const falta = proximoVencimiento(usadas, Date.now())
    if (falta === null) return
    const t = setTimeout(() => {
      setEstado(e => ({ ...e, usadas: usadasVigentes(e.usadas, Date.now()) }))
    }, falta + 50)
    return () => clearTimeout(t)
  }, [usadas])

  const marcar = useCallback((q: PreguntaRapida) => {
    const ahora = Date.now()
    setEstado(e => ({ ...e, usadas: { ...usadasVigentes(e.usadas, ahora), [claveDePregunta(q)]: ahora } }))
  }, [])

  return [usadas, marcar] as const
}
