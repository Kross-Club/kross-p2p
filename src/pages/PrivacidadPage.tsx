import { useStore } from '../lib/store-context'

// Public privacy policy — needed for Meta app publishing, PWA/app-store listings,
// and general compliance. Covers the Kross platform (and its white-label brands).
export default function PrivacidadPage() {
  const { store } = useStore()
  const marca = store.nombre || 'Kross'

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[720px] mx-auto px-5 py-10 text-gray-800">
        <h1 className="text-2xl font-black mb-1">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-6">Última actualización: 16 de julio de 2026</p>

        <p className="mb-4 text-sm leading-relaxed">
          Esta política describe cómo {marca}, operado sobre la plataforma Kross
          (“nosotros”), recopila, usa y protege tus datos cuando haces un pedido o
          usas nuestra aplicación de seguimiento de pedidos.
        </p>

        <Section title="1. Datos que recopilamos">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Identidad:</b> nombre y número de documento (DNI), validado con fuentes oficiales para confirmar tu identidad.</li>
            <li><b>Contacto:</b> número de teléfono/WhatsApp que registras al hacer un pedido.</li>
            <li><b>Entrega:</b> dirección y, si la verificas, tu ubicación GPS para asegurar la entrega correcta.</li>
            <li><b>Pedidos:</b> productos, montos y el historial de tu conversación con el asesor.</li>
            <li><b>Técnicos:</b> datos del dispositivo y del navegador necesarios para el funcionamiento de la app y las notificaciones.</li>
          </ul>
        </Section>

        <Section title="2. Para qué usamos tus datos">
          <ul className="list-disc pl-5 space-y-1">
            <li>Procesar y entregar tu pedido bajo la modalidad contraentrega.</li>
            <li>Comunicarnos contigo sobre el estado de tu pedido por chat, notificaciones push y WhatsApp.</li>
            <li>Verificar tu identidad y prevenir pedidos fraudulentos.</li>
            <li>Mejorar el servicio y la atención.</li>
          </ul>
        </Section>

        <Section title="3. Mensajes por WhatsApp">
          <p>
            Si no puedes recibir notificaciones dentro de la app, podemos enviarte
            avisos sobre tu pedido al número de WhatsApp que registraste. Solo
            enviamos mensajes relacionados con tu pedido; no enviamos publicidad no
            solicitada. Puedes pedir dejar de recibirlos respondiendo al chat.
          </p>
        </Section>

        <Section title="4. Con quién compartimos">
          <p>
            No vendemos tus datos. Los compartimos únicamente con los proveedores
            necesarios para operar el servicio (mensajería, mapas, infraestructura en
            la nube y validación de identidad), quienes los tratan solo para esos
            fines. Podemos divulgarlos si la ley lo exige.
          </p>
        </Section>

        <Section title="5. Conservación y seguridad">
          <p>
            Guardamos tus datos mientras tu cuenta esté activa o mientras sean
            necesarios para tu historial de pedidos, y aplicamos medidas razonables
            de seguridad para protegerlos.
          </p>
        </Section>

        <Section title="6. Tus derechos">
          <p>
            Puedes solicitar acceder, corregir o eliminar tus datos escribiéndonos por
            el chat de la aplicación o al correo de contacto de la marca. Atenderemos
            tu solicitud conforme a la ley de protección de datos aplicable.
          </p>
        </Section>

        <Section title="7. Contacto">
          <p>
            Para cualquier consulta sobre esta política, escríbenos por el chat de tu
            pedido o al correo de soporte de {marca}.
          </p>
        </Section>

        <p className="text-xs text-gray-400 mt-8">
          {marca} funciona sobre la plataforma Kross. Al usar la aplicación aceptas
          esta Política de Privacidad.
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="font-black text-base mb-1.5">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  )
}
