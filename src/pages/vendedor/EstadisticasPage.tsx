import { useEffect, useState } from 'react'
import { BarChart2, Package } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { NOTA_META, stageBar } from '../../lib/order-chips'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const STAGES = [
  { key: 'nuevo', label: 'Pedido', emoji: '📋' },
  { key: 'confirmado', label: 'Confirmado', emoji: '📞' },
  { key: 'preparando', label: 'Preparando', emoji: '📦' },
  { key: 'en_camino', label: 'En camino', emoji: '🚚' },
  { key: 'entregado', label: 'Entregado', emoji: '✅' },
]

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

interface Sess { id: string; stage: string; status?: string; nota?: string | null; assigned_seller_id: string | null; seller_name?: string | null; seller_role?: string | null }


export default function EstadisticasPage() {
  const { effective, isAdmin, impersonating } = useSeller()
  const [sessions, setSessions] = useState<Sess[]>([])
  const [loading, setLoading] = useState(true)

  const adminView = isAdmin && !impersonating
  const onlyMine = !!effective && !adminView

  useEffect(() => {
    if (!effective) return
    setLoading(true)
    const headers: Record<string, string> = { Authorization: `Bearer ${ANON}`, 'x-store-id': effective.store_id, 'x-include-cancelled': '1' }
    if (onlyMine) headers['x-seller-id'] = effective.auth_user_id
    fetch(`${BASE}/get-store-sessions`, { headers })
      .then(r => (r.ok ? r.json() : []))
      .then((d: Sess[]) => setSessions(Array.isArray(d) ? d : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [effective?.auth_user_id, effective?.store_id, onlyMine])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  const active = sessions.filter(s => s.status !== 'cancelado')
  const total = active.length
  const byStage = STAGES.map(s => ({ ...s, count: active.filter(x => x.stage === s.key).length }))
  const maxStage = Math.max(1, ...byStage.map(s => s.count))

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
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2 mb-1"><BarChart2 size={20} /> Estadísticas</h1>
      <p className="text-xs text-gray-400 mb-4">{adminView ? 'Toda la tienda' : `Tus pedidos · ${effective?.role_label}`}</p>

      <div className="rounded-2xl p-4 mb-4 text-white" style={{ background: 'linear-gradient(135deg, var(--brand), #863bff)' }}>
        <p className="text-white/70 text-xs font-bold">Pedidos activos</p>
        <p className="font-black text-4xl">{total}</p>
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
