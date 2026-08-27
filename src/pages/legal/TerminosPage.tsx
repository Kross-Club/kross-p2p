import { Link } from 'react-router-dom'
import LegalPage, { Seccion } from '../../components/publico/LegalPage'
import { EMPRESA, PLAZO_RESPUESTA_HABILES } from '../../config/empresa'

// Términos y condiciones del servicio. Obligatorios para operar con pasarela de
// pago y, sobre todo, son el contrato: definen qué se contrata, cómo se cobra,
// cómo se cancela y quién responde por qué.
const ACTUALIZADO = '11 de agosto de 2026'

export default function TerminosPage() {
  const titular = EMPRESA.razonSocial || EMPRESA.marca
  const ruc = EMPRESA.ruc ? ` (RUC ${EMPRESA.ruc})` : ''

  return (
    <LegalPage
      titulo="Términos y condiciones"
      actualizado={ACTUALIZADO}
      intro={
        <p>
          Estos términos regulan la contratación y el uso de los servicios que {titular}{ruc} ofrece a
          través de <b>{EMPRESA.web}</b> y de las aplicaciones que opera bajo la plataforma {EMPRESA.marca}.
          Al contratar cualquiera de nuestros servicios declaras haberlos leído y aceptado.
        </p>
      }>

      <Seccion titulo="1. Quiénes somos">
        <p>
          {titular}{ruc}
          {EMPRESA.domicilioFiscal ? `, con domicilio en ${EMPRESA.domicilioFiscal}` : ''}
          {EMPRESA.email ? `, correo de contacto ${EMPRESA.email}` : ''}
          {EMPRESA.telefono ? ` y teléfono ${EMPRESA.telefono}` : ''}, tiene la titularidad de la
          plataforma {EMPRESA.marca}, un software de gestión de tiendas en línea —cobro del pedido,
          despacho y recompra— que se contrata
          por suscripción.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué contratas">
        <p>
          {EMPRESA.marca} es un servicio de software (SaaS). Al contratar un plan o un módulo obtienes
          una licencia de uso, no exclusiva e intransferible, mientras tu suscripción esté vigente. El
          alcance de cada plan es el publicado en la página de{' '}
          <Link to="/servicios" className="underline font-bold">servicios y precios</Link> al momento de
          la contratación.
        </p>
        <p>
          {EMPRESA.marca} <b>no vende los productos</b> que ofrecen las marcas que usan la plataforma.
          Cada marca es la vendedora frente a su comprador final y responde por su catálogo, sus
          precios, sus entregas y sus devoluciones.
        </p>
      </Seccion>

      <Seccion titulo="3. Precios, pagos y comprobantes">
        <ul>
          <li>Los precios se muestran en soles (S/) e incluyen IGV.</li>
          <li>Las suscripciones se facturan por adelantado y se renuevan cada 30 días hasta que las canceles.</li>
          <li>Los servicios marcados como pago único se facturan una sola vez, al contratarlos.</li>
          <li>Emitimos boleta o factura electrónica con los datos que registras en el checkout. Es tu responsabilidad que sean correctos.</li>
          <li>Podemos actualizar los precios avisando con 30 días calendario de anticipación; el cambio nunca aplica a un periodo ya pagado.</li>
        </ul>
      </Seccion>

      <Seccion titulo="4. Activación del servicio">
        <p>
          Una vez confirmado el pago activamos tu cuenta en un plazo máximo de 3 días hábiles. Si el
          plan incluye implementación, la puesta en marcha se coordina contigo y depende de que nos
          entregues la información necesaria (catálogo, logo, cobertura y datos de cobro).
        </p>
      </Seccion>

      <Seccion titulo="5. Cancelación y renovación">
        <p>
          Puedes cancelar tu suscripción cuando quieras escribiéndonos
          {EMPRESA.email ? <> a <b>{EMPRESA.email}</b></> : ' por nuestros canales de contacto'}. La
          cancelación surte efecto al final del periodo ya pagado: mantienes el servicio hasta esa
          fecha y no se genera un nuevo cobro. Las condiciones de devolución están en la{' '}
          <Link to="/cambios-y-devoluciones" className="underline font-bold">Política de cambios y devoluciones</Link>.
        </p>
      </Seccion>

      <Seccion titulo="6. Obligaciones de quien contrata">
        <ul>
          <li>Usar la plataforma conforme a la ley peruana y a estos términos.</li>
          <li>Vender productos y servicios de comercio lícito, con la información y los permisos que la ley exija.</li>
          <li>Cuidar las credenciales de su equipo y avisarnos ante cualquier uso no autorizado.</li>
          <li>Tratar los datos de sus compradores conforme a la Ley 29733 de Protección de Datos Personales.</li>
          <li>No revender, copiar ni descompilar el software, ni usarlo para enviar comunicaciones no solicitadas.</li>
        </ul>
      </Seccion>

      <Seccion titulo="7. Disponibilidad del servicio">
        <p>
          Trabajamos para que la plataforma esté disponible de forma continua, pero puede haber
          interrupciones por mantenimiento, fallas de proveedores de infraestructura o causas de fuerza
          mayor. Avisamos con anticipación los mantenimientos programados. No respondemos por lucro
          cesante ni por daños indirectos derivados de una interrupción.
        </p>
      </Seccion>

      <Seccion titulo="8. Propiedad intelectual">
        <p>
          El software, la marca {EMPRESA.marca}, su código y su documentación son de nuestra propiedad.
          El contenido que tú cargas —marca, catálogo, fotos y textos— sigue siendo tuyo; nos autorizas
          únicamente a alojarlo y mostrarlo para prestar el servicio.
        </p>
      </Seccion>

      <Seccion titulo="9. Datos personales">
        <p>
          El tratamiento de datos se rige por nuestra{' '}
          <Link to="/privacidad" className="underline font-bold">Política de privacidad</Link>. Respecto
          de los compradores de cada marca, la marca es la titular del banco de datos y {EMPRESA.marca}
          {' '}actúa como encargada del tratamiento.
        </p>
      </Seccion>

      <Seccion titulo="10. Suspensión del servicio">
        <p>
          Podemos suspender una cuenta con falta de pago mayor a 15 días calendario, o de forma
          inmediata si se usa la plataforma para actividades ilícitas, fraudulentas o que pongan en
          riesgo a los compradores. Antes de suspender por falta de pago avisamos por correo.
        </p>
      </Seccion>

      <Seccion titulo="11. Reclamos y ley aplicable">
        <p>
          Puedes presentar un reclamo o una queja en nuestro{' '}
          <Link to="/libro-de-reclamaciones" className="underline font-bold">Libro de Reclamaciones virtual</Link>;
          lo respondemos en un plazo máximo de {PLAZO_RESPUESTA_HABILES} días hábiles, conforme al Código
          de Protección y Defensa del Consumidor (Ley 29571). Estos términos se rigen por la ley peruana
          y cualquier controversia se somete a los jueces y tribunales de Lima Cercado.
        </p>
      </Seccion>

      <Seccion titulo="12. Cambios en estos términos">
        <p>
          Podemos actualizar estos términos. Publicaremos la nueva versión en esta misma dirección con
          su fecha de actualización y, si el cambio es relevante, te avisaremos por correo antes de que
          entre en vigor.
        </p>
      </Seccion>
    </LegalPage>
  )
}
