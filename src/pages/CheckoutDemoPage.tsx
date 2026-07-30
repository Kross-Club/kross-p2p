// ─── Página de revisión del Checkout (solo desarrollo) ───────────────────────
// Monta el modal con packs de mentira y sin depender de Supabase, para revisar
// el flujo y grabar tutoriales sin tener que crear un pedido real.
// No se registra en producción: ver la ruta en App.tsx.

import { useState } from 'react'
import CheckoutModal from '../components/checkout/CheckoutModal'
import type { PackOption } from '../components/checkout/steps/Step1Pack'

const UNIT_PRICE = 110

/** Marcador de posición: N frascos dibujados, uno por unidad. Está en SVG inline
 *  para que la demo no dependa de red. Ilustra la regla real: la foto del pack
 *  solo aporta si MUESTRA la cantidad — si fuera la misma en los tres, sobraría. */
const bottles = (n: number): string => {
  const w = 22, gap = 4, total = n * w + (n - 1) * gap
  const items = Array.from({ length: n }, (_, i) => {
    const x = (100 - total) / 2 + i * (w + gap)
    return `<rect x="${x + 7}" y="22" width="8" height="8" rx="2" fill="#0F766E"/>` +
      `<rect x="${x}" y="30" width="${w}" height="48" rx="6" fill="#14B8A6"/>` +
      `<rect x="${x + 4}" y="44" width="${w - 8}" height="18" rx="3" fill="#ECFDF5"/>`
  }).join('')
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F0FDFA"/>${items}</svg>`,
  )}`
}

const PACKS: PackOption[] = [
  { id: 'pack-1', nombre: '1 unidad', descripcion: 'Para probar', precio: 110, unidades: 1, image: bottles(1) },
  { id: 'pack-2', nombre: '2 unidades', descripcion: 'Pack completo', precio: 189, unidades: 2, image: bottles(2) },
  { id: 'pack-3', nombre: '3 unidades', descripcion: 'Para compartir', precio: 259, unidades: 3, image: bottles(3) },
]

export default function CheckoutDemoPage() {
  const [open, setOpen] = useState(true)

  return (
    <div className="min-h-dvh bg-gray-100 flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-wide text-gray-400">Revisión · Fase 2</p>
        <h1 className="text-lg font-black text-gray-800 mt-1">Checkout multi-paso</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Packs de ejemplo. La cobertura y las sedes son data real del courier.
        </p>
      </div>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="bg-green-500 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-green-200"
        >
          Abrir checkout
        </button>
      )}

      {open && (
        <CheckoutModal
          packs={PACKS}
          unitPrice={UNIT_PRICE}
          bestPackId="pack-2"
          initialPack="pack-2"
          onClose={() => setOpen(false)}
          onPartialLead={state => console.info('[demo] lead parcial', state.customerInfo.whatsapp)}
          // Datos de cobro de mentira: la demo enseña la caja de Yape sin tocar
          // Supabase. Sin `submitContext` el paso 3 no registra nada — a
          // propósito: la demo se usa para grabar tutoriales, no para vender.
          yape={{ number: '999 888 777', holder: 'Marca de ejemplo', qrUrl: null }}
        />
      )}
    </div>
  )
}
