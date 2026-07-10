const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface OrderSession {
  id: string
  order_id: string
  store_id: string | null
  buyer_id: string | null
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  pack_name: string | null
  status: 'active' | 'delivered' | 'rejected' | 'expired'
  stage: 'nuevo' | 'confirmado' | 'preparando' | 'en_camino' | 'entregado'
  expires_at: string | null
  seller_name: string | null
  seller_role: string | null
  seller_avatar: string | null
  assigned_seller_id?: string | null
  involved_seller_ids?: string[] | null
  writer_seller_ids?: string[] | null
  participants?: Participant[]
}

export interface Participant {
  id: string
  nombre: string
  role_label: string
  avatar_url: string | null
  can_write: boolean
}

export interface OrderMessage {
  id: string
  session_id: string
  sender_role: 'buyer' | 'seller' | 'courier' | 'system' | 'sofia'
  sender_name: string | null
  sender_role_label?: string | null
  type: 'text' | 'audio' | 'image' | 'call_log' | 'status_update'
  body: string | null
  media_url: string | null
  created_at: string
  read_at: string | null
}

export interface SessionData {
  session: OrderSession
  messages: OrderMessage[]
}

export async function getSession(token: string): Promise<SessionData> {
  const res = await fetch(`${BASE}/get-session`, {
    headers: {
      Authorization: `Bearer ${ANON}`,
      'x-kross-token': token,
    },
  })
  if (res.status === 404) throw new Error('not_found')
  if (!res.ok) throw new Error('server_error')
  return res.json()
}

export async function sendMessage(
  token: string,
  payload: { type: 'text' | 'audio' | 'image'; body?: string; media_url?: string }
): Promise<OrderMessage> {
  const res = await fetch(`${BASE}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, ...payload }),
  })
  if (!res.ok) throw new Error('send_failed')
  return res.json()
}

export async function markRead(token: string): Promise<void> {
  await fetch(`${BASE}/mark-read`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })
}
