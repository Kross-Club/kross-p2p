import { useCallback, useEffect, useState } from 'react'
import { UserPlus, RefreshCw, Link2, Check, Store, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PanelDeAfiliado from '../../components/PanelDeAfiliado'
import { useSeller } from '../../lib/seller-session'
import {
  llamarAfiliados, porQueNoSePudo,
  type FilaDeAfiliado, type PagoAlAfiliado,
} from '../../lib/afiliados-api'
import {
  ROTULO_SUSCRIPCION, esCodigoValido, normalizarCodigo,
  nombreDelPeriodo, periodoDe, periodoAnterior,
  type EstadoSuscripcion,
} from '../../../supabase/functions/_shared/afiliados.ts'
import { administraLaPlataforma, TIENDA_PLATAFORMA } from '../../../supabase/functions/_shared/alcance.ts'

// ─── PANEL → AFILIADOS ───────────────────────────────────────────────────────
//
// La pantalla de quien opera Kross. Responde tres cosas que hoy viven en una
// hoja de cálculo y en la memoria de una persona:
//
//   1. **Quién está debajo de quién.** El árbol completo, con el nivel.
//   2. **Cuánto lleva cada uno este mes.** Contado de `cobros` en vivo, no un
//      saldo que alguien actualiza.
//   3. **Qué hay que transferir.** Cerrar el mes congela el número; marcarlo
//      pagado cierra el círculo.
//
// Es de la PLATAFORMA, no de una marca: el admin de una tienda no tiene nada
// que hacer acá, igual que en Conexiones. La puerta de verdad está en la Edge
// Function (`administraLaPlataforma`); esto solo evita ofrecer lo que va a ser
// rechazado.
//
// ⚠️ **Cerrar el mes es lo único que no se puede deshacer con un botón.** Una
// vez cerrado, el número queda escrito aunque después se anule un cobro — que
// es exactamente la razón de cerrarlo: lo que se le prometió a una persona no
// puede moverse solo. Por eso el mes en curso no se deja cerrar.

const COLOR_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  activa: '#16A34A', prueba: '#2563EB', en_gracia: '#B45309',
  cancelada: '#DC2626', sin_suscripcion: '#6B7280',
}

const soles = (n: number) => `S/ ${Number(n).toFixed(2)}`

interface TiendaSuelta { id: string; nombre: string; affiliate_id: string | null }

