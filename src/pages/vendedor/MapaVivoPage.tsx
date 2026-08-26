import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSeller } from '../../lib/seller-session'
import { supabase } from '../../lib/supabase'
import { AgencyService } from '../../lib/checkout/services/AgencyService'
import { pickupBranchIdOf } from '../../lib/session'
import { estadoDePago, avanceDelPaquete, vaEnElMapa, proyector } from '../../lib/live-map'
import type { Caja, PedidoEnVivo } from '../../lib/live-map'
import { pasoActual, courierDelPedido } from '../../lib/order-tracking'
import type { AgencyName } from '../../lib/checkout/types'

// ─── Los pedidos de la tienda, vivos, sobre el país ──────────────────────────
//
// No es un callejero y no hace falta que lo sea: acá se entrega a sedes de
// Shalom y Olva, así que lo que importa es de qué sede sale el paquete, a cuál
// va, y por dónde va en el camino. Todo se dibuja con datos que ya viven en el
// repo —las 902 sedes con coordenadas, la silueta del país, la división
// territorial— así que la pantalla no depende de ningún proveedor de mapas.
//
// La cajita en el medio de cada línea dice dos cosas a la vez: DÓNDE está
// (origen, ruta, destino) y CÓMO va el dinero (lima = pagado, mitad = adelanto
// cruzado y saldo contraentrega, gris = todavía nada).

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const ANCHO = 700
const ALTO = 880

interface Pedido extends PedidoEnVivo {
  id: string
  token: string
  buyer_name: string | null
  product_id: string | null
  product_name: string | null
  agency_branch_id?: string | null
  delivery_reference?: string | null
}

interface Punto { lat: number; lng: number; nombre: string; courier: string }
interface EnMapa { pedido: Pedido; origen: Punto | null; destino: Punto }

interface Territorio {
  caja: Caja
  anillo: number[][]
  provincias: { id: string; puntos: number[][] }[]
  departamentos: { id: string; puntos: number[][] }[]
}

