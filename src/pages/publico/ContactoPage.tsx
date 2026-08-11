import { Link } from 'react-router-dom'
import { Phone, Mail, MapPin, Clock, BookOpen, Building2 } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { RedIcon } from '../../components/publico/RedIcon'
import { EMPRESA, whatsappLink } from '../../config/empresa'

// Página de contacto: número, correo y dirección en una URL propia y enlazada
// desde el menú. Culqi lo pide explícitamente, y es lo primero que busca un
// comprador cuando algo salió mal con su pedido.
export default function ContactoPage() {
  const wa = whatsappLink('Hola, quiero información sobre Kross.')
  const sinDatos = !EMPRESA.telefono && !EMPRESA.email && !EMPRESA.domicilioFiscal

  return (
    <PublicLayout>
      <div className="max-w-[900px] mx-auto px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-black">Contacto</h1>
        <p className="text-gray-600 mt-2 max-w-[620px]">
          Escríbenos por el canal que prefieras. Respondemos dentro del horario de atención;
          los mensajes que llegan fuera de horario se responden al siguiente día hábil.
        </p>

        {sinDatos && (
          <p className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-bold px-5 py-4">
            Los datos de contacto aún no están configurados en la web.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 mt-8">
          {EMPRESA.telefono && (
            <Dato icon={<Phone size={18} />} label="Teléfono" valor={EMPRESA.telefono}
              href={`tel:${EMPRESA.telefono.replace(/\s/g, '')}`} />
          )}
          {wa && (
            <Dato icon={<Phone size={18} />} label="WhatsApp" valor={`+${EMPRESA.whatsapp}`} href={wa} externo />
          )}
          {EMPRESA.email && (
            <Dato icon={<Mail size={18} />} label="Correo" valor={EMPRESA.email} href={`mailto:${EMPRESA.email}`} />
          )}
          {EMPRESA.emailReclamos && (
            <Dato icon={<Mail size={18} />} label="Reclamos" valor={EMPRESA.emailReclamos}
              href={`mailto:${EMPRESA.emailReclamos}`} />
          )}
          {EMPRESA.domicilioFiscal && (
            <Dato icon={<MapPin size={18} />} label="Dirección" valor={EMPRESA.domicilioFiscal} />
          )}
          <Dato icon={<Clock size={18} />} label="Horario de atención" valor={EMPRESA.horario} />
        </div>

        {(EMPRESA.razonSocial || EMPRESA.ruc) && (
          <div className="mt-8 rounded-3xl border border-gray-200 p-6">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <Building2 size={16} /> Datos del comercio
            </p>
            <ul className="mt-3 text-sm space-y-1.5 text-gray-700">
              {EMPRESA.razonSocial && <li><b>Razón social:</b> {EMPRESA.razonSocial}</li>}
              {EMPRESA.ruc && <li><b>RUC:</b> {EMPRESA.ruc}</li>}
              {EMPRESA.domicilioFiscal && <li><b>Domicilio fiscal:</b> {EMPRESA.domicilioFiscal}</li>}
              <li><b>Sitio web:</b> {EMPRESA.web}</li>
            </ul>
          </div>
        )}

        {EMPRESA.redes.length > 0 && (
          <div className="mt-8">
            <h2 className="font-black">Síguenos</h2>
            <div className="flex flex-wrap gap-3 mt-3">
              {EMPRESA.redes.map((r) => (
                <a key={r.nombre} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 font-bold text-sm hover:bg-gray-50">
                  <RedIcon red={r} /> {r.nombre}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 rounded-3xl p-6 text-white" style={{ background: 'var(--brand-dark)' }}>
          <p className="flex items-center gap-2 font-black"><BookOpen size={20} /> ¿Tienes un reclamo o una queja?</p>
          <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Puedes registrarlo en nuestro Libro de Reclamaciones virtual. Es un formulario propio de
            esta web: no necesitas descargar nada ni salir del sitio.
          </p>
          <Link to="/libro-de-reclamaciones"
            className="inline-block mt-4 px-5 py-3 rounded-2xl font-black text-sm bg-white text-gray-900">
            Ir al Libro de Reclamaciones
          </Link>
        </div>
      </div>
    </PublicLayout>
  )
}

function Dato({ icon, label, valor, href, externo }: {
  icon: React.ReactNode; label: string; valor: string; href?: string; externo?: boolean
}) {
  const cuerpo = (
    <div className="rounded-3xl border border-gray-200 px-5 py-4 h-full">
      <p className="text-xs font-black text-gray-400 uppercase tracking-wide flex items-center gap-2">{icon} {label}</p>
      <p className="font-bold mt-1.5 break-words">{valor}</p>
    </div>
  )
  if (!href) return cuerpo
  return (
    <a href={href} className="block hover:bg-gray-50 rounded-3xl"
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {cuerpo}
    </a>
  )
}
