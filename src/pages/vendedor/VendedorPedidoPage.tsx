import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, Phone, PhoneOff, Mic, MicOff, Package, ArrowLeft, AlertTriangle, CheckCircle2, CheckCheck, Star, Smartphone, Users, UserPlus, Eye, X, ShoppingCart, PackagePlus, MessageCircle, NotebookPen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { escuchar } from '../../lib/realtime'
import { useCompradoresEnLinea } from '../../lib/presencia'
import { useFavoritos, alternarFavorito } from '../../lib/favoritos'
import { esperaRespuesta } from '../../lib/bandeja'
import { marcarRespondido } from '../../lib/order-answer'
import type { StoreOrder } from '../../lib/store-orders'
import IncomingCallOverlay from '../../components/IncomingCallOverlay'
import AddressBar from '../../components/AddressBar'
import TrackingBar from '../../components/TrackingBar'
import OrderDetailModal from '../../components/OrderDetailModal'
import OfferCard from '../../components/OfferCard'
import { sendCallCancel, listenCallReject } from '../../lib/call-signal'
import { pickupBranchIdOf } from '../../lib/session'
import { stageChip } from '../../lib/order-chips'
import { stageVigente } from '../../lib/order-stages'
import { conPlataEnJuego, columnaDelPedido, pasoActual, etiquetaDePaso, siguientePaso, courierDelPedido } from '../../lib/order-tracking'
import {
  esInterno, trozosConMenciones, consultaDeArroba, candidatos, insertarMencion, mencionadosEn, primerNombre,
  BORRADORES_VACIOS, borradorDe, guardarBorrador, borradorEnviado,
} from '../../lib/comentario-interno'
import type { Borradores, Etiquetable } from '../../lib/comentario-interno'
import type { PasoKey, PedidoRastreable } from '../../lib/order-tracking'
import { puedeEscribir, puedeReasignar } from '../../../supabase/functions/_shared/equipo-pedido.ts'
import AnilloAvance from '../../components/AnilloAvance'
import { useUbicacion } from '../../lib/ubicacion'
import CustomerCard from '../../components/CustomerCard'
import Confirmar from '../../components/Confirmar'
import PanelCliente from '../../components/PanelCliente'
import PagoTrace from '../../components/PagoTrace'
import TarjetaDePago from '../../components/TarjetaDePago'
import { TIPO_COBRO, textoDeCobro, montoDeLaTarjeta } from '../../lib/cobro-por-chat'
import { puedePagarSaldo, saldoDelPedido, soles } from '../../lib/order-money'
import { useSeller } from '../../lib/seller-session'
import { puedeVerClientes } from '../../lib/store-clients'
import { pedidoDemoPorToken, esTokenDemo, tiendaDemo, AUDIO_DEMO } from '../../lib/demo/tienda-demo'
import { ROL_DEMO } from '../../lib/demo/modo-demo'
import {
  ejecutarEnDemo, guardarCambio, agregarMensajeDemo, ofertaAceptadaEnDemo, ofertaEnviadaEnDemo,
  cobroEnviadoEnDemo, saldoPagadoEnDemo, ESPERA_CLIENTE_DEMO,
  invitarEnDemo, reasignarEnDemo, quitarEnDemo,
} from '../../lib/demo/cambios-demo'
import { useIsDesktop } from '../../lib/use-desktop'
import { usePanelTheme } from '../../lib/theme'
import type { OrderSession, OrderMessage } from '../../lib/order-api'
import type { RealtimeChannel } from '@supabase/supabase-js'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Ventas SÍ ve `validando` siempre: necesita distinguir un pedido que espera
// cruce de uno recién creado, aunque el comprador de Lima nunca pase por ahí.
//
// `preparando` ya no está: salió del eje (ver `order-stages.ts`). Los pedidos
// que la BD todavía tiene ahí entran por `stageVigente` y se leen como
// `confirmado` — sin eso, "avanzar" los mandaba a `nuevo`.

// ─── Seller-initiated call modal ──────────────────────────────────────────────
type CallState = 'connecting' | 'connected' | 'ended' | 'error'

