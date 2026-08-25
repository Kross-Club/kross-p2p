import { useEffect, useState } from 'react'
import { Bell, BellOff, Volume2, ShoppingBag, MessageCircle } from 'lucide-react'
import {
  pushSupported, notifPermission, getPushEndpoint,
  subscribePush, unsubscribePush,
  getPushPrefs, updatePushPrefs, type PushPrefs,
} from '../lib/push'
import { playNotificationSound, type NotificationSound } from '../lib/notification-sounds'

// Ajustes de notificaciones push del equipo, POR DISPOSITIVO: el mismo usuario
// las activa por separado en su celular y en su computadora, y ambos reciben.
// Cada tipo de aviso se puede silenciar sin dar de baja el dispositivo — el
// filtro vive en la fila de la suscripción y el servidor no envía lo apagado.
export default function PushSettings({ sellerAuthId }: { sellerAuthId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState<PushPrefs>(getPushPrefs())
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  const supported = pushSupported()
  const denied = notifPermission() === 'denied'

  useEffect(() => {
    let alive = true
    getPushEndpoint().then(ep => {
      if (alive) { setEnabled(!!ep && notifPermission() === 'granted'); setChecked(true) }
    })
    return () => { alive = false }
  }, [])

  const toggleDevice = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (enabled) {
        await unsubscribePush()
        setEnabled(false)
      } else {
        const ok = await subscribePush({ sellerId: sellerAuthId, role: 'seller' })
        setEnabled(ok)
        if (!ok && notifPermission() === 'denied') {
          alert('El navegador tiene bloqueadas las notificaciones para esta app. Actívalas desde la configuración del sitio y vuelve a intentarlo.')
        }
      }
    } finally { setBusy(false) }
  }

  const toggleEvent = (key: keyof PushPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    updatePushPrefs(next).catch(() => {})
  }

  const preview = (kind: NotificationSound) => playNotificationSound(kind)

  if (!supported) {
    return (
      <div className="bg-white border rounded-2xl p-4 shadow-sm" style={{ border: '0.5px solid var(--border)' }}>
        <p className="font-black text-gray-900 text-sm flex items-center gap-2"><BellOff size={16} /> Notificaciones push</p>
        <p className="text-xs text-gray-400 mt-1">
          Este navegador no soporta notificaciones. En iPhone, instala la app en tu pantalla de inicio para activarlas.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm" style={{ border: '0.5px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-gray-900 text-sm flex items-center gap-2">
            <Bell size={16} /> Notificaciones push
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            En este dispositivo. Actívalas también en tu celular o computadora: cada uno recibe por su cuenta.
          </p>
        </div>
        <button onClick={toggleDevice} disabled={busy || !checked} aria-label="Activar o desactivar notificaciones"
          className="relative w-12 h-7 rounded-full flex-shrink-0 transition-colors disabled:opacity-50"
          style={{ background: enabled ? 'var(--brand)' : '#D1D5DB' }}>
          <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
            style={{ left: enabled ? 22 : 2 }} />
        </button>
      </div>

      {denied && !enabled && (
        <p className="text-[11px] font-semibold mt-2 px-3 py-2 rounded-xl" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}>
          El navegador bloqueó las notificaciones para esta app. Desbloquéalas en la configuración del sitio y vuelve a activar.
        </p>
      )}

      <div className="mt-3 space-y-2" style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none' }}>
        <EventRow
          icon={<ShoppingBag size={15} />}
          label="Nuevo cliente"
          hint="Cuando entra un pedido nuevo a la tienda"
          on={prefs.new_client}
          onToggle={() => toggleEvent('new_client')}
          onPreview={() => preview('new_client')}
        />
        <EventRow
          icon={<MessageCircle size={15} />}
          label="Nuevo mensaje"
          hint="Cuando un cliente escribe en su chat"
          on={prefs.new_message}
          onToggle={() => toggleEvent('new_message')}
          onPreview={() => preview('new_message')}
        />
      </div>
    </div>
  )
}

function EventRow({ icon, label, hint, on, onToggle, onPreview }: {
  icon: React.ReactNode; label: string; hint: string
  on: boolean; onToggle: () => void; onPreview: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-3)' }}>
      <span style={{ color: on ? 'var(--brand)' : '#9CA3AF' }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-gray-800">{label}</p>
        <p className="text-[10px] text-gray-400 truncate">{hint}</p>
      </div>
      <button onClick={onPreview} className="p-1.5 rounded-lg" title="Escuchar el sonido"
        style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
        <Volume2 size={14} />
      </button>
      <button onClick={onToggle} aria-label={`Activar o desactivar aviso de ${label.toLowerCase()}`}
        className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors"
        style={{ background: on ? 'var(--brand)' : '#D1D5DB' }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ left: on ? 18 : 2 }} />
      </button>
    </div>
  )
}
