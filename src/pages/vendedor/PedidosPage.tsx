import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSeller } from '../../lib/seller-session'
import { useStoreOrders } from '../../lib/store-orders'
import { useIsDesktop } from '../../lib/use-desktop'
import { MODOS, modoDeUrl, pedidoDeUrl, urlConPedido, urlDeModo } from '../../lib/pedidos-modos'
import type { Modo } from '../../lib/pedidos-modos'
import { FILTRO_VACIO, aplicarFiltro } from '../../lib/pedidos-filtro'
import { usePunteroAlMarcado } from '../../lib/puntero-marcado'
import { datosDeFila, vistaQueContiene, VISTA_INICIAL } from '../../lib/bandeja'
import type { Vista } from '../../lib/bandeja'
import { useFavoritos } from '../../lib/favoritos'
import type { Filtro } from '../../lib/pedidos-filtro'
import FiltroPedidos from '../../components/FiltroPedidos'
import PunteroAlPedido from '../../components/PunteroAlPedido'
import PanelPedido from '../../components/PanelPedido'
import PedidosLista from './PedidosLista'
import PedidosTablero from './PedidosTablero'
import PedidosResumen from './PedidosResumen'
import { administraLaPlataforma } from '../../../supabase/functions/_shared/alcance.ts'

// ─── Pedidos: una pantalla, tres maneras de mirarla ──────────────────────────
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
  const abierto = pedidoDeUrl(params)
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO)
  // El último pedido que se abrió, aunque ya esté cerrado. Al cerrar el cajón,
  // la lista vuelve a ser cincuenta filas iguales y uno pierde en cuál estaba;
  // el borde marcado es la miga de pan para seguir por donde iba.
  const [ultimoAbierto, setUltimoAbierto] = useState<string | null>(null)

  // La plataforma no es una tienda: quien la administra —el dueño o un
  // operador de Kross— no tiene pedidos que mirar, tiene tiendas que
  // administrar. Mandarlo a una lista vacía haría pensar que la vista está rota.
  //
  // Se calcula FUERA del efecto para que su dependencia sea un booleano: con el
  // objeto entero, cada respuesta del perfil lo volvería a disparar.
  const enLaPlataforma = administraLaPlataforma(effective)
  useEffect(() => {
    if (enLaPlataforma) navigate('/vendedor/marca', { replace: true })
  }, [enLaPlataforma, navigate])

  // UNA lectura para los tres modos. Con cancelados porque el tablero los
  // agrupa aparte y el resumen los cuenta en las notas; la lista los descarta
  // al pintar, que es gratis.
  const lista = useStoreOrders(effective, { incluirCancelados: true })

  // El filtro también es UNO para los tres modos, por la misma razón que la
  // lectura: si cada vista filtrara por su cuenta, el tablero de "esta semana"
  // y el resumen de "todo" convivirían en pantalla sin que nada avise que están
  // contando cosas distintas. Se mide contra `leidoEn` —el instante en que
  // llegaron los datos— para que "hoy" no se mueva entre pintadas.
  //
  // Se memoiza contra las piezas y no contra `lista` —que es un objeto nuevo en
  // cada pintada— para que la lista filtrada conserve su identidad: varias
  // vistas derivan de ella dentro de un `useMemo`, y un array nuevo por render
  // los volvería a disparar todos sin que nada haya cambiado.
  const filtrados = useMemo(
    () => aplicarFiltro(lista.pedidos, filtro, lista.leidoEn),
    [lista.pedidos, filtro, lista.leidoEn],
  )
  const filtrada = { ...lista, pedidos: filtrados }

  // `replace` para que los cambios de modo no llenen el historial: el "atrás"
  // debe sacarte de Pedidos, no pasearte por los modos que probaste. El pedido
  // abierto se conserva: cambiar de modo con un pedido en pantalla no debería
  // cerrarlo.
  const irA = (m: Modo) => setParams(urlConPedido(m, abierto), { replace: true })

  // Abrir SÍ apila —así "atrás" cierra el panel, que es lo que uno espera de
  // algo que se abrió encima—; cerrar no, para no dejar un paso vacío detrás.
  const abrir = (token: string) => {
    setUltimoAbierto(token)
    setParams(urlConPedido(modo, token))
  }
  const cerrar = () => setParams(urlDeModo(modo), { replace: true })

  // Mientras el pedido está abierto lo marca su propio token; al cerrarse queda
  // el último. Uno solo, y no una lista de visitados: la pregunta es "¿dónde
  // estaba?", y varias marcas no la responden — la reparten.
  const marcado = abierto ?? ultimoAbierto

  // ── El botón que trae de vuelta al pedido seleccionado ──
  //
  // La fila la pintan el Tablero y la Lista; el botón vive en la barra de
  // filtros, una capa más arriba. Por eso el nodo sube hasta acá, que es el
  // único sitio donde las dos cosas se ven a la vez. En Resumen no hay fila que
  // entregar, así que `nodoMarcado` se queda en `null` y el botón no sale — sin
  // que ninguna de las pantallas tenga que saber que existe.
  //
  // En la Lista funciona aunque el pedido esté más allá de las cien filas
  // pintadas: la ventana se estira hasta alcanzarlo (`cuantasPintar`), así que
  // la fila marcada siempre existe y siempre hay a dónde ir.
  const [nodoMarcado, setNodoMarcado] = useState<HTMLElement | null>(null)
  const puntero = usePunteroAlMarcado(nodoMarcado, marcado)

  // La VISTA de la bandeja vive acá, con el modo y el filtro, y no dentro de la
  // Lista. Subió por el botón de arriba: cada vista recorta distinto, así que
  // si el pedido seleccionado está en "Sin responder" y uno se fue a
  // "Favoritos", en la pantalla no hay ninguna fila a la que llevarlo — el
  // botón se quedaba quieto y parecía roto. Para llevarlo hay que CAMBIAR de
  // vista, y eso lo tiene que poder hacer quien pinta el botón.
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)
  const favoritos = useFavoritos(effective?.store_id)

  /**
   * Ir al pedido seleccionado, esté donde esté.
   *
   * Si hace falta cambia de vista primero. El desplazamiento no se pierde: el
   * puntero anota la petición y la cumple en cuanto la fila aparece, un
   * instante después (ver `usePunteroAlMarcado`).
   *
   * Se calcula solo para el pedido marcado, no para la lista entera: es una
   * fila, y hacerlo al pulsar y no en cada pintada.
   */
  const irAlMarcado = () => {
    const suyo = marcado ? filtrada.pedidos.find(p => p.token === marcado) : null
    if (suyo) {
      // `sinLeer` en 0 a propósito: ninguna de las cinco vistas recorta por
      // mensajes sin leer, así que no cambia en cuál cae.
      const donde = vistaQueContiene(datosDeFila(suyo, lista.leidoEn, 0, favoritos.has(suyo.id)))
      if (donde !== vista) setVista(donde)
    }
    puntero.ir()
  }

  // El tablero en escritorio se queda con el alto que le sobra y scrollea él
  // mismo (ver PedidosTablero): para eso esta pantalla tiene que ser una
  // columna con alto definido. Los otros modos scrollean la página, como
  // siempre — meterlos a todos en una caja propia les cambiaría el gesto sin
  // que nadie lo haya pedido.
  const tableroLleno = desktop && modo === 'tablero'

  return (
    <div className={tableroLleno ? 'flex flex-col h-full min-h-0' : ''}>
      {/* En escritorio el marco del panel ya rotula la sección ("Pedidos" sale
          de seller-nav); en móvil no hay más título que este. */}
      <div className={`${desktop ? 'px-6 pt-5' : 'px-4 pt-4'}${tableroLleno ? ' flex-shrink-0' : ''}`}>
        {!desktop && <h1 className="text-xl font-black text-gray-900 mb-3">Pedidos</h1>}

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

        <div className="mt-2">
          <FiltroPedidos
            filtro={filtro}
            onCambio={setFiltro}
            base={lista.pedidos}
            mostrados={filtrada.pedidos.length}
            extra={marcado && modo !== 'resumen'
              ? <PunteroAlPedido direccion={puntero.direccion} onIr={irAlMarcado} />
              : undefined}
          />
        </div>
      </div>

      {modo === 'lista' && (
        <PedidosLista lista={filtrada} onAbrir={abrir} marcado={marcado} refMarcado={setNodoMarcado}
          vista={vista} onVista={setVista} />
      )}
      {modo === 'tablero' && <PedidosTablero lista={filtrada} onAbrir={abrir} marcado={marcado} refMarcado={setNodoMarcado} />}
      {modo === 'resumen' && <PedidosResumen lista={filtrada} />}

      {abierto && <PanelPedido token={abierto} onCerrar={cerrar} />}
    </div>
  )
}
