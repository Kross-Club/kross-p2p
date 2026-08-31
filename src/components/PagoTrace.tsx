import { useEffect, useState } from 'react'
import { CreditCard, Check, Clock, Copy } from 'lucide-react'
import { cobrosDelPedido, soles } from '../lib/order-money'
import type { Cobro, TipoDeCobro } from '../lib/order-money'
import { datosDeRastro, textoParaSoporte } from '../lib/rastro-de-pago'
import type { OrderSession, PagoTrazado } from '../lib/order-api'

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

const TITULO: Record<TipoDeCobro, string> = {
  adelanto: 'Adelanto pagado con Yape (360pay)',
  total: 'Pago completo con Yape (360pay)',
  saldo: 'Saldo pagado con Yape (360pay)',
}

/** Lo que queda claro solo diciéndolo. "Adelanto" sin más deja al vendedor
 *  restando de cabeza para saber si todavía falta cobrar algo. */
const PIE: Record<TipoDeCobro, (saldo: number) => string | null> = {
  adelanto: saldo => (saldo > 0 ? `Queda un saldo de ${soles(saldo)}` : null),
  total: () => 'No queda saldo pendiente',
  saldo: () => 'Con esto el pedido queda pagado por completo',
}

export default function PagoTrace({ session }: { session: OrderSession }) {
  const cobros = cobrosDelPedido(session)
  if (cobros.length === 0) return null

  const valor = Math.max(0, Number(session.product_price ?? 0))
  const cobrado = cobros.filter(c => c.verificado).reduce((n, c) => n + c.monto, 0)
  const falta = Math.max(0, valor - cobrado)

  return (
    <>
      {cobros.map(cobro => (
        <TarjetaDeCobro
          key={cobro.tipo}
          cobro={cobro}
          orderId={session.order_id ?? null}
          trace={cobro.tipo === 'saldo' ? session.saldo_trace ?? null : session.payment_trace ?? null}
          cobradoEn={cobro.tipo === 'saldo' ? session.saldo_matched_at ?? null : session.payment_matched_at ?? null}
          falta={falta}
        />
      ))}
    </>
  )
}

/**
 * Una operación. Verde cuando entró; ámbar mientras el cupón está emitido y sin
 * pagar — que no es lo mismo y confundirlos es despachar sin haber cobrado.
 */
function TarjetaDeCobro({ cobro, orderId, trace, cobradoEn, falta }: {
  cobro: Cobro
  orderId: string | null
  trace: PagoTrazado | null
  /** Cuándo entró la plata. Es lo que ubica la transacción en un listado de
   *  miles, y hasta hoy no se veía ni se copiaba. */
  cobradoEn: string | null
  /** Lo que falta cobrar del pedido entero, para el pie del adelanto. */
  falta: number
}) {
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 1500)
    return () => clearTimeout(t)
  }, [copiado])

  const ok = cobro.verificado
  // Una lista para las dos cosas: lo que se pinta es exactamente lo que se copia.
  const datos = datosDeRastro({ orderId, trace, cobradoEn: ok ? cobradoEn : null })
  const paraSoporte = textoParaSoporte(TITULO[cobro.tipo], soles(cobro.monto), datos)

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
          <span className="truncate">{ok ? TITULO[cobro.tipo] : `${TITULO[cobro.tipo].split(' ')[0]} sin pagar`}</span>
        </p>
        {/* El MONTO, acá y en ningún otro sitio. Es el dato por el que se abre
            esta tarjeta, así que va grande y a la derecha. */}
        <span className="text-sm font-black tabular flex-shrink-0"
          style={{ color: ok ? 'var(--ok-fg)' : 'var(--text-muted)' }}>
          {soles(cobro.monto)}
        </span>
      </div>

      <div className="mt-1.5 space-y-0.5 text-[10px]" style={{ color: ok ? 'var(--ok-fg)' : 'var(--text-faint)' }}>
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

        {pie && <p className="opacity-70 mt-1">{pie}</p>}
      </div>

      {datos.length > 0 && (
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(paraSoporte); setCopiado(true) } catch { /* visible igual */ }
          }}
          className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold"
          style={ok
            ? { border: '0.5px solid var(--ok-border)', color: 'var(--ok-fg)' }
            : { border: '0.5px solid var(--warn-border)', color: 'var(--text-muted)' }}
        >
          {copiado ? <Check size={11} /> : <Copy size={11} />}
          {copiado ? 'Copiado' : 'Copiar para soporte 360pay'}
        </button>
      )}
    </div>
  )
}
