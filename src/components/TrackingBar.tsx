import { useState } from 'react'
import { KeyRound, PackageCheck, Pencil, RefreshCw } from 'lucide-react'
import { isPickupDispatch } from '../lib/session'
import { trackShipment } from '../lib/checkout/services/OlvaTrackingService'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Tracking del envío por agencia en el chat del pedido (contrato `shipment`).
//  · Vendedor (Logística): registra la guía del comprobante y ve la fase.
//    Shalom pide numero + codigo (regla de su API real); Olva solo el numero —
//    el año de emisión lo pone el servidor (la guía se registra al despachar).
//  · Comprador: ve la guía y la fase; los avisos de transición le llegan como
//    mensajes del sistema (los escriben los jobs de tracking).
// El reflejo de Shalom entra por webhook + barrido; el de Olva solo por
// barrido cada 30 min — por eso en Olva hay botón "Actualizar": consulta al
// courier al toque y el servidor persiste lo que encuentre.

// `REGISTRADO` no es una fase del courier: es NUESTRA — hay guía emitida y
// Shalom/Olva todavía no reporta nada (la pre-guía). Sin este paso la barra
// salía entera apagada justo cuando el envío acababa de existir, que se lee
// como "no pasó nada" cuando lo que pasó es el registro. Mismo paso
// `registrado` que el eje del tablero (`order-tracking.ts`).
const PHASES = [
  { key: 'REGISTRADO', label: 'Registrado' },
  { key: 'EN_ORIGEN', label: 'En origen' },
  { key: 'EN_TRANSITO', label: 'En camino' },
  { key: 'EN_DESTINO', label: 'En agencia' },
  { key: 'ENTREGADO', label: 'Entregado' },
] as const

const PHASE_RANK: Record<string, number> = { EN_ORIGEN: 1, EN_TRANSITO: 2, EN_DESTINO: 3, ENTREGADO: 4 }

const SUPPORTED_COURIERS = ['SHALOM', 'OLVA']

export interface TrackingFields {
  tracking_courier?: string | null
  tracking_numero?: string | null
  tracking_codigo?: string | null
  tracking_ose_id?: string | null
  tracking_year?: string | null
  tracking_phase?: string | null
  tracking_demora_at?: string | null
  /** La clave de retiro. Solo se pinta al vendedor — y solo llega en su vista:
   *  `get-session` la manda únicamente al equipo probado. */
  shalom_pickup_code?: string | null
}

