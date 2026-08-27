import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, Repeat, DollarSign, Package, RotateCcw, Send, Settings } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Metrics {
  config: { restock_days: number; winback_days: number }
  customers: { total: number; activated: number; with_order: number; repeat: number }
  revenue: { total: number; avg_ltv: number; avg_orders: number }
  repeat_rate: number
  segments: { restock: number; winback: number }
}
interface WaTemplate { name: string; language: string; params: number }

const soles = (n: number) => `S/ ${(n ?? 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`

export default function ClientesReactivar() {
  const { real, effective } = useSeller()
  const storeId = effective?.store_id
  const [m, setM] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  // config windows
  const [restock, setRestock] = useState(30)
  const [winback, setWinback] = useState(60)
  const [savingCfg, setSavingCfg] = useState(false)

  const load = useCallback(() => {
    if (!real || !storeId) return
    setLoading(true)
    fetch(`${BASE}/retention-metrics`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_auth_id: real.auth_user_id, store_id: storeId }),
    }).then(r => r.json()).then((d: Metrics) => {
      setM(d)
      if (d?.config) { setRestock(d.config.restock_days); setWinback(d.config.winback_days) }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [real, storeId])

  useEffect(() => {
    if (!storeId) return
    load()
    fetch(`${BASE}/list-wa-templates`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    }).then(r => r.json()).then(d => setTemplates(d.templates ?? [])).catch(() => {})
  }, [storeId, load])

  const saveCfg = async () => {
    setSavingCfg(true)
    try {
      // JWT real: manage-store autentica por Auth; el admin_auth_id queda de compat.
      const { data: auth } = await supabase.auth.getSession()
      await fetch(`${BASE}/manage-store`, {
        method: 'POST', headers: { Authorization: `Bearer ${auth.session?.access_token ?? ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', admin_auth_id: real?.auth_user_id, store_id: storeId, restock_days: restock, winback_days: winback }),
      })
      load()
    } finally { setSavingCfg(false) }
  }

  const repeatPct = m ? Math.round(m.repeat_rate * 100) : 0

  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-4">Cuánto vuelven a comprar tus clientes y cómo reactivarlos.</p>

      {loading && !m ? (
        <div className="py-16 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Kpi icon={<Repeat size={15} />} label="Tasa de recompra" value={`${repeatPct}%`} sub={`${m?.customers.repeat ?? 0} de ${m?.customers.with_order ?? 0} clientes`} color="#16A34A" />
            <Kpi icon={<DollarSign size={15} />} label="Ingreso de existentes" value={soles(m?.revenue.total ?? 0)} sub="entregas acumuladas" color="#863bff" />
            <Kpi icon={<TrendingUp size={15} />} label="LTV promedio" value={soles(m?.revenue.avg_ltv ?? 0)} sub={`${(m?.revenue.avg_orders ?? 0).toFixed(1)} pedidos/cliente`} color="#111" />
            <Kpi icon={<Package size={15} />} label="Clientes activos" value={`${m?.customers.activated ?? 0}`} sub={`de ${m?.customers.total ?? 0} en tu base`} color="#F59E0B" />
          </div>

          {/* Campaigns */}
          <p className="text-xs font-black text-gray-500 uppercase tracking-wide mt-5 mb-2">Campañas</p>
          <CampaignCard
            segment="restock" title="Recordatorio de reposición" accent="#16A34A"
            desc={`Clientes cuya última compra fue hace ${m?.config.restock_days ?? 30}–${m?.config.winback_days ?? 60} días: su producto se está acabando. El mejor momento para que repitan.`}
            count={m?.segments.restock ?? 0} templates={templates} real={real} storeId={storeId} onDone={load}
          />
          <CampaignCard
            segment="winback" title="Reactivar clientes dormidos" accent="#EF4444"
            desc={`Clientes sin comprar hace más de ${m?.config.winback_days ?? 60} días. Un empujón con incentivo los trae de vuelta antes de perderlos.`}
            count={m?.segments.winback ?? 0} templates={templates} real={real} storeId={storeId} onDone={load}
          />

          {/* Windows config */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 mt-4 shadow-sm">
            <p className="font-black text-sm text-gray-900 flex items-center gap-2 mb-1"><Settings size={15} /> Ventanas de campaña</p>
            <p className="text-[11px] text-gray-400 mb-3">Ajusta según el ciclo de tu producto. Un consumible de 30 días → reposición ~25–30.</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">Reposición (días)</label>
                <input value={restock || ''} onChange={e => setRestock(Number(e.target.value.replace(/\D/g, '')) || 0)} inputMode="numeric"
                  className="w-full bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">Inactivo (días)</label>
                <input value={winback || ''} onChange={e => setWinback(Number(e.target.value.replace(/\D/g, '')) || 0)} inputMode="numeric"
                  className="w-full bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none" />
              </div>
            </div>
            <button onClick={saveCfg} disabled={savingCfg || restock < 1 || winback <= restock}
              className="w-full py-2.5 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
              {savingCfg ? 'Guardando…' : 'Guardar ventanas'}
            </button>
            {winback <= restock && <p className="text-[10px] text-red-500 mt-1.5">El umbral inactivo debe ser mayor que el de reposición.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>{icon}<span className="text-[10px] font-bold text-gray-400">{label}</span></div>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
      <p className="text-[10px] text-gray-400 font-bold truncate">{sub}</p>
    </div>
  )
}

function CampaignCard({ segment, title, desc, count, accent, templates, real, storeId, onDone }: {
  segment: 'restock' | 'winback'; title: string; desc: string; count: number; accent: string
  templates: WaTemplate[]; real: { auth_user_id: string } | null; storeId?: string; onDone: () => void
}) {
  const [tpl, setTpl] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => { if (!tpl && templates[0]) setTpl(templates[0].name) }, [templates, tpl])

  const send = async () => {
    if (!tpl) { alert('Elige una plantilla.'); return }
    const t = templates.find(x => x.name === tpl)
    if (!confirm(`Enviar la campaña "${title}" a ${Math.min(80, count)} clientes por WhatsApp?`)) return
    setSending(true)
    try {
      const res = await fetch(`${BASE}/run-campaign`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_auth_id: real?.auth_user_id, store_id: storeId, segment, template: tpl, language: t?.language, params: t?.params, limit: 80 }),
      })
      const r = await res.json().catch(() => ({}))
      if (res.ok) { alert(`Elegibles: ${r.eligible}. Enviadas: ${r.sent}. Fallidas: ${r.failed}. Quedan: ${r.remaining}.`); onDone() }
      else alert('No se pudo enviar: ' + (r.error || ''))
    } finally { setSending(false) }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="font-black text-sm text-gray-900 flex items-center gap-2">
          {segment === 'restock' ? <RotateCcw size={15} style={{ color: accent }} /> : <Repeat size={15} style={{ color: accent }} />}
          {title}
        </p>
        <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: `${accent}1A`, color: accent }}>{count}</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">{desc}</p>
      {templates.length === 0 ? (
        <p className="text-[11px] text-gray-400">Configura el WABA y aprueba una plantilla para lanzar campañas.</p>
      ) : (
        <>
          <select value={tpl} onChange={e => setTpl(e.target.value)} className="w-full bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none mb-2">
            {templates.map(t => <option key={t.name + t.language} value={t.name}>{t.name} ({t.params} var{t.params === 1 ? '' : 's'})</option>)}
          </select>
          <button onClick={send} disabled={sending || count === 0}
            className="w-full py-2.5 rounded-2xl font-black text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: accent }}>
            <Send size={14} /> {sending ? 'Enviando lote…' : `Enviar a ${Math.min(80, count)} clientes`}
          </button>
          <p className="text-[10px] text-gray-400 mt-1.5">Plantilla: {'{{1}}'} nombre · {'{{2}}'} link a la tienda. Cooldown de 7 días por cliente. Lotes de 80.</p>
        </>
      )}
    </div>
  )
}
