import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, ChevronRight, IdCard, MessageCircle, Phone, X } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { useStoreClients, fichaDeCliente, resumenDeCliente } from '../../lib/store-clients'
import type { Cliente, PedidoDeCliente } from '../../lib/store-clients'
import { CERRADO, ALERTA, NEUTRO } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido } from '../../lib/order-tracking'

// ─── La libreta de clientes ──────────────────────────────────────────────────
//
// Lo que faltaba de verdad (11-RELACIONES): el panel podía ver el contacto de un
// comprador DENTRO de un pedido, pero no a la persona. Ninguna pantalla
// respondía "¿este señor ya me compró antes?", que es la pregunta que decide si
// se le despacha sin adelanto, si vale el upsell, y si el reclamo de hoy es de
// un cliente de tres pedidos o de un desconocido.

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString('es-PE')}`

const SEGMENTO: Record<string, { label: string; style: typeof NEUTRO }> = {
  restock: { label: 'Toca recompra', style: NEUTRO },
  winback: { label: 'Se está yendo', style: ALERTA },
}

const ETIQUETA_ETAPA: Record<string, string> = {
  ...Object.fromEntries(COLUMNAS.map(c => [c.key, c.label])),
  no_entregado: 'No entregado',
}

function cuandoFue(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })
}

export default function ClientesPersonas() {
  const navigate = useNavigate()
  const { real, effective } = useSeller()
  const { clientes, cargando, error } = useStoreClients(real, effective)
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

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
              <button key={c.id} onClick={() => setAbierto(c.id)}
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
          buyerId={abierto}
          adminId={real?.auth_user_id}
          storeId={effective?.store_id}
          onClose={() => setAbierto(null)}
          onAbrirPedido={token => { setAbierto(null); navigate(`/vendedor/pedido/${token}`) }}
        />
      )}
    </div>
  )
}

// ─── La ficha: la persona y su historial ─────────────────────────────────────
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}>
      <div className="w-full max-w-[430px] rounded-t-3xl max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-gray-100"
          style={{ background: 'var(--surface)' }}>
          <p className="font-black text-sm" style={{ color: 'var(--text)' }}>
            {c?.nombre || (fallo ? 'No se pudo cargar' : 'Cargando…')}
          </p>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-faint)' }}>
            <X size={18} />
          </button>
        </div>

        {c && (
          <div className="px-4 py-4">
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Dato valor={String(c.pedidos)} etiqueta="Entregados" />
              <Dato valor={soles(c.gastado)} etiqueta="Ha gastado" />
              <Dato valor={String(c.puntos ?? 0)} etiqueta="Puntos" />
            </div>

            {c.document_number && (
              <div className="flex items-center gap-1.5 mb-2">
                <IdCard size={13} style={{ color: 'var(--text-faint)' }} />
                <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {c.document_type || 'DNI'} {c.document_number}
                </p>
              </div>
            )}
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
              Último pedido: {cuandoFue(c.ultimo)}
              {c.activated_at ? ' · usa la app' : ' · nunca entró a la app'}
              {c.source === 'import' && ' · importado'}
            </p>

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
              Sus pedidos
            </p>
            {datos.pedidos.length === 0 ? (
              <p className="text-xs text-gray-400">Todavía no ha hecho ningún pedido.</p>
            ) : (
              <div className="space-y-2">
                {datos.pedidos.map(p => {
                  const col = p.status === 'cancelado' ? 'cancelado' : columnaDelPedido(p)
                  return (
                    <button key={p.id}
                      onClick={() => p.token && onAbrirPedido(p.token)}
                      disabled={!p.token}
                      className="w-full rounded-xl px-3 py-2 text-left"
                      style={{ background: 'var(--surface-3)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>
                          {p.product_name || 'Pedido'}
                        </p>
                        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {p.product_price != null ? soles(Number(p.product_price)) : ''}
                        </span>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                        {p.status === 'cancelado' ? 'Cancelado' : (ETIQUETA_ETAPA[col] ?? col)} · {cuandoFue(p.created_at)}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
