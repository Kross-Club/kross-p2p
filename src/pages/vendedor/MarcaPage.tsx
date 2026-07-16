import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store as StoreIcon, Plus, X, Check, ExternalLink, Power, MessageCircle, LogIn } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller, type SellerProfile } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const APEX = 'krossclub.app'

interface StoreRow {
  id: string
  slug: string
  nombre: string
  logo_url: string | null
  color_primary: string
  color_dark: string
  active: boolean
  created_at?: string
  wa_enabled?: boolean
  wa_phone_number_id?: string | null
  wa_display_phone?: string | null
}

const ERR: Record<string, string> = {
  slug_reservado: 'Ese subdominio está reservado. Elige otro.',
  slug_en_uso: 'Ese subdominio ya está en uso por otra marca.',
  faltan_nombre_slug: 'Completa el nombre y el subdominio.',
  admin_invalido: 'Revisa el correo y la contraseña (mín. 6) del admin.',
  nada_que_guardar: 'No hay cambios para guardar.',
}

async function call(payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/manage-store`, {
    method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export default function MarcaPage() {
  const navigate = useNavigate()
  const { real, isAdmin, impersonating, actAs } = useSeller()

  // Super admin "enters" a brand by acting as its admin → the whole store toolset
  // (Chats, Productos, CRM, Equipo, Stats) scopes to that brand.
  const enterStore = async (storeId: string) => {
    const { data } = await supabase.from('sellers')
      .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin, is_super_admin, available')
      .eq('store_id', storeId).eq('is_admin', true).limit(1).maybeSingle()
    if (data) { actAs(data as SellerProfile); navigate('/vendedor/chats') }
    else alert('Esta marca aún no tiene un administrador para entrar. Créalo primero.')
  }
  const [stores, setStores] = useState<StoreRow[]>([])
  const [isSuper, setIsSuper] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [waUsage, setWaUsage] = useState<Record<string, number>>({})

  const load = async () => {
    if (!real) return
    const { ok, data } = await call({ action: 'list', admin_auth_id: real.auth_user_id })
    if (ok) { setStores(data.stores ?? []); setIsSuper(!!data.is_super) }
    setLoading(false)
    // WhatsApp usage this month (for the 2x-per-template billing)
    const usage = await call({ action: 'wa_usage', admin_auth_id: real.auth_user_id })
    if (usage.ok) setWaUsage(usage.data.usage ?? {})
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [real?.auth_user_id])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" /></div>

  if (!isAdmin || impersonating) {
    return <div className="px-4 py-8 text-center text-sm text-gray-400">Solo el administrador gestiona la marca.</div>
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><StoreIcon size={20} /> {isSuper ? 'Marcas' : 'Mi marca'}</h1>
        {isSuper && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-xl" style={{ background: '#55C8F5', color: '#fff' }}>
            <Plus size={13} /> Nueva marca
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {isSuper ? 'Cada marca tiene su app en su subdominio, con su logo y colores.' : 'Personaliza el logo, nombre y colores de tu app.'}
      </p>

      {isSuper && Object.values(waUsage).reduce((a, b) => a + b, 0) > 0 && (
        <div className="rounded-2xl p-3 mb-4 flex items-center gap-3" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <MessageCircle size={18} style={{ color: '#16A34A' }} />
          <div className="flex-1">
            <p className="text-xs font-black text-gray-800">
              {Object.values(waUsage).reduce((a, b) => a + b, 0)} plantillas WhatsApp este mes
            </p>
            <p className="text-[10px] text-gray-500">Total enviado por todas las marcas (base para tu cobro 2x).</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {stores.map(s => (
          <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: s.logo_url ? '#fff' : s.color_primary + '22' }}>
              {s.logo_url ? <img src={s.logo_url} alt={s.nombre} className="w-full h-full object-cover" /> : <StoreIcon size={18} style={{ color: s.color_primary }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-gray-900 truncate">{s.nombre}{!s.active && <span className="text-red-500 font-bold"> · inactiva</span>}</p>
              <a href={`https://${s.slug}.${APEX}`} target="_blank" rel="noreferrer"
                className="text-[11px] font-bold flex items-center gap-1" style={{ color: '#55C8F5' }}>
                {s.slug}.{APEX} <ExternalLink size={10} />
              </a>
              {(waUsage[s.id] ?? 0) > 0 && (
                <p className="text-[10px] font-bold mt-0.5 flex items-center gap-1" style={{ color: '#16A34A' }}>
                  <MessageCircle size={10} /> {waUsage[s.id]} plantillas WhatsApp este mes
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full border border-gray-200" style={{ background: s.color_primary }} />
              <span className="w-5 h-5 rounded-full border border-gray-200" style={{ background: s.color_dark }} />
            </div>
            <button onClick={() => setEditing(s)} className="text-xs font-black px-3 py-2 rounded-xl" style={{ background: '#EEF9FF', color: '#55C8F5' }}>Editar</button>
            {isSuper && (
              <button onClick={() => enterStore(s.id)} className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-xl" style={{ background: 'var(--brand)', color: '#fff' }}>
                <LogIn size={13} /> Entrar
              </button>
            )}
          </div>
        ))}
      </div>

      {editing && <BrandEditor store={editing} isSuper={isSuper} adminId={real?.auth_user_id ?? ''} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {creating && <CreateBrand adminId={real?.auth_user_id ?? ''} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load() }} />}
    </div>
  )
}

