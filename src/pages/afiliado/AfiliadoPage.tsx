import { useCallback, useEffect, useState } from 'react'
import { Link2, TrendingUp, Store, Users, Wallet, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import CopyRow from '../../components/CopyRow'
import {
  llamarAfiliados, porQueNoSePudo,
  type MiPanel, type PagoAlAfiliado, type Respuesta,
} from '../../lib/afiliados-api'
import {
  ROTULO_SUSCRIPCION, nombreDelPeriodo, periodoDe, periodoAnterior,
  type EstadoSuscripcion,
} from '../../../supabase/functions/_shared/afiliados.ts'

// ─── LA PANTALLA DEL AFILIADO ────────────────────────────────────────────────
//
// Responde cuatro preguntas y en este orden, porque es el orden en que se
// hacen:
//
//   1. **¿Cuál es mi enlace?** Arriba del todo y copiable de un toque. Es lo
//      único que el afiliado necesita todos los días; todo lo demás lo mira una
//      vez al mes.
//   2. **¿Cuánto llevo este mes?** El número grande. Se cuenta de `cobros` en
//      cada carga, así que está al día — no es un saldo que alguien actualiza.
//   3. **¿Qué tienda me está dando eso?** El desglose. Y ahí también las que NO
//      cuentan, con el motivo.
//   4. **¿Quién está debajo de mí?** Su rama, a cualquier profundidad.
//
// ⚠️ **Las que no cuentan se enseñan.** Una tienda referida que dejó de pagar
// su plan hace cero soles de comisión, y esconder esas transacciones deja al
// afiliado mirando "300 ventas, S/0.00" sin explicación —que se lee como un
// robo—. Con el motivo al lado, la conversación deja de ser con nosotros y pasa
// a ser con su tienda, que además es la que él puede destrabar.

const COLOR_SUSCRIPCION: Record<EstadoSuscripcion, { fondo: string; texto: string }> = {
  activa:          { fondo: '#DCFCE7', texto: '#16A34A' },
  prueba:          { fondo: '#DBEAFE', texto: '#2563EB' },
  en_gracia:       { fondo: '#FEF3C7', texto: '#B45309' },
  cancelada:       { fondo: '#FEE2E2', texto: '#DC2626' },
  sin_suscripcion: { fondo: '#F3F4F6', texto: '#6B7280' },
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`

export default function AfiliadoPage() {
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

  if (cargando && !panel) {
    return <Marco><p className="text-xs text-gray-400">Cargando tus números…</p></Marco>
  }

  if (problema) {
    return (
      <Marco>
        <div className="rounded-xl px-3 py-3" style={{ background: 'var(--warn-bg)' }}>
          <p className="text-[11px] font-black mb-1" style={{ color: 'var(--warn-fg)' }}>
            No se pudo abrir tu panel
          </p>
          <p className="text-[10px] leading-snug" style={{ color: 'var(--warn-fg)' }}>{problema}</p>
        </div>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="mt-3 text-[10px] font-bold underline" style={{ color: 'var(--text-muted)' }}>
          Salir
        </button>
      </Marco>
    )
  }

  if (!panel) return <Marco><p className="text-xs text-gray-400">Sin datos.</p></Marco>

  const { yo, mes, tarifa, precio_plan_usd, pagos, equipo } = panel
  const anterior = periodoAnterior(periodoDe(new Date()))
  const enCurso = periodoDe(new Date())
  const porCobrar = pagos.filter(p => p.estado === 'CALCULADO')

  return (
    <Marco>
      <header className="flex items-center justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h1 className="text-base font-black truncate" style={{ color: 'var(--text)' }}>{yo.nombre}</h1>
          <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Afiliado de Kross</p>
        </div>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0"
          style={{ border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}>
          Salir
        </button>
      </header>

      {/* 1. El enlace. Lo primero, porque es lo único de uso diario. */}
      <section className="rounded-2xl p-3 mb-3" style={{ background: 'var(--surface-2)' }}>
        <p className="text-[10px] font-black uppercase tracking-wide mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--text-faint)' }}>
          <Link2 size={12} /> Tu enlace
        </p>
        <CopyRow label="Compártelo" value={yo.enlace} />
        <p className="text-[10px] leading-snug mt-1" style={{ color: 'var(--text-faint)' }}>
          Quien se dé de alta desde aquí queda a tu nombre. Ganas <b>{soles(tarifa)}</b> por cada
          transacción que haga esa tienda, mientras tenga su plan de ${precio_plan_usd}/mes al día.
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
          {mes.transacciones.toLocaleString('es-PE')} transacciones × {soles(tarifa)}
        </p>
        {/* El número que no se esconde. */}
        {mes.sin_plan > 0 && (
          <p className="text-[10px] leading-snug mt-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}>
            Otras <b>{mes.sin_plan.toLocaleString('es-PE')}</b> transacciones de tus tiendas no
            cuentan este mes porque su plan no estaba al día. Abajo está cuál.
          </p>
        )}
      </section>

      {/* 3. Qué tienda me da eso. */}
      <section className="mb-3">
        <p className="text-[10px] font-black uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
          style={{ color: 'var(--text-faint)' }}>
          <Store size={12} /> Tus tiendas ({mes.tiendas.length})
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
                  {t.transacciones.toLocaleString('es-PE')} transacciones · <b>{soles(t.transacciones * tarifa)}</b>
                </p>
                {t.sin_plan > 0 && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--warn-fg)' }}>
                    {t.sin_plan.toLocaleString('es-PE')} no cuentan: el plan no estaba al día esos días.
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
                style={{ paddingLeft: 12 + a.nivel * 14, borderTop: a.nivel === 0 && a.id !== equipo[0].id ? '0.5px solid var(--border)' : undefined }}>
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
    </Marco>
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
          {pago.transacciones.toLocaleString('es-PE')} transacciones
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

/** El marco: esta pantalla vive FUERA del panel de vendedor —el afiliado no es
 *  un vendedor de ninguna tienda— así que trae su propio contenedor en vez de
 *  colgarse del `Layout`. */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
      <div className="max-w-lg mx-auto px-4 py-5">{children}</div>
    </div>
  )
}
