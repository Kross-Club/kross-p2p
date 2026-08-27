import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Eye, LogIn, UserPlus, X, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { demoActivo } from '../../lib/demo/modo-demo'
import { tiendaDemo } from '../../lib/demo/tienda-demo'
import { useSeller, type SellerProfile } from '../../lib/seller-session'
import PushSettings from '../../components/PushSettings'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Modelo por defecto: la venta la cierra el checkout/IA y el reparto lo hace la
// agencia, así que el equipo operativo es LOGÍSTICA (supervisa que el
// seguimiento automático funcione) + el admin, que lo ve todo. Ventas, Soporte
// y Motorizado quedan como roles legado: se muestran si un miembro aún los
// tiene, pero ya no se ofrecen al crear ni al cambiar rol.
const ROLES = ['Logística']
const ROLE_ORDER = ['venta', 'logist', 'despacho', 'soporte', 'motoriz', 'admin']
const roleRank = (r: string) => { const i = ROLE_ORDER.findIndex(k => r.toLowerCase().includes(k)); return i === -1 ? 99 : i }
function roleColor(role: string) {
  const r = (role ?? '').toLowerCase()
  if (r.includes('venta')) return '#55C8F5'
  if (r.includes('logist') || r.includes('despacho')) return '#863bff'
  if (r.includes('soporte')) return '#14B8A6'
  if (r.includes('motoriz')) return '#FF8C00'
  if (r.includes('admin')) return '#111'
  return '#888'
}

