import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Eye, LogIn, UserPlus, X, Pencil } from 'lucide-react'
import { escuchar } from '../../lib/realtime'
import { useSeller, type SellerProfile } from '../../lib/seller-session'
import { useEquipo } from '../../lib/store-team'
import { puedeNombrarAdmins, etiquetaDeRol, esOperador, LIMITES_OPERADOR } from '../../lib/permisos'
import PushSettings from '../../components/PushSettings'
import { TIENDA_PLATAFORMA } from '../../../supabase/functions/_shared/alcance.ts'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Modelo por defecto: la venta la cierra el checkout/IA y el reparto lo hace la
// agencia, así que el equipo operativo es LOGÍSTICA (supervisa que el
// seguimiento automático funcione) + el admin, que lo ve todo. Ventas, Soporte
// y Motorizado quedan como roles legado: se muestran si un miembro aún los
// tiene, pero ya no se ofrecen al crear ni al cambiar rol.
const ROLES = ['Logística']
const ROLE_ORDER = ['venta', 'logist', 'despacho', 'soporte', 'motoriz', 'operador', 'admin']
const roleRank = (r: string) => { const i = ROLE_ORDER.findIndex(k => r.toLowerCase().includes(k)); return i === -1 ? 99 : i }
function roleColor(role: string) {
  const r = (role ?? '').toLowerCase()
  if (r.includes('venta')) return '#55C8F5'
  if (r.includes('logist') || r.includes('despacho')) return '#863bff'
  if (r.includes('soporte')) return '#14B8A6'
  if (r.includes('motoriz')) return '#FF8C00'
  if (r.includes('operador')) return '#0EA5E9'
  if (r.includes('admin')) return '#111'
  return '#888'
}

/** El equipo de la PLATAFORMA, no el de una tienda. Es la misma pantalla y la
 *  misma tabla (`sellers`), filtrada por otro `store_id`: quien trabaja en
 *  Kross vive bajo `platform`. Ver `seller-nav.ts`.
 *
 *  El id sale de `alcance.ts`, que es donde el servidor lee el mismo dato: dos
 *  copias de esta cadena son dos oportunidades de que una tienda quede fuera de
 *  la plataforma por una letra. */
const PLATAFORMA = TIENDA_PLATAFORMA

