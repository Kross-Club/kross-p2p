// ─── PASO 1 · Selección de pack ──────────────────────────────────────────────
// El ahorro explícito es lo que mueve el ticket promedio, así que cada tarjeta
// muestra precio por unidad y cuánto se ahorra frente a comprar sueltas.
// El CTA nunca está deshabilitado aquí: el pack viene preseleccionado.

import { BEST_PACK_BADGE, SHOW_PACK_SAVINGS } from '../../../lib/checkout/checkout.config'
import { effectivePrice } from '../../../lib/checkout/product-packs'

export interface PackOption {
  id: string
  nombre: string
  descripcion?: string
  precio: number
  /** Unidades del pack. Se infiere del nombre si el producto no la declara. */
  unidades: number
  image?: string
}

interface Step1PackProps {
  packs: PackOption[]
  /** Precio de UNA unidad, para calcular el ahorro. */
  unitPrice: number
  selected: string | null
  onSelect: (packId: string) => void
  /** Pack destacado (el recomendado). */
  bestPackId: string | null
  /** Descuento de retención ya aceptado. Se resta de cada pack. */
  discountPen: number
}

export default function Step1Pack({ packs, unitPrice, selected, onSelect, bestPackId, discountPen }: Step1PackProps) {
  return (
    <>
      <h2 className="text-xl font-black text-gray-900 mb-0.5">¡Un paso más! 🎉</h2>
      <p className="text-sm text-gray-500 mb-4">Elige tu pack. Mientras más llevas, menos pagas por unidad.</p>

      <div role="radiogroup" aria-label="Elige tu pack" className="space-y-2.5">
        {packs.map(pack => {
          const active = selected === pack.id
          const isBest = pack.id === bestPackId
          const precio = effectivePrice(pack.precio, discountPen)
          const perUnit = pack.unidades > 0 ? precio / pack.unidades : precio
          // El ahorro mide SOLO el volumen, sobre el precio de lista: si se
          // midiera contra el precio ya descontado, el pack de 1 unidad —que no
          // ahorra nada— mostraría el descuento de retención como si fuera
          // ahorro por llevar más, y diluiría el anclaje hacia el pack de 2.
          // El descuento se comunica aparte: precio tachado + banner.
          const savings = Math.max(0, unitPrice * pack.unidades - pack.precio)

          return (
            <button
              key={pack.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(pack.id)}
              className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2
                ${active ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}
                ${isBest ? 'mt-3' : ''}`}
            >
              {isBest && (
                <span
                  className="absolute -top-2.5 left-4 text-[9px] font-black px-2 py-0.5 rounded-full text-white whitespace-nowrap"
                  style={{ background: '#16A34A' }}
                >
                  {BEST_PACK_BADGE}
                </span>
              )}

              {pack.image && (
                <img
                  src={pack.image}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100"
                  loading="lazy"
                />
              )}

              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-black ${active ? 'text-green-800' : 'text-gray-800'}`}>
                  {pack.nombre}
                </span>
                <span className="block text-[11px] text-gray-500">
                  S/{perUnit.toFixed(0)} por unidad
                  {pack.descripcion ? ` · ${pack.descripcion}` : ''}
                </span>
                {SHOW_PACK_SAVINGS && savings > 0 && (
                  <span className="inline-block mt-1 text-[10px] font-black text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                    Ahorras S/{savings.toFixed(0)}
                  </span>
                )}
              </span>

              <span className="flex flex-col items-end flex-shrink-0">
                {discountPen > 0 && (
                  <span className="text-[10px] text-gray-400 line-through leading-none">S/{pack.precio}</span>
                )}
                <span className={`text-lg font-black ${active ? 'text-green-600' : 'text-gray-700'}`}>
                  S/{precio}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Señales de confianza: lo que quita el miedo a comprar por un anuncio. */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        <li>✅ En Lima pagas al recibir</li>
        <li>🚚 Envíos a todo el Perú</li>
        <li>🔒 Tus datos no se comparten</li>
      </ul>
    </>
  )
}