export default function MapaVivoPage() {
  const navigate = useNavigate()
  const { effective } = useSeller()
  const storeId = effective?.store_id
  const sellerId = effective?.auth_user_id
  const esAdmin = !!effective?.is_admin
  // `null` = todavía no llegó la primera respuesta. Así el "cargando" se
  // deriva del dato en vez de ser otro estado que sincronizar.
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [origenPorProducto, setOrigenPorProducto] = useState<Record<string, string>>({})
  const [territorio, setTerritorio] = useState<Territorio | null>(null)
  const [sedes, setSedes] = useState<{ lat: number; lng: number }[]>([])
  const [puntos, setPuntos] = useState<EnMapa[]>([])
  const [elegido, setElegido] = useState<string | null>(null)
  const cargando = pedidos === null

  // ── El país: silueta y división territorial, en un import diferido ──
  useEffect(() => {
    let vivo = true
    Promise.all([
      import('../../data/coverage/region-cells.json'),
      import('../../data/coverage/peru-outline.json'),
    ]).then(([celdas, silueta]) => {
      if (!vivo) return
      const c = celdas.default as unknown as { caja: Caja; provincias: Territorio['provincias']; departamentos: Territorio['departamentos'] }
      const s = silueta.default as unknown as { anillos: number[][][] }
      setTerritorio({ caja: c.caja, provincias: c.provincias, departamentos: c.departamentos, anillo: s.anillos[0] })
    })
    return () => { vivo = false }
  }, [])

  // ── La red de sedes de fondo ──
  useEffect(() => {
    let vivo = true
    Promise.all([
      import('../../data/agencies/shalom.json'),
      import('../../data/agencies/olva.json'),
    ]).then(([sh, ol]) => {
      if (!vivo) return
      const de = (m: { default: unknown }) => ((m.default as { branches: { lat?: number; lng?: number }[] }).branches)
      setSedes([...de(sh), ...de(ol)]
        .filter((b): b is { lat: number; lng: number } => b.lat != null && b.lng != null))
    })
    return () => { vivo = false }
  }, [])

  // ── Los pedidos de la tienda ──
  useEffect(() => {
    if (!storeId) return
    const headers: Record<string, string> = { Authorization: `Bearer ${ANON}`, 'x-store-id': storeId }
    if (!esAdmin && sellerId) headers['x-seller-id'] = sellerId

    fetch(`${BASE}/get-store-sessions`, { headers })
      .then(r => (r.ok ? r.json() : []))
      .then((data: Pedido[]) => setPedidos(Array.isArray(data) ? data.filter(vaEnElMapa) : []))
      .catch(() => setPedidos([]))
  }, [storeId, sellerId, esAdmin])

  // ── De qué sede sale cada producto (la configura Logística en Productos) ──
  useEffect(() => {
    if (!storeId) return
    let vivo = true
    void (async () => {
      const { data } = await supabase.from('products')
        .select('id, shalom_origin_branch_id').eq('store_id', storeId)
      if (!vivo || !data) return
      const mapa: Record<string, string> = {}
      for (const p of data as { id: string; shalom_origin_branch_id: string | null }[]) {
        if (p.shalom_origin_branch_id) mapa[p.id] = p.shalom_origin_branch_id
      }
      setOrigenPorProducto(mapa)
    })()
    return () => { vivo = false }
  }, [storeId])

  // ── Cada pedido, con sus dos sedes resueltas ──
  useEffect(() => {
    let vivo = true
    if (!pedidos || pedidos.length === 0) return

    void Promise.all(pedidos.map(async (pedido): Promise<EnMapa | null> => {
      const courier = courierDelPedido(pedido)
      if (!courier) return null
      const idDestino = pickupBranchIdOf(pedido)
      if (!idDestino) return null

      const destino = await AgencyService.getBranch(courier as AgencyName, idDestino)
      if (!destino?.lat || !destino.lng) return null

      const idOrigen = pedido.product_id ? origenPorProducto[pedido.product_id] : null
      const origen = idOrigen ? await AgencyService.getBranch(courier as AgencyName, idOrigen) : null

      return {
        pedido,
        destino: { lat: destino.lat, lng: destino.lng, nombre: destino.name, courier },
        origen: origen?.lat && origen.lng
          ? { lat: origen.lat, lng: origen.lng, nombre: origen.name, courier }
          : null,
      }
    })).then(lista => { if (vivo) setPuntos(lista.filter((x): x is EnMapa => x !== null)) })

    return () => { vivo = false }
  }, [pedidos, origenPorProducto])

  const proyeccion = useMemo(
    () => (territorio ? proyector(territorio.caja, ANCHO, ALTO) : null),
    [territorio],
  )

  const conteo = useMemo(() => ({
    vivos: puntos.length,
    ruta: puntos.filter(p => avanceDelPaquete(p.pedido) > 0.2 && avanceDelPaquete(p.pedido) < 1).length,
    pagados: puntos.filter(p => estadoDePago(p.pedido) === 'completo').length,
  }), [puntos])

  const seleccionado = puntos.find(p => p.pedido.id === elegido) ?? null

  if (!territorio || !proyeccion) {
    return <div className="flex justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" />
    </div>
  }

  const { x, y } = proyeccion
  const camino = (anillo: number[][]) =>
    anillo.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ') + ' Z'

  return (
    <div className="px-6 py-5">
      <div className="flex items-end justify-between gap-6 mb-4">
        <div className="min-w-0">
          <h1 className="text-lg text-gray-900 leading-tight" style={{ fontWeight: 500 }}>Pedidos en vivo</h1>
          <p className="text-xs text-gray-400 mt-0.5">Cada caja es un pedido moviéndose entre sedes.</p>
        </div>
        <div className="flex items-center gap-5 flex-shrink-0">
          <Contador valor={conteo.vivos} etiqueta="En el mapa" />
          <Contador valor={conteo.ruta} etiqueta="En camino" />
          <Contador valor={conteo.pagados} etiqueta="Ya pagados" color="var(--ok-fg)" />
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <div className="flex-1 rounded-2xl overflow-hidden" style={{ background: 'var(--k-ink)', border: '0.5px solid var(--border)' }}>
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-auto block">
            <defs>
              <clipPath id="k-peru"><path d={camino(territorio.anillo)} /></clipPath>
              <linearGradient id="k-mitad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="50%" stopColor="var(--k-lime)" />
                <stop offset="50%" stopColor="var(--k-structural)" />
              </linearGradient>
            </defs>

            {/* El país */}
            <path d={camino(territorio.anillo)} fill="var(--surface)" />
            <g clipPath="url(#k-peru)">
              {territorio.provincias.map(c => (
                <polygon key={c.id} points={c.puntos.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                  fill="none" stroke="var(--border)" strokeWidth="0.6" />
              ))}
              {territorio.departamentos.map(c => (
                <polygon key={c.id} points={c.puntos.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                  fill="none" stroke="var(--border-strong)" strokeWidth="1" />
              ))}
              {/* La red de sedes: la escala del país, sin protagonismo */}
              {sedes.map((s, i) => (
                <circle key={i} cx={x(s.lng)} cy={y(s.lat)} r="1.3" fill="var(--k-structural)" opacity="0.55" />
              ))}
            </g>
            <path d={camino(territorio.anillo)} fill="none" stroke="var(--border-strong)" strokeWidth="1.2" />

            {/* Los pedidos */}
            {puntos.map(p => (
              <Envio key={p.pedido.id} envio={p} x={x} y={y}
                elegido={p.pedido.id === elegido}
                onClick={() => setElegido(p.pedido.id === elegido ? null : p.pedido.id)} />
            ))}
          </svg>
        </div>

        <aside className="w-[300px] flex-shrink-0 space-y-3">
          <Leyenda />
          {seleccionado
            ? <FichaPedido envio={seleccionado} onAbrir={() => navigate(`/vendedor/pedido/${seleccionado.pedido.token}`)} />
            : (
              <div className="rounded-2xl px-4 py-4" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {cargando ? 'Cargando pedidos…'
                    : puntos.length === 0 ? 'Ningún pedido por agencia en camino ahora mismo.'
                    : 'Toca una caja para ver su pedido.'}
                </p>
              </div>
            )}
        </aside>
      </div>
    </div>
  )
}

function Contador({ valor, etiqueta, color }: { valor: number; etiqueta: string; color?: string }) {
  return (
    <div className="text-right">
      <p className="text-2xl leading-none tabular" style={{ color: color ?? 'var(--text)', fontWeight: 500 }}>{valor}</p>
      <p className="text-[10px] uppercase tracking-wide mt-1" style={{ color: 'var(--text-faint)' }}>{etiqueta}</p>
    </div>
  )
}

/** Un pedido: sus dos sedes, la línea entre ellas y la caja en el camino. */
function Envio({ envio, x, y, elegido, onClick }: {
  envio: EnMapa
  x: (lng: number) => number
  y: (lat: number) => number
  elegido: boolean
  onClick: () => void
}) {
  const { pedido, origen, destino } = envio
  const t = avanceDelPaquete(pedido)
  const pago = estadoDePago(pedido)

  const a = origen ? { x: x(origen.lng), y: y(origen.lat) } : null
  const b = { x: x(destino.lng), y: y(destino.lat) }
  const caja = a ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : b

  const relleno = pago === 'completo' ? 'var(--k-lime)'
    : pago === 'parcial' ? 'url(#k-mitad)'
    : 'var(--k-structural)'

  const L = elegido ? 9 : 7

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {a && (
        <>
          {/* Lo recorrido, sólido; lo que falta, punteado (§6.2) */}
          <line x1={a.x} y1={a.y} x2={caja.x} y2={caja.y} stroke="var(--k-lime)" strokeWidth="1.2" opacity="0.7" />
          <line x1={caja.x} y1={caja.y} x2={b.x} y2={b.y} stroke="var(--k-lime-dim)" strokeWidth="1.2"
            strokeDasharray="3 3" opacity="0.8" />
          <SedeMarca cx={a.x} cy={a.y} courier={origen!.courier} />
        </>
      )}
      <SedeMarca cx={b.x} cy={b.y} courier={destino.courier} destino />

      {/* La caja. Late solo si el paquete está en movimiento. */}
      <g className={t > 0 && t < 1 ? 'k-latido' : undefined}>
        <rect x={caja.x - L / 2} y={caja.y - L / 2} width={L} height={L} fill={relleno}
          stroke="var(--k-ink)" strokeWidth="1" />
      </g>
      {elegido && <circle cx={caja.x} cy={caja.y} r={L * 1.9} fill="var(--k-lime)" opacity="0.14" />}
    </g>
  )
}

/**
 * La sede en el mapa. Lleva la inicial del courier hasta que existan sus logos
 * en `public/courier-shalom.svg` y `public/courier-olva.svg` — son marcas
 * ajenas, así que las pone la marca, no el código.
 */
function SedeMarca({ cx, cy, courier, destino }: { cx: number; cy: number; courier: string; destino?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={destino ? 5 : 4}
        fill="var(--surface)" stroke={destino ? 'var(--k-lime)' : 'var(--border-strong)'} strokeWidth="1" />
      <text x={cx} y={cy + 2.2} textAnchor="middle" style={{ fontSize: 5, fill: 'var(--text-muted)', fontWeight: 500 }}>
        {courier.charAt(0)}
      </text>
    </g>
  )
}

function Leyenda() {
  return (
    <div className="rounded-2xl px-4 py-3 space-y-2" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>La caja dice cómo va el pago</p>
      {[
        ['var(--k-lime)', 'Pagado completo'],
        ['url(#k-mitad-leyenda)', 'Adelanto cruzado, saldo contraentrega'],
        ['var(--k-structural)', 'Todavía sin pago verificado'],
      ].map(([relleno, texto]) => (
        <div key={texto} className="flex items-center gap-2">
          <svg width="12" height="12" className="flex-shrink-0">
            <defs>
              <linearGradient id="k-mitad-leyenda" x1="0" y1="1" x2="0" y2="0">
                <stop offset="50%" stopColor="var(--k-lime)" />
                <stop offset="50%" stopColor="var(--k-structural)" />
              </linearGradient>
            </defs>
            <rect width="12" height="12" fill={relleno} />
          </svg>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{texto}</p>
        </div>
      ))}
    </div>
  )
}

function FichaPedido({ envio, onAbrir }: { envio: EnMapa; onAbrir: () => void }) {
  const { pedido, origen, destino } = envio
  const paso = pasoActual(pedido)
  const pago = estadoDePago(pedido)

  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
      <p className="text-sm truncate" style={{ color: 'var(--text)', fontWeight: 500 }}>{pedido.buyer_name || 'Comprador'}</p>
      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-faint)' }}>{pedido.product_name}</p>

      <div className="mt-3 space-y-1.5">
        {origen && <Fila etiqueta="Sale de" valor={origen.nombre} />}
        <Fila etiqueta="Va a" valor={destino.nombre} />
        <Fila etiqueta="Ahora" valor={paso?.label ?? '—'} />
        <Fila etiqueta="Pago" valor={
          pago === 'completo' ? 'Pagado completo'
            : pago === 'parcial' ? 'Adelanto cruzado' : 'Sin pago verificado'
        } />
      </div>

      <button onClick={onAbrir} className="w-full mt-4 py-2 rounded-xl text-xs"
        style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
        Abrir el pedido
      </button>
    </div>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{etiqueta}</span>
      <span className="text-[11px] truncate text-right" style={{ color: 'var(--text-muted)' }}>{valor}</span>
    </div>
  )
}
