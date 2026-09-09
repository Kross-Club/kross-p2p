import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, ChevronRight, Star, LogOut, Bell, MessageCircle, RefreshCw, ShoppingBag } from 'lucide-react'
import { subscribePush, notifPermission, pushSupported } from '../../lib/push'
import { textoSobre, textoSuaveSobre } from '../../lib/contraste'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store-context'
import { stageVigente } from '../../lib/order-stages'
import { leerSesion, olvidarSesion, refrescarSesion } from '../../lib/sesion-comprador'
import type { SesionComprador } from '../../lib/sesion-comprador'
import { FirmaDeMarca } from '../../components/pedido/PedidoConfirmado'
import BajoLaMarca from '../../components/pedido/BajoLaMarca'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── Fidelización, apagada a propósito (09-set-2026) ─────────────────────────
//
// El anillo del score, los puntos, «Comprar de nuevo» y «Volver a pedir» se
// OCULTAN, no se borran: el módulo de Loyalty los va a trabajar y el código
// tiene que seguir vivo para no rehacerlo. Hoy prometen de más — el anillo
// enseña «0 puntos acumulados» a quien acaba de comprar, y «Volver a pedir»
// crea un pedido sin pasar por el checkout, o sea sin adelanto, que es
// exactamente lo que este producto existe para cobrar antes de despachar.
//
// Se encienden cambiando ESTA línea, no reescribiendo la pantalla.
const MOSTRAR_FIDELIZACION: boolean = false

// Sin `preparando`: salió del eje (ver `stageVigente` en order-stages). Los
// pedidos que la BD todavía tiene ahí se leen como `confirmado` — que es lo que
// son, cobrados y sin guía— en vez de caer al gris de "etapa desconocida".
const STAGE_LABEL: Record<string, string> = {
  nuevo:      '📋 Pedido creado',
  validando: '🔎 Validando pago',
  confirmado: '💰 Confirmado',
  en_camino:  '🚚 En camino',
  entregado:  '✅ Entregado',
  cancelado:  '❌ Cancelado',
}

const STAGE_COLOR: Record<string, string> = {
  nuevo:      '#FFD400',
  validando: '#F59E0B',
  confirmado: '#55C8F5',
  en_camino:  '#FF8C00',
  entregado:  '#4ADE80',
  cancelado:  '#EF4444',
}

