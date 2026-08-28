import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { useSeller } from '../lib/seller-session'
import { useDemo } from '../lib/demo/modo-demo'
import { useStoreEntregas } from '../lib/store-entregas'
import { proyector, caminoDe } from '../lib/mapa-peru'
import type { Caja } from '../lib/mapa-peru'
import { agruparPorDistrito, productosDe, filtrarPorProducto, radioDe, indicePadron, ubicadorDe } from '../lib/mapa-entregas'
import type { CatalogosGeo, DistritoEntregas, DistritoPadron, Ubicacion } from '../lib/mapa-entregas'
import { soles } from '../lib/order-money'

// ─── El Perú, con lo que se entregó en cada distrito ─────────────────────────
//
// Reemplaza al mapa de "En vivo" que vivía en Pedidos, y no es el mismo mapa
// con otros datos: aquel pintaba una posición inventada —la caja deslizándose
// por la recta entre dos sedes, que ni es la ruta ni la reporta nadie— y este
// pinta un hecho consumado. Un pedido entregado en Chimbote estuvo en Chimbote.
//
// Sobre lo ENTREGADO y no sobre lo pedido: un distrito con veinte pedidos y
// cinco entregas no es demanda, es un problema de logística disfrazado de
// demanda.
//
// La geografía se resuelve acá, con los catálogos que el checkout ya carga:
//
//   · recojo en agencia → la SEDE. Trae distrito, departamento y coordenadas
//     exactas. Es el caso de casi todo lo que despacha Kross hoy.
//   · a domicilio → la dirección escrita, leída contra el padrón del INEI y
//     colocada en el centroide del distrito.
//
// Lo que no se puede ubicar se cuenta aparte y se dice, en vez de desaparecer.

const ANCHO = 420
const ALTO = 560

interface Territorio {
  caja: Caja
  anillo: number[][]
  provincias: { id: string; puntos: number[][] }[]
  departamentos: { id: string; puntos: number[][] }[]
}

interface Catalogos extends CatalogosGeo {
  territorio: Territorio
}

/**
 * Los catálogos del mapa, una sola vez por sesión.
 *
 * Son ~500 KB entre sedes, padrón, celdas y centroides, y ya se cargan
 * diferidos en el checkout. Se cachea en el módulo para que abrir y cerrar la
 * libreta no los vuelva a pedir.
 */
let cache: Promise<Catalogos> | null = null
function catalogos(): Promise<Catalogos> {
  cache ??= Promise.all([
    import('../data/coverage/region-cells.json'),
    import('../data/coverage/peru-outline.json'),
    import('../data/coverage/district-centroids.json'),
    import('../data/coverage/peru-districts.json'),
    import('../data/agencies/shalom.json'),
    import('../data/agencies/olva.json'),
  ]).then(([celdas, silueta, centros, distritos, sh, ol]) => {
    const c = celdas.default as unknown as { caja: Caja; provincias: Territorio['provincias']; departamentos: Territorio['departamentos'] }
    const s = silueta.default as unknown as { anillos: number[][][] }
    const ce = centros.default as unknown as { districts: Record<string, { lat: number; lng: number }> }
    const pd = distritos.default as unknown as { districts: DistritoPadron[] }

    const sedes = new Map<string, Ubicacion>()
    const cargar = (m: { default: unknown }, courier: string) => {
      const branches = (m.default as { branches: { id: string; district: string; department: string; lat?: number; lng?: number }[] }).branches
      for (const b of branches) {
        if (b.lat == null || b.lng == null) continue
        sedes.set(`${courier}:${b.id}`, {
          distrito: b.district, departamento: b.department, lat: b.lat, lng: b.lng,
        })
      }
    }
    cargar(sh, 'SHALOM')
    cargar(ol, 'OLVA')

    return {
      territorio: { caja: c.caja, provincias: c.provincias, departamentos: c.departamentos, anillo: s.anillos[0] },
      sedes,
      padron: indicePadron(pd.districts),
      centroides: ce.districts,
    }
  })
  return cache
}

