import { CalendarRange, Search, SlidersHorizontal, X } from 'lucide-react'
import { FILTRO_VACIO, RANGOS, cuantosFiltros, opcionesDe, resumenDelRango } from '../lib/pedidos-filtro'
import type { ReactNode } from 'react'
import type { Filtro, RangoKey } from '../lib/pedidos-filtro'
import type { StoreOrder } from '../lib/store-orders'

// ─── El filtro de Pedidos, en una barra ──────────────────────────────────────
//
// Va abierto y no detrás de un botón: un filtro escondido que quedó encendido
// es la forma más rápida de creer que la tienda dejó de vender. Lo que sí se
// pliega es el calendario a mano, que es lo que casi nunca se usa.
//
// Se pinta con las opciones que EXISTEN en la lista (`opcionesDe`), así que un
// vendedor sin pedidos esta semana no aparece para filtrar a una pantalla vacía.

export default function FiltroPedidos({ filtro, onCambio, base, mostrados, extra }: {
  filtro: Filtro
  onCambio: (f: Filtro) => void
  /** La lista SIN filtrar: de ahí salen las opciones. Con la lista ya filtrada,
   *  elegir a un vendedor borraría del desplegable a todos los demás. */
  base: StoreOrder[]
  mostrados: number
  /** Lo que la pantalla quiera colgar al final de la barra, pegado a la
   *  derecha. Hoy es el botón que centra el pedido seleccionado, que solo tiene
   *  sentido en el Tablero — por eso lo pone quien sabe si el Tablero está
   *  puesto, y no esta barra. */
  extra?: ReactNode
}) {
  const { vendedores, productos } = opcionesDe(base)
  const puestos = cuantosFiltros(filtro)
  const aMano = filtro.rango === 'rango'

  const set = (parche: Partial<Filtro>) => onCambio({ ...filtro, ...parche })
  const rango = (key: RangoKey) => set({ rango: key, ...(key === 'rango' ? {} : { desde: '', hasta: '' }) })

  const chip = (activo: boolean) => ({
    background: activo ? 'var(--brand-tint)' : 'transparent',
    color: activo ? 'var(--brand)' : 'var(--text-faint)',
    fontWeight: activo ? 700 : 500,
  })

  const select = 'text-xs rounded-lg px-2 py-1 outline-none max-w-[9.5rem] truncate'
  const selectStyle = { background: 'var(--surface-3)', color: 'var(--text)', border: '0.5px solid var(--border)' }

  return (
    // Envuelve en vez de scrollear: en el móvil son dos líneas, y un filtro
    // que se sale de la pantalla es un filtro que nadie va a quitar.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {/* Primero el buscador y después las rebanadas: los desplegables rebanan
          —"los de Milagros", "los de esta semana"— y esto ENCUENTRA. Cuando uno
          llega con un nombre o una guía en la mano, no viene a rebanar. */}
      <div className="relative flex-shrink-0">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-faint)' }} />
        <input
          type="search"
          value={filtro.busca}
          onChange={e => set({ busca: e.target.value })}
          placeholder="Nombre, N° de pedido, DNI, teléfono o guía"
          aria-label="Buscar un pedido"
          className="text-xs rounded-lg pl-7 pr-2 py-1 outline-none w-[16rem] max-w-full"
          style={selectStyle}
        />
      </div>

      <SlidersHorizontal size={13} className="flex-shrink-0" style={{ color: 'var(--text-faint)' }} />

      <div className="flex items-center gap-0.5 rounded-xl p-0.5 flex-shrink-0" style={{ background: 'var(--surface-3)' }}>
        {RANGOS.map(r => (
          <button key={r.key} type="button" onClick={() => rango(r.key)}
            aria-pressed={filtro.rango === r.key}
            className="text-[11px] px-2 py-1 rounded-lg transition-colors"
            style={chip(filtro.rango === r.key)}>
            {r.label}
          </button>
        ))}
        <button type="button" onClick={() => rango(aMano ? 'todo' : 'rango')}
          aria-pressed={aMano}
          title="Elegir fechas exactas"
          aria-label="Elegir fechas exactas"
          className="px-2 py-1 rounded-lg transition-colors flex items-center"
          style={chip(aMano)}>
          <CalendarRange size={13} />
        </button>
      </div>

      {aMano && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input type="date" value={filtro.desde} max={filtro.hasta || undefined}
            aria-label="Desde"
            onChange={e => set({ desde: e.target.value })}
            className={select} style={selectStyle} />
          <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>→</span>
          <input type="date" value={filtro.hasta} min={filtro.desde || undefined}
            aria-label="Hasta"
            onChange={e => set({ hasta: e.target.value })}
            className={select} style={selectStyle} />
        </div>
      )}

      {vendedores.length > 1 && (
        <select value={filtro.vendedor} onChange={e => set({ vendedor: e.target.value })}
          aria-label="Filtrar por quien atiende"
          className={`${select} flex-shrink-0`} style={selectStyle}>
          <option value="">Todo el equipo</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      )}

      {productos.length > 1 && (
        <select value={filtro.producto} onChange={e => set({ producto: e.target.value })}
          aria-label="Filtrar por producto"
          className={`${select} flex-shrink-0`} style={selectStyle}>
          <option value="">Todos los productos</option>
          {productos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {puestos > 0 && (
        <button type="button" onClick={() => onCambio(FILTRO_VACIO)}
          className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          title={`${resumenDelRango(filtro)} · quitar el filtro`}>
          <X size={12} /> Quitar
        </button>
      )}

      {/* El conteo va SIEMPRE que haya filtro puesto: es lo que separa "no hay
          pedidos" de "no hay pedidos con este filtro". */}
      {puestos > 0 && (
        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
          {mostrados} de {base.length}
        </span>
      )}

      {/* Pegado a la derecha del todo: no es un filtro, así que no debe leerse
          como uno más de la fila. `ml-auto` se lo come todo el espacio que
          sobre; si la barra envuelve, baja solo y sigue a la derecha. */}
      {extra && <div className="ml-auto flex-shrink-0">{extra}</div>}
    </div>
  )
}
