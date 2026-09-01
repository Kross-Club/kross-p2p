import { useState } from 'react'
import { Wallet, ExternalLink, Check } from 'lucide-react'
import { puedePagarSaldo, saldoDelPedido, soles } from '../lib/order-money'
import { etiquetaDePago, MORADO_YAPE } from '../lib/cobro-por-chat'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── Pagar el saldo, desde el chat ───────────────────────────────────────────
//
// El pedido se cobra en dos momentos: el adelanto al cerrar el checkout, y el
// SALDO cuando ya hay guía. Ese segundo cobro se le prometía al comprador desde
// el primer mensaje —"tu saldo nos lo pagas por esta misma app, y apenas lo
// pagues te enviamos tu clave de recojo"— y no había por dónde pagarlo: había
// que pedírselo a un asesor por el chat.
//
// El botón emite el segundo cupón de 360pay y abre Yape con todo puesto. El
// resto es igual que el adelanto: 360pay cobra, el webhook confirma y el
// mensaje con la clave sale solo.
//
// Aparece cuando el saldo se puede pagar de verdad:
//
//   · queda saldo (adelantó una parte, no pagó todo),
//   · el adelanto YA está cruzado — antes no, y no es orden por orden: el
//     código de pago identifica al CLIENTE y el banco cobra siempre el cupón
//     pendiente más antiguo, así que con el adelanto sin pagar, quien viene a
//     pagar el saldo terminaría pagando el adelanto por otro monto,
//   · la tienda cobra en línea (`360PAY`). Sin eso, el saldo lo coordina el
//     asesor y prometer un botón que no cobra es peor que no ponerlo.

export interface PedidoConSaldo {
  token?: string | null
  product_price?: number | null
  advance_amount?: number | string | null
  payment_verification?: string | null
  payment_provider?: string | null
  saldo_verification?: string | null
}

/**
 * El botón, suelto del recuadro.
 *
 * Lo usan DOS sitios: la tarjeta permanente del final del chat y la que llega
 * como mensaje cuando el vendedor vuelve a pedir el saldo. Emitir el cupón dos
 * veces desde dos copias del mismo código es como se llega a que una pida el
 * saldo viejo y la otra el de hoy.
 */
export function BotonPagarSaldo({ pedido, cobro }: {
  pedido: PedidoConSaldo
  /** El cobro que se está pagando, cuando NO es el saldo: un flete, una
   *  diferencia. Se pide por su id y el monto sale de su fila —nunca del
   *  cuerpo de la petición—, para que quien llama no fije lo que se le cobra. */
  cobro?: { id?: string | null; monto: number } | null
}) {
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const falta = cobro ? cobro.monto : saldoDelPedido(pedido)

  const pagar = async () => {
    if (pidiendo || !pedido.token) return
    setPidiendo(true); setError(null)
    try {
      const r = await fetch(`${BASE}/pay360-coupon`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: cobro?.id
          ? JSON.stringify({ order_token: pedido.token, cobro_id: cobro.id })
          : JSON.stringify({ order_token: pedido.token, tipo: 'saldo' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) {
        setError(d.user_message ?? 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.')
        return
      }
      // Sin enlace NO se cae nada: el cupón existe igual y se paga tecleando el
      // código en "Pagar servicios" de Yape. Es el mismo camino que la caja del
      // checkout ya ofrece siempre, por paridad con escritorio.
      if (d.deeplink) window.location.href = d.deeplink
      else setError(`Abre Yape → Pagar servicios → 360Pay y usa tu código ${d.consumer_code ?? ''}`.trim())
    } catch {
      setError('No pudimos generar tu pago. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <>
      {/* Morado de Yape (#742284), el mismo del checkout. El comprador ya pagó
          el adelanto con ese botón: reconocerlo es más rápido que leerlo, y el
          verde de Kross ahí solo diría "algo bueno". */}
      <button
        type="button"
        onClick={pagar}
        disabled={pidiendo}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60"
        style={{ background: MORADO_YAPE }}
      >
        {pidiendo ? <Check size={14} /> : <ExternalLink size={14} />}
        {pidiendo ? 'Abriendo Yape…' : etiquetaDePago(soles(falta))}
      </button>
      {error && (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--danger-fg)' }}>{error}</p>
      )}
    </>
  )
}

/** La tarjeta permanente del final del chat: está siempre mientras haya saldo,
 *  para quien entra a la app por su cuenta. El mensaje de cobro es para quien
 *  no entra. */
export default function PagarSaldo({ pedido }: { pedido: PedidoConSaldo }) {
  if (!puedePagarSaldo(pedido)) return null
  const falta = saldoDelPedido(pedido)

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-3"
      style={{ background: 'var(--ok-bg-soft)', border: '0.5px solid var(--ok-border)' }}>
      <p className="flex items-center gap-2 text-[12px] font-bold" style={{ color: 'var(--ok-fg)' }}>
        <Wallet size={14} className="flex-shrink-0" />
        Te queda un saldo de {soles(falta)}
      </p>
      <p className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--text-muted)' }}>
        Págalo por aquí y te enviamos tu clave de recojo.
      </p>
      <BotonPagarSaldo pedido={pedido} />
    </div>
  )
}
