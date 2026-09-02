// ─── PASO 3 · Resumen y adelanto ─────────────────────────────────────────────
// El paso 3 **no pide nada**. Nunca. Con 360pay activo no anuncia nada extra:
// el resumen ya dice cuánto se adelanta y la pantalla de Yape aparece DESPUÉS
// de terminar el pedido — anunciarla aquí duplicaba el monto en la misma
// pantalla y alargaba el paso sin sumar información. Sin 360pay sí se avisa:
// un asesor coordina el adelanto por el chat, y no decirlo deja al comprador
// esperando un cobro que nunca llega.
//
// Aquí vivió la caja del Yape manual —número de la marca, código de seguridad
// de 3 dígitos, captura del comprobante— y era el único punto del checkout
// donde el comprador tenía que aprender algo nuevo: buscar tres dígitos en una
// pantalla que quizá ya cerró. Se eliminó con el flujo entero cuando 360pay
// pasó a producción: pedirle la PRUEBA de un pago es siempre peor que darle un
// botón que lo cobra.
//
// El resumen va PRIMERO en los dos casos: antes de pedirle plata hay que
// recordarle qué lleva y a dónde llega.

import { Gift } from 'lucide-react'
import { COPY, advanceFor } from '../../../lib/checkout/checkout.config'
import type { AdvanceChoice, CheckoutState } from '../../../lib/checkout/types'

interface Step3Props {
  state: CheckoutState
  /** Nombre y precio ya con descuento del pack elegido. */
  packName: string | null
  price: number
  /** true = este pedido se cobra EN LÍNEA, por el riel que sea
   *  (`onlinePayActiveFor`, lo decide el modal). false = la tienda no tiene
   *  ninguno y va por la caja manual. Cuál riel no le importa a esta pantalla:
   *  el copy no nombra el motor. */
  onlinePay: boolean
  onAdvanceChoice: (choice: AdvanceChoice) => void
  submitError: string | null
}

export default function Step3Confirm({
  state, packName, price, onlinePay, onAdvanceChoice, submitError,
}: Step3Props) {
  const advance = state.advanceAmount
  const isProvincia = state.locationType === 'PROVINCIA'
  const p = state.provinciaConfig

  const destino = isProvincia
    ? state.deliveryMethod === 'AGENCIA'
      ? `Recojo en agencia${state.pickup.agency ? ` ${state.pickup.agency}` : ''} · ${p?.district}`
      : `${p?.district ?? ''}, ${p?.province ?? ''}`
    : `${state.limaAddress?.district ?? 'Lima'} · a tu puerta`

  return (
    <>
      <h2 className="text-xl font-black text-gray-900 mb-0.5">
        {advance > 0 ? COPY.step3TitleAdvance : COPY.step3Title}
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {advance > 0
          ? (state.deliveryMethod === 'AGENCIA' ? COPY.advanceHeadsUpShortPickup : COPY.advanceHeadsUpShort)
          : COPY.doneCod}
      </p>

      {/* ── Resumen ── */}
      <dl className="rounded-2xl border border-gray-200 divide-y divide-gray-100 mb-4">
        <Row label="Tu pedido" value={packName ?? 'Tu pack'} />
        <Row label="Entrega" value={destino} />
        <Row label="Recibe" value={state.customerInfo.receiverName || '—'} />
        <Row label="Total" value={`S/${price}`} strong />
        {advance > 0 && (
          <>
            <Row label="Adelantas ahora" value={`S/${advance}`} strong accent />
            {/* El saldo explícito evita el reclamo de "pensé que ya había pagado
                todo". Es la cifra que el comprador va a recordar. En agencia el
                saldo NO se paga al recoger: se paga por la app (suelta la clave
                de recojo), y la etiqueta no puede prometer lo contrario. */}
            <Row
              label={state.deliveryMethod === 'AGENCIA' ? 'Saldo (lo pagas por la app)' : 'Pagas al recibir'}
              value={`S/${Math.max(0, price - advance)}`}
            />
          </>
        )}
      </dl>

      {price > 0 && (
        <AdvancePicker price={price} choice={state.advanceChoice}
          pickup={state.deliveryMethod === 'AGENCIA'} onPick={onAdvanceChoice} />
      )}

      {state.deliveryNote && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">
          ⚠️ {state.deliveryNote}
        </p>
      )}

      {/* Con 360pay aquí no va NADA: el resumen ya muestra el adelanto y la
          pantalla de Yape llega al terminar el pedido. Aquí vivió una caja que
          anunciaba el botón y repetía el monto — puro eco del resumen de arriba,
          y se quitó. */}
      {advance > 0 && !onlinePay && (
        /* Sin 360pay conectado no hay nada que cobrar aquí: el pedido se cierra
           igual y el adelanto lo coordina un asesor por el chat. Decirlo es
           mejor que no decir nada — quien esperaba pagar ahora sabe qué sigue. */
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-bold text-gray-900">{COPY.advanceByChatTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{COPY.advanceByChatHint}</p>
          <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {COPY.pay360AmountLabel}
            </span>
            <p className="text-2xl font-black text-gray-900">S/{advance}</p>
          </div>
        </div>
      )}

      {submitError && (
        <p role="alert" className="mt-4 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
          {submitError}
        </p>
      )}
    </>
  )
}

