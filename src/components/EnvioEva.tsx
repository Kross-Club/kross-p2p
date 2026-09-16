import { useState } from 'react'
import { Bike, Camera, ExternalLink, Printer, RefreshCw, RotateCw } from 'lucide-react'
import { enlaceDeArchivoDeTienda } from '../lib/archivos'
import { useStore } from '../lib/store-context'
import type { TiendaConDominio } from '../lib/dominio'
import {
  NOMBRE_EVA, esCierreSinEntregaEva, esDemoraEva, nombreDeEstadoEva,
} from '../../supabase/functions/_shared/eva'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── El reparto con Eva Courier, en el panel del pedido (§64) ────────────────
//
// Es la barra del envío de un DOMICILIO que va por courier. No es
// `TrackingBar` con un tercer modo, a propósito: aquella es toda de recojo en
// agencia —número, código, clave, formulario para copiar del comprobante— y
// nada de eso existe acá. Un domicilio con Eva tiene un tracking, un estado
// crudo, un rótulo que la marca IMPRIME (Eva recoge en su local) y, cuando
// falla, un motivo y un botón para reintentar. Eso es todo lo que enseña.
//
// Solo del lado del vendedor. El comprador ve su recorrido en «Ver pedido»,
// que ya sabe decir «en camino» y «entregado» con la fase.

/** Lo que este componente lee del pedido. Todo opcional: la fila de antes del
 *  §64 no tiene las columnas y la barra simplemente no se pinta. */
export interface CamposEva {
  dispatch_type?: string | null
  reparto_lima?: string | null
  tracking_courier?: string | null
  tracking_numero?: string | null
  tracking_phase?: string | null
  tracking_demora_at?: string | null
  eva_order_status?: string | null
  eva_order_reason?: string | null
  eva_estado?: string | null
  eva_estado_at?: string | null
  eva_rotulo_url?: string | null
  eva_entrega_foto?: string | null
}

/** Tres pasos y no cinco: un domicilio no tiene «en origen» ni «en agencia».
 *  Lo que mueve al comprador es que el motorizado SALIÓ y que ENTREGÓ. */
const PASOS = [
  { key: 'REGISTRADO', label: 'Registrado' },
  { key: 'EN_TRANSITO', label: 'En ruta' },
  { key: 'ENTREGADO', label: 'Entregado' },
] as const

