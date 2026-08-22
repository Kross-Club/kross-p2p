import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ShoppingCart } from 'lucide-react'
import { precioTexto, periodoTexto, type ItemCatalogo } from '../../config/catalogo'
import { useCarrito } from '../../lib/carrito'

// Tarjeta del catálogo. Los tres datos que la pasarela exige por producto —foto,
// descripción y precio— son lo primero de la tarjeta, y el botón Comprar es
// parte de ella: nada de "consultar por WhatsApp" como único camino de compra.
export default function TarjetaServicio({ item }: { item: ItemCatalogo }) {
  const { agregar } = useCarrito()
  const [agregado, marcarAgregado] = useConfirmacion()

  return (
    <article className="flex flex-col rounded-3xl border border-gray-200 overflow-hidden bg-white hover:shadow-lg transition-shadow">
      <Link to={`/servicios/${item.slug}`} className="block relative">
        <img src={item.imagen} alt={item.nombre} loading="lazy"
          className="w-full aspect-[4/3] object-cover bg-gray-100" />
        {item.destacado && (
          <span className="absolute top-3 left-3 text-[11px] font-black px-2.5 py-1 rounded-full text-white"
            style={{ background: 'var(--brand-dark)' }}>
            MÁS ELEGIDO
          </span>
        )}
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <span className="text-[11px] font-black tracking-wide text-gray-400 uppercase">{item.categoria}</span>
        <h3 className="font-black text-lg leading-tight mt-0.5">{item.nombre}</h3>
        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{item.resumen}</p>

        <ul className="mt-3 space-y-1.5">
          {item.incluye.slice(0, 3).map((linea) => (
            <li key={linea} className="flex gap-2 text-[13px] text-gray-600">
              <Check size={15} className="mt-0.5 shrink-0 text-green-600" />
              <span>{linea}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-4">
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black">{precioTexto(item.precio)}</span>
            <span className="text-xs font-bold text-gray-500">{periodoTexto(item.periodo)}</span>
          </p>
          <p className="text-[11px] text-gray-400 mb-3">Precio en soles, IGV incluido.</p>

          <div className="flex gap-2">
            <button
              onClick={() => { agregar(item.slug); marcarAgregado() }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm text-white active:scale-[.98] transition-transform"
              style={{ background: agregado ? '#16A34A' : 'var(--brand-dark)' }}>
              {agregado ? <><Check size={16} /> Agregado</> : <><ShoppingCart size={16} /> Comprar</>}
            </button>
            <Link to={`/servicios/${item.slug}`}
              className="px-4 py-3 rounded-2xl font-black text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 flex items-center">
              Ver
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

/** "Agregado" durante 1.6 s: confirma el clic sin sacar al comprador de la
 *  vitrina, que es donde sigue comprando. */
function useConfirmacion(): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const marcar = () => {
    setOn(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), 1600)
  }
  return [on, marcar]
}
