// ─── Campo de formulario del checkout ────────────────────────────────────────
// Label real (no placeholder-como-label), error debajo en rojo con copy de
// solución, y foco visible. Todos los pasos usan este mismo componente.

import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string
  /** Microcopy bajo el campo. Se oculta cuando hay error, para no competir. */
  hint?: ReactNode
  required?: boolean
}

export default function Field({ label, error, hint, required, className = '', ...input }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-gray-600 mb-1 block">
        {label} {required && <span aria-hidden="true">*</span>}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none transition-shadow
          focus:ring-2 focus:ring-green-500 focus:bg-white
          ${error ? 'ring-2 ring-red-400' : ''} ${className}`}
      />
      {error
        ? <p id={errorId} role="alert" className="text-[11px] font-semibold mt-1.5 text-red-600">{error}</p>
        : hint ? <div id={hintId} className="text-[11px] text-gray-400 mt-1.5">{hint}</div> : null}
    </div>
  )
}