export default function EquipoPage() {
  const navigate = useNavigate()
  const { real, effective, isAdmin, impersonating, loading: sellerLoading, actAs, stopActing } = useSeller()
  const [team, setTeam] = useState<SellerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [emails, setEmails] = useState<Record<string, string>>({})

  const storeId = effective?.store_id
  const loadTeam = async () => {
    // En demo el equipo es el de la tienda de ejemplo: seis personas con los
    // roles reales de una operación de contraentrega.
    if (demoActivo(storeId)) {
      const t = await tiendaDemo()
      setTeam(t.equipo as unknown as SellerProfile[])
      setLoading(false)
      return
    }
    if (!storeId) return
    try {
      const { data } = await supabase.from('sellers')
        .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin, available')
        .eq('store_id', storeId)
      const list = (data as SellerProfile[]) ?? []
      setTeam(list)
      try { localStorage.setItem(`team:${storeId}`, JSON.stringify(list)) } catch { /* ignore */ }
    } catch { /* keep whatever we have (e.g. cache) */ }
    finally { setLoading(false) } // ALWAYS clear — a rejected query must never hang the spinner
  }
  // Scope to the store being acted in (effective). Seed from a per-store cache so
  // the page paints instantly on a client-side nav, then revalidate — the finally
  // above + the watchdog guarantee we never get stuck spinning.
  useEffect(() => {
    if (!effective) { if (!sellerLoading) setLoading(false); return }
    try {
      const raw = storeId ? localStorage.getItem(`team:${storeId}`) : null
      if (raw) { setTeam(JSON.parse(raw) as SellerProfile[]); setLoading(false) }
    } catch { /* ignore */ }
    loadTeam()
    const t = setTimeout(() => setLoading(false), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, sellerLoading])

  // El correo de cada miembro vive en `auth.users` y solo lo puede leer el
  // service role, así que lo trae la función. Es la única forma de que un admin
  // sepa con qué dirección creó una cuenta — que es justo lo que hay que
  // escribir para recuperar la contraseña. Si la función no responde, la página
  // funciona igual: el correo es un dato de más, no la razón de esta pantalla.
  useEffect(() => {
    const adminId = real?.auth_user_id
    if (!isAdmin || !adminId || !storeId) return
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch(`${BASE}/admin-team`, {
          method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'emails', admin_auth_id: adminId, store_id: storeId }),
        })
        if (!res.ok) return
        const r = await res.json()
        if (vivo) setEmails(r.emails ?? {})
      } catch { /* sin correos se ve igual que antes */ }
    })()
    return () => { vivo = false }
  }, [isAdmin, real?.auth_user_id, storeId])

  // Real connection presence
  useEffect(() => {
    const ch = supabase.channel('presence:sellers')
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const enterAs = (s: SellerProfile) => { if (s.auth_user_id === real?.auth_user_id) stopActing(); else actAs(s); navigate('/vendedor/pedidos') }

  const setAvailable = async (s: SellerProfile, available: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(`${BASE}/admin-team`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_available', admin_auth_id: real?.auth_user_id, seller_id: s.auth_user_id, available }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) { alert('No se pudo cambiar el turno.'); return }
      if (r.reassigned > 0) alert(`Turno cerrado. Se cedieron ${r.reassigned} pedido(s) a otro ${s.role_label}.`)
      loadTeam()
    } finally { setBusy(false) }
  }

  const setRole = async (s: SellerProfile, role_label: string) => {
    setBusy(true)
    try {
      await fetch(`${BASE}/admin-team`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', admin_auth_id: real?.auth_user_id, seller_id: s.auth_user_id, role_label }),
      })
      setProfile(null); loadTeam()
    } finally { setBusy(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  if (!isAdmin) {
    return (
      <div className="px-4 py-4">
        <h1 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2"><Users size={20} /> Mi cuenta</h1>
        {effective && <MemberCard s={effective} isSelf online={online} />}
        {real && <div className="mt-3"><PushSettings sellerAuthId={real.auth_user_id} /></div>}
        <p className="text-xs text-gray-400 mt-4 text-center">Solo el administrador administra el equipo.</p>
      </div>
    )
  }

  const sorted = [...team].sort((a, b) => roleRank(a.role_label) - roleRank(b.role_label))

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><Users size={20} /> Mi equipo</h1>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-xl" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
          <UserPlus size={13} /> Agregar
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">Punto verde = conectado ahora. El switch controla su turno.</p>

      {impersonating && (
        <div className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'linear-gradient(90deg, #7C3AED, #4F46E5)' }}>
          <p className="text-xs font-bold text-white flex items-center gap-2"><Eye size={14} /> Viendo como {effective?.nombre.split(' ')[0]}</p>
          <button onClick={stopActing} className="text-xs font-black px-3 py-1 rounded-lg text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>Volver a admin</button>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(s => (
          <MemberCard key={s.id} s={s} isSelf={s.auth_user_id === real?.auth_user_id} online={online}
            email={emails[s.auth_user_id]}
            admin onEnter={() => enterAs(s)} onToggle={(v) => setAvailable(s, v)} onProfile={() => setProfile(s)} busy={busy} />
        ))}
      </div>

      {real && <div className="mt-4"><PushSettings sellerAuthId={real.auth_user_id} /></div>}

      {/* Profile / change role */}
      {profile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setProfile(null)}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="min-w-0">
                <h3 className="font-black text-gray-900 truncate">{profile.nombre}</h3>
                {emails[profile.auth_user_id] && (
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{emails[profile.auth_user_id]}</p>
                )}
              </div>
              <button onClick={() => setProfile(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            {profile.is_admin ? (
              <p className="text-sm text-gray-400">Es administrador.</p>
            ) : (
              <>
                <p className="text-xs font-bold text-gray-500 mb-2">Cambiar rol</p>
                {!ROLES.includes(profile.role_label) && (
                  <p className="text-[10px] text-gray-400 mb-2">
                    Rol actual: <span className="font-bold" style={{ color: roleColor(profile.role_label) }}>{profile.role_label}</span> (legado
                    — el modelo por defecto solo usa Logística; la venta la cierra la app sola).
                  </p>
                )}
                <div className="space-y-2">
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setRole(profile, r)} disabled={busy}
                      className="w-full flex items-center justify-between p-3 rounded-2xl border text-left disabled:opacity-50"
                      style={{ borderColor: profile.role_label === r ? roleColor(r) : '#f0f0f0', borderWidth: profile.role_label === r ? 2 : 1 }}>
                      <span className="font-bold text-sm" style={{ color: roleColor(r) }}>{r}</span>
                      {profile.role_label === r && <span className="text-[10px] font-black" style={{ color: roleColor(r) }}>Actual</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setProfile(null)} className="w-full mt-4 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm">Cerrar</button>
          </div>
        </div>
      )}

      {showAdd && <AddMember storeId={effective?.store_id ?? ''} adminId={real?.auth_user_id ?? ''} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); loadTeam() }} />}
    </div>
  )
}

