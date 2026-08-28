import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSeller } from '../../lib/seller-session'
import { useStoreOrders } from '../../lib/store-orders'
import { useIsDesktop } from '../../lib/use-desktop'
import { MODOS, modoDeUrl, pedidoDeUrl, urlConPedido, urlDeModo } from '../../lib/pedidos-modos'
import type { Modo } from '../../lib/pedidos-modos'
import { FILTRO_VACIO, aplicarFiltro } from '../../lib/pedidos-filtro'
import type { Filtro } from '../../lib/pedidos-filtro'
import FiltroPedidos from '../../components/FiltroPedidos'
import PanelPedido from '../../components/PanelPedido'
import PedidosLista from './PedidosLista'
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
  const abierto = pedidoDeUrl(params)
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO)
  // El último pedido que se abrió, aunque ya esté cerrado. Al cerrar el cajón,
  // la lista vuelve a ser cincuenta filas iguales y uno pierde en cuál estaba;
  // el borde marcado es la miga de pan para seguir por donde iba.
  const [ultimoAbierto, setUltimoAbierto] = useState<string | null>(null)

  // El super admin de la plataforma no es una tienda: no tiene pedidos que
  // mirar, tiene marcas que administrar.
  useEffect(() => {
    if (effective?.is_super_admin) navigate('/vendedor/marca', { replace: true })
  }, [effective?.is_super_admin, navigate])

  // UNA lectura para los cuatro modos. Con cancelados porque el tablero los
  // agrupa aparte y el resumen los cuenta en las notas; los modos que no los
  // quieren (lista, mapa) los descartan al pintar, que es gratis.
  const lista = useStoreOrders(effective, { incluirCancelados: true })

  // El filtro también es UNO para los cuatro modos, por la misma razón que la
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
          />
        </div>
      </div>

      {modo === 'lista' && <PedidosLista lista={filtrada} onAbrir={abrir} marcado={marcado} />}
      {modo === 'tablero' && <PedidosTablero lista={filtrada} onAbrir={abrir} marcado={marcado} />}
      {modo === 'mapa' && <PedidosMapa lista={filtrada} />}
      {modo === 'resumen' && <PedidosResumen lista={filtrada} />}

      {abierto && <PanelPedido token={abierto} onCerrar={cerrar} />}
    </div>
  )
}
