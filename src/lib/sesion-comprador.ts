// ─── La sesión del comprador, en el dispositivo ─────────────────────────────
//
// Vive en `localStorage` bajo `buyer_session` y la leen tres pantallas. Estaba
// escrita a mano en las tres, con un `JSON.parse` suelto y su `try` propio.
//
// Desde el 09-set-2026 lleva `session_token`: el que emite el servidor al
// verificar el código de WhatsApp. Antes la sesión ERA el JSON —cualquiera lo
// editaba en la consola para decir que era otro— y el refresco se pedía con el
// DNI, que es justo lo que dejó de valer como llave.
//
// Una sesión SIN token es de antes de este cambio: se acepta para no botar a
// nadie de golpe, pero el servidor decide si todavía sirve. Donde la marca ya
// manda códigos, ese refresco responde 403 y la persona vuelve a entrar.

const CLAVE = 'buyer_session'

export interface CompradorGuardado {
  id: string
  nombre: string
  phone: string
  document_number?: string
  score: number
  puntos: number
  address: string | null
}

export interface PedidoGuardado {
  id: string
  token: string
  order_id: string
  product_name: string
  product_price: number
  pack_name: string | null
  stage: string
  status: string
  created_at: string
  address: string | null
  unread_count?: number
}

export interface SesionComprador {
  /** El token de sesión del servidor. Falta en las sesiones viejas. */
  session_token?: string | null
  buyer: CompradorGuardado
  sessions: PedidoGuardado[]
}

export function leerSesion(): SesionComprador | null {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return null
    const s = JSON.parse(raw) as SesionComprador
    return s?.buyer?.id ? s : null
  } catch {
    return null
  }
}

/** Guarda la sesión y avisa a quien esté escuchando (la barra del chat). */
export function guardarSesion(s: SesionComprador): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(s)) } catch { /* ignore */ }
  window.dispatchEvent(new Event('buyer-session-changed'))
}

/** Guarda sin avisar: es el mismo comprador, solo con datos más frescos. */
export function refrescarSesion(s: SesionComprador): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(s)) } catch { /* ignore */ }
}

export const tokenDeSesion = (): string | null => leerSesion()?.session_token ?? null

/** Borra la sesión del dispositivo. Quien la cierra de verdad —invalidando el
 *  token para todos los dispositivos— es `buyer-login` con `logout`. */
export function olvidarSesion(): void {
  try { localStorage.removeItem(CLAVE) } catch { /* ignore */ }
  window.dispatchEvent(new Event('buyer-session-changed'))
}