function MemberCard({ s, isSelf, online, email, admin, onEnter, onToggle, onProfile, busy }: {
  s: SellerProfile; isSelf?: boolean; online: Set<string>; email?: string
  admin?: boolean; onEnter?: () => void; onToggle?: (v: boolean) => void; onProfile?: () => void; busy?: boolean
}) {
  const color = roleColor(s.is_admin ? 'admin' : s.role_label)
  const isOnline = online.has(s.auth_user_id)
  const available = s.available !== false
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm" style={{ border: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: `${color}22` }}>
            {s.avatar_url ? <img src={s.avatar_url} alt={s.nombre} className="w-full h-full object-cover" /> : <span className="font-black text-lg" style={{ color }}>{s.nombre.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: isOnline ? '#4ADE80' : '#9CA3AF' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 text-sm truncate">{s.nombre}{isSelf && <span className="text-gray-400 font-bold"> · tú</span>}</p>
          {/* Con qué correo entra: es lo que se escribe para recuperar la clave. */}
          {email && <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }} title={email}>{email}</p>}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${color}22`, color }}>{s.is_admin ? 'Admin' : s.role_label}</span>
            <span className="text-[10px] font-bold" style={{ color: isOnline ? '#16A34A' : '#9CA3AF' }}>{isOnline ? 'Conectado' : 'Desconectado'}</span>
          </div>
        </div>
        {admin && onProfile && !s.is_admin && (
          <button onClick={onProfile} className="p-2 rounded-xl" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }} title="Editar"><Pencil size={14} /></button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        {admin && !s.is_admin && onToggle && (
          <button onClick={() => onToggle(!available)} disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black disabled:opacity-50"
            style={{ background: available ? '#DCFCE7' : '#FEE2E2', color: available ? '#16A34A' : '#DC2626' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: available ? '#16A34A' : '#DC2626' }} />
            {available ? 'En turno' : 'Fuera de turno'}
          </button>
        )}
        {onEnter && (
          <button onClick={onEnter}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black"
            style={{ background: isSelf ? '#f0f0f0' : color, color: isSelf ? '#666' : '#fff' }}>
            <LogIn size={13} /> {isSelf ? 'Mi vista' : 'Entrar como'}
          </button>
        )}
      </div>
    </div>
  )
}

function AddMember({ storeId, adminId, onClose, onDone }: { storeId: string; adminId: string; onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Único rol de equipo del modelo por defecto (la venta la cierra la app sola)
  const role = 'Logística'
  const [asAdmin, setAsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!nombre || !email || password.length < 6) { setErr('Completa nombre, correo y contraseña (mín. 6).'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(`${BASE}/admin-team`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', admin_auth_id: adminId, store_id: storeId, nombre, email, password, role_label: role, is_admin: asAdmin }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(r.error || 'No se pudo crear el miembro.'); return }
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900">Agregar miembro</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="space-y-2">
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo"
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Correo (para su login)"
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
          <input value={password} onChange={e => setPassword(e.target.value)} type="text" placeholder="Contraseña (mín. 6)"
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
          <button onClick={() => setAsAdmin(a => !a)}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3"
            style={{ background: asAdmin ? '#111' : '#F3F4F6' }}>
            <span className="text-xs font-black" style={{ color: asAdmin ? '#fff' : '#666' }}>
              Administrador de la marca
            </span>
            <span className="text-[10px] font-black px-2 py-1 rounded-full"
              style={{ background: asAdmin ? '#fff' : '#e5e7eb', color: asAdmin ? '#111' : '#888' }}>
              {asAdmin ? 'SÍ' : 'NO'}
            </span>
          </button>
          {asAdmin && <p className="text-[10px] text-gray-400 px-1">Podrá gestionar el equipo, productos y CRM, y entrar por su subdominio.</p>}
          {!asAdmin && (
            <div className="rounded-2xl px-4 py-3" style={{ background: `${roleColor(role)}15` }}>
              <p className="text-xs font-black" style={{ color: roleColor(role) }}>Rol: {role}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Supervisa que el seguimiento automático de los pedidos funcione bien. La venta la cierra la app sola.
              </p>
            </div>
          )}
        </div>
        {err && <p className="text-xs font-semibold text-center mt-2" style={{ color: 'var(--danger-fg)' }}>{err}</p>}
        <button onClick={submit} disabled={busy}
          className="w-full mt-4 py-3 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
          {busy ? 'Creando…' : 'Crear miembro'}
        </button>
      </div>
    </div>
  )
}
