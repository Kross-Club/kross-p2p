import PublicLayout from '../../components/publico/PublicLayout'
import TarjetaServicio from '../../components/publico/TarjetaServicio'
import { CATALOGO_VITRINA } from '../../config/catalogo'
import { ADELANTO_MINIMO_PCT } from '../../config/propuesta'

// Catálogo completo. La home ya muestra la vitrina; esta página existe para
// tener una URL estable que enlazar (y para que el catálogo no dependa de que
// alguien baje hasta la mitad de la portada).
//
// La entradilla repite la promesa de la portada a propósito: mucha gente llega
// acá desde un anuncio, sin haber pasado por el inicio, y el precio no se
// entiende si antes no se sabe qué hace el producto con la plata del pedido.
export default function ServiciosPage() {
  const planes = CATALOGO_VITRINA.filter((i) => i.categoria === 'Plan')
  const complementos = CATALOGO_VITRINA.filter((i) => i.categoria !== 'Plan')

  return (
    <PublicLayout>
      <div className="max-w-[1120px] mx-auto px-5 py-12">
        <h1 className="text-3xl md:text-4xl">Planes y precios</h1>
        <p className="mt-3 max-w-[680px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Todos los planes traen lo mismo de base: tu app con tu marca y el checkout que le cobra a
          tu cliente {ADELANTO_MINIMO_PCT} del pedido —o el total— con Yape, validado solo. De ahí
          para arriba cambia cuánto vende tu equipo y cuánto despacha. Suscripción mensual, sin
          permanencia, salvo la implementación, que es un pago único. Precios en soles, IGV incluido.
        </p>

        <h2 className="text-xl mt-12 mb-5">Planes</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {planes.map((item) => <TarjetaServicio key={item.slug} item={item} />)}
        </div>

        <h2 className="text-xl mt-14 mb-1">Módulos y servicios</h2>
        <p className="mb-5" style={{ color: 'var(--text-muted)' }}>Se suman a cualquier plan.</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {complementos.map((item) => <TarjetaServicio key={item.slug} item={item} />)}
        </div>
      </div>
    </PublicLayout>
  )
}