// Upload a logo to the public "branding" bucket, return its URL
async function uploadLogo(file: File, adminId: string): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'png'
  const path = `${adminId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`
  const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: true })
  if (error) return null
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
      <span className="text-xs font-bold text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => onChange(e.target.value)} className="w-24 bg-white border rounded-lg px-2 py-1 text-xs font-mono outline-none" />
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded-lg border cursor-pointer" />
      </div>
    </div>
  )
}

function LogoPicker({ logo, uploading, onPick }: { logo: string | null; uploading: boolean; onPick: (f: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
        {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <StoreIcon size={22} className="text-gray-300" />}
      </div>
      <div className="flex-1">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="text-xs font-black px-3 py-2 rounded-xl disabled:opacity-50" style={{ background: '#55C8F5', color: '#fff' }}>
          {uploading ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
        </button>
        <p className="text-[10px] text-gray-400 mt-1">PNG cuadrado, 512×512 recomendado.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); if (fileRef.current) fileRef.current.value = '' }} />
    </div>
  )
}

function BrandEditor({ store, isSuper, adminId, onClose, onSaved }: {
  store: StoreRow; isSuper: boolean; adminId: string; onClose: () => void; onSaved: () => void
}) {
  const [nombre, setNombre] = useState(store.nombre)
  const [slug, setSlug] = useState(store.slug)
  const [logo, setLogo] = useState<string | null>(store.logo_url)
  const [cp, setCp] = useState(store.color_primary || '#55C8F5')
  const [cd, setCd] = useState(store.color_dark || '#060C1A')
  const [active, setActive] = useState(store.active)
  const [waEnabled, setWaEnabled] = useState(!!store.wa_enabled)
  const [waPhoneId, setWaPhoneId] = useState(store.wa_phone_number_id ?? '')
  const [waDisplay, setWaDisplay] = useState(store.wa_display_phone ?? '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pick = async (f: File) => { setUploading(true); const url = await uploadLogo(f, adminId); if (url) setLogo(url); setUploading(false) }

  const save = async () => {
    if (!nombre.trim()) { setErr('Ponle un nombre a la marca.'); return }
    setBusy(true); setErr('')
    const payload: Record<string, unknown> = {
      action: 'update', admin_auth_id: adminId, store_id: store.id,
      nombre: nombre.trim(), logo_url: logo, color_primary: cp, color_dark: cd,
    }
    if (isSuper) {
      payload.slug = slug; payload.active = active
      payload.wa_enabled = waEnabled
      payload.wa_phone_number_id = waPhoneId.trim()
      payload.wa_display_phone = waDisplay.trim()
    }
    const { ok, data } = await call(payload)
    setBusy(false)
    if (!ok) { setErr(ERR[data.error] || data.error || 'No se pudo guardar.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900">Editar marca</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre de la marca</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Naturisimo"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-3" />

        {isSuper && (
          <>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Subdominio</label>
            <div className="flex items-center bg-gray-100 rounded-2xl px-4 py-3 mb-3">
              <input value={slug} onChange={e => setSlug(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none font-mono" />
              <span className="text-xs text-gray-400">.{APEX}</span>
            </div>
          </>
        )}

        <label className="text-xs font-bold text-gray-500 mb-1 block">Logo</label>
        <div className="mb-4"><LogoPicker logo={logo} uploading={uploading} onPick={pick} /></div>

        <label className="text-xs font-bold text-gray-500 mb-1 block">Colores</label>
        <div className="space-y-2 mb-4">
          <ColorRow label="Primario" value={cp} onChange={setCp} />
          <ColorRow label="Fondo oscuro" value={cd} onChange={setCd} />
        </div>

        {isSuper && (
          <button onClick={() => setActive(a => !a)}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 mb-4"
            style={{ background: active ? '#DCFCE7' : '#FEE2E2' }}>
            <span className="text-xs font-black" style={{ color: active ? '#16A34A' : '#DC2626' }}>
              {active ? 'Marca activa' : 'Marca inactiva'}
            </span>
            <Power size={16} style={{ color: active ? '#16A34A' : '#DC2626' }} />
          </button>
        )}

        {/* WhatsApp fallback — infra, solo super admin. Se activa cuando la marca
            ya tiene su número en WhatsApp Cloud API. */}
        {isSuper && (
          <div className="rounded-2xl p-3 mb-4" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <button onClick={() => setWaEnabled(v => !v)}
              className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-black flex items-center gap-1.5" style={{ color: '#166534' }}>
                <MessageCircle size={14} /> Fallback por WhatsApp
              </span>
              <span className="text-[10px] font-black px-2 py-1 rounded-full"
                style={{ background: waEnabled ? '#16A34A' : '#E5E7EB', color: waEnabled ? '#fff' : '#6B7280' }}>
                {waEnabled ? 'ACTIVO' : 'APAGADO'}
              </span>
            </button>
            <p className="text-[10px] text-gray-500 mb-2">Si el cliente no tiene push, el aviso se envía por WhatsApp (Cloud API).</p>
            <input value={waPhoneId} onChange={e => setWaPhoneId(e.target.value)} placeholder="Phone Number ID (WhatsApp Cloud API)"
              className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none mb-2 font-mono" />
            <input value={waDisplay} onChange={e => setWaDisplay(e.target.value)} placeholder="Número visible (ej: +51 999 999 999)"
              className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none" />
          </div>
        )}

        {err && <p className="text-xs font-semibold text-center mb-2" style={{ color: '#DC2626' }}>{err}</p>}
        <button onClick={save} disabled={busy || uploading}
          className="w-full py-3 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: '#55C8F5', color: '#fff' }}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

function CreateBrand({ adminId, onClose, onDone }: { adminId: string; onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [logo, setLogo] = useState<string | null>(null)
  const [cp, setCp] = useState('#55C8F5')
  const [cd, setCd] = useState('#060C1A')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminNombre, setAdminNombre] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ slug: string } | null>(null)

  const autoSlug = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

  const pick = async (f: File) => { setUploading(true); const url = await uploadLogo(f, adminId); if (url) setLogo(url); setUploading(false) }

  const submit = async () => {
    if (!nombre.trim() || !slug.trim()) { setErr('Completa nombre y subdominio.'); return }
    if (!email.trim() || password.length < 6) { setErr('Correo y contraseña del admin (mín. 6).'); return }
    setBusy(true); setErr('')
    const { ok, data } = await call({
      action: 'create', admin_auth_id: adminId,
      nombre: nombre.trim(), slug, logo_url: logo, color_primary: cp, color_dark: cd,
      admin_email: email.trim(), admin_password: password, admin_nombre: adminNombre.trim(),
    })
    setBusy(false)
    if (!ok) { setErr(ERR[data.error] || data.error || 'No se pudo crear la marca.'); return }
    setDone({ slug: data.slug })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900">Nueva marca</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: '#DCFCE7' }}>
              <Check size={26} style={{ color: '#16A34A' }} />
            </div>
            <p className="font-black text-gray-900 mb-1">¡Marca creada!</p>
            <p className="text-sm text-gray-500 mb-1">Su app ya vive en</p>
            <a href={`https://${done.slug}.${APEX}`} target="_blank" rel="noreferrer" className="font-black text-sm" style={{ color: '#55C8F5' }}>
              {done.slug}.{APEX}
            </a>
            <p className="text-[11px] text-gray-400 mt-3">El admin entra en <b>/login</b> con el correo y la contraseña que definiste.</p>
            <button onClick={onDone} className="w-full mt-5 py-3 rounded-2xl font-black text-sm" style={{ background: '#55C8F5', color: '#fff' }}>Listo</button>
          </div>
        ) : (
          <>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre de la marca</label>
            <input value={nombre}
              onChange={e => { setNombre(e.target.value); if (!slugTouched) setSlug(autoSlug(e.target.value)) }}
              placeholder="Ej: Naturisimo" className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-3" />

            <label className="text-xs font-bold text-gray-500 mb-1 block">Subdominio</label>
            <div className="flex items-center bg-gray-100 rounded-2xl px-4 py-3 mb-3">
              <input value={slug} onChange={e => { setSlugTouched(true); setSlug(autoSlug(e.target.value)) }}
                placeholder="naturisimo" className="flex-1 bg-transparent text-sm outline-none font-mono" />
              <span className="text-xs text-gray-400">.{APEX}</span>
            </div>

            <label className="text-xs font-bold text-gray-500 mb-1 block">Logo</label>
            <div className="mb-4"><LogoPicker logo={logo} uploading={uploading} onPick={pick} /></div>

            <label className="text-xs font-bold text-gray-500 mb-1 block">Colores</label>
            <div className="space-y-2 mb-4">
              <ColorRow label="Primario" value={cp} onChange={setCp} />
              <ColorRow label="Fondo oscuro" value={cd} onChange={setCd} />
            </div>

            <div className="rounded-2xl p-3 mb-4" style={{ background: '#F8FAFF', border: '1px solid #EEF2FF' }}>
              <p className="text-xs font-black text-gray-700 mb-2">Admin de la marca</p>
              <div className="space-y-2">
                <input value={adminNombre} onChange={e => setAdminNombre(e.target.value)} placeholder="Nombre del dueño (opcional)"
                  className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Correo (para su login)"
                  className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input value={password} onChange={e => setPassword(e.target.value)} type="text" placeholder="Contraseña (mín. 6)"
                  className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
            </div>

            {err && <p className="text-xs font-semibold text-center mb-2" style={{ color: '#DC2626' }}>{err}</p>}
            <button onClick={submit} disabled={busy || uploading}
              className="w-full py-3 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: '#55C8F5', color: '#fff' }}>
              {busy ? 'Creando…' : 'Crear marca'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
