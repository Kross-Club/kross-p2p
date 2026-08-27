import { MessageCircle, Phone, BadgeCheck, ChevronRight, Smartphone } from 'lucide-react'
import CopyRow from './CopyRow'
import { diaMes } from '../lib/fechas'
import type { OrderSession } from '../lib/order-api'

// ─── A quién pertenece este pedido ───────────────────────────────────────────
//
// Va PRIMERO en la columna del pedido, y es un enlace a la persona. Esa es la
// relación que el modelo ya decía y la pantalla no: un pedido pertenece a un
// cliente, y del cliente cuelgan todos sus pedidos (docs/11-RELACIONES.md). Si
// para saber quién es hay que abrir un modal, la pertenencia no se ve.
//
// Antes esto estaba partido en dos: esta tarjeta (nombre, distrito, DNI) y una
// ficha de contacto que se abría tocando el AVATAR — con el DNI copiable, el
// teléfono y el rastro del pago. Un dato escondido detrás de un avatar que no
// parece un botón es un dato que no existe. Se juntó todo acá.
//
// Todo lo sensible llega por `buyer_contact`, que `get-session` SOLO adjunta
// cuando el que mira es vendedor: es PII, y para el comprador viaja null.
export default function CustomerCard({ session, onVerCliente }: {
  session: OrderSession
  /** Abre la ficha de la persona —donde se ven TODOS sus pedidos—. Sin esto la
   *  tarjeta no es un enlace: solo el admin tiene libreta de clientes. */
  onVerCliente?: () => void
}) {
  const c = session.buyer_contact
  const nombre = c?.nombre || session.buyer_name || 'Comprador'
  const dni = c?.document_number ?? null
  const tipoDoc = c?.document_type || 'DNI'
  const phone = c?.phone ?? null
  const celular = phone ? phone.slice(-9) : null
  // El distrito vive DENTRO de `address` ("San Borja, Lima"): el primer tramo.
  const distrito = session.address ? session.address.split(',')[0].trim() : null
  const pagado = session.payment_verification === 'MATCHED'
  const pushActivo = !!c?.push_activo
  const enAppDesde = diaMes(c?.activated_at)
  const adelanto = Number(session.advance_amount ?? 0)

  const identidad = (
    <div className="flex items-center gap-2.5 text-left w-full">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
        {nombre.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate" style={{ color: 'var(--text)', fontWeight: 500 }}>{nombre}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
          {distrito ?? 'Sin distrito'}
          {onVerCliente && ' · ver sus pedidos'}
        </p>
      </div>
      {onVerCliente && <ChevronRight size={15} className="flex-shrink-0" style={{ color: 'var(--text-faint)' }} />}
    </div>
  )

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-3" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
      {onVerCliente
        ? <button type="button" onClick={onVerCliente} className="w-full">{identidad}</button>
        : identidad}

      {pagado && (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--ok-fg)' }}>
          <BadgeCheck size={13} /> Adelanto de S/ {adelanto} verificado
        </p>
      )}

      {/* ¿Está en la app? Son DOS datos, no uno, y hace falta separarlos para
          decidir cómo se le avisa:
            · entró alguna vez  → `activated_at`
            · le llega una push HOY → hay suscripción viva
          Desinstalar no avisa a nadie, así que "entró en marzo" no promete que
          la campaña de hoy le llegue; la suscripción sí. Quien entró y ya no
          recibe es exactamente a quien hay que escribirle por WhatsApp. */}
      <p className="mt-2 flex items-center gap-1.5 text-[11px]"
        style={{ color: pushActivo ? 'var(--ok-fg)' : 'var(--text-faint)' }}>
        <Smartphone size={12} className="flex-shrink-0" />
        {pushActivo
          ? <>En la app{enAppDesde ? ` desde ${enAppDesde}` : ''} · recibe notificaciones</>
          : enAppDesde
            ? <>Entró a la app en {enAppDesde} · hoy NO recibe notificaciones</>
            : <>Nunca ha entrado a la app · solo por WhatsApp</>}
      </p>

      {(dni || phone) && (
        <div className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
          {dni && <CopyRow label={tipoDoc} value={dni} />}
          {phone && <CopyRow label="WhatsApp · celular del checkout" value={phone} />}
        </div>
      )}

      {celular && (
        <div className="flex items-center gap-2 mt-2.5">
          <a href={`https://wa.me/51${celular}`} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
            <MessageCircle size={13} /> WhatsApp
          </a>
          <a href={`tel:+51${celular}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text)', fontWeight: 500 }}>
            <Phone size={13} /> Llamar
          </a>
        </div>
      )}
    </div>
  )
}
