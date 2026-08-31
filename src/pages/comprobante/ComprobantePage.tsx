import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Printer } from 'lucide-react'
import { soles } from '../../lib/order-money'
import { useStore } from '../../lib/store-context'
import { esCobroDemo, comprobanteDemo } from '../../lib/demo/comprobante-demo'
import { lineasDelComprobante, nombreDelCobro, fechaDelComprobante } from '../../lib/comprobante'
import type { DatosDeComprobante } from '../../../supabase/functions/_shared/comprobante.ts'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── La constancia de un pago ────────────────────────────────────────────────
//
// Se abre en otra pestaña desde el chat, apenas el cobro cruza. El comprador la
// enseña, la reenvía o la guarda como PDF con el "imprimir" del navegador — y
// eso ES el PDF: `@media print` deja la hoja sola, sin botones ni fondo. Un
// generador de PDF en el servidor haría lo mismo con una librería que mantener,
// un archivo que subir a Storage y un enlace que caduca.
//
// ⚠️ **No es una boleta.** La facturación electrónica todavía no existe en el
// producto y `stores` no guarda RUC ni razón social. Esto certifica que un pago
// se recibió, y lo dice al pie: llamarla boleta sería prometer un documento
// tributario que nadie emitió.
//
// Va en blanco a propósito, sin los tokens de tema: un comprobante se imprime, y
// lo que se imprime es papel blanco con tinta oscura.

