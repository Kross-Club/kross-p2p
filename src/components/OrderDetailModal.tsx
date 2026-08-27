import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Package, AlertTriangle, RefreshCw, Trash2, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { OrderSession } from '../lib/order-api'
import { NOTA_META, NOTA_KEYS } from '../lib/order-chips'
import Confirmar from './Confirmar'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const STAGE_LABEL: Record<string, string> = {
  nuevo: '📋 Pedido creado', validando: '🔎 Validando pago', confirmado: '📞 Confirmado', preparando: '📦 Preparando',
  en_camino: '🚚 En camino', entregado: '✅ Entregado',
}

// Las notas y su color viven en un solo lugar (§6.1)
const NOTAS = NOTA_KEYS.map(key => ({ key, ...NOTA_META[key] }))

const LOSES = [
  'Comprar sin pagar adelanto',
  'Recibir en la puerta de tu casa',
  'Garantía de satisfacción con reembolso',
  'Promociones y descuentos cada mes',
]

export default function OrderDetailModal({ session, role, onClose, onPatch, enColumna = false }: {
  session: OrderSession
  role: 'buyer' | 'seller'
  onClose: () => void
  onPatch: (patch: Partial<OrderSession>) => void
  /** `true` = va dentro de la columna del pedido, sin velo ni hoja flotante.
   *  En escritorio la columna tiene sitio de sobra y el pedido es justo lo que
   *  uno mira mientras escribe: taparlo con una ventana en el centro era
   *  esconder el dato detrás de la conversación que habla de él. */
  enColumna?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  // Un cambio de cantidad se guarda solo y le cambia el total al comprador. Se
  // pregunta antes: `{ i, qty }` es lo que está esperando el sí.
  const [cambioQty, setCambioQty] = useState<{ i: number; nombre: string; de: number; a: number } | null>(null)
  const [viewerImgs, setViewerImgs] = useState<string[]>([])
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  const [removingIdx, setRemovingIdx] = useState<number | null>(null)

  // Open the fullscreen gallery for a specific product (its landing images)
  const openItemViewer = async (it: { product_id?: string | null; image?: string | null }) => {
    let imgs = it.image ? [it.image] : []
    if (it.product_id) {
      const { data } = await supabase.from('products').select('images').eq('id', it.product_id).maybeSingle()
      const arr = (data?.images as string[]) ?? []
      if (arr.length) imgs = arr
    }
    if (imgs.length) { setViewerImgs(imgs); setViewerIdx(0) }
  }

  const post = (payload: Record<string, unknown>) =>
    fetch(`${BASE}/order-manage`, { method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

  const cancel = async () => {
    setBusy(true)
    try {
      const res = await post({ action: 'cancel', session_id: session.id, by: role })
      if (!res.ok) { alert('No se pudo cancelar.'); return }
      onPatch({ status: 'cancelado' }); onClose()
    } finally { setBusy(false) }
  }

  const recreate = async () => {
    setBusy(true)
    try {
      const res = await post({ action: 'recreate', session_id: session.id })
      if (!res.ok) { alert('No se pudo reactivar.'); return }
      onPatch({ status: 'active', stage: 'nuevo', nota: 'recuperado' }); onClose()
    } finally { setBusy(false) }
  }

  const setNota = async (nota: string | null) => {
    onPatch({ nota })
    await post({ action: 'set_nota', session_id: session.id, nota })
  }

  // No se guarda al primer toque: el total del pedido es lo que el comprador ve
  // y lo que se le va a cobrar, y +/- están a un dedo de distancia.
  const pedirCambio = (i: number, nombre: string, de: number, a: number) => {
    if (busy || a === de) return
    setCambioQty({ i, nombre, de, a })
  }

  const setQty = async (index: number, qty: number) => {
    setBusy(true)
    try {
      const res = await post({ action: 'set_qty', session_id: session.id, index, qty })
      const r = await res.json()
      if (r.items) onPatch({ items: r.items, product_price: r.total })
    } finally { setBusy(false) }
  }

  const removeItem = async (index: number) => {
    setBusy(true)
    try {
      const res = await post({ action: 'remove_item', session_id: session.id, index, by: role })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) { alert(r.error === 'last_item' ? 'No puedes quitar el único producto. Si ya no lo quieres, cancela el pedido.' : 'No se pudo quitar el producto.'); return }
      onPatch({ items: r.items, product_price: r.total })
      setRemovingIdx(null)
    } finally { setBusy(false) }
  }

  const cancelled = session.status === 'cancelado'
  const stageText = cancelled ? '❌ Pedido cancelado' : (STAGE_LABEL[session.stage] ?? session.stage)

  const cuerpo = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-black text-gray-900 flex items-center gap-2 text-sm"><Package size={16} /> Tu pedido</h3>
        {!enColumna && <button onClick={onClose} aria-label="Cerrar"><X size={18} className="text-gray-400" /></button>}
      </div>

          {(() => {
            const items = (session.items && session.items.length ? session.items : [{ nombre: session.product_name || 'Producto', precio: session.product_price ?? 0, pack_name: session.pack_name, image: null, qty: 1 }])
            const total = items.reduce((s, it) => s + (Number(it.precio) || 0), 0)
            return (
              <div className="rounded-2xl p-3 mb-3" style={{ background: 'var(--warn-bg-soft)', border: '0.5px solid var(--warn-border)' }}>
                {items.length > 1 && <p className="text-[10px] font-black uppercase tracking-wide text-amber-700 mb-2">🛒 {items.length} productos</p>}
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2.5">
                        <button onClick={() => openItemViewer(it)}
                          className="relative w-11 h-11 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 group">
                          {it.image ? <img src={it.image} alt={it.nombre} className="w-full h-full object-cover" /> : <Package size={16} className="m-auto mt-3 text-gray-300" />}
                          <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                            <Eye size={15} className="text-white" />
                          </span>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-900 text-sm truncate">{it.nombre}</p>
                          <p className="text-[11px] text-gray-500">{it.pack_name || `${it.qty ?? 1} und`}</p>
                        </div>
                        {role === 'seller' && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button aria-label="Quitar una unidad"
                              onClick={() => pedirCambio(i, it.nombre, it.qty ?? 1, Math.max(1, (it.qty ?? 1) - 1))}
                              disabled={busy || (it.qty ?? 1) <= 1} className="w-6 h-6 rounded-lg bg-white border text-gray-700 font-black disabled:opacity-40">−</button>
                            <span className="w-5 text-center text-sm font-black">{it.qty ?? 1}</span>
                            <button aria-label="Agregar una unidad"
                              onClick={() => pedirCambio(i, it.nombre, it.qty ?? 1, (it.qty ?? 1) + 1)}
                              disabled={busy} className="w-6 h-6 rounded-lg bg-white border text-gray-700 font-black">+</button>
                          </div>
                        )}
                        <p className="font-bold text-gray-800 text-sm flex-shrink-0 w-14 text-right">S/ {it.precio}</p>
                        {role === 'buyer' && items.length > 1 && (
                          <button onClick={() => setRemovingIdx(removingIdx === i ? null : i)} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--danger-bg)' }}>
                            <Trash2 size={13} className="text-red-500" />
                          </button>
                        )}
                      </div>
                      {role === 'buyer' && removingIdx === i && (
                        <div className="mt-2 rounded-xl p-2.5" style={{ background: 'var(--danger-bg-soft)', border: '0.5px solid var(--danger-border)' }}>
                          <p className="text-[11px] text-red-700 font-semibold mb-2">¿Quitar este producto? Bajará tu puntuación.</p>
                          <div className="flex gap-2">
                            <button onClick={() => setRemovingIdx(null)} className="flex-1 py-1.5 rounded-lg text-xs font-black bg-white border text-gray-600">No</button>
                            <button onClick={() => removeItem(i)} disabled={busy} className="flex-1 py-1.5 rounded-lg text-xs font-black text-white" style={{ background: '#DC2626' }}>{busy ? '…' : 'Sí, quitar'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px dashed #FDE68A' }}>
                  <p className="text-xs font-black text-gray-500 uppercase">Total</p>
                  <p className="font-black text-2xl" style={{ color: 'var(--ok-fg)' }}>S/ {total}</p>
                </div>
              </div>
            )
          })()}

          <div className="space-y-2 mb-4">
            <Row label="Estado" value={stageText} />
            {session.order_id && <Row label="N° de pedido" value={session.order_id} />}
            {session.seller_name && <Row label="Te atiende" value={`${session.seller_name.split(' ')[0]}${session.seller_role ? ` · ${session.seller_role}` : ''}`} />}
          </div>

          {/* Notas CRM (solo vendedor) */}
          {role === 'seller' && (
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Nota (CRM)</p>
              <div className="flex flex-wrap gap-1.5">
                {NOTAS.map(n => {
                  const on = session.nota === n.key
                  return (
                    <button key={n.key} onClick={() => setNota(on ? null : n.key)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                      style={on ? n.style : { background: 'var(--surface-3)', color: 'var(--text-faint)' }}>
                      {n.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Acciones */}
          {cancelled ? (
            role === 'seller' ? (
              <button onClick={recreate} disabled={busy}
                className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)' }}>
                <RefreshCw size={15} /> {busy ? 'Reactivando…' : 'Reactivar pedido (recuperar venta)'}
              </button>
            ) : (
              <div className="text-center py-2 text-sm font-bold" style={{ color: 'var(--danger-fg)' }}>Este pedido está cancelado</div>
            )
          ) : !confirming ? (
            <button onClick={() => setConfirming(true)}
              className="w-full py-3 rounded-2xl font-black text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-fg)' }}>
              Cancelar pedido
            </button>
          ) : (
            <div className="rounded-2xl p-4" style={{ background: 'var(--danger-bg-soft)', border: '0.5px solid var(--danger-border)' }}>
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle size={18} style={{ color: 'var(--danger-fg)' }} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-black">
                  {role === 'buyer' ? 'Si cancelas, bajarás tu puntuación y perderás la posibilidad de:' : '¿Seguro que deseas cancelar este pedido?'}
                </p>
              </div>
              {role === 'buyer' && (
                <>
                  <ul className="space-y-1.5 mb-3 pl-1">
                    {LOSES.map(l => (
                      <li key={l} className="flex items-start gap-2 text-xs text-red-700">
                        <span className="font-black flex-shrink-0" style={{ color: 'var(--danger-fg)' }}>✕</span><span>{l}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-600 font-black mb-3">¿Seguro que quieres cancelar?</p>
                </>
              )}
              {role === 'seller' && <p className="text-xs text-red-600 mb-3">Esta acción no se puede deshacer.</p>}
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} disabled={busy} className="flex-1 py-2.5 rounded-xl font-black text-sm bg-white border border-gray-200 text-gray-600">No, mantener</button>
                <button onClick={cancel} disabled={busy} className="flex-1 py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#DC2626' }}>{busy ? 'Cancelando…' : 'Sí, cancelar'}</button>
              </div>
            </div>
          )}
    </>
  )

  return (
    <>
      {enColumna ? (
        // Dentro de la columna: una tarjeta más, con el mismo aire que las
        // vecinas. Sin velo y sin botón de cerrar — no hay nada que cerrar.
        <div className="mx-4 mt-2 rounded-2xl px-3 py-3"
          style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
          {cuerpo}
        </div>
      ) : (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {cuerpo}
          </div>
        </div>
      )}

      {cambioQty && (
        <Confirmar
          titulo={cambioQty.a > cambioQty.de ? '¿Agregar una unidad?' : '¿Quitar una unidad?'}
          detalle={`${cambioQty.nombre}: ${cambioQty.de} → ${cambioQty.a}. Cambia el total del pedido y el comprador lo ve al instante.`}
          si="Sí, guardar"
          no="No"
          ocupado={busy}
          onSi={() => { const c = cambioQty; setCambioQty(null); setQty(c.i, c.a) }}
          onNo={() => setCambioQty(null)}
        />
      )}

      {/* La galería va por portal: en la columna del pedido este bloque queda
          dentro de un contenedor que scrollea, y su `scrollIntoView` —el que
          centra la imagen— arrastraría también a la columna. */}
      {viewerIdx !== null && viewerImgs.length > 0 && createPortal(
        <div className="fixed inset-0 z-[60] bg-black flex flex-col" onClick={() => setViewerIdx(null)}>
          <div className="flex justify-end p-4">
            <button onClick={() => setViewerIdx(null)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <X size={20} className="text-white" />
            </button>
          </div>
          <div className="flex-1 flex overflow-x-auto snap-x snap-mandatory items-center" onClick={e => e.stopPropagation()}>
            {viewerImgs.map((img, i) => (
              <div key={i} className="snap-center flex-shrink-0 w-full h-full flex items-center justify-center px-2"
                ref={el => { if (el && i === viewerIdx) el.scrollIntoView({ inline: 'center' }) }}>
                <img src={img} alt={`Imagen ${i + 1}`} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
          <p className="text-center text-white/50 text-xs pb-4">Desliza para ver más ‹ ›</p>
        </div>,
        document.body,
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold text-gray-800">{value}</span>
    </div>
  )
}
