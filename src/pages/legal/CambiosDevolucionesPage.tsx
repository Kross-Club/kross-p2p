import { Link } from 'react-router-dom'
import LegalPage, { Seccion } from '../../components/publico/LegalPage'
import { EMPRESA, PLAZO_RESPUESTA_HABILES } from '../../config/empresa'

// Política de cambios y devoluciones. La pasarela la exige junto con los términos, y
// es la que responde la pregunta que más se hace antes de pagar: "¿y si no me
// sirve?". Cubre los dos casos que existen en Kross: el software que vendemos
// nosotros y el producto físico que vende cada marca, que se adelanta al pedir
// y se termina de pagar al recibir.
const ACTUALIZADO = '11 de agosto de 2026'

export default function CambiosDevolucionesPage() {
  const titular = EMPRESA.razonSocial || EMPRESA.marca

  return (
    <LegalPage
      titulo="Política de cambios y devoluciones"
      actualizado={ACTUALIZADO}
      intro={
        <p>
          Esta política explica cuándo puedes cambiar o dar de baja un servicio contratado a {titular} y
          cómo se devuelve el dinero. Aplica a las compras hechas en <b>{EMPRESA.web}</b>.
        </p>
      }>

      <Seccion titulo="1. Derecho de retracto: 7 días">
        <p>
          Si contratas un servicio de suscripción por primera vez y no te sirve, tienes{' '}
          <b>7 días calendario</b> desde la activación para pedir la baja con devolución del 100 % de lo
          pagado por ese primer periodo, sin necesidad de explicar el motivo.
        </p>
      </Seccion>

      <Seccion titulo="2. Cancelación después de los 7 días">
        <p>
          Puedes cancelar cuando quieras. El servicio sigue activo hasta que termine el periodo ya
          pagado y no se genera un nuevo cobro. Pasados los 7 días no se devuelve el importe del periodo
          en curso, porque el servicio estuvo disponible durante todo ese tiempo.
        </p>
      </Seccion>

      <Seccion titulo="3. Servicios de pago único (implementación)">
        <ul>
          <li>Si aún no iniciamos el trabajo, se devuelve el 100 %.</li>
          <li>Si el trabajo ya empezó, se devuelve la parte proporcional a lo que falte ejecutar, descontando lo ya entregado.</li>
          <li>Terminada la implementación y entregada la cuenta operativa, el servicio no es reembolsable.</li>
        </ul>
      </Seccion>

      <Seccion titulo="4. Cambio de plan">
        <p>
          Puedes subir de plan en cualquier momento: cobramos solo la diferencia por los días que resten
          del periodo. Puedes bajar de plan para el siguiente periodo, sin costo; el cambio se aplica en
          la siguiente renovación.
        </p>
      </Seccion>

      <Seccion titulo="5. Cobros duplicados o incorrectos">
        <p>
          Si detectamos —o nos avisas— un cobro duplicado, un monto distinto al publicado o un cobro
          después de la cancelación, devolvemos el importe completo. No hay plazo mínimo para reclamar
          este supuesto.
        </p>
      </Seccion>

      <Seccion titulo="6. Cómo pedir la devolución">
        <ol>
          <li>
            Escríbenos {EMPRESA.email ? <>a <b>{EMPRESA.email}</b></> : 'por nuestros canales de contacto'}
            {' '}indicando el código de tu pedido, el motivo y el número de comprobante.
          </li>
          <li>Respondemos si la solicitud procede en un máximo de 5 días hábiles.</li>
          <li>
            Aprobada la devolución, el dinero se reintegra por el mismo medio de pago que usaste, en un
            plazo de hasta 15 días hábiles. El tiempo que tarde en verse reflejado depende de tu banco o
            de la empresa emisora de tu tarjeta.
          </li>
        </ol>
      </Seccion>

      <Seccion titulo="7. Productos comprados a una marca que usa Kross">
        <p>
          Cuando compras un producto físico en la aplicación de una marca (por ejemplo{' '}
          <i>tumarca.krossclub.app</i>), el vendedor es esa marca, no {titular}. En esas compras se
          adelanta parte del pedido —la mitad o el total— al momento de hacerlo, y el saldo, si
          queda, se paga al recibirlo. En ese caso:
        </p>
        <ul>
          <li>Puedes revisar el producto <b>al recibirlo</b> y rechazarlo si no corresponde a lo pedido; si quedaba saldo por pagar, no lo pagas.</li>
          <li>Los cambios por producto errado, incompleto o defectuoso los atiende la marca vendedora, dentro de los plazos que la ley de protección al consumidor establece.</li>
          <li>El adelanto se devuelve si el pedido no llega a enviarse, o si no se entrega por causa de la marca.</li>
          <li>{titular} facilita el canal de contacto con la marca y conserva el historial del pedido como respaldo del reclamo.</li>
        </ul>
      </Seccion>

      <Seccion titulo="8. Si no estás conforme con la respuesta">
        <p>
          Puedes registrar tu caso en el{' '}
          <Link to="/libro-de-reclamaciones" className="underline font-bold">Libro de Reclamaciones virtual</Link>.
          Lo respondemos en un máximo de {PLAZO_RESPUESTA_HABILES} días hábiles, conforme al Código de
          Protección y Defensa del Consumidor (Ley 29571). También puedes acudir a INDECOPI.
        </p>
      </Seccion>
    </LegalPage>
  )
}
