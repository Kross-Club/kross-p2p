import { useEffect, useState } from 'react'
import { CreditCard, Check, Clock, Copy, Send, RefreshCw, Trash2 } from 'lucide-react'
import { cobrosDelPedido, soles, solesExactos } from '../lib/order-money'
import type { Cobro, TipoDeCobro } from '../lib/order-money'
import { datosDeRastro, textoParaSoporte } from '../lib/rastro-de-pago'
import { puedePagarSaldo } from '../lib/order-money'
import { seCobraPorChat } from '../lib/cobro-por-chat'
import { sePuedeBorrar } from '../../supabase/functions/_shared/cobros.ts'
import { vigenciaDeCupon, sePuedeEnviarCobro, avisoDeVigencia } from '../lib/vigencia-de-cupon'
import type { OrderSession, PagoTrazado } from '../lib/order-api'
import type { Proveedor } from '../../supabase/functions/_shared/comision.ts'

// ─── La plata que entró, operación por operación ─────────────────────────────
//
// Un pedido se cobra hasta DOS veces y son operaciones distintas:
//
//   · al cerrar el checkout el comprador **o adelanta o paga todo**;
//   · si adelantó, después —cuando ya hay guía— paga el SALDO, y eso es lo que
//     suelta la clave de recojo.
//
// Cada una tiene su cupón, su número de operación bancaria y su fecha. Por eso
// son dos tarjetas y no una suma: un reclamo pregunta por UNA de las dos, y con
// un solo "pagado S/180" no hay manera de saber cuál.
//
// Acá vive TODO lo de un cobro que salió bien — el monto incluido. Antes el
// monto estaba repetido tres veces en la misma columna: en la ficha del cliente
// ("Adelanto de S/90 verificado"), en su propio panel ("ADELANTO S/90 ✓
// VERIFICADO") y otra vez acá. Tres sitios diciendo lo mismo es tres sitios
// donde puede decirse distinto.
//
// En pantalla va TODO lo que sirve para seguir la transacción, y sale de una
// sola lista (`rastro-de-pago.ts`) que es la misma que arma el texto del botón
// de copiar. Antes eran dos listas y ya discrepaban: el **cupón** estaba solo
// en el texto copiado, con el argumento de que es un alfanumérico de API que no
// ayuda a cuadrar mirando. Ese argumento era del portal, no de quien trabaja —
// el cupón es lo que soporte de 360pay pide para abrir un caso, y tenerlo
// detrás de un botón obliga a copiar a ciegas para leer un dato que debería
// estar a la vista.
//
// Sobre "el número con el que yapeó": no existe. Yape no revela el celular del
// pagador —ni a 360pay ni al comercio—; lo que sí llega es el rastro bancario
// (N° de operación + banco), y eso es lo que se muestra.

/** El nombre del riel como lo conoce el comercio: es con quién habla cuando un
 *  cobro se discute, así que sí se nombra — al comprador no, a Ventas sí. */
export const NOMBRE_RIEL: Record<Proveedor, string> = { '360PAY': '360pay', FLOW: 'Flow' }

const TITULO_BASE: Record<TipoDeCobro, string> = {
  adelanto: 'Adelanto pagado con Yape',
  total: 'Pago completo con Yape',
  saldo: 'Saldo pagado con Yape',
  // El cobro adicional no dice "adicional" en la tarjeta: para el comprador es
  // simplemente lo que le cobraron, y el CONCEPTO —el flete, la diferencia—
  // aparece debajo, que es el dato que de verdad le falta.
  extra: 'Cobro pagado con Yape',
}

/** El título con el riel de ESTE cobro. Sale del cobro y no del pedido: con
 *  dos rieles, el pedido no dice por dónde fue cada uno. */
const titulo = (tipo: TipoDeCobro, riel: Proveedor) => `${TITULO_BASE[tipo]} (${NOMBRE_RIEL[riel]})`

/** Lo que queda claro solo diciéndolo. "Adelanto" sin más deja al vendedor
 *  restando de cabeza para saber si todavía falta cobrar algo. */
const PIE: Record<TipoDeCobro, (saldo: number) => string | null> = {
  adelanto: saldo => (saldo > 0 ? `Queda un saldo de ${soles(saldo)}` : null),
  total: () => 'No queda saldo pendiente',
  saldo: () => 'Con esto el pedido queda pagado por completo',
  // Un `extra` no cierra ni deja abierto el pedido: es plata aparte, así que no
  // dice nada sobre el saldo. Su concepto se pinta en su sitio.
  extra: () => null,
}

