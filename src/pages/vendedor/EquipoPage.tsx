import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Eye, ShieldCheck, LogIn } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller, type SellerProfile } from '../../lib/seller-session'

const ROLE_ORDER = ['venta', 'despacho', 'motorizado', 'admin']

function roleRank(role: string) {
  const r = role.toLowerCase()
  const idx = ROLE_ORDER.findIndex(k => r.includes(k))
  return idx === -1 ? 99 : idx
}

function roleColor(role: string) {
  const r = role.toLowerCase()
  if (r.includes('venta')) return '#55C8F5'
  if (r.includes('despacho')) return '#863bff'
  if (r.includes('motoriz')) return '#FF8C00'
  if (r.includes('admin')) return '#111'
  return '#888'
}

export default function EquipoPage() {
  const navigate = useNavigate()
  const { real, effective, isAdmin, impersonating, actAs, stopActing } = useSeller()
  const [team, setTeam] = useState<SellerProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!real) return
    supabase
      .from('sellers')
      .select('id, auth_user_id, nombre, role_label, store_id, avatar_url, is_admin')
      .eq('store_id', real.store_id)
      .then(({ data }) => {
        setTeam((data as SellerProfile[]) ?? [])
        setLoading(false)
      })
  }, [real?.store_id])

  const enterAs = (s: SellerProfile) => {
    if (s.auth_user_id === real?.auth_user_id) stopActing()
    else actAs(s)
    navigate('/vendedor/chats')
  }

  if (loading) {
    return <div className="flex justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#55C8F5] animate-spin" />
    </div>
  }

  if (!isAdmin) {
    return (
      <div className="px-4 py-4">
        <h1 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
          <Users size={20} /> Mi cuenta
        </h1>
        {effective && <MemberCard s={effective} isSelf highlight />}
        <p className="text-xs text-gray-400 mt-4 text-center">
          Solo el administrador puede ver y administrar todo el equipo.
        </p>
      </div>
    )
  }

  const sorted = [...team].sort((a, b) => roleRank(a.role_label) - roleRank(b.role_label))

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Users size={20} /> Mi equipo
        </h1>
        <span className="text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1"
          style={{ background: '#EEF9FF', color: '#111' }}>
          <ShieldCheck size={11} /> Admin
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Toca <b>Entrar como</b> para ver y atender lo que ve cada miembro del equipo.
      </p>

      {impersonating && (
        <div className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: 'linear-gradient(90deg, #7C3AED, #4F46E5)' }}>
          <p className="text-xs font-bold text-white flex items-center gap-2">
            <Eye size={14} /> Estás viendo como {effective?.nombre.split(' ')[0]}
          </p>
          <button onClick={stopActing}
            className="text-xs font-black px-3 py-1 rounded-lg text-white"
            style={{ background: 'rgba(255,255,255,0.2)' }}>
            Volver a admin
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(s => (
          <MemberCard
            key={s.id}
            s={s}
            isSelf={s.auth_user_id === real?.auth_user_id}
            highlight={s.auth_user_id === effective?.auth_user_id}
            onEnter={() => enterAs(s)}
          />
        ))}

        {sorted.length === 0 && (
          <div className="text-center py-12">
            <Users size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Aún no hay miembros en tu equipo.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MemberCard({ s, isSelf, highlight, onEnter }: {
  s: SellerProfile
  isSelf?: boolean
  highlight?: boolean
  onEnter?: () => void
}) {
  const color = roleColor(s.is_admin ? 'admin' : s.role_label)
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm flex items-center gap-3"
      style={{ borderColor: highlight ? color : '#f0f0f0', borderWidth: highlight ? 2 : 1 }}>
      <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}22` }}>
        {s.avatar_url
          ? <img src={s.avatar_url} alt={s.nombre} className="w-full h-full object-cover" />
          : <span className="font-black text-lg" style={{ color }}>{s.nombre.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-gray-900 text-sm truncate">
          {s.nombre}{isSelf && <span className="text-gray-400 font-bold"> · tú</span>}
        </p>
        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{ background: `${color}22`, color }}>
          {s.is_admin ? 'Admin' : s.role_label}
        </span>
      </div>
      {onEnter && (
        <button onClick={onEnter}
          className="text-xs font-black px-3 py-2 rounded-xl flex items-center gap-1 flex-shrink-0"
          style={{ background: isSelf ? '#f0f0f0' : color, color: isSelf ? '#666' : '#fff' }}>
          <LogIn size={13} /> {isSelf ? 'Mi vista' : 'Entrar como'}
        </button>
      )}
    </div>
  )
}
