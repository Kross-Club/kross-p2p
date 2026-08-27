import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ShoppingCart, Minus, Plus } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { porSlug, precioTexto, periodoTexto } from '../../config/catalogo'
import { useCarrito } from '../../lib/carrito'

// Detalle del servicio: la descripción larga y completa que la tarjeta no
// alcanza a contar, con el mismo precio y el mismo botón de compra.
export default function ServicioDetallePage() {
  const { slug } = useParams<{ slug: string }>()
  const item = slug ? porSlug(slug) : undefined
  const { agregar } = useCarrito()
  const navigate = useNavigate()
  const [qty, setQty] = useState(1)

  if (!item) {
    return (
      <PublicLayout>
        <div className="max-w-[720px] mx-auto px-5 py-24 text-center">
          <p className="font-black text-xl">Este servicio no existe</p>
          <p className="text-gray-500 mt-2">Puede que lo hayamos renombrado o retirado del catálogo.</p>
          <Link to="/servicios" className="inline-block mt-5 px-5 py-3 rounded-2xl text-sm k-cta">
            Ver el catálogo
          </Link>
        </div>
      </PublicLayout>
    )
  }

  const comprar = () => { agregar(item.slug, qty); navigate('/carrito') }

  return (
    <PublicLayout>
      <div className="max-w-[1120px] mx-auto px-5 py-10">
        <Link to="/servicios" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Volver al catálogo
        </Link>

        <div className="grid gap-10 md:grid-cols-2">
          <img src={item.imagen} alt={item.nombre}
            className="w-full rounded-3xl border border-gray-200 object-cover aspect-[4/3] bg-gray-100" />

          <div>
            <span className="text-[11px] font-black tracking-wide text-gray-400 uppercase">{item.categoria}</span>
            <h1 className="text-3xl font-black leading-tight mt-1">{item.nombre}</h1>
            <p className="text-gray-600 mt-3 leading-relaxed">{item.descripcion}</p>

            <p className="flex items-baseline gap-2 mt-6">
              <span className="text-4xl font-black">{precioTexto(item.precio)}</span>
              <span className="text-sm font-bold text-gray-500">{periodoTexto(item.periodo)}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Precio en soles, IGV incluido. {item.periodo === 'mes'
                ? 'Suscripción mensual, se puede cancelar cuando quieras.'
                : 'Pago único, no se renueva.'}
            </p>

            <div className="flex items-center gap-3 mt-6">
              <div className="flex items-center rounded-2xl border border-gray-200">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Quitar una unidad"
                  className="w-11 h-12 flex items-center justify-center text-gray-600 hover:text-gray-900">
                  <Minus size={16} />
                </button>
                <span className="w-10 text-center font-black">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Agregar una unidad"
                  className="w-11 h-12 flex items-center justify-center text-gray-600 hover:text-gray-900">
                  <Plus size={16} />
                </button>
              </div>
              <button onClick={comprar}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl active:scale-[.98] transition-transform k-cta">
                <ShoppingCart size={18} /> Comprar
              </button>
            </div>

            <h2 className="font-black mt-8 mb-3">Qué incluye</h2>
            <ul className="space-y-2">
              {item.incluye.map((linea) => (
                <li key={linea} className="flex gap-2.5 text-sm text-gray-700">
                  <Check size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
                  <span>{linea}</span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-gray-500 mt-8 leading-relaxed">
              La contratación se rige por nuestros{' '}
              <Link to="/terminos" className="underline font-bold">Términos y condiciones</Link> y por la{' '}
              <Link to="/cambios-y-devoluciones" className="underline font-bold">Política de cambios y devoluciones</Link>.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
