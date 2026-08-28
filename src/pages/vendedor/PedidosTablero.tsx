import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Crosshair, MessageCircle, Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { NOTA_META, CERRADO_SUAVE, NEUTRO, ALERTA } from '../../lib/order-chips'
import { COLUMNAS, columnaDelPedido, antiguedad, conPlataEnJuego, esAnulado, esperaGuiaManual } from '../../lib/order-tracking'
import { estaVivo } from '../../lib/store-orders'
import { plataDe, soles } from '../../lib/order-money'
import { horaOFecha } from '../../lib/fechas'
import { haciaDonde } from '../../lib/fuera-de-vista'
import type { Direccion } from '../../lib/fuera-de-vista'
import { useSeller } from '../../lib/seller-session'
import { useIsDesktop } from '../../lib/use-desktop'
import { useCompradoresEnLinea } from '../../lib/presencia'
import { useStoreDrafts, nombreDeCurioso, zonaDeCurioso } from '../../lib/store-drafts'
import ScrollHorizontal from '../../components/ScrollHorizontal'
import AnilloAvance from '../../components/AnilloAvance'
import type { StoreOrder, StoreOrders } from '../../lib/store-orders'
import type { Curioso } from '../../lib/store-drafts'

// El tablero es UNA vista: las columnas del eje del pedido (`COLUMNAS` en
// order-tracking), con la mitad de abajo en el idioma del courier. Tuvo un
// interruptor Lista/Kanban y se fue: la "lista" era la misma agrupación puesta
// en vertical, o sea la tercera manera de mirar lo mismo dentro de un modo que
// ya existe para eso. Este archivo tampoco define etapas — tenerlas acá era lo
// que hacía que el CRM mostrara un paso y el chat otro.
//
// §6.1: la etapa la dice la columna, no el color. Solo la última lleva lima.
const etapaChip = (key: string) => (key === 'entregado' ? CERRADO_SUAVE : NEUTRO)

/**
 * La tarjeta de un pedido en el tablero.
 *
 * **A nivel de módulo, no dentro del render.** Declarado ahí adentro, el
 * componente cambia de identidad en cada pintada y React desmonta y vuelve a
 * montar TODAS las tarjetas; con el tablero scrolleando en su propia caja, eso
 * colapsaba su alto por un instante, el navegador recortaba el scroll a cero y
 * la vista saltaba al principio. Se notaba sobre todo en la columna más alta
 * —la única donde uno llega a estar scrolleado hondo— y por eso parecía cosa de
 * "la primera columna".
 *
 * El repo ya lo decía dos veces, en `chipAntiguedad` y en el grupo de cierre;
 * esta era la que se había quedado.
 */