export default function PagoTrace({ session, onCobrar, onReemitir, onQuitar }: {
  session: OrderSession
  /** Mandar la tarjeta de pago por el chat. Lo hace la página —que es quien sabe
   *  mandar mensajes y quien conoce el demo—; acá solo se ofrece el botón. */
  onCobrar?: () => Promise<void> | void
  /** Emitir otro cupón cuando el anterior caducó. No "extiende" nada: 360pay no
   *  tiene con qué, y no hace falta — `pay360-coupon` anula el vencido y emite
   *  uno nuevo BAJO EL MISMO código de pago, que es estable por comprador. */
  onReemitir?: () => Promise<void> | void
  /** Dar de baja un cobro creado a mano. Solo llega a los que lo permiten
   *  (`sePuedeBorrar`): el adelanto y el saldo no son del vendedor, y un cobro
   *  con plata dentro se reembolsa, no se borra de una lista. */
  onQuitar?: (cobroId: string) => Promise<void> | void
}) {
  // El reloj se lee UNA vez, al montar, y baja como dato — el mismo trato que
  // `fechas.ts` le da a `ahora`. Leerlo en cada pintada haría que dos tarjetas
  // separadas por medio segundo decidieran distinto sobre un cupón que caduca
  // justo ahora; y leerlo DURANTE el render es impuro (lo ataja el linter).
  //
  // Va ARRIBA del `return null`: un hook después de una salida temprana se
  // llamaría en unos renders y no en otros.
  const [ahora] = useState(() => Date.now())

  const cobros = cobrosDelPedido(session)
  if (cobros.length === 0) return null

  const valor = Math.max(0, Number(session.product_price ?? 0))
  const cobrado = cobros.filter(c => c.verificado).reduce((n, c) => n + c.monto, 0)
  const falta = Math.max(0, valor - cobrado)

  return (
    <>
      {cobros.map(cobro => (
        <TarjetaDeCobro
          // Por id cuando lo hay: con dos cobros extra, la clave por tipo se
          // repetiría y React pintaría uno solo.
          key={cobro.id ?? cobro.tipo}
          cobro={cobro}
          // El de la fila cuando lo hay; si no, el del pedido. Los cobros de las
          // columnas viejas no lo traen y son todos de 360pay.
          riel={cobro.riel ?? (session.payment_provider === 'FLOW' ? 'FLOW' : '360PAY')}
          orderId={session.order_id ?? null}
          trace={rastroDe(cobro, session)}
          cobradoEn={cobro.matchedAt
            ?? (cobro.tipo === 'saldo' ? session.saldo_matched_at ?? null : session.payment_matched_at ?? null)}
          falta={falta}
          venceEl={cobro.venceEl
            ?? (cobro.tipo === 'saldo' ? session.pay360_saldo_coupon_expires_at ?? null : session.pay360_coupon_expires_at ?? null)}
          ahora={ahora}
          {...(seCobraPorChat(cobro, session) && (cobro.tipo !== 'saldo' || puedePagarSaldo(session))
            ? { onCobrar, onReemitir }
            : {})}
          {...(cobro.fila && sePuedeBorrar(cobro.fila) ? { onQuitar } : {})}
        />
      ))}
    </>
  )
}

/**
 * El rastro de UN cobro.
 *
 * Con dos cobros extra vivos, el pedido ya no tiene "el" cupón: cada uno tiene
 * el suyo, y esos datos viven en su fila desde el bloque §36. Pero la operación
 * BANCARIA todavía se guarda por sesión —`payment_trace` / `saldo_trace`—, así
 * que los campos de la fila **rellenan** los de la sesión en vez de reemplazarla:
 * si se reemplazara, la tarjeta del saldo pagado perdería el número de operación
 * justo cuando alguien lo necesita, que es al escribirle al soporte de 360pay.
 *
 * El día que la operación bancaria también se guarde por cobro, esto se queda
 * en la primera mitad.
 */
function rastroDe(cobro: Cobro, session: OrderSession): PagoTrazado | null {
  const deLaSesion = cobro.tipo === 'saldo' ? session.saldo_trace ?? null : session.payment_trace ?? null
  // Un `extra` no tiene columnas en la sesión: lo suyo es lo de su fila y nada
  // más. Heredar el rastro del adelanto le pegaría el cupón del que no fue.
  const base = cobro.tipo === 'extra' ? null : deLaSesion
  if (!cobro.couponId && !cobro.paymentCode) return base
  return {
    operation_number: base?.operation_number ?? null,
    bank: base?.bank ?? null,
    coupon_id: cobro.couponId ?? base?.coupon_id ?? null,
    payment_code: cobro.paymentCode ?? base?.payment_code ?? null,
  }
}

