import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Package, Printer } from 'lucide-react'
import { useStore } from '../../lib/store-context'
import { getSession } from '../../lib/order-api'
import type { OrderSession } from '../../lib/order-api'
import { pedidoDemoPorToken, esTokenDemo } from '../../lib/demo/tienda-demo'
import { etiquetaDePaso } from '../../lib/order-tracking'

// ─── La hoja de guía de la app ───────────────────────────────────────────────
//
// Lo que abre "Ver mi guía de Shalom/Olva" cuando NO hay un PDF del courier: la
// guía registrada a mano no lo trae, y la del demo tampoco. Es la MISMA regla
// en la tienda real y en el demo — el PDF del courier si existe; si no, esta
// hoja, armada con los mismos datos que el panel enseña. Un botón que a veces
// abre algo y a veces nada enseña un producto roto.
//
// La llave es el TOKEN del pedido, igual que el chat: quien tiene el enlace de
// su pedido tiene su guía. No enseña nada que el chat no enseñe ya — ni clave
// de recojo, que se entrega contra el saldo pagado, ni datos de otros.
//
// En blanco y con `@media print`, como el comprobante: la hoja se guarda como
// PDF con el imprimir del navegador.

const FASE_LABEL: Record<string, string> = {
  EN_ORIGEN: 'En agencia de origen',
  EN_TRANSITO: 'En camino',
  EN_DESTINO: 'En tu agencia',
  ENTREGADO: 'Entregado',
}

export default function GuiaPage() {
  const { token } = useParams()
  const { store } = useStore()
  const [pedido, setPedido] = useState<OrderSession | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_existe'>(token ? 'cargando' : 'no_existe')

  useEffect(() => {
    if (!token) return
    let vivo = true
    const pedir = esTokenDemo(token)
      ? pedidoDemoPorToken(token).then(p => p ? { session: p as unknown as OrderSession } : null)
      : getSession(token).then(d => ({ session: d.session })).catch(() => null)

    pedir.then(d => {
      if (!vivo) return
      // Una hoja de guía sin guía no existe: el pedido puede ser real y aun así
      // no tener envío registrado todavía.
      if (d?.session && (d.session.tracking_numero || d.session.tracking_ose_id)) {
        setPedido(d.session); setEstado('listo')
      } else setEstado('no_existe')
    }).catch(() => { if (vivo) setEstado('no_existe') })
    return () => { vivo = false }
  }, [token])

  useEffect(() => {
    if (!pedido) return
    const antes = document.title
    document.title = `Guía ${pedido.tracking_numero ?? pedido.tracking_ose_id ?? ''}`.trim()
    return () => { document.title = antes }
  }, [pedido])

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-gray-400 animate-spin" />
      </div>
    )
  }

  if (estado === 'no_existe' || !pedido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-[360px]">
          <p className="text-lg font-black text-gray-900">Esta guía no está disponible</p>
          <p className="text-sm text-gray-500 mt-1">
            El enlace puede estar incompleto, o el envío todavía no se ha registrado. Revisa el
            chat de tu pedido — ahí te avisamos apenas tu guía exista.
          </p>
        </div>
      </div>
    )
  }

  const courier = String(pedido.tracking_courier ?? pedido.agency_name ?? 'SHALOM').toUpperCase()
  // PRE-GUÍA mientras el courier no reporta nada: existe y se puede seguir,
  // pero se vuelve oficial cuando el paquete entra a la agencia de origen. La
  // primera fase reportada es exactamente ese momento.
  const esPreguia = !pedido.tracking_phase
  const fase = pedido.tracking_phase ? FASE_LABEL[pedido.tracking_phase] ?? etiquetaDePaso('en_camino').label : null

  const lineas: { etiqueta: string; valor: string }[] = []
  const pon = (etiqueta: string, valor: string | null | undefined) => {
    const v = (valor ?? '').trim()
    if (v) lineas.push({ etiqueta, valor: v })
  }
  pon('Pedido', pedido.order_id)
  pon('Cliente', pedido.buyer_name)
  pon('Guía', pedido.tracking_numero)
  // El código va junto a la guía en el mostrador: con uno solo no atienden.
  pon('Código', pedido.tracking_codigo)
  if (!pedido.tracking_numero) pon('Orden de servicio', pedido.tracking_ose_id)
  pon('Agencia de destino', pedido.agency_name ? `${courier} · ${pedido.agency_name}` : courier)

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:p-0">
      <style>{`@media print { .no-imprimir { display: none !important } }`}</style>

      <div className="max-w-[560px] mx-auto">
        <div className="bg-white rounded-2xl overflow-hidden print:rounded-none"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>

          <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: '#EEE' }}>
            <div className="flex items-center gap-3">
              {store.logo_url && <img src={store.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />}
              <div>
                <p className="font-black text-gray-900 leading-tight">{store.nombre || 'Kross'}</p>
                <p className="text-[11px] uppercase tracking-wide font-bold text-gray-400">
                  {esPreguia ? 'Pre-guía de envío' : 'Guía de envío'} · {courier}
                </p>
              </div>
            </div>
          </div>

          {/* La guía, grande: es lo que se enseña en el mostrador. */}
          <div className="px-6 py-6">
            <p className="text-sm text-gray-500 flex items-center gap-1.5"><Package size={14} /> {courier}</p>
            <p className="text-4xl font-black text-gray-900 mt-0.5">
              {pedido.tracking_numero ?? pedido.tracking_ose_id}
            </p>
            <p className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[12px] font-black"
              style={esPreguia
                ? { background: '#FEF3E2', color: '#92600A' }
                : { background: '#E7F7EE', color: '#0B7A45' }}>
              {esPreguia ? 'Pre-guía · aún no ingresa a la agencia de origen' : fase}
            </p>
          </div>

          <div className="px-6 pb-5">
            <dl className="text-[13px]">
              {lineas.map(l => (
                <div key={l.etiqueta} className="flex justify-between gap-4 py-2 border-t" style={{ borderColor: '#F1F1F1' }}>
                  <dt className="text-gray-500 flex-shrink-0">{l.etiqueta}</dt>
                  <dd className="font-bold text-gray-900 text-right break-all">{l.valor}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Qué significa una pre-guía, con las mismas palabras del chat: si la
              hoja dijera otra cosa que el mensaje, el comprador no sabría a cuál
              creerle. */}
          <div className="px-6 py-4 border-t" style={{ borderColor: '#EEE' }}>
            <p className="text-[11px] leading-relaxed text-gray-400">
              {esPreguia
                ? 'Esta pre-guía se vuelve oficial cuando tu paquete entra a la agencia de origen — '
                  + 'por el chat de tu pedido te avisamos apenas pase. Puedes seguir tu envío desde la '
                  + `app, que está sincronizada con tu guía, o directamente en ${courier === 'OLVA' ? 'Olva' : 'Shalom'}.`
                : 'Sigue tu envío desde la app, que está sincronizada con tu guía, o directamente en '
                  + `${courier === 'OLVA' ? 'Olva' : 'Shalom'} con los datos de esta hoja.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="no-imprimir w-full mt-4 py-3 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2"
          style={{ background: '#111' }}
        >
          <Printer size={15} /> Guardar como PDF
        </button>
      </div>
    </div>
  )
}