export default function MapaEntregas() {
  const { real, effective } = useSeller()
  const demo = useDemo(effective?.store_id)
  const { grupos, entregados, truncado, cargando, error } = useStoreEntregas(real, effective)
  const [cat, setCat] = useState<Catalogos | null>(null)
  const [producto, setProducto] = useState<string | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    catalogos().then(c => { if (vivo) setCat(c) })
    return () => { vivo = false }
  }, [])

  const productos = useMemo(() => productosDe(grupos), [grupos])

  // Dónde cae cada grupo. La regla vive en `mapa-entregas` y no acá para que el
  // demo ubique EXACTAMENTE igual que la pantalla: con dos copias, el mapa de
  // ejemplo podría verse bien mientras el real deja todo sin ubicar.
  const ubicar = useMemo(() => (cat ? ubicadorDe(cat) : null), [cat])

  const mapa = useMemo(() => {
    if (!ubicar) return null
    return agruparPorDistrito(filtrarPorProducto(grupos, producto), ubicar)
  }, [grupos, producto, ubicar])

  const proyeccion = useMemo(
    () => (cat ? proyector(cat.territorio.caja, ANCHO, ALTO) : null),
    [cat],
  )

  if (error) {
    return (
      <Marco>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No se pudo cargar el mapa de entregas.
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
          Si acaba de salir el despliegue, puede que <code>delivery-map</code> aún no esté publicada.
        </p>
      </Marco>
    )
  }

  if (!cat || !proyeccion || !mapa || (cargando && !grupos.length)) {
    return (
      <Marco>
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
        </div>
      </Marco>
    )
  }

  const { x, y } = proyeccion
  const maximo = mapa.distritos[0]?.pedidos ?? 0
  const detalle = mapa.distritos.find(d => d.key === elegido) ?? null

  return (
    <Marco>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm" style={{ color: 'var(--text)', fontWeight: 700 }}>Dónde se entrega</h2>
        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          {mapa.distritos.length} {mapa.distritos.length === 1 ? 'distrito' : 'distritos'}
        </span>
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
        Pedidos <b style={{ color: 'var(--text-muted)' }}>entregados</b>, no pedidos hechos: el punto
        grande es donde de verdad llegó la mercadería.
      </p>

      {/* El filtro. Es de PRODUCTO porque es la pregunta que cambia la decisión:
          dónde funciona cada cosa no es lo mismo que dónde funciona la marca. */}
      {productos.length > 1 && (
        <div className="flex gap-1 flex-wrap mb-3">
          <Chip activo={producto === null} onClick={() => setProducto(null)}>Todos</Chip>
          {productos.map(p => (
            <Chip key={p.id} activo={producto === p.id} onClick={() => setProducto(p.id)}>
              {p.nombre} <span className="tabular opacity-60">{p.pedidos}</span>
            </Chip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Dato valor={mapa.pedidos.toLocaleString('es-PE')} etiqueta="Pedidos entregados" />
        <Dato valor={soles(mapa.valor)} etiqueta="Facturado" />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--k-ink)', border: '0.5px solid var(--border)' }}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-auto block">
          <defs>
            <clipPath id="k-peru-entregas"><path d={caminoDe(cat.territorio.anillo, x, y)} /></clipPath>
          </defs>

          <path d={caminoDe(cat.territorio.anillo, x, y)} fill="var(--surface)" />
          <g clipPath="url(#k-peru-entregas)">
            {cat.territorio.provincias.map(c => (
              <polygon key={c.id} points={c.puntos.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                fill="none" stroke="var(--border)" strokeWidth="0.6" />
            ))}
            {cat.territorio.departamentos.map(c => (
              <polygon key={c.id} points={c.puntos.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                fill="none" stroke="var(--border-strong)" strokeWidth="1" />
            ))}
          </g>
          <path d={caminoDe(cat.territorio.anillo, x, y)} fill="none" stroke="var(--border-strong)" strokeWidth="1.2" />

          {/* Los distritos vienen de mayor a menor, así que el chico se pinta
              encima del grande: si no, Lima tapa al Callao. */}
          {mapa.distritos.map(d => (
            <Punto key={d.key} d={d} maximo={maximo} cx={x(d.lng)} cy={y(d.lat)}
              elegido={d.key === elegido}
              onClick={() => setElegido(d.key === elegido ? null : d.key)} />
          ))}
        </svg>
      </div>

      {/* Lo que el mapa NO pudo colocar. Un total en la esquina que no cuadra
          con la suma de los puntos destruye la confianza en toda la pantalla. */}
      {mapa.sinUbicar.pedidos > 0 && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--text-faint)' }}>
          {mapa.sinUbicar.pedidos} {mapa.sinUbicar.pedidos === 1 ? 'pedido' : 'pedidos'} sin ubicar
          {' '}({soles(mapa.sinUbicar.valor)}): la dirección no dice de qué distrito es.
        </p>
      )}
      {truncado && (
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>
          Se leyeron los {entregados.toLocaleString('es-PE')} pedidos entregados más recientes: hay más
          historia detrás, así que estos números son un piso.
        </p>
      )}

      <div className="mt-3">
        {detalle
          ? <Ficha d={detalle} onCerrar={() => setElegido(null)} />
          : (
            <>
              <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Los que más reciben
              </p>
              <div className="space-y-1">
                {mapa.distritos.slice(0, 5).map(d => (
                  <button key={d.key} onClick={() => setElegido(d.key)}
                    className="w-full flex items-baseline justify-between gap-2 text-left px-2 py-1 rounded-lg">
                    <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {d.distrito} <span style={{ color: 'var(--text-faint)' }}>· {d.departamento}</span>
                    </span>
                    <span className="text-[11px] tabular flex-shrink-0" style={{ color: 'var(--text)' }}>
                      {d.pedidos}
                    </span>
                  </button>
                ))}
                {mapa.distritos.length === 0 && (
                  <p className="text-[11px] py-2" style={{ color: 'var(--text-faint)' }}>
                    {demo ? 'Sin entregas de ejemplo.' : 'Todavía no hay pedidos entregados que ubicar.'}
                  </p>
                )}
              </div>
            </>
          )}
      </div>
    </Marco>
  )
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
      {children}
    </div>
  )
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-3)' }}>
      <p className="text-lg leading-none tabular" style={{ color: 'var(--text)', fontWeight: 500 }}>{valor}</p>
      <p className="text-[10px] uppercase tracking-wide mt-1" style={{ color: 'var(--text-faint)' }}>{etiqueta}</p>
    </div>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={activo}
      className="px-2.5 py-1 rounded-full text-[11px] transition-colors"
      style={activo
        ? { background: 'var(--invert)', color: 'var(--invert-fg)', fontWeight: 700 }
        : { background: 'var(--surface-3)', color: 'var(--text-muted)', fontWeight: 500 }}>
      {children}
    </button>
  )
}

