import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, ChevronRight } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { supabase } from '../../lib/supabase'
import { useIsDesktop } from '../../lib/use-desktop'
import { stageChip, NOTA_META } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido } from '../../lib/order-tracking'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface SupabaseSession {
  id: string
  token: string
  buyer_id: string | null
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  pack_name: string | null
  stage: string
  created_at: string
  seller_name?: string | null
  seller_role?: string | null
  nota?: string | null
  assigned_seller_id?: string | null
  writer_seller_ids?: string[] | null
  // El chip de etapa sale de la misma línea de vida que el tablero del CRM.
  dispatch_type?: string | null
  agency_name?: string | null
  advance_amount?: number | string | null
  tracking_courier?: string | null
  tracking_phase?: string | null
  chat_messages: { id: string; sender_role: string; type: string; body: string | null; created_at: string; read_at: string | null }[]
}


// La etiqueta de la etapa sale de `columnaDelPedido`, no del `stage` crudo: con
// el chip leyendo el stage y el CRM leyendo la fase del courier, el mismo pedido
// decía "En camino" acá y "En destino" allá.
const ETIQUETA: Record<string, string> = {
  ...Object.fromEntries(COLUMNAS.map(c => [c.key, c.label])),
  no_entregado: 'No entregado',
}

// Un pedido de la semana pasada mostrando solo "07:08 p. m." se lee como si
// fuera de hoy. Hora para lo de hoy, fecha corta para lo demás.
function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay
    ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

