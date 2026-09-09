// ─── La sesión del comprador y lo que ve al entrar ──────────────────────────
//
// Lo escriben TRES puertas —`buyer-login` (el auto-login desde un pedido),
// `buyer-code-verify` (el código de WhatsApp) y el refresco de «Mis pedidos»—
// y las tres tienen que devolver exactamente lo mismo. Duplicado, el día que
// alguien agregue un campo a una, las otras dos enseñan un pedido a medias.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { venceLaSesion } from './acceso-comprador.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

export const CAMPOS_COMPRADOR =
  'id, nombre, phone, document_type, document_number, score, puntos, address'

/**
 * El HMAC de un código de acceso. El código NO se guarda en claro: si la tabla
 * se filtrara, seis dígitos en claro son seis dígitos regalados. Con HMAC hace
 * falta además la llave, que nunca sale del servidor.
 *
 * El id de la fila entra en el mensaje: así el mismo código en dos filas
 * distintas no produce el mismo hash, y una tabla filtrada no deja agrupar
 * quiénes tuvieron el mismo número.
 *
 * Vive acá, y no en `acceso-comprador.ts`, porque aquel es puro y lo importa
 * `npm test`, donde no hay `Deno.env`. Y no en la función que lo emite, porque
 * importar el `index.ts` de otra función levantaría un segundo servidor.
 */
export async function hashDeCodigo(codigo: string, id: string): Promise<string> {
  const llave = Deno.env.get('BUYER_CODE_PEPPER') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(llave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}:${codigo}`))
  return [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Un token opaco de 32 bytes. No se deriva de nada del comprador: adivinarlo
 *  tiene que ser imposible, y derivarlo del DNI sería volver al principio. */
export function nuevoToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Abre una sesión para este comprador y devuelve su token. */
export async function crearSesion(buyerId: string, storeId: string | null): Promise<string | null> {
  const token = nuevoToken()
  const { error } = await supabase.from('buyer_sessions').insert({
    token, buyer_id: buyerId, store_id: storeId,
    expires_at: venceLaSesion(new Date()).toISOString(),
  })
  if (error) {
    console.error('[sesion-comprador] no se pudo abrir la sesión', error.message)
    return null
  }
  return token
}

/** El comprador dueño de una sesión viva, o `null`. Una sesión vencida no se
 *  borra acá —eso es tarea de limpieza— simplemente deja de valer. */
export async function compradorDeSesion(token: string): Promise<Record<string, unknown> | null> {
  const { data: fila } = await supabase
    .from('buyer_sessions')
    .select('buyer_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!fila) return null
  if (new Date(fila.expires_at as string).getTime() <= Date.now()) return null

  const { data: buyer } = await supabase
    .from('buyers').select(CAMPOS_COMPRADOR).eq('id', fila.buyer_id as string).maybeSingle()
  if (!buyer) return null
  await supabase.from('buyer_sessions')
    .update({ last_seen_at: new Date().toISOString() }).eq('token', token)
  return buyer as Record<string, unknown>
}

/** Cierra una sesión. Cerrar sesión tiene que dejar el token inservible: si
 *  solo se borrara del dispositivo, seguiría abriendo la cuenta desde otro. */
export async function cerrarSesion(token: string): Promise<void> {
  await supabase.from('buyer_sessions').delete().eq('token', token)
}

export interface PayloadDeComprador {
  buyer: Record<string, unknown>
  sessions: Record<string, unknown>[]
  welcome: { points: number; msg: string | null } | null
}

/**
 * Los pedidos del comprador, sus «sin leer», y la recompensa de bienvenida si
 * le toca (una sola vez, para el cliente importado que activa su app).
 */
export async function payloadDeComprador(
  buyer: Record<string, unknown>, storeId?: string | null,
): Promise<PayloadDeComprador> {
  const buyerId = buyer.id as string

  const { data: byId } = await supabase
    .from('order_sessions')
    .select('id, token, order_id, product_name, product_price, pack_name, stage, status, created_at, address')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })
  const sessions = (byId ?? []) as Record<string, unknown>[]

  // Retención: marcar activación (primer ingreso) y acreditar la bienvenida.
  let welcome: { points: number; msg: string | null } | null = null
  const { data: full } = await supabase
    .from('buyers').select('welcome_granted, activated_at, store_id, puntos').eq('id', buyerId).maybeSingle()
  const patch: Record<string, unknown> = {}
  if (full && !full.activated_at) patch.activated_at = new Date().toISOString()
  if (full && !full.welcome_granted) {
    const sid = storeId || full.store_id
    const { data: store } = sid
      ? await supabase.from('stores').select('welcome_points, welcome_msg').eq('id', sid).maybeSingle()
      : { data: null }
    const pts = store?.welcome_points ?? 0
    if (pts > 0) {
      patch.welcome_granted = true
      patch.puntos = (full.puntos ?? 0) + pts
      buyer.puntos = patch.puntos
      welcome = { points: pts, msg: store?.welcome_msg ?? null }
    }
  }
  if (Object.keys(patch).length > 0) await supabase.from('buyers').update(patch).eq('id', buyerId)

  // Los «sin leer» de cada pedido, para el globito de la lista.
  if (sessions.length > 0) {
    const ids = sessions.map(s => s.id as string)
    const { data: unreadMsgs } = await supabase
      .from('chat_messages')
      .select('session_id')
      .in('session_id', ids)
      .in('sender_role', ['seller', 'system'])
      .is('read_at', null)
    const counts: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) counts[m.session_id as string] = (counts[m.session_id as string] ?? 0) + 1
    for (const s of sessions) s.unread_count = counts[s.id as string] ?? 0
  }

  return { buyer, sessions, welcome }
}
