import { useEffect, useState } from 'react'
import { Phone, Clock } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Recording {
  id: string
  session_id: string | null
  caller_role: string | null
  caller_name: string | null
  buyer_name: string | null
  duration_sec: number | null
  created_at: string
  url: string | null
}

export default function LlamadasPage() {
  const { real, effective, isAdmin } = useSeller()
  const [recs, setRecs] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!real) return
    fetch(`${BASE}/get-recordings`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_auth_id: real.auth_user_id, store_id: effective?.store_id }),
    })
      .then(r => (r.ok ? r.json() : { recordings: [] }))
      .then(d => setRecs(d.recordings ?? []))
      .catch(() => setRecs([]))
      .finally(() => setLoading(false))
  }, [real?.auth_user_id, effective?.store_id])

  if (!isAdmin) return <div className="px-4 py-8 text-center text-sm text-gray-400">Solo el administrador escucha las llamadas.</div>
  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  const fmt = (s: number | null) => {
    const t = s ?? 0
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2"><Phone size={20} /> Llamadas</h1>
      <p className="text-xs text-gray-400 mb-4">Grabaciones de las llamadas del equipo con los clientes.</p>

      {recs.length === 0 ? (
        <div className="text-center py-14">
          <Phone size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-gray-400">Aún no hay llamadas grabadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="font-black text-sm text-gray-900 truncate">
                    {r.caller_name ?? 'Asesor'} <span className="text-gray-400 font-bold">→</span> {r.buyer_name ?? 'Cliente'}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(r.created_at).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-bold text-gray-500 flex-shrink-0">
                  <Clock size={12} /> {fmt(r.duration_sec)}
                </span>
              </div>
              {r.url
                ? <audio controls preload="none" src={r.url} className="w-full h-9" />
                : <p className="text-[11px] text-gray-400">Grabación no disponible.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