/**
 * Una operación. Verde cuando entró; ámbar mientras el cupón está emitido y sin
 * pagar — que no es lo mismo y confundirlos es despachar sin haber cobrado.
 */
function TarjetaDeCobro({ cobro, riel, orderId, trace, cobradoEn, falta, venceEl, ahora, onCobrar, onReemitir, onQuitar }: {
  cobro: Cobro
  riel: Proveedor
  orderId: string | null
  trace: PagoTrazado | null
  /** Cuándo entró la plata. Es lo que ubica la transacción en un listado de
   *  miles, y hasta hoy no se veía ni se copiaba. */
  cobradoEn: string | null
  /** Lo que falta cobrar del pedido entero, para el pie del adelanto. */
  falta: number
  /** Cuándo caduca este cupón, si se sabe. */
  venceEl: string | null
  ahora: number
  /** Solo en el saldo sin pagar: mandarle la tarjeta de pago por el chat. */
  onCobrar?: () => Promise<void> | void
  /** Íd.: emitir otro cupón cuando el anterior caducó. */
  onReemitir?: () => Promise<void> | void
  /** Solo en los cobros hechos a mano y sin pagar. */
  onQuitar?: (cobroId: string) => Promise<void> | void
}) {
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [reemitiendo, setReemitiendo] = useState(false)
  const vigencia = vigenciaDeCupon(venceEl, ahora)
  const aviso = avisoDeVigencia(venceEl, ahora)
  useEffect(() => {
    if (!enviado) return
    const t = setTimeout(() => setEnviado(false), 2500)
    return () => clearTimeout(t)
  }, [enviado])
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 1500)
    return () => clearTimeout(t)
  }, [copiado])

  const ok = cobro.verificado
  // Una lista para las dos cosas: lo que se pinta es exactamente lo que se copia.
  const datos = datosDeRastro({ orderId, trace, cobradoEn: ok ? cobradoEn : null })
  const paraSoporte = textoParaSoporte(titulo(cobro.tipo, riel), soles(cobro.monto), datos)

  const pie = ok ? PIE[cobro.tipo](falta) : null

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-2.5"
      style={ok
        ? { background: 'var(--ok-bg-soft)', border: '0.5px solid var(--ok-border)' }
        : { background: 'var(--warn-bg-soft)', border: '0.5px solid var(--warn-border)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-bold min-w-0"
          style={{ color: ok ? 'var(--ok-fg)' : 'var(--text-muted)' }}>
          {ok ? <CreditCard size={13} className="flex-shrink-0" /> : <Clock size={13} className="flex-shrink-0" />}
          <span className="truncate">{ok ? titulo(cobro.tipo, riel) : `${TITULO_BASE[cobro.tipo].split(' ')[0]} sin pagar`}</span>
        </p>
        {/* El MONTO, acá y en ningún otro sitio. Es el dato por el que se abre
            esta tarjeta, así que va grande y a la derecha. */}
        <span className="text-sm font-black tabular flex-shrink-0"
          style={{ color: ok ? 'var(--ok-fg)' : 'var(--text-muted)' }}>
          {soles(cobro.monto)}
        </span>
      </div>

      <div className="mt-1.5 space-y-0.5 text-[10px]" style={{ color: ok ? 'var(--ok-fg)' : 'var(--text-faint)' }}>
        {/* Lo que se le descontó al comercio, y lo que le queda. Va PRIMERO y
            pegado al monto porque es la resta que se hace mirando la tarjeta:
            el monto grande es lo que pagó el cliente, no lo que entra a la
            cuenta, y esa diferencia se buscaba cuadrando a mano.

            Solo cuando la pasarela mandó el desglose (§38). Con NULL no se
            pinta nada: estimar la comisión y ponerla al lado de un monto real
            la haría leerse como medida, y es justo el número que se discute
            cuando una liquidación no cuadra.

            Con céntimos, que es la excepción a `soles()` — sin ellos el neto no
            cuadraría con la resta. */}
        {ok && cobro.comision != null && cobro.neto != null && (
          <p className="mb-1">
            <span className="opacity-60">Comisión</span>{' '}
            <span className="tabular font-bold">{solesExactos(cobro.comision)}</span>
            <span className="opacity-60"> · recibes </span>
            <span className="tabular font-bold">{solesExactos(cobro.neto)}</span>
          </p>
        )}

        {/* Un cupón emitido no es plata. Decirlo evita el error caro: despachar
            leyendo el monto y dando por hecho que entró. Va ARRIBA de los datos
            porque cambia lo que significan: los mismos códigos, buscando por qué
            no entró en vez de comprobando que entró. */}
        {!ok && (
          <p className="mb-1">El cupón está emitido y todavía sin pagar. El cliente puede pagarlo
            desde su Yape cuando quiera; si no lo hace, coordina por el chat.</p>
        )}

        {/* Con qué se sigue esta transacción. La lista sale de `rastro-de-pago`
            y es la misma que copia el botón. También en el cupón sin pagar: es
            justo cuando hay que buscarlo —"ya pagué" y en el panel no aparece—. */}
        {datos.map(d => (
          <p key={d.etiqueta} className={d.largo ? 'break-all' : ''}>
            <span className="opacity-60">{d.etiqueta}</span>{' '}
            <span className={d.largo ? 'font-mono font-bold' : 'tabular font-bold'}>{d.valor}</span>
          </p>
        ))}

        {/* Qué se está cobrando. Un `extra` sin esto es un monto sin razón, y
            nadie paga un monto sin razón. */}
        {cobro.concepto && <p className="font-bold">{cobro.concepto}</p>}

        {/* Cuándo caduca. Solo mientras no se ha pagado: en un cobro que ya
            entró, la fecha de vencimiento no le importa a nadie. */}
        {!ok && aviso && (
          <p className="mt-1" style={{ color: vigencia === 'vencido' ? 'var(--danger-fg)' : undefined }}>
            {aviso}
          </p>
        )}

        {pie && <p className="opacity-70 mt-1">{pie}</p>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* En un cobro que YA entró, el botón es copiar el rastro para soporte.
            En uno que NO ha entrado, lo que hace falta no es copiar códigos: es
            cobrar. Por eso la tarjeta ámbar cambia de botón en vez de sumar
            uno — el rastro sigue a la vista, arriba, para quien lo necesite. */}
        {ok && datos.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              try { await navigator.clipboard.writeText(paraSoporte); setCopiado(true) } catch { /* visible igual */ }
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold"
            style={{ border: '0.5px solid var(--ok-border)', color: 'var(--ok-fg)' }}
          >
            {copiado ? <Check size={11} /> : <Copy size={11} />}
            {copiado ? 'Copiado' : `Copiar para soporte ${NOMBRE_RIEL[riel]}`}
          </button>
        )}

        {/* Mandarle la tarjeta de pago. El cupón lleva días emitido y esperando;
            la tarjeta que el comprador tiene al final de su chat solo la ve
            quien abre la app, y el que debe un saldo es justamente el que dejó
            de abrirla. Como mensaje sale por push y, sin push, por WhatsApp: la
            diferencia entre una tarjeta que está y un aviso que suena.
            
            Y **solo si el código sirve**: mandar una tarjeta con un cupón
            vencido es peor que no mandarla — el cliente hace su parte, Yape lo
            rechaza, y encima se gastó el único mensaje que iba a abrir. */}
        {onCobrar && sePuedeEnviarCobro(vigencia) && (
          <button
            type="button"
            disabled={enviando}
            onClick={async () => {
              setEnviando(true)
              try { await onCobrar(); setEnviado(true) } finally { setEnviando(false) }
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black disabled:opacity-50"
            style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}
          >
            {enviado ? <Check size={11} /> : <Send size={11} />}
            {enviado ? 'Enviada al chat' : enviando ? 'Enviando…' : 'Enviar tarjeta de pago'}
          </button>
        )}

        {/* Darlo de baja. Solo un cobro hecho a mano y sin pagar — lo comprueba
            el servidor igual; acá se evita ofrecer lo que va a ser rechazado. */}
        {onQuitar && cobro.id && (
          <button
            type="button"
            onClick={() => onQuitar(cobro.id!)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold"
            style={{ border: '0.5px solid var(--danger-border)', color: 'var(--danger-fg)' }}
          >
            <Trash2 size={11} /> Dar de baja
          </button>
        )}

        {/* Caducó. No se "extiende" —360pay no tiene con qué— y no hace falta:
            se emite otro, y el CÓDIGO DE PAGO del comprador no cambia, porque es
            estable por comprador. Lo que cambia es el cupón que cuelga de él. */}
        {onReemitir && vigencia === 'vencido' && (
          <button
            type="button"
            disabled={reemitiendo}
            onClick={async () => {
              setReemitiendo(true)
              try { await onReemitir() } finally { setReemitiendo(false) }
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black disabled:opacity-50"
            style={{ background: 'var(--danger-fg)', color: '#fff' }}
          >
            <RefreshCw size={11} />
            {reemitiendo ? 'Generando…' : 'Venció · generar otro código'}
          </button>
        )}
      </div>
    </div>
  )
}