export default function ChatsVendedorPage() {
  const navigate = useNavigate()
  const { effective, isAdmin } = useSeller()
  const desktop = useIsDesktop()
  const [search, setSearch] = useState('')
  const [sessions, setSessions] = useState<SupabaseSession[]>([])
  const [loading, setLoading] = useState(true)
  const [onlineBuyers, setOnlineBuyers] = useState<Set<string>>(new Set())
  const [bumps, setBumps] = useState<Record<string, number>>({})
  const seenRef = useRef<Set<string>>(new Set())

  // The super admin (Kross platform) isn't a store → send them to Marcas.
  useEffect(() => {
    if (effective?.is_super_admin) navigate('/vendedor/marca', { replace: true })
  }, [effective?.is_super_admin, navigate])

  // Live presence of all buyers → green dot on active chats
  useEffect(() => {
    const ch = supabase
      .channel('presence:buyers')
      .on('presence', { event: 'sync' }, () => {
        setOnlineBuyers(new Set(Object.keys(ch.presenceState())))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Each team member sees only the leads assigned to them (Ventas: new leads,
  // Despacho: confirmed, Motorizado: en camino). The admin (not impersonating)
  // sees every order in the store.
  // Whoever you're acting AS decides scope: an admin (store admin, or the super
  // admin who entered the store) sees all orders; a team member sees only theirs.
  const onlyMine = !!effective && !effective.is_admin

  useEffect(() => {
    if (!effective) return
    setLoading(true)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${ANON}`,
      'x-store-id': effective.store_id,
    }
    if (onlyMine) headers['x-seller-id'] = effective.auth_user_id

    fetch(`${BASE}/get-store-sessions`, { headers })
      .then(r => (r.ok ? r.json() : []))
      .then((data: SupabaseSession[]) => {
        setSessions(Array.isArray(data) ? data : [])
        setBumps({}); seenRef.current.clear()
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [effective?.auth_user_id, effective?.store_id, onlyMine])

  // Live unread: listen to each order's channel and bump the counter in real time
  const sessionIds = sessions.map(s => s.id).join(',')
  useEffect(() => {
    if (sessions.length === 0) return
    const channels = sessions.map(s =>
      supabase.channel(`order:${s.id}`)
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
          const m = payload as { id: string; sender_role: string }
          if (m.sender_role !== 'buyer' || seenRef.current.has(m.id)) return
          seenRef.current.add(m.id)
          setBumps(b => ({ ...b, [s.id]: (b[s.id] ?? 0) + 1 }))
        })
        .subscribe()
    )
    return () => channels.forEach(c => supabase.removeChannel(c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds])

  const filtered = sessions.filter(s =>
    !search ||
    s.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_name?.toLowerCase().includes(search.toLowerCase())
  )

  const scopeLabel = onlyMine ? 'Tus pedidos asignados' : 'Todos los pedidos de la tienda'

  // Todo lo que cada fila necesita, calculado una sola vez: la tarjeta de móvil
  // y la fila de escritorio pintan EXACTAMENTE los mismos datos.
  const meId = effective?.auth_user_id
  const unreadOf = (s: SupabaseSession) =>
    (s.chat_messages?.filter(m => m.sender_role === 'buyer' && !m.read_at).length ?? 0) + (bumps[s.id] ?? 0)

  const rows = filtered.map(session => {
    const lastMsg = session.chat_messages?.slice(-1)[0]
    return {
      session,
      readOnly: !isAdmin
        && session.assigned_seller_id !== meId
        && !(session.writer_seller_ids ?? []).includes(meId ?? ''),
      preview: lastMsg?.type === 'text' ? lastMsg.body : lastMsg?.type === 'audio' ? '🎵 Audio' : 'Sin mensajes',
      unread: unreadOf(session),
      when: formatWhen(session.created_at),
      online: !!session.buyer_id && onlineBuyers.has(session.buyer_id),
      nota: session.nota ? NOTA_META[session.nota] : undefined,
      pedido: `${session.product_name ?? 'Producto'} · ${session.pack_name || `S/ ${session.product_price}`}`,
    }
  })

  // Pulso de la tienda (escritorio): lo que un vendedor mira antes de abrir un
  // chat — sobre TODO lo cargado, no sobre el filtro de búsqueda.
  //
  // Se cuenta por la MISMA columna que pinta el chip. Contando `stage` crudo,
  // un pedido que Shalom ya reportó ENTREGADO pero que nadie marcó a mano salía
  // con el chip en "Entregado" y fuera del contador "Entregados", en la misma
  // pantalla y a dos centímetros de distancia.
  const columnaDe = new Map(sessions.map(s => [s.id, columnaDelPedido(s)]))
  const cuantos = (...cols: string[]) =>
    sessions.filter(s => cols.includes(columnaDe.get(s.id) ?? '')).length
  const kpis = [
    { label: 'Pedidos', value: sessions.length, color: 'var(--text)' },
    { label: 'Sin leer', value: sessions.filter(s => unreadOf(s) > 0).length, color: 'var(--text)' },
    { label: 'Nuevos', value: cuantos('nuevo', 'validando'), color: 'var(--text)' },
    { label: 'En proceso', value: cuantos('confirmado', 'preparando', 'registrado', 'transito', 'en_agencia'), color: 'var(--text)' },
    // Lo entregado es lo único que cierra bien: el único lima de la tabla (§4.2)
    { label: 'Entregados', value: cuantos('entregado'), color: 'var(--ok-fg)' },
  ]

  const open = (token: string) => navigate(`/vendedor/pedido/${token}`)

  const Avatar = ({ name, online, size }: { name: string | null; online: boolean; size: number }) => (
    <div className="relative flex-shrink-0">
      <div className="rounded-2xl flex items-center justify-center font-black"
        style={{ background: 'var(--surface-3)', color: 'var(--text)', width: size, height: size, fontSize: size >= 40 ? 18 : 13 }}>
        {(name || 'C')[0]}
      </div>
      {online && (
        <div className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white ${size >= 40 ? 'w-3.5 h-3.5' : 'w-3 h-3'}`}
          style={{ background: 'var(--ok-fg)' }} />
      )}
    </div>
  )

  const StageChip = ({ session }: { session: SupabaseSession }) => {
    const col = columnaDelPedido(session)
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={stageChip(col)}>
        {ETIQUETA[col] || col}
      </span>
    )
  }

  const spinner = (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
    </div>
  )

  const empty = (
    <div className="text-center py-12">
      <MessageCircle size={48} className="text-gray-200 mx-auto mb-3" />
      <p className="text-gray-400 text-sm">
        {onlyMine ? 'Aún no tienes pedidos asignados' : 'No hay pedidos que coincidan'}
      </p>
    </div>
  )

  // ── Escritorio: tabla densa, todo lo relevante en una línea ───────────────
  // El ancho de la PC se paga mostrando cliente, pedido, etapa, último mensaje
  // y cuándo entró SIN abrir el chat. Es lo que un CRM tiene que responder de
  // un vistazo: a quién le debo un mensaje.
  const COLS = 'minmax(200px,1.4fr) minmax(115px,1fr) 176px minmax(190px,1.6fr) 76px 18px'

  if (desktop) {
    return (
      <div className="px-6 py-5">
        <div className="flex items-end justify-between gap-6 mb-4">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-gray-900 leading-tight">Chats de clientes</h1>
            <p className="text-xs text-gray-400 mt-0.5">{scopeLabel}</p>
          </div>
          <div className="relative w-80 flex-shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente o producto..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 mb-4">
          {kpis.map(k => (
            <div key={k.label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-black leading-tight mt-0.5 tabular" style={{ color: k.color }}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="grid items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/70"
            style={{ gridTemplateColumns: COLS }}>
            {['Cliente', 'Pedido', 'Etapa', 'Último mensaje', 'Creado'].map(h => (
              <p key={h} className="text-[10px] font-black text-gray-400 uppercase tracking-wide">{h}</p>
            ))}
            <span />
          </div>

          {loading ? spinner : rows.length === 0 ? empty : rows.map(r => (
            <button
              key={r.session.id}
              onClick={() => open(r.session.token)}
              className="w-full grid items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50 transition-colors"
              style={{ gridTemplateColumns: COLS }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar name={r.session.buyer_name} online={r.online} size={34} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{r.session.buyer_name || 'Comprador'}</p>
                  {r.readOnly && (
                    <p className="text-[10px] font-bold truncate" style={{ color: '#863bff' }}>
                      👁 {r.session.seller_role || 'En otro rol'}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 truncate">{r.pedido}</p>

              <div className="flex items-center gap-1 min-w-0">
                <StageChip session={r.session} />
                {r.nota && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap" style={r.nota.style}>
                    {r.nota.label}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <p className={`text-xs truncate flex-1 ${r.unread > 0 ? 'text-gray-800 font-semibold' : 'text-gray-500'}`}>
                  {r.preview}
                </p>
                {r.unread > 0 && (
                  <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--text)', color: 'var(--surface)' }}>{r.unread}</span>
                )}
              </div>

              <p className="text-[11px] text-gray-400">{r.when}</p>
              <ChevronRight size={15} className="text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Móvil: la tarjeta de siempre ──────────────────────────────────────────
  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-1">Chats de clientes</h1>
      <p className="text-xs text-gray-400 mb-4">{scopeLabel}</p>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente o producto..."
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
      </div>

      {loading ? spinner : rows.length === 0 ? empty : (
        <div className="space-y-3">
          {rows.map(r => (
            <button
              key={r.session.id}
              onClick={() => open(r.session.token)}
              className="w-full bg-white border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow text-left"
              style={{ borderColor: 'var(--brand)', borderWidth: '0.5px' }}
            >
              <Avatar name={r.session.buyer_name} online={r.online} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-gray-800 text-sm truncate">{r.session.buyer_name || 'Comprador'}</p>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                    {r.unread > 0 && (
                      <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                        style={{ background: 'var(--text)', color: 'var(--surface)' }}>{r.unread}</span>
                    )}
                    {r.nota && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={r.nota.style}>
                        {r.nota.label}
                      </span>
                    )}
                    <StageChip session={r.session} />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 truncate">
                  {r.readOnly && <span className="font-bold" style={{ color: '#863bff' }}>👁 {r.session.seller_role || 'En otro rol'} · </span>}
                  {r.pedido}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 truncate flex-1">{r.preview}</p>
                  <span className="text-[10px] text-gray-300 flex-shrink-0 ml-1">{r.when}</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
