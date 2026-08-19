import { useEffect, useState } from 'react'
import { Users, Upload, Gift, Copy, TrendingUp, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const APEX = 'krossclub.app'

interface Stats { total: number; imported: number; activated: number; pending: number }
interface WaTemplate { name: string; language: string; params: number }

// Very small CSV parser: detects nombre / teléfono / DNI columns by header, else
// falls back to positional [nombre, teléfono, dni].
function parseCsv(text: string): { nombre?: string; phone?: string; document_number?: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const split = (l: string) => l.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
  const header = split(lines[0]).map(h => h.toLowerCase())
  const has = (kw: string[]) => header.findIndex(h => kw.some(k => h.includes(k)))
  const iName = has(['nombre', 'name', 'cliente'])
  const iPhone = has(['phone', 'tel', 'whats', 'celular', 'móvil', 'movil', 'número', 'numero'])
  const iDni = has(['dni', 'doc', 'cédula', 'cedula', 'identidad'])
  const headed = iName >= 0 || iPhone >= 0 || iDni >= 0
  const rows = (headed ? lines.slice(1) : lines).map(split)
  return rows.map(c => ({
    nombre: headed ? c[iName] : c[0],
    phone: headed ? c[iPhone] : c[1],
    document_number: headed ? c[iDni] : c[2],
  })).filter(r => (r.phone || r.document_number))
}

export default function ClientesPage() {
  const { real, effective, isAdmin } = useSeller()
  const storeId = effective?.store_id
  const [stats, setStats] = useState<Stats | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [pts, setPts] = useState(0)
  const [msg, setMsg] = useState('')
  const [rate, setRate] = useState(0)
  const [savingReward, setSavingReward] = useState(false)
  const [rows, setRows] = useState<ReturnType<typeof parseCsv>>([])
  const [importing, setImporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [invTemplate, setInvTemplate] = useState<string>('')
  const [inviting, setInviting] = useState(false)

  const loadStats = async () => {
    if (!real) return
    // JWT real: manage-store autentica por Auth; el admin_auth_id queda de compat.
    const { data: auth } = await supabase.auth.getSession()
    fetch(`${BASE}/manage-store`, {
      method: 'POST', headers: { Authorization: `Bearer ${auth.session?.access_token ?? ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'client_stats', admin_auth_id: real.auth_user_id, store_id: storeId }),
    }).then(r => r.json()).then(setStats).catch(() => {})
  }

  useEffect(() => {
    if (!storeId) return
    supabase.from('stores').select('slug, welcome_points, welcome_msg, points_rate').eq('id', storeId).maybeSingle()
      .then(({ data }) => { setSlug(data?.slug ?? null); setPts(data?.welcome_points ?? 0); setMsg(data?.welcome_msg ?? ''); setRate(Number(data?.points_rate ?? 0)) })
    loadStats()
    fetch(`${BASE}/list-wa-templates`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    }).then(r => r.json()).then(d => { setTemplates(d.templates ?? []); if (d.templates?.[0]) setInvTemplate(d.templates[0].name) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, real?.auth_user_id])

  const sendInvites = async () => {
    if (!invTemplate) { alert('Elige una plantilla de invitación.'); return }
    const t = templates.find(x => x.name === invTemplate)
    setInviting(true)
    try {
      const res = await fetch(`${BASE}/invite-buyers`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_auth_id: real?.auth_user_id, store_id: storeId, template: invTemplate, language: t?.language, params: t?.params, limit: 80 }),
      })
      const r = await res.json().catch(() => ({}))
      if (res.ok) { alert(`Enviadas: ${r.sent}. Fallidas: ${r.failed}. Quedan por invitar: ${r.remaining}.`); loadStats() }
      else alert('No se pudo invitar: ' + (r.error || ''))
    } finally { setInviting(false) }
  }

  if (!isAdmin) return <div className="px-4 py-8 text-center text-sm text-gray-400">Solo el administrador gestiona los clientes.</div>

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    const text = await f.text()
    setRows(parseCsv(text))
    if (e.target) e.target.value = ''
  }

  const doImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    try {
      const res = await fetch(`${BASE}/import-buyers`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_auth_id: real?.auth_user_id, store_id: storeId, rows }),
      })
      const r = await res.json().catch(() => ({}))
      if (res.ok) { alert(`Importados: ${r.imported}. Omitidos: ${r.skipped}.`); setRows([]); loadStats() }
      else alert('No se pudo importar: ' + (r.error || ''))
    } finally { setImporting(false) }
  }

  const saveReward = async () => {
    setSavingReward(true)
    try {
      const { data: auth } = await supabase.auth.getSession()
      await fetch(`${BASE}/manage-store`, {
        method: 'POST', headers: { Authorization: `Bearer ${auth.session?.access_token ?? ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', admin_auth_id: real?.auth_user_id, store_id: storeId, welcome_points: pts, welcome_msg: msg, points_rate: rate }),
      })
    } finally { setSavingReward(false) }
  }

  const inviteLink = slug ? `https://${slug}.${APEX}/acceso` : `https://${APEX}/acceso`
  const activationRate = stats && stats.total > 0 ? Math.round((stats.activated / stats.total) * 100) : 0

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2"><Users size={20} /> Clientes</h1>
      <p className="text-xs text-gray-400 mb-4">Activa tu base para que vuelvan a comprar.</p>

      {/* Activation funnel */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Total', value: stats?.total ?? 0, color: '#111' },
          { label: 'Importados', value: stats?.imported ?? 0, color: '#863bff' },
          { label: 'Activados', value: stats?.activated ?? 0, color: '#16A34A' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-3 text-center shadow-sm">
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-gray-400 font-bold">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl p-3 mb-5 flex items-center gap-3" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
        <TrendingUp size={18} style={{ color: '#16A34A' }} />
        <p className="text-xs font-black text-gray-800">{activationRate}% de tu base ya activó su app <span className="font-bold text-gray-500">— ese es tu canal de recompra sin ads.</span></p>
      </div>

      {/* Welcome reward */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
        <p className="font-black text-sm text-gray-900 flex items-center gap-2 mb-1"><Gift size={16} style={{ color: 'var(--brand)' }} /> Recompensa de bienvenida</p>
        <p className="text-[11px] text-gray-400 mb-3">Se acredita cuando el cliente entra con su DNI. Es el gancho para que active su app.</p>
        <label className="text-xs font-bold text-gray-500 mb-1 block">Puntos de regalo</label>
        <input value={pts || ''} onChange={e => setPts(Number(e.target.value.replace(/\D/g, '')) || 0)} inputMode="numeric" placeholder="Ej: 50"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-2" />
        <label className="text-xs font-bold text-gray-500 mb-1 block">Mensaje (opcional)</label>
        <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Ej: ¡Gracias por ser cliente! Aquí tienes tus puntos."
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-3" />
        <label className="text-xs font-bold text-gray-500 mb-1 block">Valor del punto para canje (S/ por punto · 0 = desactivado)</label>
        <input value={rate || ''} onChange={e => setRate(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} inputMode="decimal" placeholder="Ej: 0.1"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-1" />
        {rate > 0 && <p className="text-[10px] text-gray-400 mb-2">Ej: 50 puntos = S/{(50 * rate).toFixed(2)} de descuento en su próxima compra.</p>}
        <button onClick={saveReward} disabled={savingReward}
          className="w-full py-2.5 rounded-2xl font-black text-sm text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {savingReward ? 'Guardando…' : 'Guardar recompensa'}
        </button>
      </div>

      {/* Import */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
        <p className="font-black text-sm text-gray-900 flex items-center gap-2 mb-1"><Upload size={16} style={{ color: '#863bff' }} /> Importar clientes</p>
        <p className="text-[11px] text-gray-400 mb-3">Sube un CSV con nombre, teléfono y DNI. Detectamos las columnas solas.</p>
        <label className="block w-full text-center py-2.5 rounded-2xl font-black text-sm cursor-pointer" style={{ background: '#F3E8FF', color: '#863bff' }}>
          {rows.length > 0 ? `${rows.length} clientes listos` : 'Elegir archivo CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>
        {rows.length > 0 && (
          <button onClick={doImport} disabled={importing}
            className="w-full mt-2 py-2.5 rounded-2xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#863bff' }}>
            {importing ? 'Importando…' : `Importar ${rows.length} clientes`}
          </button>
        )}
      </div>

      {/* Mass invite by WhatsApp */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
        <p className="font-black text-sm text-gray-900 flex items-center gap-2 mb-1"><Send size={16} style={{ color: '#25D366' }} /> Invitar por WhatsApp (masivo)</p>
        <p className="text-[11px] text-gray-400 mb-3">
          Envía la invitación a tus clientes importados que aún no activan. Se manda por <b>lotes de 80</b> para cuidar la calidad del número.
          Pendientes por invitar: <b>{stats?.pending ?? 0}</b>.
        </p>
        {templates.length === 0 ? (
          <p className="text-[11px] text-gray-400">No hay plantillas. Configura el WABA ID y aprueba una plantilla de invitación.</p>
        ) : (
          <>
            <select value={invTemplate} onChange={e => setInvTemplate(e.target.value)}
              className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-2">
              {templates.map(t => <option key={t.name + t.language} value={t.name}>{t.name} ({t.params} var{t.params === 1 ? '' : 's'})</option>)}
            </select>
            <button onClick={sendInvites} disabled={inviting || (stats?.pending ?? 0) === 0}
              className="w-full py-2.5 rounded-2xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#25D366' }}>
              {inviting ? 'Enviando lote…' : `Enviar invitación a ${Math.min(80, stats?.pending ?? 0)} clientes`}
            </button>
            <p className="text-[10px] text-gray-400 mt-1.5">Convención de la plantilla: {'{{1}}'} nombre · {'{{2}}'} recompensa · {'{{3}}'} link. Repite el envío para el siguiente lote.</p>
          </>
        )}
      </div>

      {/* Invite link */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <p className="font-black text-sm text-gray-900 mb-1">Link de invitación</p>
        <p className="text-[11px] text-gray-400 mb-2">Compártelo (WhatsApp, redes) para que tus clientes entren con su DNI y reclamen su recompensa.</p>
        <button onClick={() => { navigator.clipboard?.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="w-full flex items-center justify-between gap-2 bg-gray-100 rounded-2xl px-4 py-3">
          <span className="text-xs font-mono text-gray-700 truncate">{inviteLink}</span>
          <span className="flex items-center gap-1 text-xs font-black flex-shrink-0" style={{ color: 'var(--brand)' }}><Copy size={13} /> {copied ? '¡Copiado!' : 'Copiar'}</span>
        </button>
      </div>
    </div>
  )
}
