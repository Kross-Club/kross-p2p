import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Users, ChevronRight } from 'lucide-react'
import { useSeller } from '../../lib/seller-session'
import { useStoreClients, resumenDeCliente } from '../../lib/store-clients'
import { CERRADO, ALERTA, NEUTRO } from '../../lib/order-chips'
import PanelCliente from '../../components/PanelCliente'

// ─── La libreta de clientes ──────────────────────────────────────────────────
//
// Lo que faltaba de verdad (11-RELACIONES): el panel podía ver el contacto de un
// comprador DENTRO de un pedido, pero no a la persona. Ninguna pantalla
// respondía "¿este señor ya me compró antes?", que es la pregunta que decide si
// se le despacha sin adelanto, si vale el upsell, y si el reclamo de hoy es de
// un cliente de tres pedidos o de un desconocido.

const SEGMENTO: Record<string, { label: string; style: typeof NEUTRO }> = {
  restock: { label: 'Toca recompra', style: NEUTRO },
  winback: { label: 'Se está yendo', style: ALERTA },
}

export default function ClientesPersonas() {
  const { real, effective } = useSeller()
  const { clientes, cargando, error } = useStoreClients(real, effective)
  const [busca, setBusca] = useState('')

  // Qué ficha está abierta vive en la URL y no en un `useState` porque ya no se
  // abre solo desde acá: desde un pedido se salta a SU cliente
  // (`/vendedor/clientes?cliente=<id>`), que es la relación que el panel tenía
  // escrita en el modelo y no en la pantalla — un pedido pertenece a alguien, y
  // de ese alguien cuelgan todos sus pedidos (docs/11-RELACIONES.md).
  const [params, setParams] = useSearchParams()
  const abierto = params.get('cliente')

  // Se conserva lo que ya había en la URL (el modo de Clientes): escribir solo
  // `cliente` borraría el modo y saltaría de vuelta a la libreta.
  const abrirFicha = (id: string | null) => {
    const siguiente = new URLSearchParams(params)
    if (id) siguiente.set('cliente', id)
    else siguiente.delete('cliente')
    setParams(siguiente, { replace: !id })
  }

  // Se ordena por lo que de verdad importa: quien más ha comprado arriba. Por
  // fecha de alta, el cliente de cinco pedidos queda enterrado bajo los que
  // nunca compraron.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes
      .filter(c => !q
        || (c.nombre ?? '').toLowerCase().includes(q)
        || (c.document_number ?? '').includes(q)
        || (c.phone ?? '').includes(q))
      .sort((a, b) => b.gastado - a.gastado || b.pedidos - a.pedidos)
  }, [clientes, busca])

  const conCompra = clientes.filter(c => c.pedidos > 0).length

  if (cargando) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
    </div>
  )

  // El error se dice, no se disfraza de "no hay clientes": una lista vacía por
  // un fallo de red haría pensar que la base está vacía.
  if (error) return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-gray-400">No se pudo cargar la lista de clientes.</p>
      <p className="text-xs text-gray-300 mt-1">
        Si acaba de salir el despliegue, puede que <code>list-clients</code> aún no esté publicada.
      </p>
    </div>
  )

  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-3">
        {clientes.length} {clientes.length === 1 ? 'persona' : 'personas'}
        {conCompra > 0 && ` · ${conCompra} con al menos un pedido entregado`}
      </p>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nombre, DNI o teléfono..."
          className="w-full bg-gray-100 rounded-2xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-12">
          <Users size={44} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {clientes.length === 0 ? 'Todavía no hay clientes.' : 'Nadie coincide con esa búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(c => {
            const seg = c.segmento ? SEGMENTO[c.segmento] : undefined
            return (
              <button key={c.id} onClick={() => abrirFicha(c.id)}
                className="w-full bg-white border border-gray-100 rounded-2xl px-3 py-3 flex items-center gap-3 text-left shadow-sm">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 font-black"
                  style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                  {(c.nombre || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm text-gray-800 truncate">{c.nombre || 'Sin nombre'}</p>
                    {c.pedidos >= 2 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={CERRADO}>Recurrente</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{resumenDeCliente(c)}</p>
                  {seg && (
                    <span className="inline-block mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full" style={seg.style}>
                      {seg.label}
                    </span>
                  )}
                </div>
                <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}

      {abierto && (
        <PanelCliente
          // Una ficha por persona: con el mismo componente reusado, el "no se
          // pudo cargar" de un cliente se quedaba pegado al siguiente.
          key={abierto}
          buyerId={abierto}
          adminId={real?.auth_user_id}
          storeId={effective?.store_id}
          onClose={() => abrirFicha(null)}
        />
      )}
    </div>
  )
}