function TarjetaPedido({ s, ahora, enLinea, marcado, chip, onAbrir, refNodo }: {
  s: StoreOrder
  ahora: number
  enLinea: ReadonlySet<string>
  marcado?: string | null
  chip: (s: StoreOrder) => ReactNode
  onAbrir: (token: string) => void
  /** Solo la tarjeta MARCADA lo recibe: es la única que hay que poder
   *  encontrar. Un ref en las cincuenta sería medir cincuenta cosas para
   *  responder por una. */
  refNodo?: (el: HTMLElement | null) => void
}) {
  // El anillo solo desde `confirmado`: antes no hay nada cobrado que mostrar, y
  // un anillo vacío en cada tarjeta de las dos primeras columnas enseña a
  // ignorarlo justo donde después importa.
  const conPlata = conPlataEnJuego(columnaDelPedido(s))
  return (
    <button ref={refNodo} onClick={() => s.token && onAbrir(s.token)} disabled={!s.token}
      className="w-full bg-white rounded-2xl p-3 shadow-sm text-left border"
      style={!!marcado && s.token === marcado
        ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 1px var(--brand)' }
        : { borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold text-gray-800 text-sm truncate flex items-center gap-1.5">
              {!!s.buyer_id && enLinea.has(s.buyer_id) && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" title="En línea ahora"
                  style={{ background: 'var(--ok-fg)' }} />
              )}
              <span className="truncate">{s.buyer_name || 'Comprador'}</span>
            </p>
            {/* Cuándo entró: la cohorte a la que pertenece el pedido. Es lo que
                el filtro de arriba recorta, así que se ve en la tarjeta. */}
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[9px] text-gray-300" title="Cuándo entró el pedido">
                {horaOFecha(s.created_at, ahora)}
              </span>
              {conPlata && <AnilloAvance pedido={s} size={16} />}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate">{s.product_name} · {s.pack_name || soles(s.product_price)}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {s.seller_name && <span className="text-[10px] text-gray-400">Atiende: {s.seller_name.split(' ')[0]}</span>}
            {chip(s)}
            {/* Cobrado y sin guía porque el proveedor la rechazó: no espera a la
                máquina, espera a una persona. Es el atasco más caro y el que
                menos se ve — en la columna se lee igual que uno recién cobrado. */}
            {esperaGuiaManual(s) && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={ALERTA}
                title={s.shalom_order_reason
                  ? `El courier rechazó el registro: ${s.shalom_order_reason}. Hay que emitir la guía a mano.`
                  : 'El courier rechazó el registro. Hay que emitir la guía a mano.'}>
                ⚠️ Guía manual
              </span>
            )}
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
}

/**
 * La tarjeta de un CURIOSO. No es un pedido y no finge serlo.
 *
 * Sin etapa, sin chat y sin vendedor: lo único que hay acá es una persona a la
 * que se puede escribir. Por eso la tarjeta no se abre —no hay nada detrás— y
 * lleva en su lugar el botón que sí sirve: WhatsApp.
 *
 * A nivel de módulo por la misma razón que `TarjetaPedido`: un componente
 * declarado dentro del render cambia de identidad en cada pintada y colapsa el
 * scroll de la columna.
 */
function TarjetaCurioso({ c, ahora, producto }: {
  c: Curioso
  ahora: number
  /** Nombre del producto que miró, si alguna venta de la tienda lo identifica.
   *  El borrador solo guarda el `product_id`, y enseñar un id no es enseñar
   *  nada. */
  producto: string | null
}) {
  const celular = c.phone ? c.phone.slice(-9) : null
  const zona = zonaDeCurioso(c)
  return (
    <div className="w-full bg-white rounded-2xl p-3 shadow-sm border"
      style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold text-gray-800 text-sm truncate">{nombreDeCurioso(c)}</p>
        <span className="text-[9px] text-gray-300 flex-shrink-0" title="Última vez que tocó el formulario">
          {horaOFecha(c.updated_at ?? c.created_at, ahora)}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">
        {producto ?? c.pack_name ?? 'Producto sin identificar'}
      </p>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {c.document_number && (
          <span className="text-[10px] text-gray-400 tabular">DNI {c.document_number}</span>
        )}
        {/* Lo que FALTA, dicho como falta. El área comercial lo completa a mano
            cuando lo convierte, y saber qué le falta a cuál es lo que decide a
            quién llamar primero. */}
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={zona ? NEUTRO : ALERTA}>
          {zona ?? 'sin distrito'}
        </span>
      </div>
      {celular && (
        <a href={`https://wa.me/51${celular}`} target="_blank" rel="noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px]"
          style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
          <MessageCircle size={12} /> Escribir
        </a>
      )}
    </div>
  )
}

/**
 * El puntero al pedido abierto.
 *
 * Aparece SOLO cuando hay un pedido marcado y no se ve. Un botón permanente
 * "ir al pedido" ocuparía sitio las nueve de cada diez veces en que el pedido
 * está delante de los ojos, y se aprendería a ignorar justo para la décima.
 *
 * La flecha apunta hacia donde está de verdad (`haciaDonde`), no a un lado
 * fijo: es lo que convierte "hay uno abierto en alguna parte" en "está a la
 * izquierda". Abajo a la izquierda porque el cajón del pedido entra por la
 * derecha — un puntero debajo del cajón sería un puntero que no se ve.
 */
const FLECHA: Record<Direccion, typeof ArrowUp> = {
  arriba: ArrowUp, abajo: ArrowDown, izquierda: ArrowLeft, derecha: ArrowRight,
}

function PunteroAlMarcado({ direccion, onIr }: { direccion: Direccion; onIr: () => void }) {
  const Flecha = FLECHA[direccion]
  return (
    <button
      onClick={onIr}
      className="fixed bottom-5 left-4 md:left-24 z-30 flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg"
      style={{ background: 'var(--invert)', color: 'var(--invert-fg)' }}
      title="Centrar el pedido que tienes abierto"
    >
      <Crosshair size={14} className="flex-shrink-0" />
      <span className="text-[11px]" style={{ fontWeight: 700 }}>Ir al pedido abierto</span>
      <Flecha size={14} className="flex-shrink-0" />
    </button>
  )
}

export default function PedidosTablero({ lista, onAbrir, marcado }: {
  lista: StoreOrders
  /** Abre el pedido en el panel de la derecha, sin salir del tablero. */
  onAbrir: (token: string) => void
  /** El token del pedido abierto —o del último que lo estuvo—. Se marca su
   *  borde para no perder el sitio al cerrar el cajón. */
  marcado?: string | null
}) {
  const { effective } = useSeller()
  // El mismo puntito verde que la Lista y el chat: quien está mirando la app
  // ahora se atiende distinto —se le escribe, no se le llama—, y eso vale igual
  // en el tablero.
  const enLinea = useCompradoresEnLinea(effective?.store_id)
  const desktop = useIsDesktop()
  // Los curiosos son la primera columna y NO son pedidos: viven en
  // `checkout_drafts` y se leen aparte. Ver `store-drafts.ts`.
  const { curiosos, cargando: cargandoCuriosos } = useStoreDrafts(effective)

  // ── El puntero al pedido abierto ──
  //
  // El borde marcado dice cuál es, pero solo mientras se vea: el tablero
  // scrollea en dos ejes y basta arrastrar un poco para que el pedido abierto
  // quede fuera, sin nada que diga hacia dónde. Esto lo dice, y lo trae.
  const [nodoMarcado, setNodoMarcado] = useState<HTMLElement | null>(null)
  // Etiquetado con el token que lo produjo: al cambiar de pedido, la dirección
  // vieja se descarta sola. Guardarla suelta y limpiarla desde el efecto la
  // borraría un render tarde, y en ese render la flecha apuntaría al anterior.
  const [fuera, setFuera] = useState<{ token: string; dir: Direccion } | null>(null)
  const direccion = marcado && fuera?.token === marcado ? fuera.dir : null

  useEffect(() => {
    if (!nodoMarcado || !marcado) return
    let vivo = true
    let pedido = 0

    // Se guarda solo cuando CAMBIA. Devolver el mismo objeto hace que React se
    // salte el render: sin esto, cada evento de scroll crearía un `{token, dir}`
    // nuevo y repintaría las cien tarjetas del tablero a sesenta por segundo.
    const aplicar = (dir: Direccion | null) => {
      if (!vivo) return
      setFuera(prev => {
        if (!dir) return prev === null ? prev : null
        if (prev && prev.token === marcado && prev.dir === dir) return prev
        return { token: marcado, dir }
      })
    }

    const medir = () => {
      pedido = 0
      if (!vivo) return
      aplicar(haciaDonde(
        nodoMarcado.getBoundingClientRect(),
        { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight },
      ))
    }

    // Una medición por cuadro como mucho: `getBoundingClientRect` obliga al
    // navegador a recalcular el layout, y el scroll dispara muchas más veces de
    // las que se pintan.
    const remedir = () => { if (!pedido) pedido = requestAnimationFrame(medir) }

    // El observador contra la PANTALLA (`root: null`), no contra la caja del
    // tablero: ya recorta por el desborde de los ancestros, así que una tarjeta
    // tapada por su columna cuenta como fuera. Cubre lo que el scroll no ve —
    // que la tarjeta se mueva porque cambió el layout, no la posición.
    const io = new IntersectionObserver(remedir, { threshold: [0, 0.35, 1] })

    // Y el scroll cubre lo que el observador no: solo avisa al CRUZAR un
    // umbral, y arrastrar de "fuera por la izquierda" a "fuera por arriba" no
    // cruza ninguno — la flecha se quedaría apuntando al lado equivocado.
    io.observe(nodoMarcado)
    window.addEventListener('scroll', remedir, true)
    window.addEventListener('resize', remedir)
    // La primera medición también por `remedir` y no directa: medir dentro del
    // efecto sería leer el layout antes de que el navegador haya pintado, y
    // guardar el resultado ahí mismo es la cascada de renders que React 19
    // marca. Un cuadro de espera no se nota.
    remedir()

    return () => {
      vivo = false
      if (pedido) cancelAnimationFrame(pedido)
      io.disconnect()
      window.removeEventListener('scroll', remedir, true)
      window.removeEventListener('resize', remedir)
    }
  }, [nodoMarcado, marcado])

  const irAlMarcado = useCallback(() => {
    nodoMarcado?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [nodoMarcado])

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
  // Anulado ≠ cancelado, y por eso son dos columnas: un cancelado es una venta
  // que existió y se perdió —duele, y cuenta en la conversión—; un anulado
  // nunca fue una venta (error o prueba) y no cuenta en ningún número.
  const cancelados = sessions.filter(s => s.status === 'cancelado')
  const anulados = sessions.filter(esAnulado)

  // Del borrador solo llega el `product_id`. El nombre se saca de los pedidos
  // que ya están en pantalla en vez de pedir el catálogo: si alguien compró ese
  // producto —y si no, la columna no es donde importa— el nombre ya está acá.
  const nombrePorProducto = new Map<string, string>()
  for (const s of sessions) {
    if (s.product_id && s.product_name) nombrePorProducto.set(s.product_id, s.product_name)
  }

  // Los dos grupos de cierre van al final en vez de omitirse: en una vista de
  // columnas, "no aparece" y "no existe" se leen igual, y un pedido caído que
  // nadie ve es justamente el que hay que recuperar. No están en `COLUMNAS`
  // porque no son pasos del eje — los agrega esta vista.
  const columnas = [
    ...COLUMNAS.map(c => ({ ...c, style: etapaChip(c.key), items: porColumna.get(c.key) ?? [] })),
    ...(caidos.length ? [{ key: 'no_entregado', label: 'No entregados', emoji: '⚠️', style: ALERTA, items: caidos }] : []),
    ...(cancelados.length ? [{ key: 'cancelado', label: 'Cancelados', emoji: '❌', style: ALERTA, items: cancelados }] : []),
    ...(anulados.length ? [{ key: 'anulado', label: 'Anulados', emoji: '🚫', style: ALERTA, items: anulados }] : []),
  ]

  // En escritorio el tablero se queda con el alto que le sobra y scrollea él
  // mismo. Dos cosas dependen de eso: que los nombres de las etapas se puedan
  // quedar fijos arriba (`sticky` necesita un contenedor que scrollee) y que la
  // pantalla de atrás no tenga scroll que perder cuando se abre un pedido
  // encima. En móvil no: un área que scrollea dentro de otra, en un teléfono,
  // se pelea con el gesto de la página.
  return (
    <div className={`px-4 pt-3 ${desktop ? 'pb-0 flex flex-col flex-1 min-h-0' : 'pb-4'}`}>
      <p className="text-xs text-gray-400 mb-2 flex-shrink-0">
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
        <ScrollHorizontal lleno={desktop} className="flex gap-3 pb-4">
          {/* CURIOSOS · antes de la primera etapa del pedido.
              Dejaron DNI y WhatsApp y no siguieron. No tienen etapa ni chat, así
              que no entran en `columnas` —que se deriva del eje del pedido— y se
              pintan acá con su propia tarjeta. La columna se muestra siempre,
              incluso vacía: en cero significa "nadie abandonó el formulario", y
              esconderla haría que un embudo con fugas se vea igual que uno sin
              ellas. Sin suma de plata: un curioso no debe nada, y ponerle precio
              a lo que nadie pidió infla el número que decide la operación. */}
          <div className="flex-shrink-0 w-56">
            <div className="sticky top-0 z-10 pb-2" style={{ background: 'var(--surface-2)' }}>
              <div className="px-3 py-1.5 rounded-xl" style={NEUTRO}
                title="Dejaron DNI y WhatsApp y no terminaron el formulario. Se les puede escribir; el distrito y la agencia los completa el área comercial.">
                <div className="flex items-center justify-between gap-1 text-[11px] font-black">
                  <span className="truncate">👀 Curiosos</span>
                  <span className="tabular flex-shrink-0">{curiosos.length}</span>
                </div>
                <div className="text-[10px] font-bold opacity-70">por contactar</div>
              </div>
            </div>
            <div className="space-y-2">
              {curiosos.map(c => (
                <TarjetaCurioso key={c.order_id} c={c} ahora={ahora}
                  producto={(c.product_id && nombrePorProducto.get(c.product_id)) || null} />
              ))}
              {!cargandoCuriosos && curiosos.length === 0 && (
                <div className="bg-gray-50 rounded-xl p-4 text-center text-[10px] text-gray-300 flex flex-col items-center gap-1">
                  <Package size={16} className="opacity-40" /> vacío
                </div>
              )}
            </div>
          </div>

          {columnas.map(col => {
            const plata = plataDe(col.items)
            return (
              <div key={col.key} className="flex-shrink-0 w-56">
                {/* Cuántos y CUÁNTO. El conteo dice dónde se atora la operación;
                    la suma dice cuánto cuesta que esté atorada ahí, que es la
                    mitad que decide a qué columna correr primero.

                    Se queda pegado arriba al bajar: con columnas de veinte
                    tarjetas, a mitad de scroll uno ya no sabe qué etapa está
                    mirando. El fondo sólido es del envoltorio, no del chip —
                    varios chips son translúcidos y las tarjetas se verían
                    pasar por debajo. */}
                <div className="sticky top-0 z-10 pb-2"
                  style={{ background: 'var(--surface-2)' }}>
                  <div className="px-3 py-1.5 rounded-xl" style={col.style}
                    title={`${col.items.length} pedidos · valor ${soles(plata.valor)} · cobrado ${soles(plata.cobrado)} · por cobrar ${soles(plata.saldo)}`}>
                    <div className="flex items-center justify-between gap-1 text-[11px] font-black">
                      <span className="truncate">{col.emoji} {col.label}</span>
                      <span className="tabular flex-shrink-0">{col.items.length}</span>
                    </div>
                    <div className="text-[10px] font-bold tabular opacity-70">{soles(plata.valor)}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {col.items.map(s => (
                    <TarjetaPedido key={s.id} s={s} ahora={ahora} enLinea={enLinea} marcado={marcado}
                      chip={chipAntiguedad} onAbrir={onAbrir}
                      refNodo={s.token && s.token === marcado ? setNodoMarcado : undefined} />
                  ))}
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

      {direccion && <PunteroAlMarcado direccion={direccion} onIr={irAlMarcado} />}
    </div>
  )
}
