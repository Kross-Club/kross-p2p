// ─── /pedido/:token — la pantalla del pedido, con URL propia ─────────────────
//
// Nació el 07-set-2026 de una fragilidad concreta: la pantalla de "pedido
// confirmado" vivía DENTRO del modal del checkout, así que un toque en la X la
// borraba para siempre. El comprador que quería mirar si su envío avanzó no
// tenía a dónde volver — y mirar es lo normal: nadie abre un chat para saber si
// su paquete ya salió.
//
// Ahora es una página que se recarga, y recargar SIRVE: el recorrido avanza con
// la fase que reporta el courier (`buildTicket` con `fase`), no solo con la
// existencia de la guía.
//
// Es la hermana de `/p/:token`, el CHAT, que sigue igual y se queda como está:
// es el enlace que viaja por WhatsApp y el que abre quien no instaló la app.
// Esta página es para mirar; aquella es para hablar.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { getSession } from '../../lib/order-api'
import type { OrderSession, OrderMessage } from '../../lib/order-api'
import { buildTicket } from '../../lib/checkout/ticket'
import type { TicketGuide } from '../../lib/checkout/ticket'
import { coordinadoDelPedido, estadoDesdePedido, pagadoDelPedido } from '../../lib/checkout/ticket-desde-pedido'
import { AgencyService } from '../../lib/checkout/services/AgencyService'
import { pickupBranchIdOf } from '../../lib/session'
import { isPickupDispatch } from '../../../supabase/functions/_shared/despacho.ts'
import { enlaceDeGuia } from '../../lib/hoja-de-guia'
import { useStore } from '../../lib/store-context'
import type { AgencyBranch } from '../../lib/checkout/types'
import PedidoConfirmado from '../../components/pedido/PedidoConfirmado'

/** Cuánto se sigue preguntando: cada 4 s durante dos minutos. Lo que puede
 *  cambiar mientras mira es el cruce del adelanto y la guía, y las dos cosas
 *  ocurren en segundo plano a los pocos segundos de pagar. Pasado eso, quien
 *  quiera saber más recarga — para eso esta pantalla tiene URL. */
const SONDEO_MS = 4_000
const SONDEO_MAX = 30

export default function MiPedidoPage() {
  const { token = '' } = useParams()
  const { store } = useStore()
  const [pedido, setPedido] = useState<OrderSession | null>(null)
  const [mensajes, setMensajes] = useState<OrderMessage[]>([])
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no-existe' | 'error'>('cargando')

  useEffect(() => {
    if (!token) return
    let vivo = true
    let intentos = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const pedir = async () => {
      intentos += 1
      try {
        const d = await getSession(token)
        if (!vivo) return
        setPedido(d.session)
        setMensajes(d.messages ?? [])
        setEstado('listo')
        // Se deja de preguntar cuando ya no queda nada por ver: el adelanto
        // cruzado y la guía con su PDF. Lo demás lo trae la próxima recarga.
        const cerrado = pagadoDelPedido(d.session)
          && (!isPickupDispatch(d.session.dispatch_type) || !!(d.messages ?? []).find(m => m.type === 'guia' && m.media_url))
        if (cerrado || intentos >= SONDEO_MAX) return
      } catch (e) {
        if (!vivo) return
        if (e instanceof Error && e.message === 'not_found') { setEstado('no-existe'); return }
        // Sin red o servidor caído: si ya hay algo en pantalla se deja, y si no
        // se dice. Se sigue reintentando hasta el tope.
        setEstado(prev => (prev === 'listo' ? prev : 'error'))
      }
      if (vivo && intentos < SONDEO_MAX) timer = setTimeout(pedir, SONDEO_MS)
    }

    pedir()
    return () => { vivo = false; if (timer) clearTimeout(timer) }
  }, [token])

  // La sede con su dirección. En esta página NO viene cargada de ningún paso
  // anterior —se entra por la URL, quizá días después—, así que se pide.
  const [sede, setSede] = useState<AgencyBranch | null>(null)
  // Solo los couriers con catálogo de sedes: `OTRO` no tiene nada que pedir.
  const agencia = pedido?.agency_name === 'SHALOM' || pedido?.agency_name === 'OLVA'
    ? pedido.agency_name
    : null
  const branchId = pedido ? pickupBranchIdOf(pedido) : null
  useEffect(() => {
    if (!agencia || !branchId) return
    let vivo = true
    AgencyService.getBranch(agencia, branchId)
      .then(b => { if (vivo) setSede(b) })
      .catch(() => { /* el ticket cae al distrito */ })
    return () => { vivo = false }
  }, [agencia, branchId])

  if (estado === 'cargando') {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="max-w-[480px] mx-auto px-5 py-16 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3" style={{ color: '#B91C1C' }} />
        <p className="text-base font-black text-gray-900">
          {estado === 'no-existe' ? 'No encontramos este pedido.' : 'No pudimos cargar tu pedido.'}
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {estado === 'no-existe'
            ? 'Revisa el enlace que te enviamos, o escríbenos y lo buscamos por tu DNI.'
            : 'Revisa tu conexión y vuelve a cargar esta página.'}
        </p>
      </div>
    )
  }

  // La guía, como la ve el ticket: el PDF del courier si el chat ya lo trae, y
  // si no la hoja de guía de la app. Misma regla que la tarjeta del chat.
  const pdf = mensajes.find(m => m.type === 'guia' && m.media_url)?.media_url ?? null
  const guide: TicketGuide | null = pedido.tracking_numero || pedido.tracking_ose_id
    ? {
        courier: pedido.tracking_courier ?? null,
        numero: pedido.tracking_numero ?? null,
        codigo: pedido.tracking_codigo ?? null,
        oseId: pedido.tracking_ose_id ?? null,
        href: pdf ?? enlaceDeGuia(token),
      }
    : null

  const ticket = buildTicket({
    state: estadoDesdePedido(pedido),
    price: Number(pedido.product_price ?? 0),
    packName: pedido.pack_name ?? pedido.product_name ?? null,
    paid: pagadoDelPedido(pedido),
    unpaid: coordinadoDelPedido(pedido),
    branch: sede,
    guide,
    fase: pedido.tracking_phase,
  })

  return (
    <div className="min-h-dvh" style={{ background: '#fff' }}>
      <div className="max-w-[480px] mx-auto px-5">
        <PedidoConfirmado
          ticket={ticket}
          orderCode={pedido.order_id}
          paid={pagadoDelPedido(pedido)}
          token={token}
          sessionId={pedido.id}
        />
        {/* El nombre de la marca cierra la página: en una pantalla que se
            recarga días después, saber de quién es el pedido no es adorno. */}
        <p className="text-center text-[11px] text-gray-400 pb-8">{store.nombre}</p>
      </div>
    </div>
  )
}
