import PublicLayout from '../../components/publico/PublicLayout'
import TarjetaServicio from '../../components/publico/TarjetaServicio'
import { CATALOGO_VITRINA } from '../../config/catalogo'

// Catálogo completo. La home ya muestra la vitrina; esta página existe para
// tener una URL estable que enlazar (y para que el catálogo no dependa de que
// alguien baje hasta la mitad de la portada).
export default function ServiciosPage() {
  const planes = CATALOGO_VITRINA.filter((i) => i.categoria === 'Plan')
  const complementos = CATALOGO_VITRINA.filter((i) => i.categoria !== 'Plan')

  return (
    <PublicLayout>
      <div className="max-w-[1120px] mx-auto px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-black">Servicios y precios</h1>
        <p className="text-gray-600 mt-2 max-w-[680px]">
          Kross se contrata por suscripción mensual, sin permanencia, salvo la implementación, que es
          un pago único. Todos los precios están expresados en soles (S/) e incluyen IGV.
        </p>

        <h2 className="text-xl font-black mt-10 mb-5">Planes</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {planes.map((item) => <TarjetaServicio key={item.slug} item={item} />)}
        </div>

        <h2 className="text-xl font-black mt-12 mb-1">Módulos y servicios</h2>
        <p className="text-gray-600 mb-5">Se suman a cualquier plan.</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {complementos.map((item) => <TarjetaServicio key={item.slug} item={item} />)}
        </div>
      </div>
    </PublicLayout>
  )
}
