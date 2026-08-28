import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, MessageCircle, ChevronRight, CornerUpLeft, CheckCheck } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { escuchar } from '../../lib/realtime'
import { useCompradoresEnLinea } from '../../lib/presencia'
import { useEquipo, involucradosDe } from '../../lib/store-team'
import { useIsDesktop } from '../../lib/use-desktop'
import { NOTA_META } from '../../lib/order-chips'
import { estaVivo } from '../../lib/store-orders'
import { horaOFecha, hace } from '../../lib/fechas'
import { datosDeFila, verBandeja, VISTAS, VISTA_INICIAL } from '../../lib/bandeja'
import type { Vista, FilaBandeja } from '../../lib/bandeja'
import { useFavoritos } from '../../lib/favoritos'
import { marcarRespondido } from '../../lib/order-answer'
import type { StoreOrder, StoreOrders } from '../../lib/store-orders'
import type { SellerProfile } from '../../lib/seller-session'

// ─── La Lista: a quién le debo un mensaje ────────────────────────────────────
//
// Lista y Tablero miran los mismos pedidos y responden preguntas distintas
// (docs/11-RELACIONES.md). El Tablero pregunta dónde se atora la OPERACIÓN —y
// por eso muestra etapa, producto y plata—; la Lista pregunta a quién le debo un
// MENSAJE, y eso se responde con la conversación: quién habló último, hace
// cuánto, quién atiende, qué está sin leer.
//
// Repetir acá la etapa y el producto era llenar la pantalla con lo que ya está
// resuelto dos clics más allá, y dejar fuera lo único que esta vista decide: el
// ORDEN. Una bandeja no se lee entera — se lee de arriba abajo hasta que se
// acaba el tiempo, así que lo que está arriba ES la pantalla (lib/bandeja.ts).

const VACIO: Record<string, number> = {}

const ROL_COLOR = (rol?: string | null) => {
  const r = (rol ?? '').toLowerCase()
  if (r.includes('venta')) return '#55C8F5'
  if (r.includes('logist') || r.includes('despacho')) return '#863bff'
  if (r.includes('soporte')) return '#14B8A6'
  if (r.includes('motoriz')) return '#FF8C00'
  return '#888'
}

/** El avatar del comprador, con su puntito de conexión. Módulo y no función
 *  dentro del render: un componente declarado ahí adentro cambia de identidad
 *  en cada pintada, y React desmonta y vuelve a montar la fila entera. */
function AvatarComprador({ name, online, size }: { name?: string | null; online: boolean; size: number }) {
  return (
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
}

/**
 * Quién atiende este pedido.
 *
 * Los avatares se superponen porque el dato que importa es "cuántos y quiénes",
 * no cada cara: en una fila de tabla, tres círculos separados ocupan lo que
 * ocupa una columna entera. El primero es el asignado — el dueño del hilo.
 */
function Asesores({ ids, porId }: { ids: string[]; porId: Map<string, SellerProfile> }) {
  if (ids.length === 0) {
    return <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Sin asignar</span>
  }
  const visibles = ids.slice(0, 3)
  return (
    <div className="flex items-center">
      {visibles.map((id, i) => {
        const m = porId.get(id)
        const nombre = m?.nombre ?? '?'
        const color = ROL_COLOR(m?.role_label)
        return (
          <span key={id}
            title={m ? `${nombre}${m.role_label ? ` · ${m.role_label}` : ''}` : 'Otro miembro del equipo'}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 border-2"
            style={{
              background: `${color}22`, color, borderColor: 'var(--surface)',
              marginLeft: i === 0 ? 0 : -7, zIndex: visibles.length - i,
            }}>
            {nombre.charAt(0).toUpperCase()}
          </span>
        )
      })}
      {ids.length > visibles.length && (
        <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-faint)' }}>
          +{ids.length - visibles.length}
        </span>
      )}
    </div>
  )
}