function SellerCallModal({
  sessionId,
  sellerName,
  channelRef,
  onClose,
}: {
  sessionId: string
  sellerName: string
  channelRef: React.RefObject<RealtimeChannel | null>
  onClose: () => void
}) {
  const [callState, setCallState] = useState<CallState>('connecting')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const roomRef = useRef<InstanceType<typeof import('livekit-client')['Room']> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioEls = useRef<HTMLAudioElement[]>([])
  const wakeLockRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    async function connect() {
      try {
        const res = await fetch(`${BASE}/seller-call-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, seller_name: sellerName }),
        })
        if (!res.ok) throw new Error('token_failed')
        const { livekit_url, livekit_token } = await res.json() as { livekit_url: string; livekit_token: string }

        const { Room, RoomEvent, createLocalTracks, Track } = await import('livekit-client')
        const room = new Room()
        roomRef.current = room

        room.on(RoomEvent.Disconnected, () => { if (!cancelled) setCallState('ended') })

        // End call when remote party hangs up
        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!cancelled && room.remoteParticipants.size === 0) {
            if (timerRef.current) clearInterval(timerRef.current)
            setCallState('ended')
            setTimeout(onClose, 1500)
          }
        })

        // Only mark "connected" when the buyer actually answers
        room.on(RoomEvent.ParticipantConnected, () => {
          if (!cancelled) {
            setCallState('connected')
            if (!timerRef.current) timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
          }
        })

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach()
            el.autoplay = true
            el.setAttribute('playsinline', '')
            document.body.appendChild(el)
            el.play().catch(() => {})
            audioEls.current.push(el)
          }
        })

        await room.connect(livekit_url, livekit_token)
        const tracks = await createLocalTracks({ audio: true, video: false })
        for (const track of tracks) await room.localParticipant.publishTrack(track)

        if (!cancelled) {
          // Wake lock: keep screen on during call
          if ('wakeLock' in navigator) {
            (navigator as any).wakeLock.request('screen')
              .then((wl: any) => { wakeLockRef.current = wl })
              .catch(() => {})
          }
          // MediaSession: keep audio alive in background
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: 'En llamada · Kross',
              artist: 'Cliente',
            })
            navigator.mediaSession.playbackState = 'playing'
          }
          // If the buyer is somehow already in the room, connect right away;
          // otherwise stay "Esperando que conteste…" until ParticipantConnected
          if (room.remoteParticipants.size > 0) {
            setCallState('connected')
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
          }
          // Notify buyer that seller is calling
          channelRef.current?.send({
            type: 'broadcast',
            event: 'seller_call_request',
            payload: { session_id: sessionId },
          })
        }
      } catch {
        if (!cancelled) setCallState('error')
      }
    }
    connect()
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
      wakeLockRef.current?.release(); wakeLockRef.current = null
      audioEls.current.forEach(el => { el.srcObject = null; el.remove() })
      audioEls.current = []
      roomRef.current?.disconnect()
    }
  }, [sessionId])

  const toggleMute = () => {
    const lp = roomRef.current?.localParticipant
    if (!lp) return
    lp.audioTrackPublications.forEach(pub => {
      if (pub.track) muted ? pub.track.unmute() : pub.track.mute()
    })
    setMuted(!muted)
  }

  const endCall = (notifyRemote: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current)
    wakeLockRef.current?.release(); wakeLockRef.current = null
    audioEls.current.forEach(el => { el.srcObject = null; el.remove() })
    audioEls.current = []
    // Buyer never answered — tell their phone to stop ringing
    if (notifyRemote && (roomRef.current?.remoteParticipants.size ?? 0) === 0) {
      sendCallCancel(sessionId)
    }
    roomRef.current?.disconnect()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
    setCallState('ended')
    setTimeout(onClose, 1200)
  }

  const hangUp = () => endCall(true)

  // Buyer rejected the call — end on this side too
  useEffect(() => listenCallReject(sessionId, () => endCall(false)), [sessionId])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-[430px] rounded-t-3xl pb-10 pt-8 px-6 text-center" style={{ background: '#111' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"
          style={{ background: callState === 'connected' ? '#4ADE80' : callState === 'error' ? '#EF4444' : '#FFD400' }}>
          📞
        </div>
        <p className="text-white font-black text-xl mb-1">Llamada al cliente</p>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {callState === 'connecting' && 'Esperando que conteste…'}
          {callState === 'connected' && `En llamada · ${fmt(elapsed)}`}
          {callState === 'ended' && 'Llamada finalizada'}
          {callState === 'error' && 'No se pudo conectar'}
        </p>

        {callState === 'connected' && (
          <div className="flex items-center justify-center gap-1 mb-8">
            {[10,18,26,18,10,26,14,22,10,18].map((h, i) => (
              <div key={i} className="w-1 rounded-full animate-pulse"
                style={{ height: `${h}px`, background: 'var(--text)', animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}
        {callState !== 'connected' && <div className="mb-8" />}

        {(callState === 'connecting' || callState === 'connected') && (
          <div className="flex items-center justify-center gap-6">
            <button onClick={toggleMute}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }}>
              {muted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <button onClick={hangUp}
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: '#EF4444' }}>
              <PhoneOff size={26} className="text-white" />
            </button>
          </div>
        )}

        {(callState === 'ended' || callState === 'error') && (
          <button onClick={onClose}
            className="w-full py-3 rounded-2xl font-black text-sm"
            style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Stage selector ───────────────────────────────────────────────────────────
//
// Lo que se VE y lo que se MUEVE son dos cosas distintas, y confundirlas era el
// bug: esta barra mostraba el `stage` crudo, o sea el reloj del equipo, con su
// propia lista de nombres. Un pedido que Shalom ya reporta EN_TRANSITO salía
// acá como "En camino" —sin emoji— mientras el tablero lo ponía en "🚚 En
// tránsito". El mismo pedido, dos nombres, dos pantallas.
//
// Ahora se ve el PASO del eje (`pasoActual`), que funde los dos relojes y es lo
// que pinta el tablero, con el nombre y el emoji de `PASOS` — una sola
// definición. Lo que se mueve sigue siendo el `stage`: las fases del courier no
// son nuestras para marcarlas.
function StageSelector({ pedido, sessionId, canWrite, esDemo, onAdvanced }: {
  /** El pedido entero y no solo su `stage`: el paso del eje se calcula con el
   *  tipo de envío y lo que reporta el courier, no solo con lo que marcó una
   *  persona. */
  pedido: PedidoRastreable & { stage?: string | null }
  sessionId: string
  canWrite: boolean
  /** En la tienda de ejemplo no hay guía ni courier: los hacemos nosotros, y por
   *  eso ahí sí se puede avanzar por toda la línea. Ver `avanzarEnDemo`. */
  esDemo: boolean
  onAdvanced: (patch: Partial<OrderSession>, handedOff: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  // Qué se está por hacer, mientras se pregunta. `null` = no se preguntó nada.
  const [porConfirmar, setPorConfirmar] = useState<PasoKey | null>(null)
  const actual = stageVigente(pedido.stage ?? 'nuevo')
  // El paso del eje: el MISMO que pinta el tablero.
  const paso = pasoActual(pedido)
  // Y lo que sigue EN LA LÍNEA DE ESTE PEDIDO, con quién lo mueve. Antes esto
  // se sacaba de la lista cruda de etapas de la base, que es otra lista: un
  // pedido por agencia en "Registrado" tenía de botón "✅ Entregado" —saltándose
  // En origen, En tránsito y En destino— y uno en "Confirmado" ofrecía "En
  // camino", que en su línea ni existe.
  const sig = siguientePaso(pedido)
  const nombreDePaso = (key: string) => {
    const { label, emoji } = etiquetaDePaso(key)
    return `${emoji} ${label}`.trim()
  }

  const push = async (key: PasoKey) => {
    setBusy(true)
    try {
      // En el demo no hay servidor al que pedírselo: el cambio se guarda en el
      // dispositivo y se ve igual. Sin esto, avanzar de etapa enseñando la
      // herramienta terminaba en "No se pudo cambiar el estado".
      if (esDemo) {
        const r = ejecutarEnDemo(pedido as unknown as StoreOrder, { action: 'advance' })
        if (!r.ok) throw new Error('advance_failed')
        onAdvanced(r.patch as Partial<OrderSession>, false)
        return
      }
      const stage = STAGE_DE_PASO[key]
      if (!stage) throw new Error('advance_failed')
      // Persisted server-side (service role) — client writes were blocked by RLS.
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance', session_id: sessionId, stage }),
      })
      if (!res.ok) throw new Error('advance_failed')
      const { assignment } = await res.json() as { assignment: unknown | null }
      onAdvanced({ stage } as Partial<OrderSession>, !!assignment)
    } catch {
      alert('No se pudo cambiar el estado. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  // Avanzar de etapa NO SE PUEDE DESHACER: no hay botón de retroceder, y el
  // cambio dispara avisos al comprador y puede ceder el pedido a otro rol. Un
  // dedo que resbala en el móvil del vendedor deja un pedido en una etapa que
  // no le toca y sin manera de volver. Por eso se pregunta antes.

  // "No entregado" ya NO vive acá. Es un CIERRE, no un paso: termina el pedido
  // igual que cancelarlo o anularlo, y estaba suelto en la fila del estado —
  // junto al botón de avanzar, que es su contrario— donde se pulsa por error.
  // Se fue abajo, con Cancelar y Anular, que es donde uno busca las cosas que
  // no se deshacen (ver `OrderDetailModal`).
  const terminal = actual === 'entregado' || actual === 'no_entregado'
  // Se puede pulsar cuando el paso es NUESTRO. Los otros dos se dicen, no se
  // pulsan: ofrecer un botón para algo que no movemos —la guía la enciende
  // registrarla, `En origen` lo reporta el courier— es prometer un hecho que no
  // tenemos. En el demo no hay guía ni courier, así que ahí todo se puede.
  const puedePulsar = !!sig && (esDemo || sig.quien === 'equipo')

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-gray-100">
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Estado:</span>
      {/* El paso del EJE, con el MISMO nombre y emoji que el tablero — que es
          lo único que evita tener que traducir entre dos pantallas que hablan
          de lo mismo. */}
      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={stageChip(paso?.key ?? actual)}>
        {nombreDePaso(paso?.key ?? actual)}
      </span>

      {canWrite && !terminal && sig && (puedePulsar ? (
        <button onClick={() => !busy && setPorConfirmar(sig.key)} disabled={busy}
          className="ml-auto text-[10px] font-black px-3 py-1 rounded-full disabled:opacity-50"
          style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
          {busy ? '…' : `→ ${nombreDePaso(sig.key)}`}
        </button>
      ) : (
        // Qué falta y de quién depende. Es más útil que un botón que no
        // corresponde: dice dónde mirar —la guía se registra ahí abajo— en vez
        // de dejar al vendedor buscando por qué no avanza.
        <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full"
          style={{ background: 'var(--surface-3)', color: 'var(--text-faint)' }}>
          {`Sigue ${nombreDePaso(sig.key)} · ${sig.quien === 'guia' ? 'al registrar la guía' : `lo reporta ${courierDelPedido(pedido) ?? 'el courier'}`}`}
        </span>
      ))}

      {porConfirmar && (
        <Confirmar
          titulo={`¿Ya está todo listo para "${etiquetaDePaso(porConfirmar).label}"?`}
          detalle="El pedido pasa a esa etapa y no se puede retroceder."
          si="Sí, avanzar"
          no="Todavía no"
          ocupado={busy}
          onSi={() => { const n = porConfirmar; setPorConfirmar(null); push(n) }}
          onNo={() => setPorConfirmar(null)}
        />
      )}
    </div>
  )
}

/** El `stage` que escribe cada paso del eje que SÍ mueve el equipo. Los otros
 *  —`registrado`, las fases del courier— no se escriben desde acá. */
const STAGE_DE_PASO: Partial<Record<PasoKey, string>> = {
  nuevo: 'nuevo', validando: 'validando', confirmado: 'confirmado',
  en_camino: 'en_camino', entregado: 'entregado', no_entregado: 'no_entregado',
}

function roleColor(role?: string | null) {
  const r = (role ?? '').toLowerCase()
  if (r.includes('venta')) return '#55C8F5'
  if (r.includes('logist') || r.includes('despacho')) return '#863bff'
  if (r.includes('soporte')) return '#14B8A6'
  if (r.includes('motoriz')) return '#FF8C00'
  if (r.includes('admin')) return '#111'
  return '#888'
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, audio, equipo = [], pedido }: {
  msg: OrderMessage; audio?: string | null; equipo?: Etiquetable[]
  /** El pedido, para la tarjeta de pago: el monto y el "¿ya pagó?" salen del
   *  estado de HOY, no de lo que decía el mensaje cuando se mandó. */
  pedido?: OrderSession | null
}) {
  const isSeller = msg.sender_role === 'seller'
  const time = new Date(msg.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  // ── El comentario interno ──
  // Va en el MISMO hilo, al lado de lo que pasó —una pestaña aparte de notas es
  // una pestaña que nadie abre— pero tiene que verse de otra especie desde el
  // otro lado de la sala. No es una burbuja de conversación: es una nota pegada
  // al hilo, así que va centrada, con candado y sin la forma de un mensaje. Si
  // se pareciera a una burbuja, alguien acabaría escribiéndole al cliente
  // creyendo que comenta, que es el error que no se puede permitir.
  if (esInterno(msg)) {
    return (
      <div className="flex justify-center mb-3">
        {/* Un papelito, no una burbuja. El color hace el trabajo que antes hacía
            la coletilla "el cliente no lo ve": un post-it amarillo pegado en el
            hilo no se confunde con un mensaje, y no hay que leer nada para
            saberlo. Decirlo además, en cada nota, era gritar lo evidente. */}
        <div className="rounded-2xl px-3 py-2 max-w-[85%] w-full"
          style={{ background: 'var(--nota-bg)', border: '0.5px solid var(--nota-border)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <NotebookPen size={11} style={{ color: 'var(--nota-fg)' }} />
            <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--nota-fg)' }}>
              Nota interna
            </p>
          </div>
          <p className="text-[13px] leading-snug" style={{ color: 'var(--text)' }}>
            {trozosConMenciones(msg.body ?? '', equipo).map((t, i) => t.mencion
              ? <strong key={i} style={{ color: 'var(--nota-fg)' }}>{t.texto}</strong>
              : <span key={i}>{t.texto}</span>)}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>
            {msg.sender_name ?? 'Equipo'}{msg.sender_role_label ? ` · ${msg.sender_role_label}` : ''} · {time}
          </p>
        </div>
      </div>
    )
  }

  // La llamada es un evento del pedido, no un mensaje de texto. Antes caía en
  // la burbuja genérica del chat —y su grabación vivía en otra pantalla, la de
  // Llamadas—, así que la llamada donde el cliente corrigió su dirección no
  // quedaba donde está la dirección. Acá se ve en la línea de tiempo, y si hay
  // grabación se escucha sin salir del pedido.
  if (msg.type === 'call_log') {
    return (
      <div className="flex justify-center mb-3">
        <div className="rounded-2xl px-3 py-2 max-w-[85%] w-full"
          style={{ background: 'var(--surface-3)' }}>
          <div className="flex items-center justify-center gap-1.5">
            <Phone size={11} style={{ color: 'var(--text-faint)' }} />
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{msg.body}</p>
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>· {time}</span>
          </div>
          {audio && <audio controls preload="none" src={audio} className="w-full h-8 mt-2" />}
        </div>
      </div>
    )
  }

  if (msg.type === 'status_update') {
    return (
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
          <Package size={11} />
          <p className="text-[11px] font-semibold">{msg.body}</p>
        </div>
      </div>
    )
  }

  if (msg.offer) {
    return <OfferCard offer={msg.offer} role="seller" />
  }

  // La tarjeta de pago que se le mandó. Antes acá caía en la burbuja de texto
  // de abajo: el vendedor mandaba algo y no tenía forma de ver qué mandó ni si
  // había llegado. Una acción cuyo resultado no se ve es una que se repite.
  if (msg.type === TIPO_COBRO && pedido) {
    return (
      <TarjetaDePago
        texto={msg.body} monto={montoDeLaTarjeta(pedido, saldoDelPedido(pedido))} pedido={pedido} role="seller"
        pagada={!puedePagarSaldo(pedido)}
        hora={new Date(msg.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
      />
    )
  }

  const roleC = roleColor(msg.sender_role_label)
  return (
    <div className={`flex ${isSeller ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] flex flex-col ${isSeller ? 'items-end' : 'items-start'}`}>
        {/* Sender distinction: who wrote it + their role */}
        <p className="text-[9px] mb-0.5 mx-1 font-bold flex items-center gap-1"
          style={{ color: isSeller ? roleC : 'var(--text-faint)' }}>
          {isSeller
            ? <>{msg.sender_name?.split(' ')[0] || 'Kross'}{msg.sender_role_label && <span className="px-1 rounded" style={{ background: `${roleC}22` }}>{msg.sender_role_label}</span>}</>
            : (msg.sender_name || 'Cliente')}
        </p>
        <div className="px-4 py-2.5 rounded-2xl text-sm"
          style={isSeller
            ? { background: 'var(--invert)', color: 'var(--invert-fg)', fontWeight: 500, borderRadius: '18px 18px 4px 18px' }
            : { background: 'var(--surface-3)', color: 'var(--text)', borderRadius: '18px 18px 18px 4px' }
          }>
          {(msg.body || '').split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 mx-1">{time}</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
/**
 * La ruta `/vendedor/pedido/:token`. Se queda como estaba: es la que abren las
 * notificaciones, los enlaces compartidos y el historial del cliente.
 */
export default function VendedorPedidoPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  return <PedidoVista token={token} onCerrar={() => navigate('/vendedor/pedidos')} />
}

/**
 * Dónde está montado el pedido. Es UN dato y no dos banderas: `pagina` y
 * `panel` y `ventana` se excluyen, y con booleanos sueltos existe el estado
 * imposible de estar en los dos sitios a la vez.
 */
export type MontajeDelPedido = 'pagina' | 'panel' | 'ventana'

/**
 * El pedido, montado como página completa o como panel lateral.
 *
 * Abrir un pedido desde Pedidos dejó de ser un viaje a otra pantalla —perdías
 * la lista, y volver costaba una recarga entera— y pasó a entrar por la derecha
 * encima de ella. Es el MISMO componente: un pedido que se comporta distinto
 * según por dónde se abrió sería otra copia de la misma pantalla, que es
 * justamente lo que este refactor viene deshaciendo (docs/11-RELACIONES.md).
 */
export function PedidoVista({ token, montaje = 'pagina', onCerrar }: {
  token: string | undefined
  /**
   * · `pagina`  → la ruta `/vendedor/pedido/:token`, con su marco 16:9.
   * · `panel`   → el cajón de la derecha: llena su caja, con su X para cerrar.
   * · `ventana` → la ventana del centro, para MIRAR un pedido viejo. Va sin la
   *   ficha del cliente —se llegó a este pedido justamente desde ahí— y sin
   *   botón de volver: la ventana ya trae el suyo arriba a la derecha.
   */
  montaje?: MontajeDelPedido
  /** Volver: a la lista en la ruta, cerrar el panel o la ventana si no. */
  onCerrar: () => void
}) {
  const { real, effective, isAdmin } = useSeller()
  const desktop = useIsDesktop()
  usePanelTheme()
  const sellerName = effective?.nombre ?? 'Kross'

  /** Los "el cliente respondió" del demo. Se guardan para cancelarlos al cerrar
   *  el pedido: si no, el temporizador escribe sobre una pantalla que ya no
   *  está — y enseñando, eso es una respuesta que aparece en el pedido
   *  equivocado. */
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { demoTimers.current.forEach(clearTimeout) }, [])
  const alRato = useCallback((fn: () => void) => {
    demoTimers.current.push(setTimeout(fn, ESPERA_CLIENTE_DEMO))
  }, [])
  // En la tienda de ejemplo se firma como DUEÑO. Quien presenta la enseña como
  // dueño del negocio, no con su cargo en Kross: "Admin" es una palabra
  // nuestra, y lo que el cliente que mira tiene que ver es su propia tienda.
  const sellerRole = esTokenDemo(token) ? ROL_DEMO : (effective?.role_label ?? null)

  const [session, setSession] = useState<OrderSession | null>(null)
  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [loading, setLoading] = useState(true)
  // DOS borradores, uno por audiencia. Lo escrito no cruza de un modo al otro:
  // con uno solo, media nota + un toque al interruptor por costumbre + enviar
  // le manda al cliente algo que nunca fue para él, por push y por WhatsApp, y
  // eso no se deshace. Ver `Borradores` en lib/comentario-interno.ts.
  const [borradores, setBorradores] = useState<Borradores>(BORRADORES_VACIOS)
  // ¿Esto va al cliente o es una nota del equipo? Vive acá y no en el mensaje
  // porque es el MODO del redactor: lo que decide qué se ve mientras se escribe.
  const [interno, setInterno] = useState(false)
  const input = borradorDe(borradores, interno)
  const setInput = (texto: string) => setBorradores(b => guardarBorrador(b, interno, texto))
  const [notaInvitacion, setNotaInvitacion] = useState('')
  /** A quién se eligió invitar, mientras se escribe su nota. `null` = todavía
   *  se está eligiendo. Es lo que parte el invitador en dos pasos. */
  const [porInvitar, setPorInvitar] = useState<{ auth_user_id: string; nombre: string; role_label: string } | null>(null)
  const [caret, setCaret] = useState(0)
  const campoRef = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [verClienteAbierto, setVerCliente] = useState(false)
  const [marcando, setMarcando] = useState(false)
  // El puntito verde, de la misma fuente que Lista y Tablero.
  const enLinea = useCompradoresEnLinea(effective?.store_id)
  const favoritos = useFavoritos(effective?.store_id)
  const buyerOnline = !!session?.buyer_id && enLinea.has(session.buyer_id)
  // "Está en la app" = hoy puede recibir una push. Haber entrado alguna vez no
  // basta: se desinstala sin avisar, y lo que decide si el aviso llega es la
  // suscripción viva.
  const enApp = !!session?.buyer_contact?.push_activo
  // De dónde es el pedido: del `address` a domicilio, de la SEDE si va por
  // agencia (ver lib/ubicacion.ts).
  const ubicacion = useUbicacion(session)
  const [buyerTyping, setBuyerTyping] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const [showWa, setShowWa] = useState(false)
  // Las grabaciones de ESTE pedido, para engancharlas a su mensaje de llamada.
  // Solo admin: dissolver la pantalla de Llamadas no debe ampliar en silencio
  // quién puede escuchar a un cliente. `get-recordings` ya lo exige y filtra
  // por `session_id`; acá solo se le pregunta por este pedido.
  const [audiosReales, setAudios] = useState<Record<string, string>>({})
  const [team, setTeam] = useState<{ auth_user_id: string; nombre: string; role_label: string }[]>([])
  const mensajesRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load session by token (also used to refresh after assignment/participant changes)
  const reloadSession = useCallback(async (withSpinner = false) => {
    if (!token) { setLoading(false); return }
    if (withSpinner) setLoading(true)

    // Un pedido de ejemplo no existe en la base: se abre desde el generador, con
    // su conversación y su grabación. Sin esto la bandeja del demo llevaba a
    // "Sesión no encontrada", que es peor que no tener demo.
    if (esTokenDemo(token)) {
      try {
        const p = await pedidoDemoPorToken(token)
        if (p) {
          setSession(p as unknown as OrderSession)
          setMessages((p.chat_messages ?? []) as unknown as OrderMessage[])
        }
      } finally { setLoading(false) }
      return
    }

    try {
      // El JWT del vendedor, no la anon key. `?viewer=seller` no prueba nada
      // —lo escribe cualquiera, y el token del pedido es del comprador—, así
      // que los COMENTARIOS INTERNOS solo vuelven si `get-session` puede
      // comprobar contra `sellers` quién está pidiendo. Sin sesión se cae a la
      // anon key: se ve todo lo demás y lo interno no, que es como debe fallar.
      const { data: sesion } = await supabase.auth.getSession()
      const jwt = sesion?.session?.access_token ?? ANON
      const res = await fetch(`${BASE}/get-session?viewer=seller`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-kross-token': token },
      })
      if (!res.ok) return
      const { session: s, messages: m } = await res.json() as { session: OrderSession; messages: OrderMessage[] }
      setSession(s)
      setMessages(m)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { reloadSession(true) }, [reloadSession])

  // Mark the buyer's messages as read whenever the seller has this chat open
  const markRead = useCallback((sid: string) => {
    fetch(`${BASE}/mark-chat-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, reader: 'seller' }),
    }).catch(() => {})
  }, [])

  useEffect(() => { if (session?.id) markRead(session.id) }, [session?.id, markRead])

  // Las grabaciones se piden UNA vez por pedido, y solo si el hilo tiene alguna
  // llamada que enganchar: sin llamadas no hay nada que traer.
  const hayLlamadas = messages.some(m => m.type === 'call_log' && m.call_recording_id)

  // En demo la grabación es un WAV de ejemplo incrustado: el reproductor es real
  // y suena, pero no finge ser una conversación grabada. Se DERIVA de los
  // mensajes en vez de guardarse en estado — un efecto lo pondría un render
  // tarde y el control saldría muerto en la primera pintada.
  const audios = esTokenDemo(token)
    ? Object.fromEntries(messages.flatMap(m => m.call_recording_id ? [[m.call_recording_id, AUDIO_DEMO]] : []))
    : audiosReales
  useEffect(() => {
    if (esTokenDemo(token)) return   // en demo el audio se deriva, no se pide
    if (!isAdmin || !real?.auth_user_id || !session?.id || !hayLlamadas) return
    let vivo = true
    fetch(`${BASE}/get-recordings`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_auth_id: real.auth_user_id, store_id: effective?.store_id, session_id: session.id }),
    })
      .then(r => (r.ok ? r.json() : { recordings: [] }))
      .then((d: { recordings?: { id: string; url: string | null }[] }) => {
        if (!vivo) return
        const map: Record<string, string> = {}
        for (const r of d.recordings ?? []) if (r.url) map[r.id] = r.url
        setAudios(map)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [token, isAdmin, real?.auth_user_id, effective?.store_id, session?.id, hayLlamadas])

  // Realtime.
  //
  // Por `escuchar` y no por `supabase.channel` directo: desde que el pedido se
  // abre EN PANEL encima de la lista, las dos pantallas piden los mismos topics
  // a la vez. `supabase.channel(topic)` devuelve el canal que ya existe, y
  // atarle un manejador después de `subscribe()` LANZA — la excepción subía por
  // este efecto y dejaba la pantalla en blanco. Ver lib/realtime.ts.
  useEffect(() => {
    if (!session) return
    const sid = session.id
    const s = escuchar(`order:${sid}`, {
      broadcast: {
        new_message: ({ payload }) => {
          const msg = payload as unknown as OrderMessage
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev.filter(m => !(m.id.startsWith('opt-') && m.sender_role === msg.sender_role)), msg]
          })
          if (msg.sender_role === 'buyer') markRead(sid)
        },
        stage_update: ({ payload }) => {
          setSession(prev => prev ? { ...prev, stage: payload.stage as OrderSession['stage'] } : prev)
        },
        assignment_update: () => { reloadSession() },
        participants_update: () => { reloadSession() },
        // De lo interno no viaja el cuerpo por el canal —es el del comprador—:
        // solo el aviso. El hilo se vuelve a pedir por la puerta que verifica.
        internal_update: () => { reloadSession() },
        address_update: ({ payload }) => {
          setSession(prev => prev ? { ...prev, address: payload.address as string, address_verified: payload.address_verified as boolean, address_lat: payload.address_lat as number, address_lng: payload.address_lng as number } : prev)
        },
        order_cancelled: () => {
          setSession(prev => prev ? { ...prev, status: 'cancelado' } : prev)
        },
        order_recreated: () => {
          setSession(prev => prev ? { ...prev, status: 'active', stage: 'nuevo' } : prev)
        },
        answered_update: ({ payload }) => {
          setSession(prev => prev ? { ...prev, answered_at: payload.answered_at as string } : prev)
        },
        nota_update: ({ payload }) => {
          setSession(prev => prev ? { ...prev, nota: payload.nota as string } : prev)
        },
        tracking_update: ({ payload }) => {
          setSession(prev => prev ? { ...prev, ...payload } : prev)
        },
        items_update: ({ payload }) => {
          setSession(prev => prev ? { ...prev, items: payload.items as OrderSession['items'], product_price: payload.total as number } : prev)
        },
        message_update: ({ payload }) => {
          setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, offer: payload.offer as OrderMessage['offer'] } : m))
        },
        typing: ({ payload }) => {
          if (payload.role === 'buyer') {
            setBuyerTyping(true)
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
            typingTimerRef.current = setTimeout(() => setBuyerTyping(false), 3000)
          }
        },
      },
    })
    channelRef.current = s.canal
    return () => {
      s.cerrar()
      channelRef.current = null
    }
  }, [session?.id])


  // Bajar al último mensaje.
  //
  // Se mueve el `scrollTop` del propio contenedor y no `scrollIntoView`: ese
  // arrastra a TODOS los ancestros que scrolleen, y con el pedido abierto
  // encima de una lista eso significaba mover también la pantalla de atrás.
  useEffect(() => {
    const caja = mensajesRef.current
    if (caja) caja.scrollTop = caja.scrollHeight
  }, [messages.length, buyerTyping])

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !session) return
    if (sendTypingTimerRef.current) return
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { role: 'seller' } })
    sendTypingTimerRef.current = setTimeout(() => { sendTypingTimerRef.current = null }, 2000)
  }, [session])

  // El equipo de la TIENDA — el de invitar, que es otra lista que la del `@`:
  // ahí se ofrece a quien ya está en el pedido, y acá a quien todavía no.
  const cargarEquipo = useCallback(async () => {
    if (team.length > 0) return
    // En la tienda de ejemplo el equipo no está en `sellers`: lo arma el
    // generador. Sin esto, el invitador salía VACÍO en el demo —consultaba por
    // `store_id = 'demo'`, que no existe— y no había a quién invitar justo
    // mientras se enseña la herramienta.
    if (esTokenDemo(token)) {
      const t = await tiendaDemo()
      setTeam(t.equipo.map(m => ({ auth_user_id: m.auth_user_id, nombre: m.nombre, role_label: m.role_label })))
      return
    }
    if (!session?.store_id) return
    const { data } = await supabase
      .from('sellers')
      .select('auth_user_id, nombre, role_label, active')
      .eq('store_id', session.store_id)
      .not('auth_user_id', 'is', null)
    // `active` se filtra acá y no con `.eq('active', true)`: las filas viejas lo
    // tienen NULL, y en Postgres `= true` las descarta — dejaba fuera a media
    // tienda sin que nada lo dijera. Fuera solo quien está apagado a propósito.
    const vivos = (data as { auth_user_id: string; nombre: string; role_label: string; active: boolean | null }[] ?? [])
      .filter(m => m.active !== false)
    setTeam(vivos)
  }, [team.length, session?.store_id, token])

  // A quién se puede etiquetar: **los que están en el pedido**, no toda la
  // tienda. Etiquetar a alguien que no puede leer el hilo es escribirle a una
  // pared: le llega una mención a una conversación que no ve. Para traer a
  // alguien de fuera está Invitar, y en cuanto entra ya se le puede etiquetar.
  const equipoEtiquetable: Etiquetable[] = useMemo(
    () => (session?.participants ?? []).map(p => ({ id: p.id, nombre: p.nombre, role_label: p.role_label })),
    [session?.participants],
  )

  const handleSend = useCallback(async () => {
    if (!input.trim() || !session || sending) return
    const body = input.trim()
    const esComentario = interno
    // Se resuelven contra el equipo y se guardan `id`s: el texto `@Renzo` deja
    // de apuntar a nadie en cuanto Renzo cambia de nombre.
    const etiquetados = esComentario ? mencionadosEn(body, equipoEtiquetable) : []
    setBorradores(b => borradorEnviado(b, esComentario))
    setSending(true)
    const optimisticId = `opt-${Date.now()}`
    const optimistic: OrderMessage = {
      id: optimisticId,
      session_id: session.id,
      sender_role: 'seller',
      sender_name: sellerName,
      sender_role_label: sellerRole,
      type: 'text',
      body,
      media_url: null,
      created_at: new Date().toISOString(),
      read_at: null,
      visibility: esComentario ? 'sellers' : 'all',
      mentions: etiquetados,
    }
    setMessages(prev => [...prev, optimistic])

    // En el demo el mensaje se queda acá, en el dispositivo: no hay servidor
    // que lo guarde ni comprador al otro lado. Es la mitad honesta de lo que se
    // enseña —lo que ESCRIBE el vendedor queda escrito y sigue ahí al volver—;
    // la respuesta del cliente no se puede inventar, así que no se inventa.
    if (esTokenDemo(token)) {
      agregarMensajeDemo(session.id, { ...optimistic, id: `demo-msg-${Date.now()}` })
      setSending(false)
      return
    }

    try {
      const res = await fetch(`${BASE}/seller-send-message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          seller_name: sellerName,
          seller_role: sellerRole,
          body,
          type: 'text',
          interno: esComentario,
          mentions: etiquetados,
        }),
      })
      if (!res.ok) throw new Error('send_failed')
      const saved: OrderMessage = await res.json()
      // Replace optimistic with real message; seller-send-message already broadcasts to buyer
      setMessages(prev => prev.map(m => m.id === optimisticId ? saved : m))
      // Al canal solo lo público: `order:<id>` es el del COMPRADOR y su chat
      // pinta lo que llegue. Un comentario interno mandado por ahí se le
      // aparecería en vivo, que es peor que poder leerlo — no hay que buscarlo.
      if (!esComentario) {
        channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: saved })
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      // Al borrador de SU audiencia, no al que esté puesto ahora: si mientras
      // tanto se cambió de modo, devolverlo al otro lado es justo el cruce que
      // los dos borradores existen para impedir.
      setBorradores(b => guardarBorrador(b, esComentario, body))
    } finally {
      setSending(false)
    }
  }, [input, session, sending, sellerName, sellerRole, token, interno, equipoEtiquetable])

  // ── Volver a pedir el saldo por el chat ──
  //
  // Es un mensaje normal con `type: 'cobro'`, y por eso no hizo falta nada nuevo
  // en el servidor: `seller-send-message` lo inserta, lo emite al canal del
  // comprador y dispara su push (y WhatsApp si no hay push). Lo único que ese
  // tipo cambia es cómo lo pinta el chat del comprador — con el botón de Yape
  // debajo.
  //
  // El monto sale del pedido de HOY, no de cuando se generó el cupón: con un
  // upsell de por medio el saldo cambió, y prometer el viejo sería cobrar de
  // menos.
  const cobrarPorChat = useCallback(async () => {
    if (!session) return
    // `saldoDelPedido` y no una resta a mano: es la MISMA cuenta que pinta el
    // anillo y que decide si el botón de pagar aparece. Tres restas iguales en
    // tres sitios es como se llega a que el mensaje prometa un monto y la caja
    // cobre otro.
    const body = textoDeCobro(soles(saldoDelPedido(session)))

    if (esTokenDemo(token)) {
      // Dos tiempos, y esa espera ES lo que se enseña: la tarjeta sale como
      // ENVIADA, y diez segundos después el comprador "paga". Aceptarla en el
      // mismo instante se lee como que el panel se lo inventó.
      const msg = cobroEnviadoEnDemo(session as unknown as StoreOrder, body, { nombre: sellerName, rol: sellerRole })
      setMessages(prev => [...prev, msg as unknown as OrderMessage])
      alRato(() => {
        const patch = saldoPagadoEnDemo(session as unknown as StoreOrder)
        setSession(s => s ? { ...s, ...patch } as OrderSession : s)
      })
      return
    }

    const res = await fetch(`${BASE}/seller-send-message`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id, seller_name: sellerName, seller_role: sellerRole,
        type: TIPO_COBRO, body,
      }),
    })
    if (!res.ok) { alert('No se pudo enviar el cobro. Revisa tu conexión e intenta de nuevo.'); return }
    const saved: OrderMessage = await res.json()
    setMessages(prev => prev.some(m => m.id === saved.id) ? prev : [...prev, saved])
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: saved })
  }, [session, token, sellerName, sellerRole, alRato])

  // ── El cupón venció: emitir otro ──
  //
  // No se "extiende": 360pay no tiene endpoint para eso, y no hace falta.
  // `pay360-coupon` ya consulta el cupón previo, lo anula si no está pagado y
  // emite uno nuevo — y el CÓDIGO DE PAGO del comprador no cambia, porque es
  // estable por comprador (`pay360_consumer_code`). Lo que cambia es el cupón
  // que cuelga de él, con su vencimiento nuevo.
  const reemitirCupon = useCallback(async () => {
    if (!session) return
    if (esTokenDemo(token)) {
      const patch = { pay360_saldo_coupon_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }
      guardarCambio(session.id, patch)
      setSession(s => s ? { ...s, ...patch } as OrderSession : s)
      return
    }
    const r = await fetch(`${BASE}/pay360-coupon`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_token: token, tipo: 'saldo' }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.ok) { alert(d.user_message ?? 'No se pudo generar el código. Intenta de nuevo.'); return }
    // La sesión se relee entera: el cupón nuevo trae otro vencimiento y, si el
    // pedido creció con un upsell, otro monto.
    reloadSession()
  }, [session, token, reloadSession])

  if (loading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center" style={{ background: 'var(--chat-bg)' }}>
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col h-screen items-center justify-center px-8 text-center" style={{ background: 'var(--chat-bg)' }}>
        <Package size={40} className="text-gray-300 mb-4" />
        <p className="font-black text-gray-800">Sesión no encontrada</p>
        <button onClick={onCerrar} className="mt-4 text-sm text-[var(--brand)] font-semibold">
          Volver a chats
        </button>
      </div>
    )
  }

  const meId = effective?.auth_user_id
  const participants = session.participants ?? []
  const arroba = consultaDeArroba(input, caret)
  const etiquetar = (quien: Etiquetable) => {
    if (!arroba) return
    const r = insertarMencion(input, arroba.desde, caret, quien)
    setInput(r.texto)
    setCaret(r.caret)
    // El foco vuelve al campo con el cursor donde toca: si se queda en el
    // botón, hay que volver a tocar el campo para seguir escribiendo.
    requestAnimationFrame(() => {
      campoRef.current?.focus()
      campoRef.current?.setSelectionRange(r.caret, r.caret)
    })
  }
  const onShift = effective?.available !== false // turno (lo asigna el admin)
  // Quién manda en ESTE pedido. La regla vive en `_shared/equipo-pedido.ts` y
  // la lee también el servidor: acá es la manija —no ofrecer lo que va a ser
  // rechazado— y allá la puerta.
  const yo = { id: meId ?? null, is_admin: isAdmin, available: onShift }
  const canWrite = puedeEscribir(session, yo)
  const canReasignar = puedeReasignar(session, yo)

  const openInvite = async () => {
    setShowInvite(true)
    await cargarEquipo()
  }

  /** Cerrar deja el invitador como estaba. Sin esto, reabrirlo enseña la nota
   *  que se escribió para OTRA persona — y esa nota se manda etiquetándola. */
  const cerrarInvitar = () => {
    setShowInvite(false)
    setPorInvitar(null)
    setNotaInvitacion('')
  }

  const invite = async (sellerAuthId: string) => {
    const porQue = notaInvitacion.trim()
    if (!porQue) return
    cerrarInvitar()

    // En la tienda de ejemplo no hay a quién pedírselo: se resuelve acá igual
    // que lo haría el servidor —participante, aviso y nota— para que invitar
    // con nota se pueda enseñar entero.
    if (esTokenDemo(token)) {
      const m = team.find(t => t.auth_user_id === sellerAuthId)
      if (m) {
        const r = invitarEnDemo(
          session as unknown as StoreOrder,
          { id: m.auth_user_id, nombre: m.nombre, role_label: m.role_label },
          porQue,
          { nombre: sellerName, rol: sellerRole },
        )
        if (r.patch) setSession(s => s ? { ...s, ...r.patch } as OrderSession : s)
      }
      reloadSession()
      return
    }

    // El porqué viaja con la invitación y queda como COMENTARIO INTERNO
    // etiquetando al invitado. Invitar sin decir a qué obliga al otro a leerse
    // el hilo entero para adivinar qué le tocaba.
    const res = await postDeEquipo({
      action: 'invite', session_id: session.id, invite_seller_id: sellerAuthId, invite_nota: porQue,
    })
    if (!res.ok) { alert('No se pudo invitar.'); return }
    reloadSession()
  }

  /**
   * Las acciones de EQUIPO —invitar, sacar, pasar el pedido— van con el JWT del
   * vendedor y no con la anon key: el servidor ya no se fía de un `by_seller_id`
   * en el cuerpo, que es lo que el que llama diga de sí mismo. Sin sesión la
   * petición se rechaza, que es como debe fallar.
   */
  const postDeEquipo = async (payload: Record<string, unknown>) => {
    const { data: sesion } = await supabase.auth.getSession()
    const jwt = sesion?.session?.access_token ?? ANON
    return fetch(`${BASE}/order-manage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const expel = async (sellerAuthId: string) => {
    if (esTokenDemo(token)) {
      const r = quitarEnDemo(session as unknown as StoreOrder, sellerAuthId)
      if (r.patch) setSession(s => s ? { ...s, ...r.patch } as OrderSession : s)
      reloadSession()
      return
    }
    const res = await postDeEquipo({ action: 'expel', session_id: session.id, invite_seller_id: sellerAuthId })
    if (!res.ok) { alert('No se pudo sacar del pedido.'); return }
    reloadSession()
  }

  /** Pasarle el pedido a otro. La nota es obligatoria: un pedido que cambia de
   *  dueño sin explicación es un pedido que el siguiente empieza de cero. */
  const reasignar = async (sellerAuthId: string) => {
    const porQue = notaInvitacion.trim()
    if (!porQue) return
    cerrarInvitar()

    if (esTokenDemo(token)) {
      const m = team.find(t => t.auth_user_id === sellerAuthId)
      if (m) {
        const r = reasignarEnDemo(
          session as unknown as StoreOrder,
          { id: m.auth_user_id, nombre: m.nombre, role_label: m.role_label },
          porQue,
          { nombre: sellerName, rol: sellerRole },
        )
        if (r.patch) setSession(s => s ? { ...s, ...r.patch } as OrderSession : s)
      }
      reloadSession()
      return
    }

    const res = await postDeEquipo({
      action: 'reassign', session_id: session.id, to_seller_id: sellerAuthId, invite_nota: porQue,
    })
    if (!res.ok) { alert('No se pudo pasar el pedido.'); return }
    reloadSession()
  }

  // ¿Este pedido le debe una respuesta al cliente? Es la MISMA regla que ordena
  // la bandeja (lib/bandeja.ts): el último en hablar fue el comprador y nadie
  // lo dio por respondido después. Una segunda copia acá haría que el botón y
  // la lista discreparan sobre el mismo pedido.
  const debeRespuesta = esperaRespuesta(session as unknown as StoreOrder)
  const favorito = favoritos.has(session.id)

  const alMarcarRespondido = async () => {
    if (marcando) return
    setMarcando(true)
    const answered_at = await marcarRespondido(session.id, effective?.store_id)
    if (answered_at) setSession(s => s ? { ...s, answered_at } : s)
    else alert('No se pudo marcar como respondido. Intenta de nuevo.')
    setMarcando(false)
  }

  // ── Las piezas del pedido, montadas distinto según la pantalla ───────────
  const overlay = (
    <>
      {/* IncomingCallOverlay — disabled when seller already has a call open */}
      <IncomingCallOverlay storeId={effective?.store_id ?? session.store_id ?? undefined} disabled={showCall || !canWrite} />
    </>
  )

  const headerBlock = (
    <>
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-4 text-white"
        style={{ background: 'var(--chat-header)', borderRadius: '0 0 24px 24px' }}>
        <div className="flex items-center gap-3">
          {/* En la ventana del centro no va: la ventana ya trae su X arriba a
              la derecha, y dos formas de cerrar lo mismo, a diez píxeles una de
              otra, se leen como que hacen cosas distintas. */}
          {montaje !== 'ventana' && (
            <button onClick={onCerrar} aria-label={montaje === 'panel' ? 'Cerrar el pedido' : 'Volver a Pedidos'}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.1)' }}>
              {montaje === 'panel' ? <X size={18} className="text-white" /> : <ArrowLeft size={18} className="text-white" />}
            </button>
          )}

          {/* El avatar ya no abre nada. Era un botón que no parecía botón, y
              detrás tenía el DNI, el teléfono y el rastro del pago — datos que
              nadie encontraba. Todo eso vive ahora en la columna de la derecha,
              a la vista. Acá el avatar es lo que aparenta: quién es, y si está
              en línea. */}
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black"
              style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
              {(session.buyer_name || 'C')[0]}
            </div>
            {/* Lima cuando está conectado, como en Lista y en el Tablero. Decía
                `var(--text)`, que en el panel oscuro ES casi blanco: el punto
                salía blanco y no se distinguía del apagado. */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
              title={buyerOnline ? 'Con la app abierta ahora' : 'No tiene la app abierta'}
              style={{ borderColor: 'var(--chat-header)', background: buyerOnline ? 'var(--ok-fg)' : 'var(--structural, #3D444C)' }} />
          </div>

          <button onClick={() => setShowDetail(true)} disabled={desktop}
            className="flex-1 min-w-0 text-left disabled:cursor-default">
            <p className="font-black text-white text-base leading-tight flex items-baseline gap-2">
              <span className="truncate">{session.buyer_name || 'Comprador'}</span>
              {/* El DNI, no el número de pedido. Cuál de sus pedidos es este ya
                  lo responde la ficha del cliente, que marca el que está
                  abierto; lo que no dice ninguna otra pantalla de un vistazo es
                  QUIÉN es esta persona — y el DNI es su identidad en Kross: un
                  mismo número junta sus pedidos aunque cambie de teléfono. */}
              {session.buyer_contact?.document_number && (
                <span className="text-[11px] font-semibold tabular flex-shrink-0"
                  title={`${session.buyer_contact.document_type || 'DNI'} ${session.buyer_contact.document_number}`}
                  style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {session.buyer_contact.document_number}
                </span>
              )}
              {/* Cuánto de este pedido está cobrado. El mismo anillo del
                  tablero, y por la misma razón: al abrir el chat lo primero que
                  decide el tono de la conversación es si ya pagó, si pagó la
                  mitad o si no ha entrado nada. Desde `confirmado` en adelante,
                  igual que allá — antes no hay nada cobrado que mostrar. */}
              {conPlataEnJuego(columnaDelPedido(session)) && (
                <AnilloAvance pedido={session} size={15} sobreOscuro />
              )}
            </p>
            {/* DE DÓNDE es el pedido. Decide el courier, el costo del envío y
                cuánto tarda, y es lo primero que se pregunta al abrir un chat.
                Acá decía "En línea ahora" —que ya lo dice el punto del avatar— o
                el producto, que ahora vive entero en la columna de la derecha. */}
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {ubicacion ?? 'Sin ubicación'}
            </p>
            {!desktop && (
              <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.7)' }}><ShoppingCart size={11} /> Ver pedido</p>
            )}
          </button>

          {/* La deuda con el cliente se cierra acá. La bandeja llama "sin
              responder" a un pedido cuyo último mensaje es del comprador, y eso
              casi siempre se arregla escribiéndole — pero no siempre: se le
              llamó, se le contestó por WhatsApp, o la pregunta no necesitaba
              respuesta. Sin esto, esos pedidos se quedan arriba de la lista
              para siempre y la lista deja de significar algo.
              Solo aparece cuando hay deuda: un botón que no hace falta ocupa
              sitio y hace dudar de si había algo pendiente. */}
          {debeRespuesta && canWrite && (
            <button
              onClick={alMarcarRespondido}
              disabled={marcando}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50"
              style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}
              aria-label="Marcar como respondido"
              title="Marcar como respondido — sale de «Sin responder» hasta que el cliente vuelva a escribir">
              <CheckCheck size={16} />
            </button>
          )}

          {/* La estrella es de quien mira, no del pedido: dos vendedores tienen
              pendientes distintos, y una estrella compartida se llenaría de las
              marcas de todos hasta no decir nada. Ver lib/favoritos.ts */}
          <button
            onClick={() => alternarFavorito(effective?.store_id, session.id)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={favorito
              ? { background: 'var(--brand)', color: 'var(--on-brand)' }
              : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}
            aria-pressed={favorito}
            aria-label={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
            title={favorito ? 'Quitar de favoritos' : 'Guardar para volver — sale en «Favoritos»'}>
            <Star size={16} fill={favorito ? 'currentColor' : 'none'} />
          </button>

          {/* Antes era una campana genérica. Ahora dice lo que de verdad
              importa: si este cliente está en la app.

              El botón NO se esconde cuando ya está: desinstalar no avisa a
              nadie, así que "ya la tiene" nunca es una certeza y esconder el
              botón dejaría al vendedor sin manera de reinvitarlo. Lo que cambia
              es el color y lo que dice — apagado si ya recibe notificaciones,
              encendido si no—, y los dos datos crudos (desde cuándo entró, si
              hoy recibe push) están en la ficha del cliente, a la derecha. */}
          <button
            onClick={() => channelRef.current?.send({ type: 'broadcast', event: 'request_push_permission', payload: {} })}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={enApp
              ? { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }
              : { background: 'var(--brand)', color: 'var(--on-brand)' }}
            aria-label={enApp ? 'Volver a invitarlo a la app' : 'Invitar al cliente a instalar la app'}
            title={enApp
              ? 'Ya recibe notificaciones en la app · tocar vuelve a pedirle permiso'
              : 'Todavía no está en la app — tocar le pide instalarla y activar notificaciones'}>
            <Smartphone size={16} />
          </button>
          <button
            onClick={() => setShowWa(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#25D366' }}
            title="Enviar aviso por WhatsApp">
            <MessageCircle size={16} className="text-white" />
          </button>
          {canWrite && (
            // `--invert`/`--invert-fg` y no `--text` + blanco: en el panel
            // oscuro `--text` ES casi blanco, así que el botón quedaba claro
            // con un teléfono blanco encima — invisible. El par invertido está
            // definido justamente para que el fondo y el icono se opongan.
            <button onClick={() => setShowCall(true)}
              title="Llamar al cliente"
              aria-label="Llamar al cliente"
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--invert)', color: 'var(--invert-fg)' }}>
              <Phone size={16} />
            </button>
          )}
        </div>

        {/* Participants of the value chain */}
        {participants.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
            <Users size={12} className="text-white/40 flex-shrink-0" />
            {participants.map(p => {
              const c = roleColor(p.role_label)
              const isCurrent = !!p.is_owner
              // Only whoever invited them (or an admin) can expel an invited guest
              const canExpel = !isCurrent && (p.invited_by === meId || isAdmin)
              return (
                <span key={p.id}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                  style={{ background: isCurrent ? c : 'rgba(255,255,255,0.12)', color: isCurrent ? '#fff' : 'rgba(255,255,255,0.85)' }}>
                  {p.nombre.split(' ')[0]} · {p.role_label}
                  {canExpel && (
                    <button onClick={() => expel(p.id)} title="Retirar del chat" className="ml-0.5">
                      <X size={11} />
                    </button>
                  )}
                </span>
              )
            })}
            {canWrite && (
              <button onClick={openInvite}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <UserPlus size={11} /> Invitar
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )

  const cancelBanner = (
    <>
      {/* Cancelado */}
      {session.status === 'cancelado' && (
        <div className="mx-4 mt-2 rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'var(--danger-bg)', border: '0.5px solid var(--danger-border)' }}>
          <span>❌</span>
          <p className="text-xs font-black" style={{ color: 'var(--danger-fg)' }}>Pedido cancelado — abre “Ver pedido” para reactivarlo</p>
        </div>
      )}
    </>
  )

  // La columna del pedido, en el orden en que se pregunta:
  //
  //   1. ¿DE QUIÉN es este pedido?  → y de ahí, a todos sus pedidos
  //   2. ¿en qué etapa va?
  //   3. ¿entró la plata?           → adelanto + con qué pagó
  //   4. ¿dónde recibe?
  //   5. ¿dónde está el paquete?
  //
  // Se fue el mapa. Pintaba una cuadrícula con un punto y "7 sedes cerca" para
  // un envío por agencia cuya dirección exacta ya está escrita dos tarjetas más
  // abajo: ocupaba el sitio más caro de la columna sin responder nada que el
  // vendedor no supiera. Lo que sí importa del envío —la fase del courier— lo
  // dice `TrackingBar`, con texto.
  // "Ver sus pedidos" abre la ficha ENCIMA del pedido, no en otra pantalla:
  // mirar al dueño de un pedido no debería costar salir del pedido. Desde ahí,
  // tocar otro de sus pedidos cambia el que está abierto abajo (`onAbrirPedido`),
  // que es exactamente lo que uno quiere: saltar entre los pedidos de la misma
  // persona sin volver a la lista.
  const verCliente = session.buyer_id && puedeVerClientes(effective)
    ? () => setVerCliente(true)
    : undefined

  const contextPanel = (
    <>
      {/* En la ventana no: a este pedido se llegó DESDE la ficha del cliente,
          que sigue abierta detrás. Repetirla sería ofrecer volver a un sitio
          donde uno ya está. */}
      {montaje !== 'ventana' && (
        <CustomerCard session={session} ubicacion={ubicacion} onVerCliente={verCliente} />
      )}

      {/* Stage selector */}
      {session.status !== 'cancelado' && (
      <StageSelector
        pedido={session}
        sessionId={session.id}
        canWrite={canWrite}
        esDemo={esTokenDemo(token)}
        onAdvanced={(patch, handedOff) => {
          setSession(s => s ? { ...s, ...patch } : s)
          // Ceded the lead → back to my list; otherwise refresh in place
          if (handedOff) onCerrar()
          else if (!esTokenDemo(token)) reloadSession()
        }}
      />
      )}

      {/* La plata, antes que la dirección: si el cobro no cuadró, eso decide si
          se despacha o no — la dirección recién importa después.
          Una tarjeta por OPERACIÓN (adelanto o pago total, y el saldo cuando lo
          hay), con su monto y su rastro contra el banco. Acá había además un
          `AdvancePanel` que repetía el mismo monto con otras palabras; se
          eliminó con la línea de la ficha del cliente que hacía lo mismo. */}
      <PagoTrace session={session} onCobrar={cobrarPorChat} onReemitir={reemitirCupon} />
      {/* El motivo del fallo, que no es del cobro sino de la EMISIÓN: por qué
          un pedido con adelanto ni siquiera tiene cupón. */}
      {session.payment_reason && session.payment_verification !== 'MATCHED' && (
        <p className="mx-4 mt-2 flex items-start gap-1.5 rounded-2xl px-3 py-2 text-[11px]"
          style={{ background: 'var(--warn-bg-soft)', border: '0.5px solid var(--warn-border)', color: 'var(--text-muted)' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{session.payment_reason}</span>
        </p>
      )}

      <AddressBar
        sessionId={session.id}
        address={session.address ?? null}
        verified={!!session.address_verified}
        lat={session.address_lat}
        lng={session.address_lng}
        role="seller"
        dispatchType={session.dispatch_type}
        agencyName={session.agency_name}
        agencyBranchId={pickupBranchIdOf(session)}
        onUpdated={(address, address_verified, address_lat, address_lng) => setSession(s => s ? { ...s, address, address_verified, address_lat, address_lng } : s)}
      />

      {/* Tracking del envío por agencia: Logística registra la guía y el job
          refleja la fase (contrato `shipment`, 00-CORE) */}
      <TrackingBar
        sessionId={session.id}
        role="seller"
        dispatchType={session.dispatch_type}
        agencyName={session.agency_name}
        tracking={session}
        onUpdated={t => setSession(s => s ? { ...s, ...t } : s)}
      />

      {/* El pedido en sí —productos, cantidades, nota del CRM, cancelar— cierra
          la columna en escritorio. Estaba en una ventana en el centro de la
          pantalla, encima de la conversación que habla justamente de él, y
          debajo quedaba media columna vacía. En móvil sigue siendo hoja: ahí no
          hay columna donde ponerlo. */}
      {desktop && (
        <OrderDetailModal
          enColumna
          session={session}
          role="seller"
          onClose={() => {}}
          onPatch={(patch) => setSession(s => s ? { ...s, ...patch } : s)}
          onInvitar={canWrite ? openInvite : undefined}
        />
      )}
    </>
  )

  const messagesBlock = (
    <>
      {/* Messages */}
      <div ref={mensajesRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <CheckCircle2 size={40} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Sin mensajes aún</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} equipo={equipoEtiquetable} pedido={session}
            audio={msg.call_recording_id ? audios[msg.call_recording_id] : undefined} />
        ))}

        {/* Typing indicator */}
        {buyerTyping && (
          <div className="flex justify-start mb-3">
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl"
              style={{ background: 'var(--surface-3)', borderRadius: '18px 18px 18px 4px' }}>
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--text-muted)', animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  )

  const composerBlock = (
    <>
      {/* Input — only writers (current owner + invited) or admin can send */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 bg-white">
        {canWrite ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowOffer(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}
              title="Enviar oferta">
              <PackagePlus size={16} />
            </button>
            {/* El interruptor: a quién le estoy escribiendo. Va PEGADO al campo
                y le cambia el aspecto —no es una casilla en un menú— porque el
                error caro no es olvidar comentar: es escribirle al cliente
                creyendo que comentabas. Lo que se ve tiene que decirlo. */}
            <button
              onClick={() => setInterno(v => !v)}
              aria-pressed={interno}
              title={interno ? 'Nota interna · no la ve el cliente' : 'Escribir al cliente'}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={interno
                ? { background: 'var(--nota-bg)', color: 'var(--nota-fg)' }
                : { background: 'var(--surface-3)', color: 'var(--text-faint)' }}>
              <NotebookPen size={15} />
            </button>
            <div className="relative flex-1">
              {/* El buscador de `@`. Solo en comentario interno: etiquetar
                  gente de la tienda en un mensaje que lee el cliente no
                  significa nada, y el cliente vería el nombre de quien no
                  conoce. */}
              {interno && arroba && candidatos(equipoEtiquetable, arroba.busca).length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 w-64 max-h-52 overflow-y-auto rounded-2xl py-1 z-20"
                  style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
                  {candidatos(equipoEtiquetable, arroba.busca).map(q => (
                    <button key={q.id} onClick={() => etiquetar(q)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0"
                        style={{ background: `${roleColor(q.role_label)}22`, color: roleColor(q.role_label) }}>
                        {q.nombre.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-bold" style={{ color: 'var(--text)' }}>{primerNombre(q.nombre)}</span>
                      <span style={{ color: 'var(--text-faint)' }}>{q.role_label}</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                ref={campoRef}
                value={input}
                onChange={e => { setInput(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); if (!interno) broadcastTyping() }}
                onKeyUp={e => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
                onClick={e => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={interno ? 'Nota interna · @ para etiquetar' : 'Escribe al cliente…'}
                className="w-full rounded-full px-4 py-2.5 text-sm outline-none placeholder-gray-400"
                style={interno
                  ? { background: 'var(--nota-bg)', border: '1px solid var(--nota-border)', color: 'var(--text)' }
                  : { background: 'var(--surface-3)' }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label={interno ? 'Guardar la nota interna' : 'Enviar al cliente'}
              className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm disabled:opacity-40"
              style={interno
                ? { background: 'var(--nota-fg)', color: 'var(--nota-on)' }
                : { background: 'var(--invert)', color: 'var(--invert-fg)' }}>
              <Send size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 text-center">
            <Eye size={14} className="text-gray-400" />
            <p className="text-xs text-gray-500">
              {!onShift
                ? 'Estás fuera de turno · el administrador debe activarte para poder atender.'
                : `Solo lectura · este pedido lo atiende ${session.seller_name?.split(' ')[0] || 'otro agente'}. Pídele que te invite para participar.`}
            </p>
          </div>
        )}
      </div>
    </>
  )

  const modals = (
    <>
      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={cerrarInvitar}>
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            {/* Dos pasos: primero A QUIÉN, después POR QUÉ. Con la nota arriba
                de la lista quedaba en blanco casi siempre —uno viene a invitar
                a alguien, no a redactar— y el invitado llegaba al hilo sin
                saber qué le tocaba. Poniéndola después de elegir, y con el
                botón apagado hasta que diga algo, la pregunta llega cuando ya
                se sabe la respuesta: "a Renzo… ¿para qué?". */}
            {!porInvitar ? (
              <>
                <h3 className="font-black text-gray-900 mb-1">
                  {canReasignar ? 'Sumar alguien o pasar el pedido' : 'Invitar a participar'}
                </h3>
                <p className="text-xs text-gray-400 mb-3">Podrá escribir y llamar en este pedido.</p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {/* Sale el equipo entero menos el responsable — a él no se le
                      invita ni se le pasa el pedido que ya tiene—. Los que YA
                      participan siguen en la lista, marcados: no se les puede
                      invitar otra vez, pero sí pasarles el pedido, que es el
                      caso más común de todos ("Kevin, que ya está adentro,
                      sigue con esto"). */}
                  {team
                    .filter(t => t.auth_user_id !== session.assigned_seller_id)
                    .map(t => {
                      const yaEsta = participants.some(p => p.id === t.auth_user_id && p.can_write)
                      return (
                        <button key={t.auth_user_id} onClick={() => setPorInvitar(t)}
                          className="w-full flex items-center gap-3 p-3 rounded-2xl border border-gray-100 text-left">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                            style={{ background: `${roleColor(t.role_label)}22`, color: roleColor(t.role_label) }}>
                            {t.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-sm text-gray-900">{t.nombre}</p>
                            <p className="text-xs text-gray-400">
                              {t.role_label}{yaEsta ? ' · ya participa' : ''}
                            </p>
                          </div>
                          <UserPlus size={16} className="text-gray-300" />
                        </button>
                      )
                    })}
                </div>
                <button onClick={cerrarInvitar} className="w-full mt-4 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm">
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <h3 className="font-black text-gray-900 mb-1">
                  Invitar a {primerNombre(porInvitar.nombre)}
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  {porInvitar.role_label} · va a leer todo el chat con el cliente.
                  {canReasignar ? ' Puede entrar a ayudar, o quedarse con el pedido.' : ''}
                </p>
                {/* La nota queda en el hilo como NOTA INTERNA etiquetándolo y
                    firmada por quien invita, así que el invitado llega sabiendo
                    qué le toca y de parte de quién. Por eso es obligatoria. */}
                <input
                  autoFocus
                  value={notaInvitacion}
                  onChange={e => setNotaInvitacion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && notaInvitacion.trim()) invite(porInvitar.auth_user_id) }}
                  placeholder="Nota interna para este miembro"
                  className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none mb-3"
                  style={{ background: 'var(--nota-bg)', border: '1px solid var(--nota-border)', color: 'var(--text)' }}
                />
                {/* Dos destinos para la MISMA nota, porque la pregunta que
                    queda después de elegir a alguien es una sola: ¿viene a
                    ayudar, o se queda con el pedido? */}
                {!participants.some(p => p.id === porInvitar.auth_user_id && p.can_write) && (
                  <button
                    onClick={() => invite(porInvitar.auth_user_id)}
                    disabled={!notaInvitacion.trim()}
                    className="w-full py-3 rounded-2xl font-black text-sm disabled:opacity-40"
                    style={{ background: 'var(--nota-fg)', color: 'var(--nota-on)' }}>
                    Invitar con esta nota
                  </button>
                )}
                {canReasignar && (
                  <button
                    onClick={() => reasignar(porInvitar.auth_user_id)}
                    disabled={!notaInvitacion.trim()}
                    className="w-full mt-2 py-3 rounded-2xl font-black text-sm disabled:opacity-40"
                    style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                    Pasarle el pedido
                  </button>
                )}
                <button onClick={() => setPorInvitar(null)} className="w-full mt-2 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm">
                  Elegir a otro
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showCall && session && (
        <SellerCallModal
          sessionId={session.id}
          sellerName={sellerName}
          channelRef={channelRef}
          onClose={() => setShowCall(false)}
        />
      )}

      {showDetail && !desktop && (
        <OrderDetailModal
          session={session}
          role="seller"
          onClose={() => setShowDetail(false)}
          onPatch={(patch) => setSession(s => s ? { ...s, ...patch } : s)}
          onInvitar={canWrite ? openInvite : undefined}
        />
      )}

      {showOffer && (
        <OfferSheet
          storeId={effective?.store_id ?? session.store_id ?? ''}
          onClose={() => setShowOffer(false)}
          onSend={async (offer) => {
            setShowOffer(false)

            // En el demo la oferta se manda Y el cliente la acepta, de una. En
            // la tienda de verdad son dos momentos con una persona en medio,
            // pero acá no hay nadie del otro lado: una oferta esperando para
            // siempre no enseña nada, y lo que hay que poder mostrar es el
            // pedido creciendo — el total sube y el anillo baja porque el
            // adelanto ya no lo cubre.
            if (esTokenDemo(token)) {
              // Igual que el cobro: primero ENVIADA, y a los diez segundos el
              // cliente la acepta. Antes se metían de golpe la oferta ya
              // aceptada y su confirmación, así que enseñando no se veía nunca
              // el momento que importa — el de esperar una respuesta.
              const msg = ofertaEnviadaEnDemo(session as unknown as StoreOrder, offer, { nombre: sellerName, rol: sellerRole })
              reloadSession()
              alRato(() => {
                const r = ofertaAceptadaEnDemo(session as unknown as StoreOrder, offer, { nombre: sellerName, rol: sellerRole }, msg.id)
                if (r.patch) setSession(s => s ? { ...s, ...r.patch } as OrderSession : s)
                reloadSession()
              })
              return
            }

            try {
              const res = await fetch(`${BASE}/seller-send-message`, {
                method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: session.id, seller_name: sellerName, seller_role: sellerRole, type: 'text', offer, body: `🎁 Oferta: ${offer.nombre} — S/ ${offer.precio}` }),
              })
              if (res.ok) {
                const saved: OrderMessage = await res.json()
                setMessages(prev => prev.some(m => m.id === saved.id) ? prev : [...prev, saved])
                channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: saved })
              } else {
                alert('No se pudo enviar la oferta. Falta desplegar seller-send-message y la columna "offer".')
              }
            } catch {
              alert('No se pudo enviar la oferta. Revisa tu conexión.')
            }
          }}
        />
      )}

      {showWa && (
        <WaTemplatesSheet
          storeId={effective?.store_id ?? session.store_id ?? ''}
          sessionId={session.id}
          sellerName={sellerName}
          onClose={() => setShowWa(false)}
        />
      )}

      {verClienteAbierto && session.buyer_id && (
        <PanelCliente
          encima
          buyerId={session.buyer_id}
          adminId={real?.auth_user_id}
          storeId={effective?.store_id}
          // Cuál de sus pedidos es el que está abierto detrás. Sin esto, la
          // lista son cuatro filas parecidas y el vendedor no sabe en cuál está.
          pedidoActual={session.id}
          onClose={() => setVerCliente(false)}
        />
      )}
    </>
  )

  // ── PC: chat a la izquierda, contexto del pedido fijo a la derecha ───────
  // El ancho de línea del chat va acotado para que se siga leyendo, y la
  // columna —cliente, etapa, adelanto, dirección, tracking— no se mueve: en
  // escritorio no hay que hacer scroll para ver en qué etapa está lo que estás
  // escribiendo.
  const cuerpoEscritorio = (
    <>
      {headerBlock}
      {cancelBanner}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col min-h-0 w-full max-w-[820px] mx-auto">
            {messagesBlock}
            {composerBlock}
          </div>
        </div>
        <aside className="w-[400px] flex-shrink-0 border-l border-gray-100 overflow-y-auto py-2"
          style={{ background: 'var(--surface)' }}>
          {contextPanel}
        </aside>
      </div>
    </>
  )

  // ── Móvil: la columna de siempre ─────────────────────────────────────────
  const cuerpoMovil = (
    <>
      {headerBlock}
      {cancelBanner}
      {contextPanel}
      {messagesBlock}
      {composerBlock}
    </>
  )

  // Dentro del cajón o de la ventana no hay marco que dibujar: la caja la pone
  // el contenedor, y esto solo la llena.
  if (montaje !== 'pagina') {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--chat-bg)' }}>
        {overlay}
        {desktop ? cuerpoEscritorio : cuerpoMovil}
        {modals}
      </div>
    )
  }

  // Como página: el mismo marco 16:9 del panel.
  if (desktop) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-gray-100 flex items-center justify-center p-4">
        {overlay}
        <div
          className="rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col"
          style={{ width: 'min(1440px, 100%, calc((100vh - 2rem) * 16 / 9))', aspectRatio: '16 / 9', background: 'var(--chat-bg)' }}>
          {cuerpoEscritorio}
        </div>
        {modals}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen max-w-[430px] mx-auto" style={{ background: 'var(--chat-bg)' }}>
      {overlay}
      {cuerpoMovil}
      {modals}
    </div>
  )
}

// Catalog of order variables a template variable can map to
const WA_VARS = [
  { key: 'name', label: 'Nombre del cliente' },
  { key: 'product', label: 'Producto' },
  { key: 'link', label: 'Link del pedido' },
  { key: 'price', label: 'Precio' },
  { key: 'address', label: 'Dirección' },
  { key: 'order_id', label: 'N° de pedido' },
]
const DEFAULT_MAP = ['name', 'product', 'link', 'price', 'address', 'order_id']

interface WaTemplate { name: string; language: string; params: number; preview: string }

// Seller picks a WhatsApp template + maps each variable, then sends to the buyer.
function WaTemplatesSheet({ storeId, sessionId, sellerName, onClose }: {
  storeId: string; sessionId: string; sellerName: string; onClose: () => void
}) {
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [open, setOpen] = useState<WaTemplate | null>(null)     // the template being configured
  const [mapping, setMapping] = useState<string[]>([])

  useEffect(() => {
    fetch(`${BASE}/list-wa-templates`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    })
      .then(r => (r.ok ? r.json() : { templates: [] }))
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [storeId])

  const pick = (t: WaTemplate) => {
    if (t.params === 0) { send(t, []) }               // no variables → send directly
    else { setOpen(t); setMapping(DEFAULT_MAP.slice(0, t.params)) }
  }

  const send = async (t: WaTemplate, map: string[]) => {
    setSending(true)
    try {
      const res = await fetch(`${BASE}/send-wa-template`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, template: t.name, language: t.language, params: t.params, mapping: map, seller_name: sellerName }),
      })
      const r = await res.json().catch(() => ({}))
      if (r.ok) { setDone(t.name); setTimeout(onClose, 900) }
      else alert('No se pudo enviar: ' + (r.error || 'revisa la plantilla o el número.'))
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-gray-900 flex items-center gap-2"><MessageCircle size={18} style={{ color: '#25D366' }} /> Enviar por WhatsApp</h3>
          <button onClick={() => (open ? setOpen(null) : onClose())}><X size={18} className="text-gray-400" /></button>
        </div>

        {open ? (
          // ── Configure the template's variables ──
          <>
            <p className="text-xs text-gray-500 mb-3">Plantilla <b>{open.name}</b>. Elige qué dato va en cada variable:</p>
            <div className="space-y-2 mb-4">
              {mapping.map((mk, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-black text-gray-500 w-10">{`{{${i + 1}}}`}</span>
                  <select value={mk} onChange={e => setMapping(m => m.map((x, k) => k === i ? e.target.value : x))}
                    className="flex-1 bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none">
                    {WA_VARS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setOpen(null)} className="px-4 py-3 rounded-2xl font-black text-sm bg-gray-100 text-gray-600">Atrás</button>
              <button onClick={() => send(open, mapping)} disabled={sending}
                className="flex-1 py-3 rounded-2xl font-black text-sm text-white disabled:opacity-50" style={{ background: '#25D366' }}>
                {sending ? 'Enviando…' : 'Enviar WhatsApp'}
              </button>
            </div>
          </>
        ) : (
          // ── List of templates ──
          <>
            <p className="text-xs text-gray-400 mb-4">Elige la plantilla que le llegará al cliente. Tú decides cuándo enviar.</p>
            {loading ? (
              <div className="flex justify-center py-10"><div className="w-7 h-7 rounded-full border-4 border-gray-200 border-t-[#25D366] animate-spin" /></div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay plantillas disponibles. Revisa que la marca tenga su WABA ID y plantillas aprobadas.</p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <button key={t.name + t.language} onClick={() => pick(t)} disabled={sending}
                    className="w-full text-left p-3 rounded-2xl border disabled:opacity-50"
                    style={{ borderColor: done === t.name ? '#25D366' : '#eee', borderWidth: 1.5 }}>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-gray-900">{t.name}</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)' }}>
                        {done === t.name ? 'Enviado ✓' : `${t.params} var${t.params === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    {t.preview && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{t.preview}</p>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Offer / upsell composer ──────────────────────────────────────────────────
function OfferSheet({ storeId, onClose, onSend }: {
  storeId: string
  onClose: () => void
  onSend: (offer: { product_id?: string; nombre: string; precio: number; image?: string | null }) => void
}) {
  const [products, setProducts] = useState<{ id: string; nombre: string; precio: number; images: string[] }[]>([])
  const [productId, setProductId] = useState<string | undefined>()
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) return
    supabase.from('products').select('id, nombre, precio, images').eq('store_id', storeId)
      .then(({ data }) => setProducts((data as any) ?? []))
  }, [storeId])

  const pick = (p: { id: string; nombre: string; precio: number; images: string[] }) => {
    setProductId(p.id); setNombre(p.nombre); setPrecio(String(p.precio || '')); setImage(p.images?.[0] ?? null)
  }
  const send = () => {
    if (!nombre.trim() || !precio) return
    onSend({ product_id: productId, nombre: nombre.trim(), precio: Number(precio) || 0, image })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900 flex items-center gap-2"><PackagePlus size={18} /> Enviar oferta</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {products.length > 0 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-2">Elige un producto</p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {products.map(p => (
                <button key={p.id} onClick={() => pick(p)}
                  className="flex-shrink-0 w-24 rounded-xl overflow-hidden border text-left"
                  style={{ borderColor: productId === p.id ? '#16A34A' : '#f0f0f0', borderWidth: productId === p.id ? 2 : 1 }}>
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.nombre} className="w-full h-20 object-cover" />
                    : <div className="w-full h-20 bg-gray-100" />}
                  <div className="p-1.5">
                    <p className="text-[10px] font-bold text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-[10px] font-black" style={{ color: 'var(--ok-fg)' }}>S/ {p.precio}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">O escribe la oferta</p>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la oferta"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-2" />
        <input value={precio} onChange={e => setPrecio(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Precio S/"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-4" />

        <button onClick={send} disabled={!nombre.trim() || !precio}
          className="w-full py-3 rounded-2xl font-black text-sm text-white disabled:opacity-40" style={{ background: '#16A34A' }}>
          Enviar oferta al cliente
        </button>
      </div>
    </div>
  )
}
