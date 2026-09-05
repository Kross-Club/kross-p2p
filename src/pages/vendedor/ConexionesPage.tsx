import { useCallback, useEffect, useState } from 'react'
import { Plug, RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller } from '../../lib/seller-session'
import {
  ROTULO_RESULTADO, ROTULO_SALUD,
  type EventoApi, type Integracion, type Salud,
} from '../../../supabase/functions/_shared/integraciones.ts'

// ─── CONEXIONES · las APIs de las que Kross depende ──────────────────────────
// Kross se apoya en una docena de APIs que no controla. Antes de esta pantalla,
// cuando una fallaba el error moría en los logs de una Edge Function: no había
// dónde ver cuál estaba caída, desde cuándo, ni —lo más caro— NINGÚN
// identificador que enseñarle al dueño de esa API para reclamarle.
//
// Esto es esa pantalla, y responde en este orden:
//   1. ¿cuál está caída AHORA? (chequeo en vivo donde el proveedor lo permite)
//   2. ¿cuál viene fallando aunque responda el chequeo? — el caso que engaña
//   3. ¿qué falló exactamente? Cada renglón trae su referencia `KX-…`, el id de
//      request del proveedor y su respuesta cruda, para pegarlos en un ticket.
//
// Quien administra la plataforma la ve entera. El admin de una marca ve el
// mismo tablero, pero los eventos son los de SU tienda.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface EstadoIntegracion extends Integracion {
  configurado: boolean
  ping: boolean | null
  salud: Salud
  fallos_24h: number
  ultimo_fallo: { ref?: string; created_at?: string; http_status?: number | null } | null
  marcas_configuradas: number | null
}

const COLOR: Record<Salud, { fondo: string; texto: string }> = {
  OPERATIVA:      { fondo: '#DCFCE7', texto: '#16A34A' },
  INESTABLE:      { fondo: '#FEF3C7', texto: '#B45309' },
  CAIDA:          { fondo: '#FEE2E2', texto: '#DC2626' },
  SIN_CONFIGURAR: { fondo: '#F3F4F6', texto: '#6B7280' },
  DESCONOCIDA:    { fondo: '#F3F4F6', texto: '#6B7280' },
}

// El orden de la lista es el del daño: lo caído primero, después lo que falla,
// después lo sano, y al final lo que ni siquiera está montado.
const URGENCIA: Record<Salud, number> = {
  CAIDA: 0, INESTABLE: 1, DESCONOCIDA: 2, OPERATIVA: 3, SIN_CONFIGURAR: 4,
}

