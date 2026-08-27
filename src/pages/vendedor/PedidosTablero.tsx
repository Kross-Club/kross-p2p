import { ChevronRight, Package } from 'lucide-react'
import { NOTA_META, CERRADO_SUAVE, NEUTRO, ALERTA } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido, antiguedad } from '../../lib/order-tracking'
import { estaVivo } from '../../lib/store-orders'
import { plataDe, soles } from '../../lib/order-money'
import { horaOFecha } from '../../lib/fechas'
import ScrollHorizontal from '../../components/ScrollHorizontal'
import type { StoreOrder, StoreOrders } from '../../lib/store-orders'

// El tablero es UNA vista: las columnas del eje del pedido (`COLUMNAS` en
// order-tracking), con la mitad de abajo en el idioma del courier. Tuvo un
// interruptor Lista/Kanban y se fue: la "lista" era la misma agrupación puesta
// en vertical, o sea la tercera manera de mirar lo mismo dentro de un modo que
// ya existe para eso. Este archivo tampoco define etapas — tenerlas acá era lo
// que hacía que el CRM mostrara un paso y el chat otro.
//
// §6.1: la etapa la dice la columna, no el color. Solo la última lleva lima.
const etapaChip = (key: string) => (key === 'entregado' ? CERRADO_SUAVE : NEUTRO)

export default function PedidosTablero({ lista, onAbrir }: {
  lista: StoreOrders
  /** Abre el pedido en el panel de la derecha, sin salir del tablero. */
  onAbrir: (token: string) => void
}) {

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
  // Helper y no componente: declarar un componente dentro del render le cambia
  // la identidad en cada pintada.
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
    <button onClick={() => s.token && onAbrir(s.token)} disabled={!s.token}
      className="w-full bg-white border border-gray-100 rounded-2xl p-3 shadow-sm text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold text-gray-800 text-sm truncate">{s.buyer_name || 'Comprador'}</p>
            {/* Cuándo entró: la cohorte a la que pertenece el pedido. Es lo que
                el filtro de arriba recorta, así que se ve en la tarjeta. */}
            <span className="text-[9px] text-gray-300 flex-shrink-0" title="Cuándo entró el pedido">
              {horaOFecha(s.created_at, ahora)}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate">{s.product_name} · {s.pack_name || soles(s.product_price)}</p>
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

  // Se agrupa UNA vez. `columnaDelPedido` garantiza que cada pedido caiga en
  // exactamente una columna.
  const vivos = sessions.filter(estaVivo)
  const porColumna = new Map<string, StoreOrder[]>()
  const caidos: StoreOrder[] = []
  for (const s of vivos) {
    const col = columnaDelPedido(s)
    if (col === 'no_entregado') { caidos.push(s); continue }
    const enLaColumna = porColumna.get(col)
    if (enLaColumna) enLaColumna.push(s)
    else porColumna.set(col, [s])
  }
  const cancelados = sessions.filter(s => !estaVivo(s))

  // Los dos grupos de cierre van al final en vez de omitirse: en una vista de
  // columnas, "no aparece" y "no existe" se leen igual, y un pedido caído que
  // nadie ve es justamente el que hay que recuperar. No están en `COLUMNAS`
  // porque no son pasos del eje — los agrega esta vista.
  const columnas = [
    ...COLUMNAS.map(c => ({ ...c, style: etapaChip(c.key), items: porColumna.get(c.key) ?? [] })),
    ...(caidos.length ? [{ key: 'no_entregado', label: 'No entregados', emoji: '⚠️', style: ALERTA, items: caidos }] : []),
    ...(cancelados.length ? [{ key: 'cancelado', label: 'Cancelados', emoji: '❌', style: ALERTA, items: cancelados }] : []),
  ]

  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs text-gray-400 mb-2">
        {soloMios ? 'Tus pedidos por etapa' : 'Todos los pedidos de la tienda, por etapa'}
        {' · '}
        <span title="Suma del precio de los pedidos que se ven">{soles(plataDe(vivos).valor)} en juego</span>
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
        </div>
      ) : (
        // La barra de arrastre va ARRIBA, pegada a los nombres de las etapas:
        // con nueve columnas y cinco en pantalla, una barra al pie de la
        // columna más larga esconde media operación.
        <ScrollHorizontal className="flex gap-3 pb-4">
          {columnas.map(col => {
            const plata = plataDe(col.items)
            return (
              <div key={col.key} className="flex-shrink-0 w-56">
                {/* Cuántos y CUÁNTO. El conteo dice dónde se atora la operación;
                    la suma dice cuánto cuesta que esté atorada ahí, que es la
                    mitad que decide a qué columna correr primero. */}
                <div className="px-3 py-1.5 rounded-xl mb-2" style={col.style}
                  title={`${col.items.length} pedidos · valor ${soles(plata.valor)} · cobrado ${soles(plata.cobrado)} · por cobrar ${soles(plata.saldo)}`}>
                  <div className="flex items-center justify-between gap-1 text-[11px] font-black">
                    <span className="truncate">{col.emoji} {col.label}</span>
                    <span className="tabular flex-shrink-0">{col.items.length}</span>
                  </div>
                  <div className="text-[10px] font-bold tabular opacity-70">{soles(plata.valor)}</div>
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
            )
          })}
        </ScrollHorizontal>
      )}
    </div>
  )
}