export default function TrackingBar({ sessionId, role, dispatchType, agencyName, tracking, onUpdated }: {
  sessionId: string
  role: 'buyer' | 'seller'
  dispatchType?: string | null
  agencyName?: string | null
  tracking: TrackingFields
  onUpdated: (t: TrackingFields) => void
}) {
  const [editing, setEditing] = useState(false)
  const [numero, setNumero] = useState('')
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)

  const registered = !!tracking.tracking_courier
  const courier = tracking.tracking_courier ?? agencyName ?? null

  // Solo pedidos de recojo en agencia, y solo couriers con reflejo construido.
  if (!isPickupDispatch(dispatchType)) return null
  if (!registered && (role !== 'seller' || !SUPPORTED_COURIERS.includes(courier ?? ''))) return null

  const isOlva = courier === 'OLVA'
  const numeroOk = isOlva
    ? /^\d{6,15}$/.test(numero.replace(/\D/g, ''))
    : /^\d{8,10}$/.test(numero.replace(/\D/g, ''))
  const codigoOk = isOlva || /^[A-Za-z0-9]{4}$/.test(codigo.trim())

  const save = async () => {
    if (busy || !numeroOk || !codigoOk) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/order-manage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_tracking', session_id: sessionId,
          tracking: isOlva
            ? { courier: 'OLVA', numero: numero.replace(/\D/g, '') }
            : { courier: 'SHALOM', numero: numero.replace(/\D/g, ''), codigo: codigo.trim().toUpperCase() },
        }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok || !r.ok) throw new Error('failed')
      onUpdated(r.tracking as TrackingFields)
      setEditing(false)
      setNumero(''); setCodigo('')
    } catch {
      setError('No se pudo registrar la guía. Revisa los datos e intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  // Solo Olva: sin webhook, el barrido pasa cada 30 min — el toque consulta ya.
  // El servidor persiste (solo hacia adelante); aquí se refleja lo mismo.
  const refresh = async () => {
    if (refreshing || !tracking.tracking_numero) return
    setRefreshing(true)
    setRefreshNote(null)
    const r = await trackShipment({
      track: tracking.tracking_numero,
      year: tracking.tracking_year,
      sessionId,
    })
    if (r.ok) {
      const advanced = r.phase && (PHASE_RANK[r.phase] ?? 0) > (PHASE_RANK[tracking.tracking_phase ?? ''] ?? 0)
      if (advanced) onUpdated({ ...tracking, tracking_phase: r.phase })
      else setRefreshNote('Sin avances nuevos por ahora.')
    } else if (r.stage === 'rate_limit') {
      setRefreshNote('Demasiadas consultas seguidas: espera un minuto.')
    } else {
      // `upstream` incluye guía inexistente: el proveedor no lo distingue de
      // Olva caído, así que aquí tampoco se acusa a la guía.
      setRefreshNote('No se pudo consultar Olva en este momento.')
    }
    setRefreshing(false)
  }

  // Sin fase reportada la barra NO está apagada: está en `Registrado` — la
  // guía existe (si no, esta tarjeta ni se pinta) y el courier aún no habla.
  const idxCourier = PHASES.findIndex(p => p.key === tracking.tracking_phase)
  const phaseIdx = idxCourier >= 0 ? idxCourier : 0
  const esPreguia = idxCourier < 0
  const showForm = role === 'seller' && (!registered || editing)

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-white px-3 py-2.5" style={{ border: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        <PackageCheck size={15} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
        <p className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wide text-gray-400 leading-tight">
          {registered ? `Envío ${courier}` : `Registrar envío · ${courier}`}
          {tracking.tracking_demora_at && (
            <span className="ml-1 whitespace-nowrap" style={{ color: '#F59E0B' }}>· Demora reportada</span>
          )}
        </p>
        {registered && !editing && isOlva && (
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0 disabled:opacity-50"
            style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : undefined} />
            {refreshing ? '…' : 'Actualizar'}
          </button>
        )}
        {role === 'seller' && registered && !editing && (
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
            <Pencil size={10} /> Corregir
          </button>
        )}
      </div>

      {registered && !editing && (
        <>
          {/* Los identificadores, con el vocabulario del voucher de Shalom:
              su PDF dice "NRO. ORDEN" y "CÓDIGO", y llamarlos igual acá es lo
              que hace que en el mostrador no haya que traducir entre papeles
              (`idsDeGuia` en `_shared/mensaje-de-guia.ts` — la misma regla del
              mensaje del chat). En Olva la guía se llama guía. */}
          <p className="text-xs font-semibold text-gray-700 mt-1.5 break-words">
            {tracking.tracking_numero
              ? tracking.tracking_codigo
                ? <>{isOlva ? 'Guía' : 'Nro. de orden'} <span className="font-black">{tracking.tracking_numero}</span> · Código <span className="font-black">{tracking.tracking_codigo}</span></>
                : <>{isOlva ? 'Guía' : 'Nro. de orden'} <span className="font-black">{tracking.tracking_numero}</span></>
              : <>Orden de servicio <span className="font-black">{tracking.tracking_ose_id}</span></>}
          </p>
          {/* ⚠️ La CLAVE, solo en el panel del vendedor. Al comprador le llega
              por el chat recién cuando paga su saldo — por eso acá se dice
              dónde termina, para que nadie la dicte por teléfono "de ayuda". */}
          {role === 'seller' && tracking.shalom_pickup_code && (
            <p className="text-xs font-semibold mt-1 flex items-start gap-1.5 rounded-xl px-2 py-1.5"
              style={{ background: 'var(--warn-bg-soft)', border: '0.5px solid var(--warn-border)', color: 'var(--text-muted)' }}>
              <KeyRound size={12} className="flex-shrink-0 mt-0.5" />
              <span>Clave de recojo <span className="font-black" style={{ color: 'var(--text)' }}>{tracking.shalom_pickup_code}</span>
                {' '}— solo la ve tu equipo; al cliente le llega sola por el chat cuando paga su saldo.</span>
            </p>
          )}
          {/* Línea de fases: la actual y las ya pasadas en marca; el resto gris */}
          <div className="flex items-center gap-1 mt-2">
            {PHASES.map((p, i) => (
              <div key={p.key} className="flex-1 text-center">
                <div className="h-1 rounded-full mb-1"
                  style={{ background: i <= phaseIdx ? 'var(--brand)' : '#E5E7EB' }} />
                <p className="text-[8px] font-black uppercase leading-tight"
                  style={{ color: i === phaseIdx ? 'var(--brand)' : i < phaseIdx ? '#9CA3AF' : '#D1D5DB' }}>
                  {p.label}
                </p>
              </div>
            ))}
          </div>
          {/* Qué significa `Registrado`: en Shalom es la PRE-GUÍA —con las
              mismas palabras del chat y de la hoja de guía—; en Olva la guía ya
              es oficial y solo falta que el courier reporte. */}
          {esPreguia && !refreshNote && (
            <p className="text-[10px] font-semibold text-gray-400 mt-1">
              {isOlva
                ? 'Esperando el primer estado del courier…'
                : 'Pre-guía: se vuelve oficial cuando el paquete entre a la agencia de origen.'}
            </p>
          )}
          {refreshNote && (
            <p className="text-[10px] font-semibold text-gray-400 mt-1">{refreshNote}</p>
          )}
        </>
      )}

      {showForm && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input value={numero} onChange={e => setNumero(e.target.value)} inputMode="numeric"
              placeholder={isOlva ? 'Guía (8 dígitos)' : 'Guía (8–10 dígitos)'} maxLength={isOlva ? 15 : 10}
              className="flex-1 min-w-0 text-xs font-semibold px-2.5 py-2 rounded-xl outline-none"
              style={{ border: '0.5px solid var(--border)' }} />
            {!isOlva && (
              <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
                placeholder="Código" maxLength={4}
                className="w-20 text-xs font-semibold px-2.5 py-2 rounded-xl outline-none uppercase"
                style={{ border: '0.5px solid var(--border)' }} />
            )}
            <button onClick={save} disabled={busy || !numeroOk || !codigoOk}
              className="text-[11px] font-black px-3 py-2 rounded-xl flex-shrink-0 disabled:opacity-40"
              style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
              {busy ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
          <p className="text-[10px] font-semibold text-gray-400 mt-1.5">
            {isOlva
              ? 'El número viene impreso en el comprobante de OLVA. La guía le llega al comprador por el chat.'
              : `Los dos vienen impresos en el comprobante de ${courier}. La guía le llega al comprador por el chat.`}
          </p>
          {error && <p className="text-[10px] font-bold mt-1" style={{ color: 'var(--danger-fg)' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
