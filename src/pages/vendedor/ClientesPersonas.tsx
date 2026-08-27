import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Users, ChevronRight, MessageCircle, Phone, X } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { useStoreClients, fichaDeCliente, resumenDeCliente } from '../../lib/store-clients'
import type { Cliente, PedidoDeCliente } from '../../lib/store-clients'
import { CERRADO, ALERTA, NEUTRO } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido } from '../../lib/order-tracking'
import { soles } from '../../lib/order-money'
import { fechaCorta } from '../../lib/fechas'
import PanelDerecha from '../../components/PanelDerecha'
import CopyRow from '../../components/CopyRow'

// ─── La libreta de clientes ──────────────────────────────────────────────────
//
// Lo que faltaba de verdad (11-RELACIONES): el panel podía ver el contacto de un
// comprador DENTRO de un pedido, pero no a la persona. Ninguna pantalla
// respondía "¿este señor ya me compró antes?", que es la pregunta que decide si
// se le despacha sin adelanto, si vale el upsell, y si el reclamo de hoy es de
// un cliente de tres pedidos o de un desconocido.

const SEGMENTO: Record<string, { label: string; style: typeof NEUTRO }> = {
  restock: { label: 'Toca recompra', style: NEUTRO },
  winback: { label: 'Se está yendo', style: ALERTA },
}

const ETIQUETA_ETAPA: Record<string, string> = {
  ...Object.fromEntries(COLUMNAS.map(c => [c.key, c.label])),
  no_entregado: 'No entregado',
}

