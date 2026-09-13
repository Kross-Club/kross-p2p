import { useCallback, useEffect, useState } from 'react'
import { Link2, TrendingUp, Store, Users, Wallet, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import CopyRow from './CopyRow'
import {
  llamarAfiliados, porQueNoSePudo,
  type MiPanel, type PagoAlAfiliado, type Respuesta,
} from '../lib/afiliados-api'
import {
  ROTULO_SUSCRIPCION, nombreDelPeriodo, periodoDe, periodoAnterior,
  type EstadoSuscripcion,
} from '../../supabase/functions/_shared/afiliados.ts'

// ─── EL PANEL DEL AFILIADO ───────────────────────────────────────────────────
//
// Una sola pantalla para las DOS personas que miran sus referidos, porque miran
// exactamente lo mismo:
//
//   · el afiliado de FUERA, en `/afiliado` — entra, mira y se va. Va `suelto`:
//     con su propio marco y su botón de salir, porque no hay panel alrededor.
//   · el COMERCIANTE, en `Panel → Afiliados` (§52) — ya está adentro de su
//     tienda, así que va sin marco y sin salir: eso lo pone el `Layout`.
//
// Dos componentes para lo mismo se habrían separado en la primera semana: uno
// arreglaría el conteo y el otro seguiría enseñando el viejo, y el que reclama
// es el que cobra.
//
// Responde cuatro preguntas y en este orden, que es el orden en que se hacen:
//
//   1. **¿Cuál es mi enlace?** Arriba del todo y copiable de un toque. Es lo
//      único de uso diario; el resto se mira una vez al mes.
//   2. **¿Cuánto llevo este mes?** El número grande, contado de `cobros` en
//      cada carga — no es un saldo que alguien actualiza.
//   3. **¿Qué tienda me está dando eso?** El desglose, con lo que NO cuenta y
//      por qué.
//   4. **¿Quién está debajo de mí?**
//
// ⚠️ **Lo que no cuenta se enseña, y se dice de QUIÉN es la culpa.** Hay dos
// razones distintas —su referida no pagó, o él no pagó SU plan (§52)— y mandan
// a llamar a personas distintas. Juntarlas en un solo número dejaría al
// comerciante reclamándole a su referido por algo que tiene que arreglar él.

const COLOR_SUSCRIPCION: Record<EstadoSuscripcion, { fondo: string; texto: string }> = {
  activa:          { fondo: '#DCFCE7', texto: '#16A34A' },
  prueba:          { fondo: '#DBEAFE', texto: '#2563EB' },
  en_gracia:       { fondo: '#FEF3C7', texto: '#B45309' },
  cancelada:       { fondo: '#FEE2E2', texto: '#DC2626' },
  sin_suscripcion: { fondo: '#F3F4F6', texto: '#6B7280' },
}

/** Con estos dos estados la comisión corre. Con los otros, no. */
const AL_DIA: EstadoSuscripcion[] = ['activa', 'prueba']

const soles = (n: number) => `S/ ${n.toFixed(2)}`
const miles = (n: number) => n.toLocaleString('es-PE')

export default function PanelDeAfiliado({ suelto = false }: { suelto?: boolean }) {
  const [panel, setPanel] = useState<MiPanel | null>(null)
  const [problema, setProblema] = useState('')
  const [cargando, setCargando] = useState(true)
  // El mes que se está mirando. Arranca en el EN CURSO; el anterior está a un
  // clic porque es el que se cobra.
  const [periodo, setPeriodo] = useState(() => periodoDe(new Date()))

  const aplicar = useCallback((r: Respuesta<MiPanel>) => {
    if (!r.ok) {
      setProblema(porQueNoSePudo(r.status, r.data?.error))
      setPanel(null)
    } else {
      setProblema('')
      setPanel(r.data)
    }
    setCargando(false)
  }, [])

  /** Recargar a mano, con su spinner. */
  const cargar = useCallback(async (mes: string) => {
    setCargando(true)
    aplicar(await llamarAfiliados<MiPanel>({ action: 'mi_panel', periodo: mes }))
  }, [aplicar])

  // La primera carga —y el cambio de mes— van por su cuenta y no llamando a
  // `cargar`, para que el efecto no toque estado de forma síncrona: pide, y
  // recién con la respuesta en la mano pinta. Es el patrón de `ConexionesPage`.
  useEffect(() => {
    let vivo = true
    llamarAfiliados<MiPanel>({ action: 'mi_panel', periodo }).then(r => { if (vivo) aplicar(r) })
    return () => { vivo = false }
  }, [periodo, aplicar])

  if (cargando && !panel) return <p className="text-xs text-gray-400">Cargando tus números…</p>

  if (problema) {
    return (
      <div>
        <div className="rounded-xl px-3 py-3" style={{ background: 'var(--warn-bg)' }}>
          <p className="text-[11px] font-black mb-1" style={{ color: 'var(--warn-fg)' }}>
            No se pudo abrir tu panel de afiliado
          </p>
          <p className="text-[10px] leading-snug" style={{ color: 'var(--warn-fg)' }}>{problema}</p>
        </div>
        {suelto && (
          <button onClick={() => void supabase.auth.signOut()}
            className="mt-3 text-[10px] font-bold underline" style={{ color: 'var(--text-muted)' }}>
            Salir
          </button>
        )}
      </div>
    )
  }

  if (!panel) return <p className="text-xs text-gray-400">Sin datos.</p>

  const { yo, mes, tarifa, precio_plan_usd, pagos, equipo, mi_plan } = panel
  const anterior = periodoAnterior(periodoDe(new Date()))
  const enCurso = periodoDe(new Date())
  const porCobrar = pagos.filter(p => p.estado === 'CALCULADO')
  // Solo una tienda tiene plan propio que vencer (§52). Un afiliado de fuera
  // recibe `null`, que NO es lo mismo que "sin suscripción".
  const miPlanFrena = mi_plan !== null && !AL_DIA.includes(mi_plan)

  return (
    <div>
      {suelto && (
        <header className="flex items-center justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h1 className="text-base font-black truncate" style={{ color: 'var(--text)' }}>{yo.nombre}</h1>
            <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Afiliado de Kross</p>
          </div>
          <button onClick={() => void supabase.auth.signOut()}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0"
            style={{ border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
            Salir
          </button>
        </header>
      )}

      {/* ⚠️ Lo primero cuando su propio plan frena la comisión (§52). Arriba del
          enlace a propósito: de nada sirve que reparta el enlace si lo que trae
          no le va a contar, y es lo único de esta pantalla que él puede
          arreglar hoy mismo. */}
      {miPlanFrena && (
        <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: 'var(--warn-bg)' }}>
          <p className="text-[11px] font-black mb-0.5" style={{ color: 'var(--warn-fg)' }}>
            Tu propio plan de Kross no está al día
          </p>
          <p className="text-[10px] leading-snug" style={{ color: 'var(--warn-fg)' }}>
            Mientras esté así, las ventas de las tiendas que trajiste <b>no te generan comisión</b>.
            Lo que ya se te liquidó se te paga igual.
          </p>
        </div>
      )}

      {/* 1. El enlace. Lo único de uso diario. */}
      <section className="rounded-2xl p-3 mb-3" style={{ background: 'var(--surface-2)' }}>
        <p className="text-[10px] font-black uppercase tracking-wide mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--text-faint)' }}>
          <Link2 size={12} /> Tu enlace
        </p>
        {yo.enlace
          ? <CopyRow label="Compártelo" value={yo.enlace} />
          : <p className="text-[11px]" style={{ color: 'var(--warn-fg)' }}>
              Tu enlace todavía no está listo. Escríbenos y lo activamos.
            </p>}
        <p className="text-[10px] leading-snug mt-1" style={{ color: 'var(--text-faint)' }}>
          Quien se dé de alta desde aquí queda a tu nombre. Ganas <b>{soles(tarifa)}</b> por cada
          transacción que haga esa tienda, mientras tenga su plan de ${precio_plan_usd}/mes al día
          {mi_plan !== null && <> —y tú el tuyo—</>}.
        </p>
        {/* §53: lo que el enlace NO dice. Es tranquilizador para el comerciante
            que duda de repartirlo, y es literalmente por lo que se rediseñó. */}
        <p className="text-[10px] leading-snug mt-1.5" style={{ color: 'var(--text-faint)' }}>
          El enlace no revela el nombre ni la dirección de tu tienda: quien lo abra solo ve que
          lo invitaste tú.
        </p>
      </section>

      {/* 2. Cuánto llevo. */}
      <section className="rounded-2xl p-4 mb-3" style={{ background: 'var(--surface-2)' }}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1.5"
            style={{ color: 'var(--text-faint)' }}>
            <TrendingUp size={12} /> {nombreDelPeriodo(mes.periodo)}
            {mes.periodo === enCurso && <span style={{ color: 'var(--text-faint)' }}>· en curso</span>}
          </p>
          <div className="flex gap-1 flex-shrink-0">
            {[anterior, enCurso].map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className="text-[10px] font-bold px-2 py-1 rounded-lg"
                style={periodo === p
                  ? { background: 'var(--brand)', color: '#fff' }
                  : { border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
                {p === enCurso ? 'Este mes' : 'Mes pasado'}
              </button>
            ))}
            <button onClick={() => void cargar(periodo)} aria-label="Actualizar"
              className="px-2 py-1 rounded-lg" style={{ border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
              <RefreshCw size={11} className={cargando ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <p className="text-3xl font-black tabular" style={{ color: 'var(--text)' }}>{soles(mes.monto)}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {miles(mes.transacciones)} transacciones × {soles(tarifa)}
        </p>

        {/* Las dos razones, separadas: mandan a llamar a personas distintas. */}
        {mes.sin_mi_plan > 0 && (
          <p className="text-[10px] leading-snug mt-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}>
            <b>{miles(mes.sin_mi_plan)}</b> transacciones no cuentan porque <b>tu</b> plan no estaba
            al día esos días.
          </p>
        )}
        {mes.sin_plan > 0 && (
          <p className="text-[10px] leading-snug mt-1.5 rounded-lg px-2 py-1.5" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
            Otras <b>{miles(mes.sin_plan)}</b> no cuentan porque la tienda que las hizo no tenía su
            plan al día. Abajo está cuál.
          </p>
        )}
      </section>

      {/* 3. Qué tienda me da eso. */}
      <section className="mb-3">
        <p className="text-[10px] font-black uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
          style={{ color: 'var(--text-faint)' }}>
          <Store size={12} /> Tiendas que trajiste ({mes.tiendas.length})
        </p>
        {mes.tiendas.length === 0 ? (
          <p className="text-[11px] rounded-xl px-3 py-3" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            Todavía no hay ninguna tienda a tu nombre. Comparte tu enlace: la primera que se dé de
            alta desde ahí aparece acá.
          </p>
        ) : (
          <div className="space-y-1.5">
            {mes.tiendas.map(t => (
              <div key={t.store_id} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-black truncate" style={{ color: 'var(--text)' }}>{t.nombre}</span>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: COLOR_SUSCRIPCION[t.estado].fondo, color: COLOR_SUSCRIPCION[t.estado].texto }}>
                    ● {ROTULO_SUSCRIPCION[t.estado]}
                  </span>
                </div>
                <p className="text-[10px] tabular" style={{ color: 'var(--text-muted)' }}>
                  {miles(t.transacciones)} transacciones · <b>{soles(t.transacciones * tarifa)}</b>
                </p>
                {t.sin_plan > 0 && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--warn-fg)' }}>
                    {miles(t.sin_plan)} no cuentan: su plan no estaba al día esos días.
                  </p>
                )}
                {t.sin_mi_plan > 0 && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--warn-fg)' }}>
                    {miles(t.sin_mi_plan)} no cuentan: el que no estaba al día eras tú.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Lo que se te debe y lo que ya se pagó. */}
      <section className="mb-3">
        <p className="text-[10px] font-black uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
          style={{ color: 'var(--text-faint)' }}>
          <Wallet size={12} /> Tus liquidaciones
        </p>
        {pagos.length === 0 ? (
          <p className="text-[11px] rounded-xl px-3 py-3" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            Todavía no se cierra ningún mes. Un mes se cierra cuando termina, y lo que queda
            anotado ya no se mueve.
          </p>
        ) : (
          <div className="space-y-1.5">
            {porCobrar.length > 0 && (
              <p className="text-[10px] rounded-lg px-2 py-1.5" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)' }}>
                Por cobrar: <b>{soles(porCobrar.reduce((s, p) => s + Number(p.monto_pen), 0))}</b>
              </p>
            )}
            {pagos.map(p => <Liquidacion key={p.periodo} pago={p} />)}
          </div>
        )}
      </section>

      {/* 5. Quién está debajo. Solo si hay alguien: una sección vacía que
          explica un programa que no tienes es ruido. */}
      {equipo.length > 1 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
            style={{ color: 'var(--text-faint)' }}>
            <Users size={12} /> Tu equipo
          </p>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            {equipo.map(a => (
              <div key={a.id} className="px-3 py-2 flex items-center gap-2"
                style={{ paddingLeft: 12 + a.nivel * 14 }}>
                {a.nivel > 0 && <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>└</span>}
                <span className="text-xs font-bold truncate" style={{ color: a.active ? 'var(--text)' : 'var(--text-faint)' }}>
                  {a.nombre}
                </span>
                <span className="text-[10px] tabular" style={{ color: 'var(--text-faint)' }}>/{a.codigo}</span>
                {!a.active && <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>inactivo</span>}
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-snug mt-1.5" style={{ color: 'var(--text-faint)' }}>
            Hoy la comisión se paga solo por las tiendas que traes tú. Tu equipo cobra el suyo por
            las suyas.
          </p>
        </section>
      )}
    </div>
  )
}

function Liquidacion({ pago }: { pago: PagoAlAfiliado }) {
  const pagado = pago.estado === 'PAGADO'
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--surface-2)' }}>
      <div className="min-w-0">
        <p className="text-xs font-black capitalize" style={{ color: 'var(--text)' }}>
          {nombreDelPeriodo(pago.periodo)}
        </p>
        <p className="text-[10px] tabular" style={{ color: 'var(--text-muted)' }}>
          {miles(pago.transacciones)} transacciones
          {pago.referencia && ` · ${pago.referencia}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-black tabular" style={{ color: 'var(--text)' }}>{soles(Number(pago.monto_pen))}</p>
        <p className="text-[9px] font-black" style={{ color: pagado ? 'var(--ok-fg)' : 'var(--warn-fg)' }}>
          {pagado ? 'Pagado' : 'Por cobrar'}
        </p>
      </div>
    </div>
  )
}
