import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Package } from 'lucide-react'
import { NOTA_META, CERRADO_SUAVE, NEUTRO, ALERTA } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido, antiguedad } from '../../lib/order-tracking'
import { estaVivo } from '../../lib/store-orders'
import type { StoreOrder, StoreOrders } from '../../lib/store-orders'

// Las columnas son el eje del pedido (`COLUMNAS` en order-tracking), con la
// mitad de abajo en el idioma del courier. Este archivo ya NO define etapas:
// tenerlas acá era lo que hacía que el CRM mostrara un paso y el chat otro.
// §6.1: la etapa la dice la columna, no el color. Solo la última lleva lima.
const etapaChip = (key: string) => (key === 'entregado' ? CERRADO_SUAVE : NEUTRO)



export default function PedidosTablero({ lista }: { lista: StoreOrders }) {
  const navigate = useNavigate()
  const [view, setView] = useState<'lista' | 'kanban'>('lista')

  // `leidoEn` es el instante en que llegaron los datos: medir la antigüedad
  // contra eso —y no contra cada pintada— hace que todas las tarjetas cuenten
  // desde el mismo punto y mantiene el render puro.
  const { pedidos: sessions, cargando: loading, leidoEn: ahora, soloMios } = lista

  // Cuánto lleva parado. Con las columnas en el idioma del courier, el dato que
  // decide es el tiempo, no el conteo: dos días en `registrado` es un paquete
  // que nunca salió del almacén; cinco en `en destino` es plata esperando que
  // el cliente vaya a recoger. El rojo lo reserva la demora que reporta el
  // courier — el único atraso que no estamos infiriendo nosotros.
  //
  // Solo se pinta desde 1 día: "0d" en todo el tablero es ruido.
  // Helper y no componente, igual que `grupoDeCierre`: declarar un componente
  // dentro del render le cambia la identidad en cada pintada.
  const chipAntiguedad = (s: StoreOrder) => {
    const a = antiguedad(s, ahora)
    if (!a || (a.dias < 1 && !a.demorado)) return null
    const courier = s.tracking_courier ?? s.agency_name ?? 'El courier'
    return (
      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
        style={a.demorado ? ALERTA : NEUTRO}
        title={a.demorado
          ? `${courier} reporta demora en este envío`
          : a.exacta
            ? 'Tiempo en esta etapa'
            : 'Desde que entró el pedido — esta etapa no tiene fecha propia'}>
        {a.demorado && '⚠️ '}{a.exacta ? '' : '~'}{a.dias}d
      </span>
    )
  }

  const Card = ({ s }: { s: StoreOrder }) => (
    <button onClick={() => navigate(`/vendedor/pedido/${s.token}`)}
      className="w-full bg-white border border-gray-100 rounded-2xl p-3 shadow-sm text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{s.buyer_name || 'Comprador'}</p>
          <p className="text-xs text-gray-400 truncate">{s.product_name} · {s.pack_name || `S/ ${s.product_price}`}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {s.seller_name && <span className="text-[10px] text-gray-400">Atiende: {s.seller_name.split(' ')[0]}</span>}
            {chipAntiguedad(s)}
            {s.nota && NOTA_META[s.nota] && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={NOTA_META[s.nota].style}>
                {NOTA_META[s.nota].label}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
      </div>
    </button>
  )

  // Se agrupa UNA vez y las dos vistas (lista y kanban) leen el mismo mapa: si
  // cada una filtrara por su cuenta volveríamos a poder mostrar dos verdades.
  // `columnaDelPedido` garantiza que cada pedido caiga en exactamente una.
  const vivos = sessions.filter(estaVivo)
  const porColumna = new Map<string, StoreOrder[]>()
  const caidos: StoreOrder[] = []
  for (const s of vivos) {
    const col = columnaDelPedido(s)
    if (col === 'no_entregado') { caidos.push(s); continue }
    const lista = porColumna.get(col)
    if (lista) lista.push(s)
    else porColumna.set(col, [s])
  }
  const cancelados = sessions.filter(s => !estaVivo(s))

  // El kanban arrastra los dos grupos de cierre al final en vez de omitirlos:
  // en la vista de columnas, "no aparece" y "no existe" se leen igual, y un
  // pedido caído que nadie ve es justamente el que hay que recuperar. No están
  // en `COLUMNAS` porque no son pasos del eje — los agrega esta vista.
  const columnasKanban = [
    ...COLUMNAS.map(c => ({ ...c, style: etapaChip(c.key), items: porColumna.get(c.key) ?? [] })),
    ...(caidos.length ? [{ key: 'no_entregado', label: 'No entregados', emoji: '⚠️', style: ALERTA, items: caidos }] : []),
    ...(cancelados.length ? [{ key: 'cancelado', label: 'Cancelados', emoji: '❌', style: ALERTA, items: cancelados }] : []),
  ]

  // Grupo de cierre: ni el fracaso ni la cancelación son un paso del eje, así
  // que van aparte. Es un helper y no un componente a propósito — declarar un
  // componente dentro del render le cambia la identidad en cada pintada.
  const grupoDeCierre = (titulo: string, style: typeof ALERTA, items: StoreOrder[]) =>
    items.length === 0 ? null : (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-black px-3 py-1 rounded-full" style={style}>{titulo}</span>
          <span className="text-xs text-gray-400 font-semibold">{items.length}</span>
        </div>
        <div className="space-y-2">{items.map(s => <Card key={s.id} s={s} />)}</div>
      </div>
    )

  return (
    <div className="px-4 pt-3 pb-4">
      {/* Lista y Kanban son la misma agrupación con otra forma, así que van
          como sub-control del modo, no como un modo más. */}
      <div className="flex items-center justify-end mb-1">
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          <button onClick={() => setView('lista')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>Lista</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>Kanban</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">{soloMios ? 'Tus pedidos por etapa' : 'Todos los pedidos de la tienda, por etapa'}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
        </div>
      ) : view === 'lista' ? (
        <div className="space-y-5">
          {COLUMNAS.map(col => {
            const items = porColumna.get(col.key) ?? []
            return (
              <div key={col.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black px-3 py-1 rounded-full" style={etapaChip(col.key)}>
                    {col.emoji} {col.label}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-[11px] text-gray-300 pl-1">Sin pedidos</p>
                ) : (
                  <div className="space-y-2">{items.map(s => <Card key={s.id} s={s} />)}</div>
                )}
              </div>
            )
          })}
          {grupoDeCierre('⚠️ No entregados', ALERTA, caidos)}
          {grupoDeCierre('❌ Cancelados / notas', ALERTA, cancelados)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columnasKanban.map(col => (
            <div key={col.key} className="flex-shrink-0 w-56">
              <div className="text-[11px] font-black px-3 py-1.5 rounded-xl mb-2 text-center" style={col.style}>
                {col.emoji} {col.label} ({col.items.length})
              </div>
              <div className="space-y-2">
                {col.items.map(s => <Card key={s.id} s={s} />)}
                {col.items.length === 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 text-center text-[10px] text-gray-300 flex flex-col items-center gap-1">
                    <Package size={16} className="opacity-40" /> vacío
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
