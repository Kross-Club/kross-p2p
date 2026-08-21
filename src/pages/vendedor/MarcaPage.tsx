import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store as StoreIcon, Plus, X, Check, ExternalLink, Power, MessageCircle, LogIn, Truck } from 'lucide-react'
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
  notif_icon_url?: string | null
  color_primary: string
  color_dark: string
  active: boolean
  created_at?: string
  wa_enabled?: boolean
  home_delivery_enabled?: boolean
  wa_phone_number_id?: string | null
  wa_display_phone?: string | null
  wa_business_account_id?: string | null
  // Cobros de la marca
  yape_number?: string | null
  yape_holder?: string | null
  yape_qr_url?: string | null
  /** Derivado por el backend: la llave secreta jamás viaja, solo su presencia. */
  pay360_enabled?: boolean
  pay360_env?: string | null
  /** Presencia = la marca ya es un negocio en 360pay. No es un secreto. */
  pay360_business_id?: string | null
  pay360_payment_prefix?: string | null
}

const ERR: Record<string, string> = {
  slug_reservado: 'Ese subdominio está reservado. Elige otro.',
  slug_en_uso: 'Ese subdominio ya está en uso por otra marca.',
  faltan_nombre_slug: 'Completa el nombre y el subdominio.',
  admin_invalido: 'Revisa el correo y la contraseña (mín. 6) del admin.',
  nada_que_guardar: 'No hay cambios para guardar.',
  auth_requerida: 'Tu sesión venció. Vuelve a entrar para tocar los cobros.',
  pay360_sin_llave_partner: 'Falta configurar la llave de partner de 360pay en el servidor.',
  pay360_ya_conectado: 'Esta marca ya está conectada a 360pay.',
  pay360_prefijo_invalido: 'El prefijo son 3 caracteres: letras y números.',
  pay360_alta_fallo: 'No pudimos crear la cuenta en 360pay. Revisa e inténtalo de nuevo.',
  pay360_sin_conectar: 'Conecta la marca con 360pay antes de encender el cobro.',
  pay360_nombre_invalido: 'Escribe el nombre del comercio para 360pay.',
}