// ─── Cuánto adelanta ─────────────────────────────────────────────────────────
// La mitad es el mínimo; el total es opcional. Se pregunta ACÁ y no en el paso 2
// porque es lo último antes de yapear: preguntarlo antes obligaba al comprador a
// decidir sobre un monto que todavía podía cambiar de pack.
//
// Las dos tarjetas muestran el reparto completo —lo de ahora Y lo que queda—
// porque la duda real no es "cuánto pago" sino "cuánto me falta después".

function AdvancePicker({ price, choice, pickup, onPick }: {
  price: number
  choice: AdvanceChoice
  /** Recojo en agencia: el saldo se paga por la app (suelta la clave de
   *  recojo), nunca "al recibirlo" — la letra chica no puede decir otra cosa. */
  pickup?: boolean
  onPick: (c: AdvanceChoice) => void
}) {
  const options: { id: AdvanceChoice; title: string; now: number; perk?: string }[] = [
    { id: 'HALF', title: 'Pago la mitad ahora', now: advanceFor(price, 'HALF') },
    { id: 'FULL', title: 'Pago todo ahora', now: advanceFor(price, 'FULL'), perk: COPY.advanceFullPerk },
  ]

  return (
    <div className="mb-4">
      <p className="text-xs font-black text-gray-700 mb-2">¿Cuánto quieres adelantar? *</p>
      <div className="space-y-2" role="radiogroup" aria-label="¿Cuánto quieres adelantar?">
        {options.map(({ id, title, now, perk }) => {
          const active = choice === id
          const rest = Math.max(0, price - now)
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(id)}
              className={`w-full text-left rounded-2xl px-4 py-3 border-2 transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500
                ${active ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-black ${active ? 'text-green-800' : 'text-gray-900'}`}>
                  {title}
                </span>
                <span className="text-sm font-black" style={{ color: 'var(--brand)' }}>S/{now}</span>
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5">
                {rest > 0
                  ? (pickup
                      ? `Te quedan S/${rest}, que pagas por la app cuando tu pedido se envíe.`
                      : `Te quedan S/${rest} por pagar al recibirlo.`)
                  : (pickup ? 'Ya no pagas nada más.' : 'Ya no pagas nada al recibirlo.')}
              </span>
              {/* El empujón hacia el pago completo: una línea, en verde, que
                  suma un beneficio en vez de repetir el reparto. */}
              {perk && (
                <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-green-700">
                  <Gift size={12} className="flex-shrink-0" aria-hidden="true" />
                  {perk}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Row({ label, value, strong, accent }: {
  label: string; value: string; strong?: boolean; accent?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <dt className="text-[11px] font-bold text-gray-400 flex-shrink-0">{label}</dt>
      <dd className={`text-right text-sm min-w-0 ${strong ? 'font-black' : 'text-gray-600'} ${accent ? 'text-green-600' : 'text-gray-800'}`}>
        {value}
      </dd>
    </div>
  )
}
