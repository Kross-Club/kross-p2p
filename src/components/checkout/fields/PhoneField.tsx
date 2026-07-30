// ─── Campo de WhatsApp ───────────────────────────────────────────────────────
// Prefijo +51 fijo: el comprador es peruano y un selector de país es un tap que
// el 99 % no necesita. El teclado abre en números (`inputMode="numeric"`).

import { useId } from 'react'
import { PHONE_COUNTRY_CODE_PE, PHONE_LENGTH_PE } from '../../../lib/checkout/checkout.config'

interface PhoneFieldProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error?: string
}

export default function PhoneField({ value, onChange, onBlur, error }: PhoneFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-gray-600 mb-1 block">
        Tu WhatsApp <span aria-hidden="true">*</span>
      </label>
      <div className="flex gap-2">
        <span
          className="flex items-center gap-1 bg-gray-100 rounded-2xl px-3 py-3 text-sm font-bold text-gray-700 flex-shrink-0"
          aria-hidden="true"
        >
          🇵🇪 +{PHONE_COUNTRY_CODE_PE}
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoCorrect="off"
          maxLength={PHONE_LENGTH_PE}
          placeholder={`${PHONE_LENGTH_PE} dígitos`}
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, PHONE_LENGTH_PE))}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`flex-1 min-w-0 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none transition-shadow
            focus:ring-2 focus:ring-green-500 focus:bg-white ${error ? 'ring-2 ring-red-400' : ''}`}
        />
      </div>
      {error && <p id={errorId} role="alert" className="text-[11px] font-semibold mt-1.5 text-red-600">{error}</p>}
    </div>
  )
}