async function llamar(payload: Record<string, unknown>) {
  // JWT real del vendedor: la función lo verifica contra Auth y no acepta el
  // atajo de `admin_auth_id`. Acá se muestran respuestas crudas de terceros.
  const { data } = await supabase.auth.getSession()
  const jwt = data.session?.access_token ?? ANON
  try {
    const res = await fetch(`${BASE}/integraciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, data: await res.json().catch(() => ({})) as Record<string, unknown> }
  } catch (e) {
    console.error('[ConexionesPage] integraciones no respondió', e)
    return { ok: false, data: {} as Record<string, unknown> }
  }
}

const hace = (iso: string | undefined): string => {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

const reloj = (iso: string): string =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ConexionesPage() {
  // El perfil EFECTIVO: si alguien de la plataforma entró a operar una marca,
  // ve las conexiones con el alcance de esa marca — igual que el resto del panel.
  const { effective: quien } = useSeller()
  const [lista, setLista] = useState<EstadoIntegracion[] | null>(null)
  const [totalMarcas, setTotalMarcas] = useState<number | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Record<string, EventoApi[]>>({})
  const [buscada, setBuscada] = useState('')
  const [encontrada, setEncontrada] = useState<EventoApi | null | 'no'>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { ok, data } = await llamar({ action: 'estado' })
    if (ok && Array.isArray(data.integraciones)) {
      setLista(data.integraciones as EstadoIntegracion[])
      setTotalMarcas(typeof data.total_marcas === 'number' ? data.total_marcas : null)
    } else {
      setLista([])
    }
    setCargando(false)
  }, [])

  // La primera carga va por su cuenta (y no llamando a `cargar`) para que el
  // efecto no toque estado de forma síncrona: pide, y recién con la respuesta
  // en la mano pinta. El botón "Revisar" sí usa `cargar`, con su spinner.
  useEffect(() => {
    if (!quien?.is_admin) return
    let vivo = true
    llamar({ action: 'estado' }).then(({ ok, data }) => {
      if (!vivo) return
      setLista(ok && Array.isArray(data.integraciones) ? data.integraciones as EstadoIntegracion[] : [])
      setTotalMarcas(typeof data.total_marcas === 'number' ? data.total_marcas : null)
    })
    return () => { vivo = false }
  }, [quien?.is_admin])

  const abrir = async (id: string) => {
    if (abierta === id) { setAbierta(null); return }
    setAbierta(id)
    if (eventos[id]) return
    const { ok, data } = await llamar({ action: 'eventos', provider: id, limit: 30 })
    if (ok && Array.isArray(data.eventos)) setEventos(e => ({ ...e, [id]: data.eventos as EventoApi[] }))
  }

  const buscar = async () => {
    const ref = buscada.trim().toUpperCase()
    if (!ref) return
    const { data } = await llamar({ action: 'evento', ref })
    setEncontrada((data.evento as EventoApi | null) ?? 'no')
  }

  if (!quien?.is_admin) {
    return <div className="p-6 text-sm text-gray-500">Esta pantalla es de los administradores.</div>
  }

  const ordenada = [...(lista ?? [])].sort((a, b) =>
    (URGENCIA[a.salud] - URGENCIA[b.salud]) || Number(b.critico) - Number(a.critico) || a.nombre.localeCompare(b.nombre))
  const enProblemas = ordenada.filter(i => i.salud === 'CAIDA' || i.salud === 'INESTABLE')

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-base font-black flex items-center gap-2">
          <Plug size={16} /> Conexiones
        </h1>
        <button onClick={() => cargar()} disabled={cargando}
          className="text-[10px] font-black px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-40"
          style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
          <RefreshCw size={11} className={cargando ? 'animate-spin' : ''} /> Revisar
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-snug">
        Las APIs de las que depende Kross. Cada fallo queda con una referencia
        <span className="font-mono"> KX-…</span> que puedes pegarle al dueño de esa API para
        que busque el suyo. Se guardan 30 días.
      </p>

      {/* Buscar una referencia que alguien tiene apuntada: es el caso de uso de
          soporte —"nos dijeron el error KX-7QK4M2"— y por eso está arriba. */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-1.5 rounded-xl px-3 py-2"
          style={{ background: 'var(--surface-3)' }}>
          <Search size={13} className="text-gray-400 flex-shrink-0" />
          <input value={buscada} onChange={e => { setBuscada(e.target.value); setEncontrada(null) }}
            onKeyDown={e => { if (e.key === 'Enter') void buscar() }}
            placeholder="KX-7QK4M2" spellCheck={false}
            className="flex-1 min-w-0 bg-transparent text-xs outline-none font-mono uppercase" />
        </div>
        <button onClick={buscar} disabled={!buscada.trim()}
          className="text-[10px] font-black px-3 py-2 rounded-xl disabled:opacity-40"
          style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
          Buscar
        </button>
      </div>
      {encontrada === 'no' && (
        <p className="text-[11px] mb-3" style={{ color: 'var(--danger-fg)' }}>
          No hay ningún evento con esa referencia (o es de otra marca, o ya pasaron los 30 días).
        </p>
      )}
      {encontrada && encontrada !== 'no' && (
        <div className="mb-3"><Evento e={encontrada} /></div>
      )}

      {lista === null && <p className="text-xs text-gray-400">Preguntándole a cada proveedor…</p>}

      {lista !== null && enProblemas.length === 0 && (
        <div className="rounded-xl px-3 py-2 mb-3" style={{ background: 'var(--ok-bg)' }}>
          <p className="text-[11px] font-bold" style={{ color: 'var(--ok-fg)' }}>
            Ninguna integración está caída ni acumula fallos en las últimas 24 horas.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {ordenada.map(i => (
          <div key={i.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <button onClick={() => abrir(i.id)} className="w-full text-left p-3">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-black flex items-center gap-1.5">
                  {abierta === i.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {i.nombre}
                  {i.critico && <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>crítica</span>}
                </span>
                <span className="text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0"
                  style={{ background: COLOR[i.salud].fondo, color: COLOR[i.salud].texto }}>
                  ● {ROTULO_SALUD[i.salud]}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 leading-snug pl-[18px]">
                {i.que} · <span className="text-gray-400">{i.dueno}</span>
              </p>
              <p className="text-[10px] text-gray-400 leading-snug pl-[18px] mt-0.5">
                {i.alcance === 'marca'
                  ? `Configurada en ${i.marcas_configuradas ?? 0}${totalMarcas ? ` de ${totalMarcas}` : ''} marcas`
                  : i.configurado ? 'Llave de la plataforma cargada' : `Falta el secret ${i.secreto ?? '—'}`}
                {i.fallos_24h > 0 && ` · ${i.fallos_24h} fallo${i.fallos_24h === 1 ? '' : 's'} en 24 h`}
                {i.ultimo_fallo?.created_at && ` · el último ${hace(i.ultimo_fallo.created_at)}`}
                {i.suplente && ' · tiene suplente'}
              </p>
            </button>

            {abierta === i.id && (
              <div className="px-3 pb-3">
                {!eventos[i.id] && <p className="text-[10px] text-gray-400">Cargando…</p>}
                {eventos[i.id]?.length === 0 && (
                  <p className="text-[10px] text-gray-400">Sin eventos en los últimos 30 días.</p>
                )}
                <div className="space-y-1.5">
                  {(eventos[i.id] ?? []).map(e => <Evento key={e.ref} e={e} />)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Un renglón del historial. Todo lo que hace falta para abrir un ticket con el
 *  proveedor está acá: cuándo, qué se le pidió, qué contestó y los dos ids. */
function Evento({ e }: { e: EventoApi }) {
  const malo = e.outcome !== 'OK'
  return (
    <div className="rounded-xl px-2.5 py-2" style={{ background: 'var(--surface-3)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-black font-mono">{e.ref}</span>
        <span className="text-[10px] font-bold" style={{ color: malo ? 'var(--danger-fg)' : 'var(--ok-fg)' }}>
          {ROTULO_RESULTADO[e.outcome]}{e.http_status ? ` · ${e.http_status}` : ''}
        </span>
      </div>
      <p className="text-[10px] text-gray-500 mt-0.5">
        {e.op} · {reloj(e.created_at)}
        {e.duration_ms != null && ` · ${e.duration_ms} ms`}
      </p>
      {e.provider_ref && (
        <p className="text-[10px] text-gray-400 font-mono break-all">su id: {e.provider_ref}</p>
      )}
      {e.detail && (
        <p className="text-[10px] text-gray-400 mt-1 break-words leading-snug">{e.detail}</p>
      )}
    </div>
  )
}