export default function EquipoPage() {
  const navigate = useNavigate()
  const { real, effective, isAdmin, impersonating, loading: sellerLoading, actAs, stopActing } = useSeller()
  // El equipo sale del lector compartido: la Lista de pedidos también lo
  // necesita —para pintar quién atiende cada pedido— y dos copias de la misma
  // consulta son dos oportunidades de que una traiga un campo que la otra no.
  const { equipo: team, cargando: cargandoEquipo, recargar: loadTeam } = useEquipo(effective)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [emails, setEmails] = useState<Record<string, string>>({})

  const storeId = effective?.store_id
  // El equipo de la plataforma se administra igual que el de una tienda: misma
  // pantalla, otro `store_id`. Lo único que cambia es el rol que se ofrece —acá
  // no hay quien atienda pedidos, hay quien opera la plataforma— y las palabras.
  const plataforma = storeId === PLATAFORMA
  // Nombrar admins u operadores es lo único que un operador NO puede: sin eso
  // se nombraría a sí mismo y su restricción duraría un clic. Lo rechaza el
  // servidor (`admin-team`); acá se oculta para no ofrecerlo.
  const puedeNombrar = puedeNombrarAdmins(real)

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

  // Real connection presence.
  //
  // Por `escuchar`: `SellerPresenceTracker` (en `Layout`) ya tiene abierto este
  // topic, y `supabase.channel` devolvía ESE canal ya suscrito — atarle un
  // manejador lanza y dejaba Equipo en blanco. Además su `removeChannel` se
  // llevaba la presencia del propio vendedor. Ver lib/realtime.ts.
  useEffect(() => {
    const s = escuchar('presence:sellers', {
      presencia: estado => setOnline(new Set(Object.keys(estado))),
    })
    return () => s.cerrar()
  }, [])

  // "Entrar como" aterriza donde esa persona trabaja: en una tienda son sus
  // pedidos; en la plataforma, las tiendas — ahí no hay pedidos que ver, y
  // mandarlo a una lista vacía haría pensar que la vista está rota.
  const enterAs = (s: SellerProfile) => {
    if (s.auth_user_id === real?.auth_user_id) stopActing(); else actAs(s)
    navigate(plataforma ? '/vendedor/marca' : '/vendedor/pedidos')
  }

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

  if (sellerLoading || (cargandoEquipo && team.length === 0)) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

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
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Users size={20} /> {plataforma ? 'Equipo Kross' : 'Mi equipo'}
        </h1>
        {/* En la plataforma el único alta posible es con mando —operador o
            admin—: no hay pedidos que atender, así que un miembro raso no
            tendría nada que hacer. Y el mando no lo da un operador. Ofrecer el
            botón sería ofrecer un formulario que no se puede enviar. */}
        {(!plataforma || puedeNombrar) && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-xl" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
            <UserPlus size={13} /> Agregar
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {plataforma
          ? 'Quién opera la plataforma. Un operador entra a cualquier tienda y hace lo mismo que tú.'
          : 'Punto verde = conectado ahora. El switch controla su turno.'}
      </p>

      {/* Qué es un operador, dicho donde se crea uno. La lista sale de
          `permisos.ts`, el mismo sitio que la aplica: si mañana cambia lo que
          puede, cambia también lo que acá se promete. */}
      {plataforma && (
        <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: 'var(--info-bg)', border: '0.5px solid var(--info-border)' }}>
          <p className="text-xs font-black mb-1" style={{ color: 'var(--info-fg)' }}>Operador</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Hace todo lo que hace el administrador —entra a cualquier tienda, mueve pedidos, atiende
            clientes— menos {LIMITES_OPERADOR.join(', ')}.
          </p>
        </div>
      )}

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
              <p className="text-sm text-gray-400">
                {esOperador(profile)
                  ? `Es operador: hace todo lo que hace el administrador menos ${LIMITES_OPERADOR.join(', ')}.`
                  : 'Es administrador.'}
              </p>
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

      {showAdd && (
        <AddMember
          storeId={effective?.store_id ?? ''}
          adminId={real?.auth_user_id ?? ''}
          plataforma={plataforma}
          puedeNombrar={puedeNombrar}
          onClose={() => setShowAdd(false)}
          onDone={() => { setShowAdd(false); loadTeam() }}
        />
      )}
    </div>
  )
}