/** La actividad del hilo: cuándo se movió, y si está esperando respuesta. */
function Actividad({ fila, ahora }: { fila: FilaBandeja; ahora: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] whitespace-nowrap"
        style={{ color: fila.esperando ? 'var(--danger-fg)' : 'var(--text-faint)' }}>
        {fila.esperando && <CornerUpLeft size={11} className="inline mr-1 -mt-0.5" />}
        {hace(ahora - fila.ultimoEn)}
      </p>
      {/* Solo la deuda NUESTRA lleva color: si los dos lados se pintan, el rojo
          deja de querer decir "esto te toca a ti" (§6.1). */}
      {fila.esperando && (
        <p className="text-[10px] whitespace-nowrap" style={{ color: 'var(--danger-fg)' }}>sin responder</p>
      )}
      {fila.esperandoCliente && (
        <p className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
          esperando al cliente
        </p>
      )}
    </div>
  )
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
  // El puntito verde y el equipo salen de una sola definición, compartidas con
  // el Tablero, el chat y la pantalla de Equipo.
  const onlineBuyers = useCompradoresEnLinea(effective?.store_id)
  const { porId } = useEquipo(effective)
  const [search, setSearch] = useState('')
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const favoritos = useFavoritos(effective?.store_id)
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
          // Alguien lo dio por respondido desde otro sitio: la fila tiene que
          // salir de "Sin responder" sin que nadie recargue, o dos personas
          // trabajarían sobre la misma deuda.
          answered_update: () => lista.recargar(),
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

  const scopeLabel = onlyMine ? 'Tus pedidos asignados' : 'Todos los pedidos de la tienda'

  const meId = effective?.auth_user_id
  const unreadOf = (s: StoreOrder) =>
    (s.chat_messages?.filter(m => m.sender_role === 'buyer' && !m.read_at).length ?? 0) + (bumps[s.id] ?? 0)

  // Todo lo que cada fila necesita, calculado una vez: la tarjeta de móvil y la
  // fila de escritorio pintan EXACTAMENTE los mismos datos.
  const filas = sessions
    .filter(s => !search
      || s.buyer_name?.toLowerCase().includes(search.toLowerCase())
      || s.buyer_phone?.includes(search))
    .map(session => ({
      session,
      fila: datosDeFila(session, leidoEn, unreadOf(session), favoritos.has(session.id)),
      readOnly: !isAdmin
        && session.assigned_seller_id !== meId
        && !(session.writer_seller_ids ?? []).includes(meId ?? ''),
      online: !!session.buyer_id && onlineBuyers.has(session.buyer_id),
      nota: session.nota ? NOTA_META[session.nota] : undefined,
      asesores: involucradosDe(session),
    }))

  const rows = verBandeja(filas, vista, r => r.fila)

  // Los recuadros SON las vistas, con su número: un contador que no se puede
  // tocar invita a buscar dónde está lo que cuenta, y el sitio donde estaba era
  // el chip de al lado. Ahora es lo mismo, una sola vez.
  const cuantos = (v: Vista) => verBandeja(filas, v, r => r.fila).length

  // Un pedido sin token no tiene nada que abrir. No debería pasar, pero el tipo
  // lo admite porque la respuesta del servidor manda, no nuestro deseo.
  const open = (token?: string) => { if (token) onAbrir(token) }

  // Cerrar la deuda DESDE LA FILA, sin abrir el chat. Es el camino que pide el
  // caso más común: el cliente escribió "Gracias 🙏" o un emoji, no hay nada que
  // contestar, y abrir el chat para no escribir nada es puro peaje.
  const [cerrando, setCerrando] = useState<string | null>(null)
  const cerrarDeuda = async (id: string) => {
    if (cerrando) return
    setCerrando(id)
    const ok = await marcarRespondido(id, effective?.store_id)
    setCerrando(null)
    if (ok) lista.recargar()
    else alert('No se pudo marcar como respondido. Intenta de nuevo.')
  }

  /** Los recuadros: cada uno es una vista, y su número es cuántos pedidos deja
   *  ver. `chips` los aprieta para el móvil, donde cuatro tarjetas no caben. */
  const selectorVista = (chips: boolean) => (
    <div className={chips
      ? 'flex items-center gap-0.5 rounded-xl p-0.5 w-max'
      : 'grid grid-cols-5 gap-3'}
      style={chips ? { background: 'var(--surface-3)' } : undefined}>
      {VISTAS.map(v => {
        const activo = v.key === vista
        const n = cuantos(v.key)
        // Solo la deuda con el cliente se pinta: si todo tiene color, nada
        // resalta (§6.1). Y en cero no alarma — no hay nada que atender.
        const urge = v.key === 'sin_responder' && n > 0
        if (chips) {
          return (
            <button key={v.key} type="button" onClick={() => setVista(v.key)}
              title={v.pregunta} aria-pressed={activo}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
              style={activo
                ? { background: 'var(--surface)', color: 'var(--text)', fontWeight: 700 }
                : { color: 'var(--text-faint)', fontWeight: 500 }}>
              {v.label} <span className="tabular">{n}</span>
            </button>
          )
        }
        return (
          <button key={v.key} type="button" onClick={() => setVista(v.key)}
            title={v.pregunta} aria-pressed={activo}
            className="bg-white border rounded-2xl px-4 py-3 text-left transition-colors"
            style={activo
              ? { borderColor: 'var(--brand)', boxShadow: 'inset 0 0 0 1px var(--brand)' }
              : { borderColor: 'var(--border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
              {v.label}
            </p>
            <p className="text-2xl font-black leading-tight mt-0.5 tabular"
              style={{ color: urge ? 'var(--danger-fg)' : 'var(--text)' }}>{n}</p>
          </button>
        )
      })}
    </div>
  )

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

  // ── Escritorio: la conversación en una línea ──────────────────────────────
  const COLS = 'minmax(190px,1.5fr) 108px minmax(220px,2fr) 96px 76px 18px'

  if (desktop) {
    return (
      <div className="px-6 pt-4 pb-5">
        <div className="flex items-end justify-between gap-4 mb-4">
          <p className="text-xs text-gray-400 min-w-0">{scopeLabel}</p>
          <div className="relative w-72 flex-shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente o teléfono..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
            />
          </div>
        </div>

        <div className="mb-4">{selectorVista(false)}</div>

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="grid items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/70"
            style={{ gridTemplateColumns: COLS }}>
            {['Cliente', 'Atiende', 'Último mensaje', 'Actividad', 'Creado'].map(h => (
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
                <AvatarComprador name={r.session.buyer_name} online={r.online} size={34} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{r.session.buyer_name || 'Comprador'}</p>
                  {r.nota && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap" style={r.nota.style}>
                      {r.nota.label}
                    </span>
                  )}
                </div>
              </div>

              <Asesores ids={r.asesores} porId={porId} />

              <div className="flex items-center gap-2 min-w-0">
                {/* Quién habló último, CON NOMBRE. Sin esto, "Listo, ya pagué" y
                    "Confirmo tu pedido" se leen igual y son lo contrario; y
                    decir "Tú:" para todo lo que sale de la tienda esconde lo
                    que importa en un equipo de seis: si ya contestó Milagros,
                    no hace falta que conteste nadie más. */}
                {r.fila.quienEscribio && (
                  <span className="text-[10px] flex-shrink-0 font-semibold whitespace-nowrap"
                    style={{ color: r.fila.ultimoDe === 'buyer' ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                    {r.fila.quienEscribio}:
                  </span>
                )}
                <p className={`text-xs truncate flex-1 ${r.fila.sinLeer > 0 ? 'text-gray-800 font-semibold' : 'text-gray-500'}`}>
                  {r.fila.vistaPrevia}
                </p>
                {r.fila.sinLeer > 0 && (
                  <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--text)', color: 'var(--surface)' }}>{r.fila.sinLeer}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <Actividad fila={r.fila} ahora={leidoEn} />
                {r.fila.esperando && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); cerrarDeuda(r.session.id) }}
                    disabled={cerrando === r.session.id}
                    title="Marcar como respondido — para un «gracias» que no hay que contestar"
                    aria-label="Marcar como respondido"
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                    style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}>
                    <CheckCheck size={12} />
                  </button>
                )}
              </div>

              <p className="text-[11px] text-gray-400">{horaOFecha(r.session.created_at, leidoEn)}</p>
              <ChevronRight size={15} className="text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Móvil: la tarjeta, con lo mismo ───────────────────────────────────────
  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-2">{scopeLabel}</p>
      <div className="overflow-x-auto -mx-4 px-4 mb-3">{selectorVista(true)}</div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente o teléfono..."
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
              <AvatarComprador name={r.session.buyer_name} online={r.online} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="font-semibold text-gray-800 text-sm truncate">{r.session.buyer_name || 'Comprador'}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.fila.sinLeer > 0 && (
                      <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                        style={{ background: 'var(--text)', color: 'var(--surface)' }}>{r.fila.sinLeer}</span>
                    )}
                    {r.nota && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={r.nota.style}>
                        {r.nota.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500 truncate flex-1">
                    {r.fila.quienEscribio && <span className="text-gray-400">{r.fila.quienEscribio}: </span>}
                    {r.fila.vistaPrevia}
                  </p>
                  <span className="text-[10px] flex-shrink-0"
                    style={{ color: r.fila.esperando ? 'var(--danger-fg)' : 'var(--text-faint)' }}>
                    {hace(leidoEn - r.fila.ultimoEn)}
                  </span>
                  {r.fila.esperando && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); cerrarDeuda(r.session.id) }}
                      disabled={cerrando === r.session.id}
                      title="Marcar como respondido"
                      aria-label="Marcar como respondido"
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                      style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}>
                      <CheckCheck size={12} />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <Asesores ids={r.asesores} porId={porId} />
                  {r.readOnly && (
                    <span className="text-[10px] font-bold" style={{ color: '#863bff' }}>
                      👁 {r.session.seller_role || 'En otro rol'}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
