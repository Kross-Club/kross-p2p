import { Package } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { NOTA_META, stageBar } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido } from '../../lib/order-tracking'
import { estaVivo } from '../../lib/store-orders'
import type { StoreOrders } from '../../lib/store-orders'

function roleColor(role: string) {
  const r = (role ?? '').toLowerCase()
  if (r.includes('venta')) return '#55C8F5'
  if (r.includes('logist') || r.includes('despacho')) return '#863bff'
  if (r.includes('soporte')) return '#14B8A6'
  if (r.includes('motoriz')) return '#FF8C00'
  return '#888'
}
function roleCat(role: string) {
  const r = (role ?? '').toLowerCase()
  if (r.includes('venta')) return 'Ventas'
  if (r.includes('logist') || r.includes('despacho')) return 'Logística'
  if (r.includes('soporte')) return 'Soporte'
  if (r.includes('motoriz')) return 'Motorizado'
  return 'Otro'
}

export default function PedidosResumen({ lista }: { lista: StoreOrders }) {
  const { effective, isAdmin, impersonating } = useSeller()
  // Los cancelados llegan en la lista y acá SÍ se usan: el desglose de notas
  // los cuenta (una nota "cancelado" solo existe en un pedido cancelado).
  const { pedidos: sessions, cargando: loading } = lista
  const adminView = isAdmin && !impersonating

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  const active = sessions.filter(estaVivo)
  const total = active.length
  // Mismas columnas que el tablero del CRM, mismo `columnaDelPedido`: si acá se
  // contara por `stage` crudo, Stats y CRM darían números distintos del mismo
  // día. `no_entregado` se cuenta aparte porque no es un paso del eje.
  const columnaDe = new Map(active.map(s => [s.id, columnaDelPedido(s)]))
  const byStage = COLUMNAS.map(c => ({
    ...c, count: active.filter(x => columnaDe.get(x.id) === c.key).length,
  }))
  const caidos = active.filter(x => columnaDe.get(x.id) === 'no_entregado').length
  const maxStage = Math.max(1, ...byStage.map(s => s.count), caidos)

  // Notas breakdown (across active + cancelled)
  const notaMap: Record<string, number> = {}
  for (const s of sessions) { if (s.nota) notaMap[s.nota] = (notaMap[s.nota] ?? 0) + 1 }
  const notaKeys = Object.keys(NOTA_META).filter(k => notaMap[k])

  const memberMap: Record<string, { name: string; role: string; count: number }> = {}
  for (const s of active) {
    const id = s.assigned_seller_id ?? 'sin'
    if (!memberMap[id]) memberMap[id] = { name: s.seller_name ?? 'Sin asignar', role: s.seller_role ?? '', count: 0 }
    memberMap[id].count++
  }
  const members = Object.values(memberMap).sort((a, b) => b.count - a.count)

  const roleMap: Record<string, number> = {}
  for (const s of active) { const c = roleCat(s.seller_role ?? ''); roleMap[c] = (roleMap[c] ?? 0) + 1 }

  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-4">{adminView ? 'Toda la tienda' : `Tus pedidos · ${effective?.role_label}`}</p>

      <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
        <p className="text-xs font-bold" style={{ color: 'var(--text-faint)' }}>Pedidos activos</p>
        <p className="font-black text-4xl tabular" style={{ color: 'var(--text)' }}>{total}</p>
      </div>

      <h2 className="font-black text-sm text-gray-900 mb-2">Por estado</h2>
      <div className="space-y-2 mb-6">
        {byStage.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{s.emoji} {s.label}</span>
            <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full flex items-center justify-end px-2" style={{ width: `${(s.count / maxStage) * 100}%`, background: stageBar(s.key), minWidth: s.count > 0 ? 24 : 0 }}>
                {s.count > 0 && <span className="text-[10px] font-black text-white">{s.count}</span>}
              </div>
            </div>
          </div>
        ))}
        {caidos > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--danger-fg)' }}>⚠️ No entregado</span>
            <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full flex items-center justify-end px-2"
                style={{ width: `${(caidos / maxStage) * 100}%`, background: 'var(--danger-fg)', minWidth: 24 }}>
                <span className="text-[10px] font-black text-white">{caidos}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {notaKeys.length > 0 && (
        <>
          <h2 className="font-black text-sm text-gray-900 mb-2">Notas / seguimiento</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {notaKeys.map(k => (
              <div key={k} className="flex items-center gap-2 px-3 py-2 rounded-2xl" style={NOTA_META[k].style}>
                <span className="font-black text-lg tabular">{notaMap[k]}</span>
                <span className="text-xs font-bold">{NOTA_META[k].label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {adminView && (
        <>
          <h2 className="font-black text-sm text-gray-900 mb-2">Por categoría de rol</h2>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {['Ventas', 'Logística', 'Soporte', 'Motorizado'].map(cat => (
              <div key={cat} className="rounded-2xl p-3 text-center" style={{ background: `${roleColor(cat)}18` }}>
                <p className="font-black text-2xl" style={{ color: roleColor(cat) }}>{roleMap[cat] ?? 0}</p>
                <p className="text-[10px] font-bold" style={{ color: roleColor(cat) }}>{cat}</p>
              </div>
            ))}
          </div>

          <h2 className="font-black text-sm text-gray-900 mb-2">Por miembro</h2>
          <div className="space-y-2">
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white" style={{ border: '0.5px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0" style={{ background: `${roleColor(m.role)}22`, color: roleColor(m.role) }}>{m.name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">{m.name}</p>
                  <p className="text-[10px] text-gray-400">{m.role || '—'}</p>
                </div>
                <span className="font-black text-lg" style={{ color: roleColor(m.role) }}>{m.count}</span>
              </div>
            ))}
            {members.length === 0 && (
              <div className="text-center py-8"><Package size={32} className="mx-auto mb-2 opacity-30" /><p className="text-xs text-gray-400">Sin pedidos aún</p></div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