export default function ComprobantePage() {
  const { cobroId } = useParams()
  // La marca sale del subdominio, como en toda la app: el comprobante de
  // `marca.krossclub.app` lleva el logo y el nombre de esa marca sin que el
  // enlace tenga que decirlo.
  const { store } = useStore()
  const [datos, setDatos] = useState<DatosDeComprobante | null>(null)
  // Sin id no hay nada que pedir, y eso se sabe ANTES del primer pintado: es
  // el estado inicial, no algo que un efecto descubra después.
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_existe'>(cobroId ? 'cargando' : 'no_existe')

  useEffect(() => {
    if (!cobroId) return
    let vivo = true

    // El cobro de la tienda de ejemplo vive en el dispositivo, no en la base.
    // Sin este desvío el demo terminaba en "este comprobante no existe" — justo
    // el final del flujo que se está enseñando.
    const pedir = esCobroDemo(cobroId)
      ? comprobanteDemo(cobroId, store)
      : fetch(`${BASE}/get-comprobante?cobro_id=${encodeURIComponent(cobroId)}`, {
          headers: { Authorization: `Bearer ${ANON}` },
        }).then(r => r.ok ? r.json() : null)

    pedir
      .then(d => {
        if (!vivo) return
        if (d?.cobro_id) { setDatos(d); setEstado('listo') } else setEstado('no_existe')
      })
      .catch(() => { if (vivo) setEstado('no_existe') })
    return () => { vivo = false }
  }, [cobroId, store])

  // El título de la pestaña es el nombre con el que se guarda el PDF: el
  // navegador lo usa de nombre de archivo por defecto. "Comprobante ORD-1756…"
  // en la carpeta de descargas es encontrable; "Kross" no.
  useEffect(() => {
    if (!datos) return
    const antes = document.title
    document.title = `Comprobante ${datos.pedido ?? ''}`.trim()
    return () => { document.title = antes }
  }, [datos])

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-gray-400 animate-spin" />
      </div>
    )
  }

  // Un cobro que no existe y uno que no se pagó dicen lo mismo: el servidor no
  // distingue —quien tantea ids no aprende cuáles son reales— y la página
  // tampoco puede inventarse la diferencia.
  if (estado === 'no_existe' || !datos) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-[360px]">
          <p className="text-lg font-black text-gray-900">Este comprobante no existe</p>
          <p className="text-sm text-gray-500 mt-1">
            El enlace puede estar incompleto, o el pago todavía no se ha confirmado. Si ya pagaste,
            escríbenos por el chat de tu pedido.
          </p>
        </div>
      </div>
    )
  }

  const lineas = lineasDelComprobante(datos)
  const titulo = nombreDelCobro({ tipo: datos.tipo, concepto: datos.concepto, monto: datos.monto, total: datos.total })

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:p-0">
      {/* Lo que NO se imprime: el botón. Un papel con un botón dibujado encima
          se lee como un error de impresión. */}
      <style>{`@media print { .no-imprimir { display: none !important } }`}</style>

      <div className="max-w-[560px] mx-auto">
        <div className="bg-white rounded-2xl overflow-hidden print:rounded-none"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>

          {/* Quién cobró */}
          <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: '#EEE' }}>
            <div className="flex items-center gap-3">
              {datos.logo && (
                <img src={datos.logo} alt="" className="w-10 h-10 rounded-lg object-cover" />
              )}
              <div>
                <p className="font-black text-gray-900 leading-tight">{datos.tienda ?? 'Kross'}</p>
                <p className="text-[11px] uppercase tracking-wide font-bold text-gray-400">
                  Constancia de pago
                </p>
              </div>
            </div>
          </div>

          {/* El monto, grande: es el dato por el que se abre esta hoja. Y el
              sello de pagado al lado, porque una constancia sin la marca de que
              entró es solo un monto escrito. */}
          <div className="px-6 py-6">
            <p className="text-sm text-gray-500">{titulo}</p>
            <p className="text-4xl font-black text-gray-900 mt-0.5">{soles(datos.monto)}</p>
            <p className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[12px] font-black"
              style={{ background: '#E7F7EE', color: '#0B7A45' }}>
              <Check size={13} /> Pagado · {fechaDelComprobante(datos)}
            </p>
          </div>

          {/* Con qué se sigue esta transacción. La misma lista, con los mismos
              nombres, que el vendedor tiene en su panel: cuando el comprador
              enseña esto y el otro mira su pantalla, los dos ven lo mismo. */}
          <div className="px-6 pb-5">
            <dl className="text-[13px]">
              {lineas.map(l => (
                <div key={l.etiqueta} className="flex justify-between gap-4 py-2 border-t" style={{ borderColor: '#F1F1F1' }}>
                  <dt className="text-gray-500 flex-shrink-0">{l.etiqueta}</dt>
                  <dd className="font-bold text-gray-900 text-right break-all">{l.valor}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 py-2 border-t" style={{ borderColor: '#F1F1F1' }}>
                <dt className="text-gray-500">Método</dt>
                <dd className="font-bold text-gray-900">Yape · 360pay</dd>
              </div>
            </dl>
          </div>

          {/* Cómo queda el pedido después de este pago. Sin esto, quien adelantó
              la mitad se queda con un papel que dice S/75 y sin saber si ya no
              debe nada. */}
          <div className="px-6 py-4" style={{ background: '#FAFAFA' }}>
            <div className="flex justify-between text-[13px] py-0.5">
              <span className="text-gray-500">Total del pedido</span>
              <span className="font-bold text-gray-900">{soles(datos.total)}</span>
            </div>
            <div className="flex justify-between text-[13px] py-0.5">
              <span className="text-gray-500">Pagado hasta hoy</span>
              <span className="font-bold text-gray-900">{soles(datos.pagado)}</span>
            </div>
            <div className="flex justify-between text-[13px] py-0.5 mt-1 pt-2 border-t" style={{ borderColor: '#EAEAEA' }}>
              <span className="font-bold text-gray-900">{datos.saldo > 0 ? 'Saldo pendiente' : 'Saldo'}</span>
              <span className="font-black" style={{ color: datos.saldo > 0 ? '#B45309' : '#0B7A45' }}>
                {datos.saldo > 0 ? soles(datos.saldo) : 'Sin saldo pendiente'}
              </span>
            </div>
          </div>

          {/* Lo que esta hoja NO es. Va en el documento y no solo en el código:
              quien la reciba tiene que poder saber que no le llegó una boleta. */}
          <div className="px-6 py-4 border-t" style={{ borderColor: '#EEE' }}>
            <p className="text-[11px] leading-relaxed text-gray-400">
              Esta constancia certifica que {datos.tienda ?? 'la tienda'} recibió el pago descrito.
              No es una boleta ni una factura electrónica. Conserva el número de operación para
              cualquier consulta sobre esta transacción.
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