function MemberCard({ s, isSelf, online, email, admin, onEnter, onToggle, onProfile, busy }: {
  s: SellerProfile; isSelf?: boolean; online: Set<string>; email?: string
  admin?: boolean; onEnter?: () => void; onToggle?: (v: boolean) => void; onProfile?: () => void; busy?: boolean
}) {
  // La etiqueta la decide el PERMISO, no `role_label` —que es texto libre—: un
  // "Operador" con dedazo se vería como miembro raso teniendo todos los
  // permisos. Ver `etiquetaDeRol` en permisos.ts.
  const etiqueta = etiquetaDeRol(s)
  const color = roleColor(etiqueta)
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
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${color}22`, color }}>{etiqueta}</span>
            <span className="text-[10px] font-bold" style={{ color: isOnline ? '#16A34A' : '#9CA3AF' }}>{isOnline ? 'Conectado' : 'Desconectado'}</span>
          </div>
        </div>
        {/* También para un operador: la ficha es donde se ve su correo —lo que
            hay que escribir para recuperarle la clave— y qué puede y qué no. */}
        {admin && onProfile && (!s.is_admin || esOperador(s)) && (
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

function AddMember({ storeId, adminId, plataforma, puedeNombrar, onClose, onDone }: {
  storeId: string; adminId: string
  /** El equipo de Kross, no el de una tienda: acá no se contrata a quien
   *  atiende pedidos, se da de alta a quien opera la plataforma. */
  plataforma: boolean
  /** Nombrar admins u operadores. Un operador no puede — se nombraría a sí
   *  mismo. El servidor lo rechaza igual; acá se oculta la casilla. */
  puedeNombrar: boolean
  onClose: () => void; onDone: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Único rol de equipo del modelo por defecto (la venta la cierra la app sola)
  const role = 'Logística'
  // En la plataforma el alta natural es un OPERADOR: alguien que entra a las
  // tiendas y las opera. Un miembro raso ahí no tendría pedidos que atender —
  // los pedidos son de las tiendas, no de Kross.
  const [asAdmin, setAsAdmin] = useState(false)
  const [asOperador, setAsOperador] = useState(plataforma && puedeNombrar)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!nombre || !email || password.length < 6) { setErr('Completa nombre, correo y contraseña (mín. 6).'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(`${BASE}/admin-team`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', admin_auth_id: adminId, store_id: storeId, nombre, email, password,
          role_label: role,
          is_admin: asAdmin,
          is_operator: asOperador,
          // El alcance del operador de la plataforma es la plataforma: sin esto
          // entraría como admin de una tienda que no existe y no vería nada.
          is_super_admin: plataforma && (asOperador || asAdmin),
        }),
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
          {/* Las dos casillas son excluyentes: un operador es un admin con un
              límite, no las dos cosas a la vez. Solo las ve quien puede
              otorgarlas — un operador da de alta gente, pero no mando. */}
          {puedeNombrar && (
            <>
              <button onClick={() => { setAsOperador(v => !v); setAsAdmin(false) }}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: asOperador ? roleColor('operador') : '#F3F4F6' }}>
                <span className="text-xs font-black" style={{ color: asOperador ? '#fff' : '#666' }}>
                  Operador{plataforma ? ' de la plataforma' : ' de la marca'}
                </span>
                <span className="text-[10px] font-black px-2 py-1 rounded-full"
                  style={{ background: asOperador ? '#fff' : '#e5e7eb', color: asOperador ? roleColor('operador') : '#888' }}>
                  {asOperador ? 'SÍ' : 'NO'}
                </span>
              </button>
              {asOperador && (
                <p className="text-[10px] text-gray-400 px-1">
                  Hace todo lo que haces tú{plataforma ? ', en cualquier tienda' : ''}, menos {LIMITES_OPERADOR.join(', ')}.
                </p>
              )}

              <button onClick={() => { setAsAdmin(a => !a); setAsOperador(false) }}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: asAdmin ? '#111' : '#F3F4F6' }}>
                <span className="text-xs font-black" style={{ color: asAdmin ? '#fff' : '#666' }}>
                  {plataforma ? 'Administrador de la plataforma' : 'Administrador de la marca'}
                </span>
                <span className="text-[10px] font-black px-2 py-1 rounded-full"
                  style={{ background: asAdmin ? '#fff' : '#e5e7eb', color: asAdmin ? '#111' : '#888' }}>
                  {asAdmin ? 'SÍ' : 'NO'}
                </span>
              </button>
              {asAdmin && (
                <p className="text-[10px] text-gray-400 px-1">
                  Sin límites: también apaga tiendas, borra productos y nombra a otros administradores.
                </p>
              )}
            </>
          )}
          {/* En una tienda, quien no es ni admin ni operador atiende pedidos. En
              la plataforma ese rol no existe: los pedidos son de las tiendas. */}
          {!asAdmin && !asOperador && !plataforma && (
            <div className="rounded-2xl px-4 py-3" style={{ background: `${roleColor(role)}15` }}>
              <p className="text-xs font-black" style={{ color: roleColor(role) }}>Rol: {role}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Supervisa que el seguimiento automático de los pedidos funcione bien. La venta la cierra la app sola.
              </p>
            </div>
          )}
          {!asAdmin && !asOperador && plataforma && (
            <p className="text-[10px] px-1" style={{ color: 'var(--danger-fg)' }}>
              Elige Operador o Administrador: en la plataforma no hay pedidos que atender.
            </p>
          )}
        </div>
        {err && <p className="text-xs font-semibold text-center mt-2" style={{ color: 'var(--danger-fg)' }}>{err}</p>}
        <button onClick={submit} disabled={busy || (plataforma && !asAdmin && !asOperador)}
          className="w-full mt-4 py-3 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
          {busy ? 'Creando…' : 'Crear miembro'}
        </button>
      </div>
    </div>
  )
}
