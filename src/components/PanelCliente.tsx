import { useEffect, useState } from 'react'
import { MessageCircle, Phone, X } from 'lucide-react'
import { fichaDeCliente, resumenDeCliente } from '../lib/store-clients'
import type { Cliente, PedidoDeCliente } from '../lib/store-clients'
import { ALERTA, NEUTRO } from '../lib/order-chips'
import { COLUMNAS, columnaDelPedido } from '../lib/order-tracking'
import { soles } from '../lib/order-money'
import { fechaCorta } from '../lib/fechas'
import PanelDerecha from './PanelDerecha'
import CopyRow from './CopyRow'

// ─── La persona, y todo lo que le cuelga ─────────────────────────────────────
//
// Vive acá y no dentro de la libreta porque se abre desde DOS sitios: desde
// Clientes, y desde un pedido —"ver sus pedidos"—, y ahí se apila ENCIMA del
// cajón del pedido en vez de sacarte de él. Esa es la relación que el modelo ya
// decía: un pedido pertenece a un cliente, y del cliente cuelgan todos sus
// pedidos (docs/11-RELACIONES.md). Mirar al dueño no debería costar salir de lo
// que estabas mirando.

const SEGMENTO: Record<string, { label: string; style: typeof NEUTRO }> = {
  restock: { label: 'Toca recompra', style: NEUTRO },
  winback: { label: 'Se está yendo', style: ALERTA },
}

const ETIQUETA_ETAPA: Record<string, string> = {
  ...Object.fromEntries(COLUMNAS.map(c => [c.key, c.label])),
  no_entregado: 'No entregado',
}

// Va con TODOS sus pedidos, no solo los entregados: un cancelado o un no
// entregado es justamente lo que explica por qué este cliente merece otra
// mirada antes de despacharle sin adelanto.
export default function PanelCliente({ buyerId, adminId, storeId, encima = false, onClose, onAbrirPedido }: {
  buyerId: string
  adminId: string | undefined
  storeId: string | undefined
  /** `true` = se abrió DESDE un pedido, así que va una capa por encima de él. */
  encima?: boolean
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
    <PanelDerecha etiqueta={`Cliente ${c?.nombre ?? ''}`} ancho="min(520px, 100%)" capa={encima ? 2 : 1} onCerrar={onClose}>
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
