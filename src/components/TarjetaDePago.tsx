import { Check, Wallet } from 'lucide-react'
import { soles } from '../lib/order-money'
import { BotonPagarSaldo, type PedidoConSaldo } from './PagarSaldo'

// ─── La tarjeta de pago, en los dos chats ────────────────────────────────────
//
// El mismo componente lo pintan el comprador y el vendedor, igual que
// `OfferCard`. Antes solo existía del lado del comprador y el vendedor veía una
// burbuja de texto: mandaba algo y no tenía forma de saber qué había mandado ni
// si había llegado. Una acción cuyo resultado no se ve es una acción que se
// repite "por si acaso".
//
// El **morado de Yape** (`#742284`, el mismo del checkout) no es decoración: es
// lo que hace que el comprador reconozca de un vistazo que ese botón lo lleva a
// donde ya pagó el adelanto. El verde de Kross ahí diría "algo bueno"; el
// morado dice "Yape".

export default function TarjetaDePago({ texto, monto, pedido, cobro, role, pagada, hora }: {
  /** El cuerpo del mensaje: lo mismo que le llegó por push y por WhatsApp. */
  texto: string | null
  /** El monto de ESTE cobro. Ojo: no es "lo que falta del pedido hoy" — en
   *  cuanto se paga, eso es cero, y la tarjeta pasaba a decir S/ 0 debajo de un
   *  texto que hablaba de S/ 60. Ver `montoDeLaTarjeta`. */
  monto: number
  pedido: PedidoConSaldo
  /** El cobro al que apunta el mensaje (bloque §37), cuando apunta a uno. Es lo
   *  que hace que el botón cobre ESTO y no el saldo: sin él, una tarjeta de
   *  flete abría Yape para pagar el saldo del pedido, por otro monto. */
  cobro?: { id?: string | null; monto: number } | null
  role: 'buyer' | 'seller'
  /** Ya entró la plata. Es lo único que convierte "enviada" en "aceptada". */
  pagada: boolean
  hora?: string
}) {
  return (
    <div className={`flex ${role === 'buyer' ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className="max-w-[85%] rounded-2xl overflow-hidden"
        style={{ border: '0.5px solid var(--ok-border)', background: 'var(--ok-bg-soft)' }}>
        <div className="p-3">
          <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1"
            style={{ color: 'var(--ok-fg)' }}>
            <Wallet size={11} /> {role === 'buyer' ? 'Pago pendiente' : 'Tarjeta de pago enviada'}
          </p>

          {/* El monto, grande. Es el dato por el que se abre esta tarjeta —
              tanto para decidir pagar como para saber qué se pidió. */}
          <p className="font-black text-xl mt-0.5" style={{ color: 'var(--ok-fg)' }}>{soles(monto)}</p>
          {texto && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{texto}</p>}

          {role === 'buyer' && (
            pagada
              ? <div className="w-full mt-2 py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-1.5"
                  // `--ok-on` sobre el lima: en tema oscuro `--ok-fg` es el
                  // mismo lima del fondo y el texto desaparecía.
                  style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}>
                  <Check size={15} /> Pago recibido
                </div>
              : <div className="mt-2"><BotonPagarSaldo pedido={pedido} cobro={cobro} /></div>
          )}

          {/* Del lado del vendedor no hay botón: él no paga. Lo que necesita
              saber es si el otro lo hizo — y hasta que ocurra, la cabecera ya
              dice "enviada", que es la mitad honesta de la respuesta. */}
          {role === 'seller' && pagada && (
            <p className="text-[11px] font-black mt-1.5 flex items-center gap-1" style={{ color: 'var(--ok-fg)' }}>
              <Check size={12} /> Pagada por el cliente
            </p>
          )}

          {hora && <p className="text-[10px] text-gray-400 mt-1.5">{hora}</p>}
        </div>
      </div>
    </div>
  )
}
