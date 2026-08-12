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

import { COPY, YAPE_CODE_LENGTH } from '../../../lib/checkout/checkout.config'
import type { CheckoutState } from '../../../lib/checkout/types'
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
  errors: FieldErrors
  touch: (field: 'yapeCode' | 'culqiPhone' | 'culqiOtp') => void
  onYapeCode: (code: string) => void
  onCulqiPhone: (phone: string) => void
  onCulqiOtp: (otp: string) => void
  onVoucher: (file: File) => Promise<void>
  submitError: string | null
}

export default function Step3Confirm({
  state, packName, price, yape, culqi, errors, touch, onYapeCode,
  onCulqiPhone, onCulqiOtp, onVoucher, submitError,
}: Step3Props) {
  const advance = state.advanceAmount
  const isProvincia = state.locationType === 'PROVINCIA'
  const p = state.provinciaConfig

  const destino = isProvincia
    ? p?.deliveryMethod === 'AGENCIA'
      ? `Recojo en agencia${p.selectedAgency ? ` ${p.selectedAgency}` : ''} · ${p.district}`
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
            <Row label="Pagas al recoger" value={`S/${Math.max(0, price - advance)}`} />
          </>
        )}
      </dl>

      {state.deliveryNote && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">
          ⚠️ {state.deliveryNote}
        </p>
      )}

      {advance > 0 && (culqi
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