export default function ClientesPersonas() {
  const navigate = useNavigate()
  const { real, effective } = useSeller()
  const { clientes, cargando, error } = useStoreClients(real, effective)
  const [busca, setBusca] = useState('')

  // Qué ficha está abierta vive en la URL y no en un `useState` porque ya no se
  // abre solo desde acá: desde un pedido se salta a SU cliente
  // (`/vendedor/clientes?cliente=<id>`), que es la relación que el panel tenía
  // escrita en el modelo y no en la pantalla — un pedido pertenece a alguien, y
  // de ese alguien cuelgan todos sus pedidos (docs/11-RELACIONES.md).
  const [params, setParams] = useSearchParams()
  const abierto = params.get('cliente')

  // Se conserva lo que ya había en la URL (el modo de Clientes): escribir solo
  // `cliente` borraría el modo y saltaría de vuelta a la libreta.
  const abrirFicha = (id: string | null) => {
    const siguiente = new URLSearchParams(params)
    if (id) siguiente.set('cliente', id)
    else siguiente.delete('cliente')
    setParams(siguiente, { replace: !id })
  }

  // Se ordena por lo que de verdad importa: quien más ha comprado arriba. Por
  // fecha de alta, el cliente de cinco pedidos queda enterrado bajo los que
  // nunca compraron.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes
      .filter(c => !q
        || (c.nombre ?? '').toLowerCase().includes(q)
        || (c.document_number ?? '').includes(q)
        || (c.phone ?? '').includes(q))
      .sort((a, b) => b.gastado - a.gastado || b.pedidos - a.pedidos)
  }, [clientes, busca])

  const conCompra = clientes.filter(c => c.pedidos > 0).length

  if (cargando) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
    </div>
  )

  // El error se dice, no se disfraza de "no hay clientes": una lista vacía por
  // un fallo de red haría pensar que la base está vacía.
  if (error) return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-gray-400">No se pudo cargar la lista de clientes.</p>
      <p className="text-xs text-gray-300 mt-1">
        Si acaba de salir el despliegue, puede que <code>list-clients</code> aún no esté publicada.
      </p>
    </div>
  )

  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-3">
        {clientes.length} {clientes.length === 1 ? 'persona' : 'personas'}
        {conCompra > 0 && ` · ${conCompra} con al menos un pedido entregado`}
      </p>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nombre, DNI o teléfono..."
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-12">
          <Users size={44} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {clientes.length === 0 ? 'Todavía no hay clientes.' : 'Nadie coincide con esa búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(c => {
            const seg = c.segmento ? SEGMENTO[c.segmento] : undefined
            return (
              <button key={c.id} onClick={() => abrirFicha(c.id)}
                className="w-full bg-white border border-gray-100 rounded-2xl px-3 py-3 flex items-center gap-3 text-left shadow-sm">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 font-black"
                  style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                  {(c.nombre || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm text-gray-800 truncate">{c.nombre || 'Sin nombre'}</p>
                    {c.pedidos >= 2 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={CERRADO}>Recurrente</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{resumenDeCliente(c)}</p>
                  {seg && (
                    <span className="inline-block mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full" style={seg.style}>
                      {seg.label}
                    </span>
                  )}
                </div>
                <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}

      {abierto && (
        <Ficha
          // Una ficha por persona: con el mismo componente reusado, el "no se
          // pudo cargar" de un cliente se quedaba pegado al siguiente.
          key={abierto}
          buyerId={abierto}
          adminId={real?.auth_user_id}
          storeId={effective?.store_id}
          onClose={() => abrirFicha(null)}
          onAbrirPedido={token => { abrirFicha(null); navigate(`/vendedor/pedido/${token}`) }}
        />
      )}
    </div>
  )
}

// ─── La ficha: la persona y su historial ─────────────────────────────────────
//
// Entra por la derecha, como el pedido: es el mismo gesto —mirar algo sin salir
// de donde estás— y con el mismo marco no parecen dos aplicaciones distintas.
//
// Va con TODOS sus pedidos, no solo los entregados: un cancelado o un no
// entregado es justamente lo que explica por qué este cliente merece otra
// mirada antes de despacharle sin adelanto.
function Ficha({ buyerId, adminId, storeId, onClose, onAbrirPedido }: {
  buyerId: string
  adminId: string | undefined
  storeId: string | undefined
  onClose: () => void
  onAbrirPedido: (token: string) => void
}) {
  const [datos, setDatos] = useState<{ cliente: Cliente; pedidos: PedidoDeCliente[] } | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    if (!adminId) return
    let vivo = true
    fichaDeCliente(adminId, storeId, buyerId).then(d => {
      if (!vivo) return
      if (d) setDatos(d); else setFallo(true)
    })
    return () => { vivo = false }
  }, [adminId, storeId, buyerId])

  const c = datos?.cliente
  const celular = c?.phone ? c.phone.slice(-9) : null
  const seg = c?.segmento ? SEGMENTO[c.segmento] : undefined

  return (
    <PanelDerecha etiqueta={`Cliente ${c?.nombre ?? ''}`} ancho="min(520px, 100%)" onCerrar={onClose}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div className="min-w-0">
          <p className="font-black text-sm truncate" style={{ color: 'var(--text)' }}>
            {c?.nombre || (fallo ? 'No se pudo cargar' : 'Cargando…')}
          </p>
          {c && (
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{resumenDeCliente(c)}</p>
          )}
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded-lg flex-shrink-0"
          style={{ color: 'var(--text-faint)' }}>
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!c && !fallo && (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
          </div>
        )}

        {fallo && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-faint)' }}>
            No se pudo cargar la ficha. Si acaba de salir el despliegue, puede que{' '}
            <code>list-clients</code> aún no esté publicada.
          </p>
        )}

        {c && (
          <>
            {/* Lo que decide cómo tratar a esta persona, de un vistazo. */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Dato valor={String(c.pedidos)} etiqueta="Entregados" />
              <Dato valor={soles(c.gastado)} etiqueta="Ha gastado" />
              <Dato valor={String(c.puntos ?? 0)} etiqueta="Puntos" />
              <Dato valor={c.score != null ? String(c.score) : '—'} etiqueta="Puntaje" />
            </div>

            {seg && (
              <span className="inline-block mb-3 text-[10px] font-black px-2 py-1 rounded-full" style={seg.style}>
                {seg.label}
              </span>
            )}

            <div className="rounded-2xl px-3 py-1 mb-3" style={{ background: 'var(--surface-3)' }}>
              {c.document_number && (
                <CopyRow label={c.document_type || 'DNI'} value={c.document_number} />
              )}
              {c.phone && <CopyRow label="WhatsApp" value={c.phone} />}
            </div>

            <div className="text-[11px] mb-3 space-y-0.5" style={{ color: 'var(--text-faint)' }}>
              <p>Último pedido: {fechaCorta(c.ultimo)}</p>
              <p>Cliente desde: {fechaCorta(c.created_at)}</p>
              <p>
                {c.activated_at ? `Usa la app desde ${fechaCorta(c.activated_at)}` : 'Nunca entró a la app'}
                {c.source === 'import' && ' · importado'}
              </p>
            </div>

            {celular && (
              <div className="flex items-center gap-2 mb-4">
                <a href={`https://wa.me/51${celular}`} target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold"
                  style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                  <MessageCircle size={13} /> WhatsApp
                </a>
                <a href={`tel:+51${celular}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold"
                  style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                  <Phone size={13} /> Llamar
                </a>
              </div>
            )}

            <p className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: 'var(--text-faint)' }}>
              Sus pedidos · {datos.pedidos.length}
            </p>
            {datos.pedidos.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Todavía no ha hecho ningún pedido.</p>
            ) : (
              <div className="space-y-2">
                {datos.pedidos.map(p => {
                  const col = p.status === 'cancelado' ? 'cancelado' : columnaDelPedido(p)
                  return (
                    <button key={p.id}
                      onClick={() => p.token && onAbrirPedido(p.token)}
                      disabled={!p.token}
                      className="w-full rounded-xl px-3 py-2 text-left disabled:cursor-default"
                      style={{ background: 'var(--surface-3)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>
                          {p.product_name || 'Pedido'}
                        </p>
                        <span className="text-[11px] flex-shrink-0 tabular" style={{ color: 'var(--text-muted)' }}>
                          {p.product_price != null ? soles(p.product_price) : ''}
                        </span>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                        {p.status === 'cancelado' ? 'Cancelado' : (ETIQUETA_ETAPA[col] ?? col)} · {fechaCorta(p.created_at)}
                        {!p.token && ' · sin chat'}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PanelDerecha>
  )
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-2xl px-2 py-2 text-center" style={{ background: 'var(--surface-3)' }}>
      <p className="font-black text-base tabular" style={{ color: 'var(--text)' }}>{valor}</p>
      <p className="text-[9px] font-bold" style={{ color: 'var(--text-faint)' }}>{etiqueta}</p>
    </div>
  )
}
