// ─── Select con búsqueda ─────────────────────────────────────────────────────
// Un <select> nativo con 483 distritos es inusable en un Android de gama media.
// Esto es un input que filtra mientras escribes: tecleando "sur" salen Surco,
// Surquillo y San Juan de Miraflores.
//
// Navegable con teclado (↑ ↓ Enter Esc) porque el flujo completo tiene que poder
// grabarse desde una laptop con mouse y teclado.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  /** Segunda línea: contexto que desambigua (provincia, departamento…). */
  detail?: string
  /** Insignia a la derecha ("Llega a tu puerta"). */
  badge?: string
}

interface SearchSelectProps {
  label: string
  placeholder: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  loading?: boolean
  /** Máximo de resultados visibles: la lista larga se navega escribiendo. */
  limit?: number
  required?: boolean
}

export default function SearchSelect({
  label, placeholder, options, value, onChange, onBlur, error, loading, limit = 50, required,
}: SearchSelectProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? options.filter(o => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q))
      : options
    return pool.slice(0, limit)
  }, [options, query, limit])

  // Cerrar al hacer clic fuera. En móvil evita que la lista tape el CTA.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); onBlur?.() }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onBlur])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQuery('')
    onBlur?.()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active].value) }
    else if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="text-xs font-bold text-gray-600 mb-1 block">
        {label} {required && <span aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          value={open ? query : selected?.label ?? ''}
          placeholder={loading ? 'Cargando…' : placeholder}
          disabled={loading}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true) }}
          onKeyDown={onKeyDown}
          className={`w-full bg-gray-100 rounded-2xl pl-4 pr-10 py-3 text-sm outline-none transition-shadow
            focus:ring-2 focus:ring-green-500 focus:bg-white disabled:opacity-60
            ${error ? 'ring-2 ring-red-400' : ''}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {open ? <Search size={16} /> : <ChevronDown size={16} />}
        </span>
      </div>

      {error && <p role="alert" className="text-[11px] font-semibold mt-1.5 text-red-600">{error}</p>}

      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-2xl bg-white shadow-xl border border-gray-100 py-1"
        >
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-400">
              No encontramos "{query}". Revisa cómo se escribe.
            </li>
          )}
          {results.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 ${i === active ? 'bg-green-50' : ''}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-800 truncate">{o.label}</span>
                  {o.detail && <span className="block text-[11px] text-gray-400 truncate">{o.detail}</span>}
                </span>
                {o.badge && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                    {o.badge}
                  </span>
                )}
                {o.value === value && <Check size={14} className="text-green-600 flex-shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