export default function MisPedidosPage() {
  const navigate = useNavigate()
  const { store } = useStore()
  const [data, setData] = useState<SesionComprador | null>(null)

  const [notifGranted, setNotifGranted] = useState(notifPermission() === 'granted')
  const [welcome, setWelcome] = useState<{ points: number; msg: string | null } | null>(() => {
    try { const w = localStorage.getItem('welcome_reward'); if (w) { localStorage.removeItem('welcome_reward'); return JSON.parse(w) } } catch { /* */ }
    return null
  })
  const [bumps, setBumps] = useState<Record<string, number>>({})
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const guardada = leerSesion()
    if (!guardada) { navigate('/acceso', { replace: true }); return }
    setData(guardada)
    if (notifPermission() === 'granted') {
      subscribePush({ buyerId: guardada.buyer.id, role: 'buyer' as const }).catch(() => {})
    }

    // Refrescar con el TOKEN de sesión, no con el DNI: el DNI dejó de ser una
    // llave (ver `_shared/acceso-comprador.ts`). Una sesión de antes del cambio
    // no lo tiene; ahí se pide con el DNI y, si la marca ya manda códigos, el
    // servidor responde 403 y toca volver a entrar. Es un solo reingreso.
    const cuerpo = guardada.session_token
      ? { session_token: guardada.session_token }
      : { document_number: guardada.buyer.document_number, store_id: store.id }
    // La rama vieja necesita la tienda, y `store.id` llega un tick después de
    // montar: sin esperar, el primer intento salía sin tienda y moría en 400.
    if (!guardada.session_token && !store.id) return
    fetch(`${BASE}/buyer-login`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
      .then(async r => {
        if (r.status === 401 || r.status === 403) {
          olvidarSesion()
          navigate('/acceso', { replace: true })
          return null
        }
        return r.ok ? r.json() : null
      })
      .then(fresh => {
        if (!fresh?.buyer) return
        // El token nuevo si vino; si no, el que ya teníamos.
        const nueva = { ...fresh, session_token: fresh.session_token ?? guardada.session_token ?? null }
        setData(nueva)
        refrescarSesion(nueva)
      })
      .catch(() => {})
  }, [navigate, store.id])

  // Live unread: bump the counter when the seller writes, in real time
  const sessionIds = (data?.sessions ?? []).map(s => s.id).join(',')
  useEffect(() => {
    const sess = data?.sessions ?? []
    if (sess.length === 0) return
    const channels = sess.map(s =>
      supabase.channel(`order:${s.id}`)
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
          const m = payload as { id: string; sender_role: string; visibility?: string }
          // Count only messages the buyer would see, from the other side
          if (m.sender_role === 'buyer' || m.visibility === 'sellers' || seenRef.current.has(m.id)) return
          seenRef.current.add(m.id)
          setBumps(b => ({ ...b, [s.id]: (b[s.id] ?? 0) + 1 }))
        })
        .subscribe()
    )
    return () => channels.forEach(c => supabase.removeChannel(c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds])

  const enableNotifications = async () => {
    const s = leerSesion()
    if (!s) return
    const ok = await subscribePush({ buyerId: s.buyer.id, role: 'buyer' as const })
    if (ok) setNotifGranted(true)
  }

  const openOrder = (s: { id: string; token: string }) => {
    // Optimistically clear this order's unread so it doesn't reappear on return
    setBumps(b => ({ ...b, [s.id]: 0 }))
    setData(d => {
      if (!d) return d
      const sessions = d.sessions.map(x => x.id === s.id ? { ...x, unread_count: 0 } : x)
      const nd = { ...d, sessions }
      refrescarSesion(nd)
      return nd
    })
    navigate(`/p/${s.token}`)
  }

  // Cerrar sesión invalida el token en el SERVIDOR. Borrarlo solo de este
  // dispositivo dejaría la cuenta abierta desde cualquier otro que lo tuviera.
  const logout = () => {
    const token = leerSesion()?.session_token
    if (token) {
      fetch(`${BASE}/buyer-login`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ logout: true, session_token: token }),
      }).catch(() => {})
    }
    olvidarSesion()
    navigate('/acceso', { replace: true })
  }

  const [reordering, setReordering] = useState<string | null>(null)
  const reorder = async (s: { id: string; product_name: string; product_price: number; pack_name: string | null }) => {
    if (!data || !store.id) return
    setReordering(s.id)
    try {
      const res = await fetch(`${BASE}/register-buyer`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: store.id, product_name: s.product_name, product_price: s.product_price, pack_name: s.pack_name,
          buyer_name: data.buyer.nombre, buyer_phone: data.buyer.phone, document_type: 'DNI', document_number: data.buyer.document_number,
        }),
      })
      if (res.ok) { const { token } = await res.json(); navigate(`/p/${token}`) }
      else alert('No se pudo repetir el pedido. Intenta de nuevo.')
    } finally { setReordering(null) }
  }

  if (!data) return null

  const { buyer, sessions } = data
  // La cabecera va en el color de la marca, PLANO: el degradado terminaba
  // siempre en el mismo morado, que no es de nadie —una marca naranja se veía
  // media morada—. Y como el color lo elige el comerciante, la tinta se decide
  // por contraste (`lib/contraste.ts`), igual que en el ticket del pedido.
  const marca = store.color_primary || '#55C8F5'
  const tinta = textoSobre(marca)
  const tintaSuave = textoSuaveSobre(marca)
  // El velo de los botones va del mismo lado que la tinta: blanco sobre una
  // marca oscura, ink sobre una clara. Un velo blanco sobre amarillo no se ve.
  const velo = tinta === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(15,17,21,0.08)'
  // Avisos: el botón solo existe donde el navegador PUEDE. En el Safari de un
  // iPhone (fuera de la app instalada) no hay API de notificaciones, así que
  // `subscribePush` devolvía false y el botón no hacía absolutamente nada —
  // prometía y fallaba en silencio. Ahí el camino es instalar la app, que el
  // chat del pedido ya ofrece. `denied` tampoco se puede revertir desde acá.
  const puedeAvisar = pushSupported() && notifPermission() !== 'denied'
  const scoreColor = buyer.score >= 80 ? '#4ADE80' : buyer.score >= 50 ? '#FFD400' : '#EF4444'
  const scoreLabel = buyer.score >= 80 ? 'Comprador confiable' : buyer.score >= 50 ? 'Comprador estándar' : 'Nuevo comprador'

  return (
    <div className="min-h-screen" style={{ background: '#FFFDF5' }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-12" style={{ background: marca, color: tinta }}>
        <div className="max-w-[430px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            {/* El logo apaisado solo, sin el nombre escrito al lado: la misma
                firma del ticket y del chat (09-set-2026). */}
            <FirmaDeMarca nombre={store.nombre} ancho={store.logo_wide_url} cuadrado={store.logo_url} tinta={tinta} />
            <div className="flex items-center gap-2">
              {puedeAvisar && !notifGranted && (
                <button onClick={enableNotifications}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black"
                  style={{ background: velo, color: tinta }}>
                  <Bell size={12} /> Activar avisos
                </button>
              )}
              <button onClick={logout} aria-label="Cerrar sesión" className="p-2 rounded-xl"
                style={{ background: velo, color: tinta }}>
                <LogOut size={16} />
              </button>
            </div>
          </div>

          <p className="text-sm" style={{ color: tintaSuave }}>Hola,</p>
          <h1 className="font-black text-2xl">{buyer.nombre.split(' ')[0]}</h1>

          {/* Score card — tap to see how to level up. Apagada: ver MOSTRAR_FIDELIZACION. */}
          {MOSTRAR_FIDELIZACION && (
          <button onClick={() => navigate('/mi-score')}
            className="mt-4 w-full p-4 rounded-2xl flex items-center gap-4 text-left"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3"
                  strokeDasharray={`${buyer.score} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-black text-sm text-white">{buyer.score}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-sm">{scoreLabel}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Star size={12} fill="#FFD400" color="#FFD400" />
                <span className="text-xs text-white/80">{buyer.puntos} puntos acumulados</span>
              </div>
              <p className="text-xs font-bold text-white/90 mt-0.5 flex items-center gap-1">
                Ver cómo subir tu score <ChevronRight size={12} />
              </p>
            </div>
          </button>
          )}
        </div>
      </div>

      {/* De la franja de la marca al claro, con la curva hacia abajo. */}
      <BajoLaMarca fondo="#FFFDF5">

      {/* Welcome reward (once, when an imported customer activates). Apagada con
          el resto de la fidelización: anunciar puntos ganados donde no se enseña
          ningún punto deja al comprador buscando algo que no está. */}
      {MOSTRAR_FIDELIZACION && welcome && (
        <div className="max-w-[430px] mx-auto px-4 pt-4">
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #FFF7E6, #FFFDF5)', border: '1.5px solid #FFD400' }}>
            <span className="text-2xl">🎁</span>
            <div className="flex-1">
              <p className="font-black text-sm text-gray-900">¡Bienvenido, {buyer.nombre.split(' ')[0]}!</p>
              <p className="text-xs text-gray-600">{welcome.msg || `Ganaste ${welcome.points} puntos por ser cliente. ¡Gracias!`}</p>
            </div>
            <button onClick={() => setWelcome(null)} className="text-gray-400 text-xs font-bold">✕</button>
          </div>
        </div>
      )}

      {/* Repurchase CTA — the whole point of retention. Apagado: ver MOSTRAR_FIDELIZACION. */}
      {MOSTRAR_FIDELIZACION && (
      <div className="max-w-[430px] mx-auto px-4 pt-4">
        <button onClick={() => navigate('/tienda')}
          className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-sm"
          style={{ background: marca, color: tinta }}>
          <ShoppingBag size={16} /> Comprar de nuevo
        </button>
      </div>
      )}

      {/* Orders list */}
      <div className="max-w-[430px] mx-auto px-4 py-5">
        <h2 className="font-black text-lg mb-3" style={{ color: '#111' }}>
          Mis pedidos ({sessions.length})
        </h2>

        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm" style={{ color: '#888' }}>Aún no tienes pedidos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map(s => {
              const date = new Date(s.created_at).toLocaleDateString('es-PE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })
              const isCancelled = s.status === 'cancelado'
              const etapa = stageVigente(s.stage)
              const stageColor = isCancelled ? '#EF4444' : (STAGE_COLOR[etapa] ?? '#ccc')
              const stageLabel = isCancelled ? '❌ Pedido cancelado' : (STAGE_LABEL[etapa] ?? etapa)
              const unread = (s.unread_count ?? 0) + (bumps[s.id] ?? 0)

              return (
                <div key={s.id} className="rounded-2xl shadow-sm overflow-hidden"
                  style={{ background: '#fff', border: unread > 0 ? '1.5px solid var(--brand)' : '1.5px solid #f0f0f0' }}>
                <button onClick={() => openOrder(s)}
                  className="w-full text-left p-4 flex items-center gap-3">
                  <div className="relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${stageColor}22` }}>
                    <Package size={20} style={{ color: stageColor }} />
                    {unread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-white text-[10px] font-black"
                        style={{ background: '#EF4444' }}>{unread}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate" style={{ color: '#111' }}>
                      {s.product_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#888' }}>
                      S/{s.product_price} · {date}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: `${stageColor}22`, color: stageColor }}>
                        {stageLabel}
                      </span>
                      {unread > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-black" style={{ color: 'var(--brand)' }}>
                          <MessageCircle size={12} /> Leer chat
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: '#ccc' }} />
                </button>
                {MOSTRAR_FIDELIZACION && !isCancelled && (
                  <button onClick={() => reorder(s)} disabled={reordering === s.id}
                    className="w-full py-2.5 text-xs font-black flex items-center justify-center gap-1.5 border-t disabled:opacity-50"
                    style={{ color: 'var(--brand)', borderColor: '#f0f0f0' }}>
                    <RefreshCw size={13} /> {reordering === s.id ? 'Creando…' : 'Volver a pedir'}
                  </button>
                )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </BajoLaMarca>
    </div>
  )
}