export default function EnvioEva({ sessionId, pedido, tienda, onUpdated }: {
  sessionId: string
  pedido: CamposEva
  /** La marca del pedido, para que el rótulo salga por SU dominio (mismo
   *  trato que la guía y el comprobante). Sin ella, la del contexto. */
  tienda?: TiendaConDominio | null
  onUpdated: (patch: CamposEva) => void
}) {
  const { store } = useStore()
  const [retrying, setRetrying] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [nota, setNota] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const esEva = pedido.tracking_courier === 'EVA'
  const expediente = String(pedido.eva_order_status ?? '').toUpperCase()
  // Se pinta si Eva ya tiene el pedido, o si el registro dejó rastro (FAILED,
  // SKIPPED, PENDING). Sin ninguna de las dos no hay nada que decir.
  if (pedido.dispatch_type !== 'MOTORIZADO_LIMA') return null
  if (!esEva && !expediente) return null

  const fallo = expediente === 'FAILED'
  const saltado = expediente === 'SKIPPED'
  const pendiente = expediente === 'PENDING' && !esEva
  const estado = String(pedido.eva_estado ?? '').toUpperCase()
  const entregado = pedido.tracking_phase === 'ENTREGADO'
  const idx = entregado ? 2 : pedido.tracking_phase === 'EN_TRANSITO' ? 1 : 0
  const demora = !entregado && (esDemoraEva(estado) || !!pedido.tracking_demora_at)
  const cierre = esCierreSinEntregaEva(estado)
  const rotulo = enlaceDeArchivoDeTienda(tienda ?? store, pedido.eva_rotulo_url)

  // Preguntarle a Eva dónde va. En SU portal el estado lo mueve el motorizado,
  // así que el vendedor no tiene otra forma de saberlo hasta que Eva llame; y
  // como Eva no reintenta sus webhooks, esto es además el respaldo de un aviso
  // perdido. Solo lee: se puede tocar las veces que haga falta.
  const consultar = async () => {
    if (consultando) return
    setConsultando(true)
    setError(null)
    setNota(null)
    try {
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'consultar_eva', session_id: sessionId }),
      })
      const r = await res.json().catch(() => ({})) as
        { ok?: boolean; aplicado?: boolean; tracking?: CamposEva; etiqueta?: string; error?: string }
      if (!res.ok || !r.ok) { setError(r.error ?? `No se pudo consultar a ${NOMBRE_EVA}.`); return }
      if (r.aplicado && r.tracking) onUpdated(r.tracking)
      // Decir «sin novedad» es parte de la respuesta: un botón que no hace nada
      // visible se lee como que falló.
      else setNota(`Sin novedad: ${NOMBRE_EVA} sigue en «${r.etiqueta ?? 'el mismo estado'}».`)
    } catch {
      setError('No se pudo consultar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setConsultando(false)
    }
  }

  const reintentar = async () => {
    if (retrying) return
    setRetrying(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_eva', session_id: sessionId }),
      })
      const r = await res.json().catch(() => ({})) as { tracking?: CamposEva; error?: string }
      if (res.ok && r.tracking) { onUpdated(r.tracking); return }
      setError(r.error ? `${NOMBRE_EVA} volvió a rechazarlo: ${r.error}` : `${NOMBRE_EVA} volvió a rechazarlo.`)
    } catch {
      setError('No se pudo reintentar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        <Bike size={15} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
        <p className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wide text-gray-400 leading-tight">
          Envío {NOMBRE_EVA}
          {demora && <span className="ml-1 whitespace-nowrap" style={{ color: '#F59E0B' }}>· Pasó y no entregó</span>}
          {cierre && <span className="ml-1 whitespace-nowrap" style={{ color: 'var(--danger-fg)' }}>· Cerrado sin entregar</span>}
        </p>
        {/* Preguntarle el estado a Eva. Va antes del rótulo porque es lo que se
            busca cuando el comprador escribe «¿dónde está mi pedido?». */}
        {esEva && !cierre && (
          <button onClick={consultar} disabled={consultando}
            className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0 disabled:opacity-50"
            style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
            <RotateCw size={10} className={consultando ? 'animate-spin' : undefined} />
            {consultando ? '…' : 'Actualizar'}
          </button>
        )}
        {/* El rótulo es LA acción de este envío: Eva recoge en el local y la
            etiqueta va pegada al paquete. */}
        {esEva && rotulo && (
          <a href={rotulo} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
            <Printer size={10} /> Imprimir rótulo
          </a>
        )}
      </div>

      {esEva && (
        <>
          <p className="text-xs font-semibold text-gray-700 mt-1.5 break-words">
            Tracking <span className="font-black">{pedido.tracking_numero}</span>
            {estado && <span className="text-gray-400"> · {nombreDeEstadoEva(estado)}</span>}
          </p>
          <div className="flex items-center gap-1 mt-2">
            {PASOS.map((p, i) => (
              <div key={p.key} className="flex-1 text-center">
                <div className="h-1 rounded-full mb-1" style={{ background: i <= idx ? 'var(--brand)' : '#E5E7EB' }} />
                <p className="text-[8px] font-black uppercase leading-tight"
                  style={{ color: i === idx ? 'var(--brand)' : i < idx ? '#9CA3AF' : '#D1D5DB' }}>
                  {p.label}
                </p>
              </div>
            ))}
          </div>
          {idx === 0 && !cierre && (
            <p className="text-[10px] font-semibold text-gray-400 mt-1">
              {estado === 'ASIGNADO MOTORIZADO'
                ? 'Motorizado asignado: sale en el próximo despacho.'
                : 'Eva pasa a recogerlo por tu local. Ten el paquete con su rótulo listo.'}
            </p>
          )}
          {nota && <p className="text-[10px] font-semibold text-gray-400 mt-1">{nota}</p>}
          {!rotulo && idx === 0 && !cierre && (
            <p className="text-[10px] font-semibold text-gray-400 mt-1">
              El rótulo no se pudo bajar: imprímelo desde app.evacourier.pe con el tracking de arriba.
            </p>
          )}
          {pedido.eva_entrega_foto && (
            <a href={pedido.eva_entrega_foto} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-black mt-1.5 px-2 py-1 rounded-lg"
              style={{ background: 'var(--ok-bg-soft)', color: 'var(--ok-fg)', border: '0.5px solid var(--ok-border)' }}>
              <Camera size={10} /> Foto de la entrega <ExternalLink size={9} />
            </a>
          )}
        </>
      )}

      {/* El registro no salió, o no aplicó. Con el motivo con nombre y la
          salida: corregir y reintentar, o coordinar por fuera. */}
      {(fallo || saltado || pendiente) && (
        <div className="mt-2 rounded-xl px-2.5 py-2"
          style={{ background: 'var(--warn-bg-soft)', border: '0.5px solid var(--warn-border)' }}>
          <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            {pendiente && 'Registrando en Eva…'}
            {saltado && `No se registró en ${NOMBRE_EVA}${pedido.eva_order_reason ? `: ${pedido.eva_order_reason}` : ''}.`}
            {fallo && (
              <>⚠️ El registro en {NOMBRE_EVA} falló{pedido.eva_order_reason ? `: ${pedido.eva_order_reason}` : ''}.
                {' '}Si el motivo dice que Eva no respondió, <b>busca primero el pedido en app.evacourier.pe</b> — reintentar sin mirar serían dos motorizados.</>
            )}
          </p>
          {fallo && (
            <button onClick={reintentar} disabled={retrying}
              className="mt-1.5 text-[10px] font-black px-2 py-1 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
              <RefreshCw size={10} className={`inline mr-1 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Reintentando…' : `Reintentar en ${NOMBRE_EVA}`}
            </button>
          )}
          {error && <p className="text-[10px] font-bold mt-1" style={{ color: 'var(--danger-fg)' }}>{error}</p>}
        </div>
      )}
      {/* El error de una consulta no vive dentro del bloque del fallo: se puede
          consultar un envío que salió bien. */}
      {esEva && error && !(fallo || saltado || pendiente) && (
        <p className="text-[10px] font-bold mt-1" style={{ color: 'var(--danger-fg)' }}>{error}</p>
      )}
    </div>
  )
}
