import { useCallback, useEffect, useState } from 'react'
import { Plug, RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller } from '../../lib/seller-session'
import {
  INTEGRACIONES, ROTULO_RESULTADO, ROTULO_SALUD, suplenteDe,
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
//
// ⚠️ **Los NOMBRES no dependen del servidor.** El catálogo de integraciones es
// estático y vive en el módulo compartido, así que la lista se pinta siempre —
// aunque la Edge Function no esté desplegada o rechace la sesión. Lo único que
// falta en ese caso es el estado EN VIVO, y se dice con todas sus letras. La
// primera versión de esta pantalla se quedaba en blanco y encima mostraba
// "ninguna integración está caída": no había preguntado nada, así que eso no
// era un veredicto tranquilizador — era una mentira.

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
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) as Record<string, unknown> }
  } catch (e) {
    console.error('[ConexionesPage] integraciones no respondió', e)
    return { ok: false, status: 0, data: {} as Record<string, unknown> }
  }
}

/** Por qué no se pudo consultar el estado, dicho para que se pueda accionar. */
function porQueNoSePudo(status: number): string {
  if (status === 404) {
    return 'La función `integraciones` todavía no está desplegada en Supabase '
      + '(`supabase functions deploy integraciones`). Hasta entonces se ven los nombres, no el estado.'
  }
  if (status === 401 || status === 403) {
    return 'Tu sesión no tiene permiso para consultar el estado. Hay que entrar como admin '
      + '(y si acabas de iniciar sesión, recargar la página).'
  }
  if (status === 0) return 'No hubo respuesta del servidor: revisa la conexión y vuelve a intentar.'
  return `El servidor respondió ${status} al consultar el estado.`
}

/** El catálogo sin estado en vivo: los nombres siempre se pueden mostrar. */
const SIN_ESTADO: EstadoIntegracion[] = INTEGRACIONES.map(i => ({
  ...i,
  configurado: false,
  ping: null,
  salud: 'DESCONOCIDA' as Salud,
  fallos_24h: 0,
  ultimo_fallo: null,
  marcas_configuradas: null,
}))

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
  /** Por qué no se pudo consultar el estado. `null` = se pudo. */
  const [problema, setProblema] = useState<string | null>(null)

  /** Una sola forma de aplicar la respuesta, la use el efecto o el botón. */
  const aplicar = (r: { ok: boolean; status: number; data: Record<string, unknown> }) => {
    if (r.ok && Array.isArray(r.data.integraciones)) {
      setLista(r.data.integraciones as EstadoIntegracion[])
      setTotalMarcas(typeof r.data.total_marcas === 'number' ? r.data.total_marcas : null)
      setProblema(null)
      return
    }
    // No se pudo preguntar. Los nombres se muestran igual —son del catálogo, no
    // del servidor— y arriba se explica qué falta para ver el estado.
    setLista(SIN_ESTADO)
    setTotalMarcas(null)
    setProblema(porQueNoSePudo(r.status))
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    aplicar(await llamar({ action: 'estado' }))
    setCargando(false)
  }, [])

  // La primera carga va por su cuenta (y no llamando a `cargar`) para que el
  // efecto no toque estado de forma síncrona: pide, y recién con la respuesta
  // en la mano pinta. El botón "Revisar" sí usa `cargar`, con su spinner.
  useEffect(() => {
    if (!quien?.is_admin) return
    let vivo = true
    llamar({ action: 'estado' }).then(r => { if (vivo) aplicar(r) })
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
    const r = await llamar({ action: 'evento', ref })
    // Si ni siquiera se pudo preguntar, no se dice "no existe": se dice por qué.
    if (!r.ok) { setProblema(porQueNoSePudo(r.status)); setEncontrada(null); return }
    setEncontrada((r.data.evento as EventoApi | null) ?? 'no')
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

      {/* No se pudo preguntar: se dice qué falta. Nunca el cartel verde — no
          haber preguntado no es lo mismo que estar todo bien. */}
      {problema && (
        <div className="rounded-xl px-3 py-2 mb-3" style={{ background: 'var(--warn-bg)' }}>
          <p className="text-[11px] font-black mb-0.5" style={{ color: 'var(--warn-fg)' }}>
            No se pudo consultar el estado en vivo
          </p>
          <p className="text-[10px] leading-snug" style={{ color: 'var(--warn-fg)' }}>
            {problema} Abajo están las {SIN_ESTADO.length} integraciones que Kross usa, sin su
            estado ni su historial.
          </p>
        </div>
      )}

      {lista !== null && !problema && enProblemas.length === 0 && (
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
                  {/* Una contingencia NO se rotula "crítica": si no está montada
                      no se frena nada, porque su titular está trabajando. Lo
                      crítico es el par, y decir "suplente de Olva PE" explica
                      qué es sin sonar a alarma. Los dos llevan `title` porque
                      una etiqueta que hay que preguntar qué significa no está
                      haciendo su trabajo. */}
                  {suplenteDe(i.id)
                    ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                        title={`Es el repuesto de ${suplenteDe(i.id)!.nombre}: entra a trabajar solo cuando ese no responde.`}
                        style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                        suplente de {suplenteDe(i.id)!.nombre}
                      </span>
                    : i.critico && <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                        title="Si esta API se cae, se frena vender o despachar. Es el papel que cumple, no un problema: una integración crítica puede estar perfectamente sana."
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
                {/* Sin datos del servidor NO se afirma si está configurada: decir
                    "falta el secret" sin haber preguntado es inventar un
                    diagnóstico. Se dice cuál es el secret y ya. */}
                {problema
                  ? (i.alcance === 'marca'
                      ? 'Se configura en cada marca'
                      : `La enciende el secret ${i.secreto ?? '—'}`)
                  : i.alcance === 'marca'
                    ? `Configurada en ${i.marcas_configuradas ?? 0}${totalMarcas ? ` de ${totalMarcas}` : ''} marcas`
                    : i.configurado ? 'Llave de la plataforma cargada' : `Falta el secret ${i.secreto ?? '—'}`}
                {!problema && i.fallos_24h > 0 && ` · ${i.fallos_24h} fallo${i.fallos_24h === 1 ? '' : 's'} en 24 h`}
                {!problema && i.ultimo_fallo?.created_at && ` · el último ${hace(i.ultimo_fallo.created_at)}`}
                {i.suplente && ' · tiene suplente'}
                {!problema && i.salud === 'SIN_CONFIGURAR' && suplenteDe(i.id) && (
                  <span style={{ color: 'var(--warn-fg)' }}>
                    {` · hoy ${suplenteDe(i.id)!.nombre} no tiene repuesto si se cae`}
                  </span>
                )}
              </p>
            </button>

            {abierta === i.id && (
              <div className="px-3 pb-3">
                {problema && <p className="text-[10px] text-gray-400">
                  El historial tampoco se puede leer hasta que el estado en vivo funcione.
                </p>}
                {!problema && !eventos[i.id] && <p className="text-[10px] text-gray-400">Cargando…</p>}
                {!problema && eventos[i.id]?.length === 0 && (
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