async function call(payload: Record<string, unknown>) {
  // El JWT REAL del vendedor: manage-store lo verifica contra Auth, y los
  // campos de cobro (yape/360pay) SOLO se aceptan por esta vía. El
  // admin_auth_id del body queda como compat mientras conviven versiones.
  const { data: authData } = await supabase.auth.getSession()
  const jwt = authData.session?.access_token ?? ANON
  const res = await fetch(`${BASE}/manage-store`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export default function MarcaPage() {
  const navigate = useNavigate()
  const { real, isAdmin, impersonating, actAs } = useSeller()

  // Super admin "enters" a brand → acts as itself but scoped to that store, so the
  // full store toolset (Chats, Productos, CRM, Equipo, Stats) works even for a brand
  // with no team yet (that's exactly when you enter — to set it up).
  const enterStore = (storeId: string) => {
    if (!real) { alert('Sesión no lista, recarga la página e intenta de nuevo.'); return }
    actAs({ ...real, store_id: storeId, is_admin: true, is_super_admin: false, role_label: 'Admin' } as SellerProfile)
    navigate('/vendedor/chats')
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

function LogoPicker({ logo, uploading, onPick, round, help }: { logo: string | null; uploading: boolean; onPick: (f: File) => void; round?: boolean; help?: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3">
      <div className={`w-16 h-16 overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center ${round ? 'rounded-full' : 'rounded-2xl'}`}>
        {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <StoreIcon size={22} className="text-gray-300" />}
      </div>
      <div className="flex-1">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="text-xs font-black px-3 py-2 rounded-xl disabled:opacity-50" style={{ background: '#55C8F5', color: '#fff' }}>
          {uploading ? 'Subiendo…' : logo ? 'Cambiar' : 'Subir'}
        </button>
        <p className="text-[10px] text-gray-400 mt-1">{help ?? 'PNG cuadrado, 512×512 recomendado.'}</p>
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
  const [notifIcon, setNotifIcon] = useState<string | null>(store.notif_icon_url ?? null)
  const [cp, setCp] = useState(store.color_primary || '#55C8F5')
  const [cd, setCd] = useState(store.color_dark || '#060C1A')
  const [active, setActive] = useState(store.active)
  const [waEnabled, setWaEnabled] = useState(!!store.wa_enabled)
  // `?? true` y no `!!`: una marca cargada antes de que existiera la columna
  // llega con el campo ausente, y un `false` accidental le apagaría el
  // domicilio al guardar cualquier otro cambio.
  const [homeDelivery, setHomeDelivery] = useState(store.home_delivery_enabled ?? true)
  const [waPhoneId, setWaPhoneId] = useState(store.wa_phone_number_id ?? '')
  const [waDisplay, setWaDisplay] = useState(store.wa_display_phone ?? '')
  const [waBiz, setWaBiz] = useState(store.wa_business_account_id ?? '')
  // Cobros — del admin de la tienda, no del super: es SU número y SU cuenta.
  const [yapeNumber, setYapeNumber] = useState(store.yape_number ?? '')
  const [yapeHolder, setYapeHolder] = useState(store.yape_holder ?? '')
  const [yapeQr, setYapeQr] = useState<string | null>(store.yape_qr_url ?? null)
  const [pay360On, setPay360On] = useState(!!store.pay360_enabled)
  const [pay360Env, setPay360Env] = useState(store.pay360_env === 'live' ? 'live' : 'sandbox')
  const [pay360Prefix, setPay360Prefix] = useState('')
  // El nombre del comercio en 360pay: por defecto el de la marca, editable
  // porque allá es la razón comercial frente al banco y acá el rótulo.
  const [pay360Name, setPay360Name] = useState(store.nombre ?? '')
  const [connecting, setConnecting] = useState(false)
  const pay360Connected = !!store.pay360_business_id

  const [uploading, setUploading] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')


  const pick = async (f: File) => { setUploading(true); const url = await uploadLogo(f, adminId); if (url) setLogo(url); setUploading(false) }
  const pickIcon = async (f: File) => { setUploadingIcon(true); const url = await uploadLogo(f, adminId); if (url) setNotifIcon(url); setUploadingIcon(false) }
  const pickQr = async (f: File) => { setUploadingQr(true); const url = await uploadLogo(f, adminId); if (url) setYapeQr(url); setUploadingQr(false) }

  const save = async () => {
    if (!nombre.trim()) { setErr('Ponle un nombre a la marca.'); return }
    setBusy(true); setErr('')
    const payload: Record<string, unknown> = {
      action: 'update', admin_auth_id: adminId, store_id: store.id,
      nombre: nombre.trim(), logo_url: logo, notif_icon_url: notifIcon, color_primary: cp, color_dark: cd,
      // Cobros: los gestiona el admin de la tienda (manage-store exige el JWT
      // verificado para estos campos — redirigen dinero, no un logo).
      yape_number: yapeNumber, yape_holder: yapeHolder, yape_qr_url: yapeQr,
      pay360_enabled: pay360On, pay360_env: pay360Env,
    }
    if (isSuper) {
      payload.slug = slug; payload.active = active
      payload.wa_enabled = waEnabled
      payload.home_delivery_enabled = homeDelivery
      payload.wa_phone_number_id = waPhoneId.trim()
      payload.wa_display_phone = waDisplay.trim()
      payload.wa_business_account_id = waBiz.trim()
    }
    const { ok, data } = await call(payload)
    setBusy(false)
    if (!ok) { setErr(ERR[data.error] || data.error || 'No se pudo guardar.'); return }
    onSaved()
  }

  // Alta en 360pay. Va aparte del guardado y no junto a él a propósito: crea
  // una cuenta REAL en un tercero y no se puede deshacer desde aquí, así que no
  // puede viajar de polizón en el botón que guarda un logo.
  const connectPay360 = async () => {
    if (connecting || pay360Connected) return
    setConnecting(true); setErr('')
    const { ok, data } = await call({
      action: 'update', admin_auth_id: adminId, store_id: store.id,
      pay360_env: pay360Env,
      pay360_connect: {
        payment_prefix: pay360Prefix.trim().toUpperCase(),
        name: pay360Name.trim(),
      },
    })
    setConnecting(false)
    if (!ok) {
      setErr(ERR[(data as { error?: string }).error ?? ''] ?? 'No pudimos conectar con 360pay.')
      return
    }
    // Se recarga en vez de mutar el estado local: el alta escribió el
    // business_id y el secreto del webhook del lado del servidor, y seguir con
    // una copia vieja en pantalla invitaría a darla de alta dos veces.
    onSaved?.()
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

        <label className="text-xs font-bold text-gray-500 mb-1 block">Ícono de notificación</label>
        <div className="mb-4">
          <LogoPicker logo={notifIcon} uploading={uploadingIcon} onPick={pickIcon} round
            help="PNG con fondo transparente y borde redondo (como WhatsApp). Si no lo pones, usa el logo." />
        </div>

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

        {/* Cómo entrega esta marca. El recojo en agencia SIEMPRE está disponible
            —es la salida que nunca se cierra—, así que el switch solo prende o
            apaga el domicilio. Solo super admin: depende de si la marca tiene
            operación de última milla contratada. */}
        {isSuper && (
          <div className="rounded-2xl p-3 mb-4" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <button onClick={() => setHomeDelivery(v => !v)}
              className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-black flex items-center gap-1.5" style={{ color: '#1E40AF' }}>
                <Truck size={14} /> Entrega a domicilio
              </span>
              <span className="text-[10px] font-black px-2 py-1 rounded-full"
                style={{ background: homeDelivery ? '#2563EB' : '#E5E7EB', color: homeDelivery ? '#fff' : '#6B7280' }}>
                {homeDelivery ? 'ACTIVA' : 'APAGADA'}
              </span>
            </button>
            <p className="text-[10px] text-gray-500">
              {homeDelivery
                ? 'El comprador elige entre recibirlo en su casa o recoger en agencia.'
                : 'Solo recojo en agencia. Apágala si la marca no tiene motorizado ni courier a domicilio: prometer entrega a la puerta y no cumplirla cuesta más que no ofrecerla.'}
            </p>
          </div>
        )}
        {/* ── Cobros — del admin de la tienda, sin gate isSuper: es SU Yape y
              SU cuenta de 360pay. El backend exige el JWT verificado para todo
              esto: son campos que redirigen dinero. ── */}
        <div className="rounded-2xl p-3 mb-4" style={{ background: '#FAF5FB', border: '1px solid #E9DDF9' }}>
          <p className="text-xs font-black mb-2" style={{ color: '#742284' }}>💜 Cobros de la marca</p>

          <label className="text-[10px] font-bold text-gray-500 mb-1 block">Número de Yape (9 dígitos)</label>
          <input value={yapeNumber} inputMode="numeric" maxLength={9}
            onChange={e => setYapeNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="987654321"
            className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none mb-2 font-mono" />
          <label className="text-[10px] font-bold text-gray-500 mb-1 block">Titular, tal como lo muestra Yape</label>
          <input value={yapeHolder} onChange={e => setYapeHolder(e.target.value)}
            placeholder="MARCA DEMO SAC"
            className="w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none mb-2" />
          <label className="text-[10px] font-bold text-gray-500 mb-1 block">QR de Yape (lo ve el comprador en desktop)</label>
          <div className="mb-3"><LogoPicker logo={yapeQr} uploading={uploadingQr} onPick={pickQr} /></div>

          {/* 360pay: cobro EN el checkout con el botón de Yape. Sin esto, la
              marca cobra su adelanto por el Yape manual de arriba. */}
          <div className="border-t pt-3" style={{ borderColor: '#E9DDF9' }}>
            <button onClick={() => pay360Connected && setPay360On(v => !v)}
              className="w-full flex items-center justify-between mb-1"
              style={{ opacity: pay360Connected || pay360On ? 1 : 0.5 }}>
              <span className="text-xs font-black" style={{ color: '#742284' }}>
                Cobrar el adelanto con Yape (360pay)
              </span>
              <span className="text-[10px] font-black px-2 py-1 rounded-full"
                style={{ background: pay360On ? '#742284' : '#E5E7EB', color: pay360On ? '#fff' : '#6B7280' }}>
                {pay360On ? 'ACTIVO' : 'APAGADO'}
              </span>
            </button>
            <p className="text-[10px] text-gray-500 mb-2">
              El comprador toca un botón y Yape se abre con el monto ya puesto. El pago se
              confirma solo, sin capturas ni códigos.
            </p>

            {pay360Connected ? (
              <div className="rounded-xl px-3 py-2 mb-2" style={{ background: '#F5F0FA' }}>
                <p className="text-[10px] font-black" style={{ color: '#742284' }}>
                  ✓ Conectado · prefijo {store.pay360_payment_prefix}
                </p>
                {/* El ambiente se muestra siempre: una marca cobrando de verdad
                    contra sandbox no falla de forma visible, simplemente nunca
                    recibe el dinero. */}
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Ambiente: <strong>{pay360Env === 'live' ? 'producción' : 'pruebas'}</strong>
                </p>
              </div>
            ) : (
              <div className="rounded-xl px-3 py-2.5 mb-2" style={{ background: '#FFF8E1' }}>
                <label className="text-[10px] font-bold text-gray-600 mb-1 block">
                  Nombre del comercio en 360pay
                </label>
                <input value={pay360Name} onChange={e => setPay360Name(e.target.value)}
                  placeholder="Kross Shop"
                  className="w-full bg-white border rounded-xl px-3 py-2 text-sm outline-none mb-2" />
                <label className="text-[10px] font-bold text-gray-600 mb-1 block">
                  Prefijo de los códigos de pago (3 caracteres)
                </label>
                <div className="flex gap-2">
                  <input value={pay360Prefix}
                    onChange={e => setPay360Prefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
                    placeholder="KRS" maxLength={3}
                    className="w-20 bg-white border rounded-xl px-3 py-2 text-sm font-mono font-bold outline-none" />
                  <button onClick={connectPay360}
                    disabled={connecting || pay360Prefix.length !== 3 || !pay360Name.trim()}
                    className="flex-1 rounded-xl px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                    style={{ background: '#742284' }}>
                    {connecting ? 'Conectando…' : 'Conectar con 360pay'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Se crea la cuenta de la marca en 360pay. <strong>Se hace una sola vez</strong> y
                  no se puede deshacer desde aquí.
                </p>
              </div>
            )}

            <label className="text-[10px] font-bold text-gray-500 mb-1 block">Ambiente</label>
            <select value={pay360Env}
              onChange={e => setPay360Env(e.target.value === 'live' ? 'live' : 'sandbox')}
              disabled={pay360Connected}
              className="w-full bg-white border rounded-xl px-3 py-2 text-sm mb-3 disabled:opacity-50">
              <option value="sandbox">Pruebas (sandbox)</option>
              <option value="live">Producción</option>
            </select>
          </div>

        </div>

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
            <input value={waBiz} onChange={e => setWaBiz(e.target.value)} placeholder="WABA ID (para listar plantillas)"
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
