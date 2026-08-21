// ─── PASO 3 · Resumen y adelanto ─────────────────────────────────────────────
// Dos formas de cobrar el adelanto, según la tienda (prop `culqi`):
//
//   Manual → caja de Yape con el número de la marca + el código de seguridad
//            (obligatorio) + la captura (opcional, ver VOUCHER_REQUIRED). El
//            cruce corre en background contra la notificación.
//   Culqi  → celular + código de aprobación, y el CTA COBRA: monto exacto,
//            confirmación al toque, sin captura ni cruce. Ver §3.3 del doc.
//
// El resumen va PRIMERO en los dos casos: antes de pedirle plata hay que
// recordarle qué lleva y a dónde llega.

import { COPY, YAPE_CODE_LENGTH, advanceFor } from '../../../lib/checkout/checkout.config'
import type { AdvanceChoice, CheckoutState } from '../../../lib/checkout/types'
import type { FieldErrors } from '../../../lib/checkout/validation'
import type { StoreYape } from '../CheckoutModal'
import YapeCodeHint from '../YapeCodeHint'
import YapeBox from '../payment/YapeBox'
import CulqiYapeBox from '../payment/CulqiYapeBox'
import VoucherField from '../payment/VoucherField'
import Field from '../fields/Field'

interface Step3Props {
  state: CheckoutState
  /** Nombre y precio ya con descuento del pack elegido. */
  packName: string | null
  price: number
  /** Datos de cobro de la tienda. `null` si la marca aún no los configuró. */
  yape: StoreYape | null
  /** true = este pedido se cobra en línea (culqiActiveFor, lo decide el modal). */
  culqi: boolean
  /** true = se cobra con 360pay. Manda sobre `culqi` (ver checkout.config). */
  pay360: boolean
  errors: FieldErrors
  touch: (field: 'yapeCode' | 'culqiPhone' | 'culqiOtp') => void
  onYapeCode: (code: string) => void
  onCulqiPhone: (phone: string) => void
  onCulqiOtp: (otp: string) => void
  onVoucher: (file: File) => Promise<void>
  onAdvanceChoice: (choice: AdvanceChoice) => void
  submitError: string | null
}

export default function Step3Confirm({
  state, packName, price, yape, culqi, pay360, errors, touch, onYapeCode,
  onCulqiPhone, onCulqiOtp, onVoucher, onAdvanceChoice, submitError,
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
        {advance > 0 ? COPY.advanceHeadsUpShort : COPY.doneCod}
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
                todo". Es la cifra que el comprador va a recordar. */}
            <Row
              label={state.deliveryMethod === 'AGENCIA' ? 'Pagas al recoger' : 'Pagas al recibir'}
              value={`S/${Math.max(0, price - advance)}`}
            />
          </>
        )}
      </dl>

      {price > 0 && (
        <AdvancePicker price={price} choice={state.advanceChoice} onPick={onAdvanceChoice} />
      )}

      {state.deliveryNote && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">
          ⚠️ {state.deliveryNote}
        </p>
      )}

      {/* Con 360pay el paso 3 no pide nada: el botón que abre Yape aparece
          DESPUÉS de terminar el pedido, con el monto ya fijado por el cupón.
          Mostrar aquí la caja manual —número, código de 3 dígitos— pedía la
          prueba de un pago que todavía no existe. */}
      {advance > 0 && pay360 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-bold text-gray-900">{COPY.pay360Title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{COPY.pay360Step3Hint}</p>
          <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {COPY.pay360AmountLabel}
            </span>
            <p className="text-2xl font-black text-gray-900">S/{advance}</p>
          </div>
        </div>
      ) : advance > 0 && (culqi
        ? (
          <CulqiYapeBox
            state={state}
            amount={advance}
            errors={errors}
            touch={touch}
            onPhone={onCulqiPhone}
            onOtp={onCulqiOtp}
          />
        )
        : (
          /* Rama manual, BIT a BIT como siempre: es lo que sostiene la
             convivencia — una tienda sin Culqi no nota este archivo. */
          <>
            <YapeBox yape={yape} amount={advance} />

            <div className="mt-3">
              {/* La ayuda va ARRIBA del campo: quien ya sabe la ignora en medio
                  segundo, y quien no, la ve antes de quedarse mirando un input
                  vacío sin saber qué escribir. */}
              <YapeCodeHint />
              <Field
                label={COPY.yapeCodeLabel}
                required
                value={state.advanceYapeCode}
                onChange={e => onYapeCode(e.target.value)}
                onBlur={() => touch('yapeCode')}
                error={errors.yapeCode}
                hint={COPY.yapeCodeHint}
                placeholder={COPY.yapeCodePlaceholder}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={YAPE_CODE_LENGTH}
                className="tracking-[0.5em] text-center text-lg font-black"
              />
            </div>

            <VoucherField voucher={state.paymentVoucher} onSelect={onVoucher} error={errors.voucher} />
          </>
        )
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

function AdvancePicker({ price, choice, onPick }: {
  price: number
  choice: AdvanceChoice
  onPick: (c: AdvanceChoice) => void
}) {
  const options: { id: AdvanceChoice; title: string; now: number }[] = [
    { id: 'HALF', title: 'Pago la mitad ahora', now: advanceFor(price, 'HALF') },
    { id: 'FULL', title: 'Pago todo ahora', now: advanceFor(price, 'FULL') },
  ]

  return (
    <div className="mb-4">
      <p className="text-xs font-black text-gray-700 mb-2">¿Cuánto quieres adelantar? *</p>
      <div className="space-y-2" role="radiogroup" aria-label="¿Cuánto quieres adelantar?">
        {options.map(({ id, title, now }) => {
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
                {rest > 0 ? `Te quedan S/${rest} por pagar al recibirlo.` : 'Ya no pagas nada al recibirlo.'}
              </span>
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
