import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, MessageCircle, ChevronRight } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { escuchar } from '../../lib/realtime'
import { useCompradoresEnLinea } from '../../lib/presencia'
import { useIsDesktop } from '../../lib/use-desktop'
import { stageChip, NOTA_META } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido } from '../../lib/order-tracking'
import { estaVivo } from '../../lib/store-orders'
import { soles } from '../../lib/order-money'
import { horaOFecha } from '../../lib/fechas'
import type { StoreOrder, StoreOrders } from '../../lib/store-orders'



const VACIO: Record<string, number> = {}

// La etiqueta de la etapa sale de `columnaDelPedido`, no del `stage` crudo: con
// el chip leyendo el stage y el CRM leyendo la fase del courier, el mismo pedido
// decía "En camino" acá y "En destino" allá.
const ETIQUETA: Record<string, string> = {
  ...Object.fromEntries(COLUMNAS.map(c => [c.key, c.label])),
  no_entregado: 'No entregado',
}

export default function PedidosLista({ lista, onAbrir, marcado }: {
  lista: StoreOrders
  /** Abre el pedido en el panel de la derecha, sin salir de la lista. */
  onAbrir: (token: string) => void
  /** El token del pedido abierto —o del último que lo estuvo—. Se marca su
   *  borde para no perder el sitio al cerrar el cajón. */
  marcado?: string | null
}) {
  const { effective, isAdmin } = useSeller()
  const desktop = useIsDesktop()
  // El puntito verde sale de una sola definición, compartida con el Tablero y
  // con el chat (lib/presencia.ts). Antes vivía acá y por eso era la única
  // pantalla que lo tenía.
  const onlineBuyers = useCompradoresEnLinea(effective?.store_id)
  const [search, setSearch] = useState('')
  // `gen` = el `leidoEn` de la lista sobre la que se contaron estos bumps.
  const [bumpsRef, setBumps] = useState<{ gen: number; por: Record<string, number> }>({ gen: 0, por: {} })
  const seenRef = useRef<Set<string>>(new Set())

  // La lista la trae la pantalla contenedora, una sola vez para los cuatro
  // modos. Acá se descartan los cancelados: un pedido muerto no espera
  // respuesta de nadie, así que no pinta nada en una bandeja de mensajes.
  const { cargando: loading, soloMios: onlyMine, leidoEn } = lista
  const sessions = useMemo(() => lista.pedidos.filter(estaVivo), [lista.pedidos])

  // Los contadores de "sin leer" son de ESTA pantalla y se acumulan sobre la
  // lista, así que una lista nueva tiene que soltarlos o seguirían sumando
  // sobre pedidos que ya no están.
  //
  // El reseteo va DERIVADO —los bumps se guardan junto a la lectura que los
  // originó y se descartan si no coinciden— y no en un efecto: un efecto los
  // limpiaría un render tarde, y en ese render se verían contadores de la lista
  // anterior sobre los pedidos de la nueva.
  const bumps = bumpsRef.gen === leidoEn ? bumpsRef.por : VACIO

  // Live unread: listen to each order's channel and bump the counter in real time
  const sessionIds = sessions.map(s => s.id).join(',')
  useEffect(() => {
    if (sessions.length === 0) return
    // Cada lectura empieza su propio conteo: los ids ya vistos de la lista
    // anterior no deben silenciar mensajes de la nueva.
    seenRef.current = new Set()
    const suscripciones = sessions.map(s =>
      escuchar(`order:${s.id}`, {
        broadcast: {
          new_message: ({ payload }) => {
            const m = payload as { id: string; sender_role: string }
            if (m.sender_role !== 'buyer' || seenRef.current.has(m.id)) return
            seenRef.current.add(m.id)
            setBumps(b => {
              const por = b.gen === leidoEn ? b.por : {}
              return { gen: leidoEn, por: { ...por, [s.id]: (por[s.id] ?? 0) + 1 } }
            })
          },
        },
      })
    )
    return () => suscripciones.forEach(s => s.cerrar())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds, leidoEn])

  const filtered = sessions.filter(s =>
    !search ||
    s.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_name?.toLowerCase().includes(search.toLowerCase())
  )

  const scopeLabel = onlyMine ? 'Tus pedidos asignados' : 'Todos los pedidos de la tienda'

  // Todo lo que cada fila necesita, calculado una sola vez: la tarjeta de móvil
  // y la fila de escritorio pintan EXACTAMENTE los mismos datos.
  const meId = effective?.auth_user_id
  const unreadOf = (s: StoreOrder) =>
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
      when: horaOFecha(session.created_at, leidoEn),
      online: !!session.buyer_id && onlineBuyers.has(session.buyer_id),
      nota: session.nota ? NOTA_META[session.nota] : undefined,
      pedido: `${session.product_name ?? 'Producto'} · ${session.pack_name || soles(session.product_price)}`,
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

  // Un pedido sin token no tiene nada que abrir. No debería pasar, pero el tipo
  // lo admite porque la respuesta del servidor manda, no nuestro deseo.
  const open = (token?: string) => { if (token) onAbrir(token) }

  const Avatar = ({ name, online, size }: { name?: string | null; online: boolean; size: number }) => (
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

  const StageChip = ({ session }: { session: StoreOrder }) => {
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
      <div className="px-6 pt-4 pb-5">
        <div className="flex items-end justify-between gap-6 mb-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">{scopeLabel}</p>
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
              // El pedido que se abrió queda marcado también después de cerrar
              // el cajón: sin eso, la lista vuelve a ser cincuenta filas
              // iguales y uno pierde en cuál estaba.
              style={{
                gridTemplateColumns: COLS,
                ...(!!marcado && r.session.token === marcado
                  ? { background: 'var(--brand-tint)', boxShadow: 'inset 2px 0 0 var(--brand)' }
                  : null),
              }}
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
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-3">{scopeLabel}</p>

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
              style={!!marcado && r.session.token === marcado
                ? { borderColor: 'var(--brand)', borderWidth: '1.5px' }
                : { borderColor: 'var(--border)', borderWidth: '0.5px' }}
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