/**
 * Un distrito. El área del círculo es proporcional a los pedidos —no el radio—
 * porque el área es lo que el ojo lee como cantidad (`radioDe`).
 *
 * A nivel de módulo, como las tarjetas del tablero: un componente declarado
 * dentro del render cambia de identidad en cada pintada.
 */
function Punto({ d, maximo, cx, cy, elegido, onClick }: {
  d: DistritoEntregas
  maximo: number
  cx: number
  cy: number
  elegido: boolean
  onClick: () => void
}) {
  const r = radioDe(d.pedidos, maximo)
  // El número dentro del círculo solo donde CABE. Rotular los 58 distritos
  // convertiría el mapa en una sopa de dígitos encimados; en los grandes —que
  // son los que uno mira primero— ahorra el hover.
  const rotula = r >= 11
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <title>{`${d.distrito}, ${d.departamento} · ${d.pedidos} entregados · ${soles(d.valor)}`}</title>
      <circle cx={cx} cy={cy} r={r} fill="var(--k-lime)" opacity={elegido ? 0.55 : 0.3} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--k-lime)" strokeWidth={elegido ? 1.6 : 0.9} />
      {rotula && (
        <text x={cx} y={cy + 3} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text)', fontWeight: 700 }}>
          {d.pedidos}
        </text>
      )}
      {/* Blanco de clic mínimo: un distrito de un pedido mide 3 px y sin esto
          no se puede tocar. */}
      <circle cx={cx} cy={cy} r={Math.max(r, 8)} fill="transparent" />
    </g>
  )
}

function Ficha({ d, onCerrar }: { d: DistritoEntregas; onCerrar: () => void }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-3)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm truncate flex items-center gap-1.5" style={{ color: 'var(--text)', fontWeight: 700 }}>
            <MapPin size={13} className="flex-shrink-0" style={{ color: 'var(--k-lime)' }} />
            {d.distrito}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{d.departamento}</p>
        </div>
        <button onClick={onCerrar} className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
          cerrar
        </button>
      </div>
      <div className="flex items-baseline gap-4 mt-2">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <b className="tabular" style={{ color: 'var(--text)' }}>{d.pedidos}</b> entregados
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <b className="tabular" style={{ color: 'var(--text)' }}>{soles(d.valor)}</b> facturado
        </span>
      </div>

      {/* La otra mitad de la pregunta. El filtro de arriba dice dónde funciona
          UN producto; esto dice qué funciona en UN distrito — que es lo que
          decide qué stock mandar a esa zona. */}
      <div className="mt-2 pt-2 space-y-1" style={{ borderTop: '0.5px solid var(--border)' }}>
        {d.porProducto.map(p => (
          <div key={p.id ?? 'sin'} className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{p.nombre}</span>
            <span className="text-[11px] tabular flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
              {p.pedidos} · {soles(p.valor)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
