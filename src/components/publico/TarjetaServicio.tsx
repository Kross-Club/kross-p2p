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
    <article className="flex flex-col rounded-3xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <Link to={`/servicios/${item.slug}`} className="block relative">
        <img src={item.imagen} alt={item.nombre} loading="lazy"
          className="w-full aspect-[4/3] object-cover bg-gray-100" />
        {item.destacado && (
          <span className="absolute top-3 left-3 text-[11px] px-2.5 py-1 rounded-full uppercase tracking-wide"
            style={{ background: 'var(--invert)', color: 'var(--invert-fg)' }}>
            Más elegido
          </span>
        )}
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <span className="text-[11px] tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>{item.categoria}</span>
        <h3 className="text-lg leading-tight mt-1">{item.nombre}</h3>
        <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.resumen}</p>

        <ul className="mt-3 space-y-1.5">
          {item.incluye.slice(0, 3).map((linea) => (
            <li key={linea} className="flex gap-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              <Check size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
              <span>{linea}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-4">
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl tabular">{precioTexto(item.precio)}</span>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{periodoTexto(item.periodo)}</span>
          </p>
          <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>Precio en soles, IGV incluido.</p>

          <div className="flex gap-2">
            <button
              onClick={() => { agregar(item.slug); marcarAgregado() }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm active:scale-[.98] transition-transform ${agregado ? '' : 'k-cta'}`}
              style={agregado ? { background: 'var(--ok-bg)', color: 'var(--ok-on)' } : undefined}>
              {agregado ? <><Check size={16} /> Agregado</> : <><ShoppingCart size={16} /> Comprar</>}
            </button>
            <Link to={`/servicios/${item.slug}`}
              className="px-4 py-3 rounded-2xl text-sm flex items-center k-cta-2">
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
