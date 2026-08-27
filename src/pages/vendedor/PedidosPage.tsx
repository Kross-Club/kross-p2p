import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSeller } from '../../lib/seller-session'
import { useStoreOrders } from '../../lib/store-orders'
import { useIsDesktop } from '../../lib/use-desktop'
import { MODOS, modoDeUrl, urlDeModo } from '../../lib/pedidos-modos'
import type { Modo } from '../../lib/pedidos-modos'
import PedidosBandeja from './PedidosBandeja'
import PedidosTablero from './PedidosTablero'
import PedidosMapa from './PedidosMapa'
import PedidosResumen from './PedidosResumen'

// ─── Pedidos: una pantalla, cuatro maneras de mirarla ────────────────────────
//
// El costo de tener Chats, CRM, En vivo y Stats como cuatro entradas del menú
// no eran las cuatro pantallas: era que el vendedor tenía que decidir en cuál
// buscar antes de poder trabajar. Acá esa pregunta desaparece — entras a
// Pedidos y eliges cómo mirarlos. Ver docs/11-RELACIONES.md.
//
// El modo vive en la URL (`?modo=`) y no en un `useState`: así se puede mandar
// un enlace a un modo concreto y el botón "atrás" hace lo que uno espera.

export default function PedidosPage() {
  const navigate = useNavigate()
  const { effective } = useSeller()
  const desktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const modo = modoDeUrl(params)

  // El super admin de la plataforma no es una tienda: no tiene pedidos que
  // mirar, tiene marcas que administrar.
  useEffect(() => {
    if (effective?.is_super_admin) navigate('/vendedor/marca', { replace: true })
  }, [effective?.is_super_admin, navigate])

  // UNA lectura para los cuatro modos. Con cancelados porque el tablero los
  // agrupa aparte y el resumen los cuenta en las notas; los modos que no los
  // quieren (bandeja, mapa) los descartan al pintar, que es gratis.
  const lista = useStoreOrders(effective, { incluirCancelados: true })

  // `replace` para que los cambios de modo no llenen el historial: el "atrás"
  // debe sacarte de Pedidos, no pasearte por los modos que probaste.
  const irA = (m: Modo) => setParams(urlDeModo(m), { replace: true })

  const selector = (
    <div className="flex gap-1 p-0.5 rounded-2xl overflow-x-auto" style={{ background: 'var(--surface-3)' }}>
      {MODOS.map(m => {
        const activo = m.key === modo
        return (
          <button
            key={m.key}
            onClick={() => irA(m.key)}
            title={m.pregunta}
            aria-pressed={activo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors flex-shrink-0"
            style={activo
              ? { background: 'var(--surface)', color: 'var(--text)', fontWeight: 700 }
              : { color: 'var(--text-faint)', fontWeight: 500 }}
          >
            <m.icon size={14} />
            {m.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div>
      {/* En escritorio el marco del panel ya rotula la sección ("Pedidos" sale
          de seller-nav); en móvil no hay más título que este. */}
      <div className={desktop ? 'px-6 pt-5' : 'px-4 pt-4'}>
        {!desktop && <h1 className="text-xl font-black text-gray-900 mb-3">Pedidos</h1>}
        {selector}
      </div>

      {modo === 'bandeja' && <PedidosBandeja lista={lista} />}
      {modo === 'tablero' && <PedidosTablero lista={lista} />}
      {modo === 'mapa' && <PedidosMapa lista={lista} />}
      {modo === 'resumen' && <PedidosResumen lista={lista} />}
    </div>
  )
}
