import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2, ShoppingCart, Lock } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { useCarrito } from '../../lib/carrito'
import { precioTexto, periodoTexto } from '../../config/catalogo'

// Carrito. Requisito directo de Culqi ("debe contar con un carrito de compras o
// botón de Comprar") y, sobre todo, el único sitio donde el cliente ve el total
// antes de dar sus datos.
export default function CarritoPage() {
  const { lineas, total, cambiarQty, quitar, unidades } = useCarrito()

  return (
    <PublicLayout>
      <div className="max-w-[900px] mx-auto px-5 py-12">
        <h1 className="text-3xl font-black">Tu carrito</h1>

        {lineas.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-gray-200 py-16 text-center">
            <ShoppingCart size={36} className="mx-auto text-gray-300" />
            <p className="font-black mt-4">Todavía no agregaste nada</p>
            <p className="text-sm text-gray-500 mt-1">Elige el plan o el módulo que necesitas.</p>
            <Link to="/servicios" className="inline-block mt-5 px-6 py-3 rounded-2xl font-black text-sm text-white"
              style={{ background: 'var(--brand-dark)' }}>
              Ver servicios
            </Link>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mt-1">{unidades} {unidades === 1 ? 'servicio' : 'servicios'} seleccionados</p>

            <ul className="mt-8 space-y-4">
              {lineas.map(({ item, qty, subtotal }) => (
                <li key={item.slug} className="flex flex-wrap gap-4 items-center rounded-3xl border border-gray-200 p-4">
                  <img src={item.imagen} alt={item.nombre} className="w-24 h-20 rounded-2xl object-cover bg-gray-100" />

                  <div className="flex-1 min-w-[180px]">
                    <Link to={`/servicios/${item.slug}`} className="font-black hover:underline">{item.nombre}</Link>
                    <p className="text-sm text-gray-500">{item.resumen}</p>
                    <p className="text-sm font-bold text-gray-700 mt-1">
                      {precioTexto(item.precio)} <span className="text-xs font-medium text-gray-500">{periodoTexto(item.periodo)}</span>
                    </p>
                  </div>

                  <div className="flex items-center rounded-2xl border border-gray-200">
                    <button onClick={() => cambiarQty(item.slug, qty - 1)} aria-label={`Quitar una unidad de ${item.nombre}`}
                      className="w-10 h-11 flex items-center justify-center text-gray-600 hover:text-gray-900">
                      <Minus size={15} />
                    </button>
                    <span className="w-9 text-center font-black">{qty}</span>
                    <button onClick={() => cambiarQty(item.slug, qty + 1)} aria-label={`Agregar una unidad de ${item.nombre}`}
                      className="w-10 h-11 flex items-center justify-center text-gray-600 hover:text-gray-900">
                      <Plus size={15} />
                    </button>
                  </div>

                  <p className="font-black w-28 text-right">{precioTexto(subtotal)}</p>

                  <button onClick={() => quitar(item.slug)} aria-label={`Quitar ${item.nombre} del carrito`}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={17} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-3xl border border-gray-200 p-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total a pagar</p>
                  <p className="text-3xl font-black">{precioTexto(total)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    IGV incluido. Los servicios mensuales se renuevan cada 30 días hasta que los canceles.
                  </p>
                </div>
                <Link to="/pago"
                  className="px-7 py-4 rounded-2xl font-black text-white active:scale-[.98] transition-transform"
                  style={{ background: 'var(--brand-dark)' }}>
                  Continuar al pago
                </Link>
              </div>

              <p className="flex items-center gap-2 text-xs text-gray-500 mt-5">
                <Lock size={14} className="text-green-600" /> Conexión cifrada con certificado SSL en todo el sitio.
              </p>
            </div>
          </>
        )}
      </div>
    </PublicLayout>
  )
}