export default function AfiliadosPage() {
  const { effective } = useSeller()
  const puede = administraLaPlataforma(effective)

  const [periodo, setPeriodo] = useState(() => periodoAnterior(periodoDe(new Date())))
  const [filas, setFilas] = useState<FilaDeAfiliado[] | null>(null)
  const [pagos, setPagos] = useState<PagoAlAfiliado[]>([])
  const [tiendas, setTiendas] = useState<TiendaSuelta[]>([])
  const [problema, setProblema] = useState('')
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)

  /** Las tres consultas de la pantalla, en paralelo. Pura: no toca estado, para
   *  que el efecto pueda pedir sin pintar hasta tener la respuesta. */
  const pedir = useCallback(async (mes: string) => {
    const [lista, hist, tiendasRes] = await Promise.all([
      llamarAfiliados<{ afiliados: FilaDeAfiliado[] }>({ action: 'listar', periodo: mes }),
      llamarAfiliados<{ pagos: PagoAlAfiliado[] }>({ action: 'pagos' }),
      // `stores` tiene lectura pública (la usa el storefront de cada marca), así
      // que el selector de tiendas se sirve directo en vez de por la función.
      supabase.from('stores')
        .select('id, nombre, affiliate_id').neq('id', TIENDA_PLATAFORMA).order('nombre'),
    ])
    return { lista, hist, tiendas: (tiendasRes.data ?? []) as TiendaSuelta[] }
  }, [])

  const aplicar = useCallback((r: Awaited<ReturnType<typeof pedir>>) => {
    if (!r.lista.ok) {
      setProblema(porQueNoSePudo(r.lista.status, r.lista.data?.error))
      setFilas(null)
    } else {
      setProblema('')
      setFilas(r.lista.data.afiliados ?? [])
      setPagos(r.hist.ok ? (r.hist.data.pagos ?? []) : [])
    }
    setTiendas(r.tiendas)
    setCargando(false)
  }, [])

  /** Recargar a mano, con su spinner. */
  const cargar = useCallback(async (mes: string) => {
    if (!puede) return
    setCargando(true)
    aplicar(await pedir(mes))
  }, [puede, pedir, aplicar])

  // La primera carga y el cambio de mes van por su cuenta: el efecto pide y
  // recién con la respuesta en la mano pinta, sin tocar estado de forma
  // síncrona. Es el patrón de `ConexionesPage`.
  useEffect(() => {
    if (!puede) return
    let vivo = true
    pedir(periodo).then(r => { if (vivo) aplicar(r) })
    return () => { vivo = false }
  }, [puede, periodo, pedir, aplicar])

  // **La misma ruta, dos contenidos** (§52). Quien administra la plataforma ve
  // el programa entero; el admin de una marca ve SU enlace y las tiendas que
  // trajo — que es exactamente lo que ve un afiliado de fuera en `/afiliado`,
  // con el mismo componente. Es el patrón de `Tiendas`/`Marca`.
  //
  // Un vendedor raso no llega acá ni por el menú ni por la URL: el servidor no
  // le devuelve ningún afiliado, así que el panel dice que no tiene acceso.
  if (!puede) {
    return (
      <div className="p-4 max-w-lg">
        <header className="mb-3">
          <h1 className="text-sm font-black" style={{ color: 'var(--text)' }}>Afiliados</h1>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Recomienda Kross y gana por cada venta de las tiendas que traigas
          </p>
        </header>
        <PanelDeAfiliado />
      </div>
    )
  }

  const enCurso = periodoDe(new Date())
  const cerrado = pagos.some(p => p.periodo === periodo)
  const totalMes = (filas ?? []).reduce((s, f) => s + f.monto, 0)
  const porPagar = pagos.filter(p => p.estado === 'CALCULADO')

  return (
    <div className="p-4 max-w-3xl">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h1 className="text-sm font-black" style={{ color: 'var(--text)' }}>Afiliados</h1>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Quién trajo a quién, y cuánto se le debe
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="text-[10px] font-bold px-2 py-1.5 rounded-lg"
            style={{ border: '0.5px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' }}>
            {mesesRecientes().map(m => (
              <option key={m} value={m}>{nombreDelPeriodo(m)}{m === enCurso ? ' · en curso' : ''}</option>
            ))}
          </select>
          <button onClick={() => void cargar(periodo)} aria-label="Actualizar"
            className="px-2 py-1.5 rounded-lg" style={{ border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
            <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setNueva(v => !v)}
            className="text-[10px] font-black px-2.5 py-1.5 rounded-lg flex items-center gap-1"
            style={{ background: 'var(--brand)', color: '#fff' }}>
            <UserPlus size={12} /> Nuevo
          </button>
        </div>
      </header>

      {problema && (
        <div className="rounded-xl px-3 py-2 mb-3" style={{ background: 'var(--warn-bg)' }}>
          <p className="text-[10px] leading-snug" style={{ color: 'var(--warn-fg)' }}>{problema}</p>
        </div>
      )}

      {nueva && <FormularioNuevo afiliados={filas ?? []} onListo={() => { setNueva(false); void cargar(periodo) }} />}

      {/* El total del mes y el botón de cerrarlo. */}
      <section className="rounded-2xl p-3 mb-3 flex items-center justify-between gap-3" style={{ background: 'var(--surface-2)' }}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            {nombreDelPeriodo(periodo)}
          </p>
          <p className="text-xl font-black tabular" style={{ color: 'var(--text)' }}>{soles(totalMes)}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            en comisiones de {(filas ?? []).filter(f => f.monto > 0).length} afiliados
          </p>
        </div>
        <CerrarMes periodo={periodo} enCurso={enCurso} cerrado={cerrado}
          onListo={() => void cargar(periodo)} />
      </section>

      {porPagar.length > 0 && (
        <section className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-faint)' }}>
            Por transferir ({porPagar.length})
          </p>
          <div className="space-y-1.5">
            {porPagar.map(p => (
              <PorPagar key={p.id} pago={p}
                nombre={(filas ?? []).find(f => f.id === p.affiliate_id)?.nombre ?? '—'}
                onListo={() => void cargar(periodo)} />
            ))}
          </div>
        </section>
      )}

      {/* El árbol. */}
      {filas === null ? (
        <p className="text-xs text-gray-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-[11px] rounded-xl px-3 py-3" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          Todavía no hay afiliados. El primero se crea con «Nuevo»: se le da un código —que ES su
          enlace— y su correo, que es con el que va a poder entrar a ver sus números.
        </p>
      ) : (
        <div className="space-y-1.5">
          {filas.map(f => (
            <Fila key={f.id} f={f} tiendas={tiendas} abierta={abierta === f.id}
              onAbrir={() => setAbierta(a => a === f.id ? null : f.id)}
              onListo={() => void cargar(periodo)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Los últimos doce meses, del más nuevo al más viejo. */
function mesesRecientes(): string[] {
  const out: string[] = []
  let m = periodoDe(new Date())
  for (let i = 0; i < 12; i++) { out.push(m); m = periodoAnterior(m) }
  return out
}

function Fila({ f, tiendas, abierta, onAbrir, onListo }: {
  f: FilaDeAfiliado
  tiendas: TiendaSuelta[]
  abierta: boolean
  onAbrir: () => void
  onListo: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)', marginLeft: f.nivel * 16 }}>
      <button onClick={onAbrir} className="w-full text-left p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-black truncate" style={{ color: f.active ? 'var(--text)' : 'var(--text-faint)' }}>
              {f.nivel > 0 && <span style={{ color: 'var(--text-faint)' }}>└ </span>}
              {f.nombre}
              <span className="tabular font-normal" style={{ color: 'var(--text-faint)' }}> /{f.codigo}</span>
              {/* Los afiliados-tienda (§52) son casi todos —cada marca nace con
                  el suyo—, así que lo que hay que poder distinguir de un
                  vistazo es al de FUERA: ese cobra sin plan propio que vencer. */}
              {!f.store_id && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded ml-1"
                  title="Afiliado de fuera: no tiene tienda, así que no tiene plan propio que se le pueda vencer."
                  style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>externo</span>
              )}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {f.tiendas} tienda{f.tiendas === 1 ? '' : 's'} · {f.transacciones.toLocaleString('es-PE')} transacciones
              {/* Sin cuenta vinculada NO puede ver sus números. Es la causa
                  número uno de "no me entra el enlace", así que se dice acá y
                  no en un rincón. */}
              {!f.auth_user_id && <span style={{ color: 'var(--warn-fg)' }}> · sin cuenta vinculada</span>}
              {!f.active && ' · inactivo'}
            </p>
          </div>
          <span className="text-sm font-black tabular flex-shrink-0" style={{ color: 'var(--text)' }}>{soles(f.monto)}</span>
        </div>
      </button>

      {abierta && (
        <div className="px-3 pb-3 space-y-2" style={{ borderTop: '0.5px solid var(--border)' }}>
          <div className="flex items-center gap-1.5 pt-2">
            <code className="text-[10px] flex-1 truncate px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-3)', color: f.enlace ? 'var(--text-muted)' : 'var(--warn-fg)' }}>
              {f.enlace ?? 'sin identificador público — correr §53 del esquema'}
            </code>
            {f.enlace && (
              <button onClick={async () => {
                try { await navigator.clipboard.writeText(f.enlace!); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* visible igual */ }
              }} className="text-[10px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 flex-shrink-0"
                style={{ border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
                {copiado ? <Check size={11} /> : <Link2 size={11} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
            )}
          </div>

          {f.email && <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            {f.email}{f.phone && ` · ${f.phone}`}
            {!f.auth_user_id && ' · entra a /afiliado con este correo para vincular su cuenta'}
          </p>}

          {f.detalle.length > 0 && (
            <div className="space-y-1">
              {f.detalle.map(t => (
                <p key={t.store_id} className="text-[10px] flex items-center justify-between gap-2 tabular"
                  style={{ color: 'var(--text-muted)' }}>
                  <span className="truncate">
                    <span style={{ color: COLOR_SUSCRIPCION[t.estado] }}>●</span> {t.nombre}
                    <span style={{ color: 'var(--text-faint)' }}> · {ROTULO_SUSCRIPCION[t.estado]}</span>
                  </span>
                  <span className="flex-shrink-0">
                    {t.transacciones.toLocaleString('es-PE')}
                    {t.sin_plan > 0 && <span style={{ color: 'var(--warn-fg)' }}> (+{t.sin_plan} sin su plan)</span>}
                    {/* La otra razón (§52): la referida sí pagó, el que no fue
                        el afiliado-tienda. Son dos llamadas distintas. */}
                    {t.sin_mi_plan > 0 && <span style={{ color: 'var(--warn-fg)' }}> (+{t.sin_mi_plan} sin el suyo)</span>}
                  </span>
                </p>
              ))}
            </div>
          )}

          {!f.auth_user_id && f.email && <DarAcceso afiliado={f} onListo={onListo} />}

          <Atribuir afiliado={f} tiendas={tiendas} onListo={onListo} />
        </div>
      )}
    </div>
  )
}

/** Crearle la cuenta con la que va a mirar sus números.
 *
 *  Se le da de alta el enlace primero y la cuenta después, que es el orden en
 *  que pasa: el afiliado empieza a repartir su enlace el mismo día y pide ver
 *  el panel cuando ya tiene tiendas. La contraseña la pone quien administra y
 *  se la pasa por donde ya hablan — no hay correo de invitación, y montar uno
 *  para esto sería una pieza más que mantener por un puñado de personas. */
function DarAcceso({ afiliado, onListo }: { afiliado: FilaDeAfiliado; onListo: () => void }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [yendo, setYendo] = useState(false)
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <KeyRound size={12} style={{ color: 'var(--text-faint)' }} />
      <input value={clave} onChange={e => { setClave(e.target.value); setError('') }}
        placeholder={`Contraseña para ${afiliado.email}`} maxLength={72}
        className="text-[10px] flex-1 min-w-0 px-2 py-1.5 rounded-lg"
        style={{ border: '0.5px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' }} />
      <button onClick={async () => {
        setYendo(true)
        const r = await llamarAfiliados({ action: 'acceso', id: afiliado.id, password: clave })
        setYendo(false)
        if (!r.ok) setError(r.data?.error ?? 'No se pudo.')
        else { setClave(''); onListo() }
      }} disabled={clave.length < 6 || yendo}
        className="text-[10px] font-black px-2.5 py-1.5 rounded-lg disabled:opacity-40 flex-shrink-0"
        style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
        Darle acceso
      </button>
      {error && <span className="text-[9px]" style={{ color: 'var(--danger-fg)' }}>{error}</span>}
    </div>
  )
}

/** Colgarle una tienda a mano. Es el arreglo para la atribución que no viajó
 *  sola —el comerciante llegó por el enlace pero se dio de alta por teléfono— y
 *  para la disputa que se resuelve hablando. */
function Atribuir({ afiliado, tiendas, onListo }: {
  afiliado: FilaDeAfiliado
  tiendas: TiendaSuelta[]
  onListo: () => void
}) {
  const [store, setStore] = useState('')
  const [aviso, setAviso] = useState('')
  const [yendo, setYendo] = useState(false)

  const mandar = async (forzar: boolean) => {
    if (!store) return
    setYendo(true)
    const r = await llamarAfiliados({ action: 'atribuir', store_id: store, affiliate_id: afiliado.id, forzar })
    setYendo(false)
    if (r.status === 409) { setAviso('Esa tienda ya es de otro afiliado. Vuelve a tocar para reasignarla.'); return }
    if (!r.ok) { setAviso(r.data?.error ?? 'No se pudo.'); return }
    setAviso(''); setStore(''); onListo()
  }

  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Store size={12} style={{ color: 'var(--text-faint)' }} />
      <select value={store} onChange={e => { setStore(e.target.value); setAviso('') }}
        className="text-[10px] flex-1 min-w-0 px-2 py-1.5 rounded-lg"
        style={{ border: '0.5px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' }}>
        <option value="">Atribuirle una tienda…</option>
        {tiendas.map(t => (
          <option key={t.id} value={t.id}>
            {t.nombre}{t.affiliate_id && t.affiliate_id !== afiliado.id ? ' (ya atribuida)' : ''}
          </option>
        ))}
      </select>
      <button onClick={() => void mandar(!!aviso)} disabled={!store || yendo}
        className="text-[10px] font-black px-2.5 py-1.5 rounded-lg disabled:opacity-40 flex-shrink-0"
        style={{ background: aviso ? 'var(--warn-fg)' : 'var(--surface-3)', color: aviso ? '#fff' : 'var(--text-muted)' }}>
        {aviso ? 'Reasignar' : 'Atribuir'}
      </button>
      {aviso && <span className="text-[9px]" style={{ color: 'var(--warn-fg)' }}>{aviso}</span>}
    </div>
  )
}

function CerrarMes({ periodo, enCurso, cerrado, onListo }: {
  periodo: string; enCurso: string; cerrado: boolean; onListo: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState('')

  if (cerrado) {
    return <span className="text-[10px] font-black flex-shrink-0" style={{ color: 'var(--ok-fg)' }}>Mes cerrado</span>
  }
  // El mes en curso no se cierra: congelaría un número que todavía va a crecer,
  // y cerrar es idempotente — el segundo intento no lo corregiría.
  if (periodo >= enCurso) {
    return <span className="text-[10px] flex-shrink-0 text-right" style={{ color: 'var(--text-faint)' }}>
      Se cierra<br />cuando termine
    </span>
  }

  return (
    <div className="flex-shrink-0 text-right">
      <button
        onClick={async () => {
          if (!confirmando) { setConfirmando(true); return }
          setYendo(true)
          const r = await llamarAfiliados({ action: 'liquidar', periodo })
          setYendo(false); setConfirmando(false)
          if (!r.ok) setError(r.data?.error ?? 'No se pudo cerrar.')
          else { setError(''); onListo() }
        }}
        disabled={yendo}
        className="text-[10px] font-black px-2.5 py-1.5 rounded-lg disabled:opacity-40"
        style={confirmando
          ? { background: 'var(--warn-fg)', color: '#fff' }
          : { border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
        {yendo ? 'Cerrando…' : confirmando ? '¿Seguro? Ya no se mueve' : 'Cerrar el mes'}
      </button>
      {error && <p className="text-[9px] mt-1" style={{ color: 'var(--danger-fg)' }}>{error}</p>}
    </div>
  )
}

function PorPagar({ pago, nombre, onListo }: { pago: PagoAlAfiliado; nombre: string; onListo: () => void }) {
  const [ref, setRef] = useState('')
  const [yendo, setYendo] = useState(false)
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: 'var(--surface-2)' }}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black truncate" style={{ color: 'var(--text)' }}>{nombre}</p>
        <p className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>
          {nombreDelPeriodo(pago.periodo)} · {pago.transacciones.toLocaleString('es-PE')} transacciones
        </p>
      </div>
      <span className="text-sm font-black tabular flex-shrink-0" style={{ color: 'var(--text)' }}>{soles(pago.monto_pen)}</span>
      <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Yape 999…" maxLength={120}
        className="text-[10px] w-24 px-2 py-1.5 rounded-lg flex-shrink-0"
        style={{ border: '0.5px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' }} />
      <button onClick={async () => {
        setYendo(true)
        await llamarAfiliados({ action: 'pagar', payout_id: pago.id, referencia: ref })
        setYendo(false); onListo()
      }} disabled={yendo}
        className="text-[10px] font-black px-2.5 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-40"
        style={{ background: 'var(--brand)', color: '#fff' }}>
        Pagado
      </button>
    </div>
  )
}

function FormularioNuevo({ afiliados, onListo }: { afiliados: FilaDeAfiliado[]; onListo: () => void }) {
  const [f, setF] = useState({ codigo: '', nombre: '', email: '', phone: '', referred_by: '', password: '' })
  const [error, setError] = useState('')
  const [yendo, setYendo] = useState(false)
  const codigo = normalizarCodigo(f.codigo)
  const valido = esCodigoValido(codigo) && !!f.nombre.trim()

  return (
    <div className="rounded-2xl p-3 mb-3 space-y-2" style={{ background: 'var(--surface-2)' }}>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Nombre" value={f.nombre} onChange={v => setF({ ...f, nombre: v })} placeholder="Jhoann Pacahuala" />
        <Campo label="Código (su enlace)" value={f.codigo} onChange={v => setF({ ...f, codigo: v })} placeholder="jhoann" />
        {/* El correo NO es opcional en la práctica: es la llave con la que el
            afiliado vincula su cuenta y ve sus números. Sin él hay que volver a
            entrar acá a escribirlo. */}
        <Campo label="Correo (con el que va a entrar)" value={f.email} onChange={v => setF({ ...f, email: v })} placeholder="correo@ejemplo.com" />
        <Campo label="Teléfono" value={f.phone} onChange={v => setF({ ...f, phone: v })} placeholder="999888777" />
      </div>
      {/* Opcional: el enlace funciona desde el minuto uno, lo que necesita
          cuenta es MIRAR. Se le puede dar de alta hoy y acceso la semana que
          viene, con el botón «Darle acceso». */}
      <Campo label="Contraseña del panel (opcional, 6+)" value={f.password}
        onChange={v => setF({ ...f, password: v })} placeholder="se la das tú" />
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-faint)' }}>Lo trajo</p>
        <select value={f.referred_by} onChange={e => setF({ ...f, referred_by: e.target.value })}
          className="text-[11px] w-full px-2 py-1.5 rounded-lg"
          style={{ border: '0.5px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' }}>
          <option value="">Kross directo</option>
          {afiliados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
      {codigo && (
        <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
          <b className="tabular">/{codigo}</b> es cómo lo identificas tú acá. Su enlace público
          sale opaco —<span className="tabular">krossclub.app/u/…</span>— y aparece al crearlo:
          el identificador lo asigna la base, no esta pantalla.
        </p>
      )}
      {error && <p className="text-[10px]" style={{ color: 'var(--danger-fg)' }}>{error}</p>}
      <button
        onClick={async () => {
          setYendo(true)
          const r = await llamarAfiliados({ action: 'crear', ...f, codigo, referred_by: f.referred_by || null })
          setYendo(false)
          if (!r.ok) setError(r.data?.error ?? 'No se pudo crear.')
          else onListo()
        }}
        disabled={!valido || yendo}
        className="text-[10px] font-black px-3 py-2 rounded-lg disabled:opacity-40"
        style={{ background: 'var(--brand)', color: '#fff' }}>
        {yendo ? 'Creando…' : 'Crear afiliado'}
      </button>
    </div>
  )
}

function Campo({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="text-[11px] w-full px-2 py-1.5 rounded-lg"
        style={{ border: '0.5px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' }} />
    </div>
  )
}
