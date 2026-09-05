import { ShoppingBag, Users, Package, Store, UserPlus, Plug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SellerProfile } from './seller-session'
import { administraLaPlataforma } from '../../supabase/functions/_shared/alcance.ts'

export interface SellerNavLink {
  to: string
  icon: LucideIcon
  label: string
}

// Un solo origen para la navegación del panel: la barra de abajo (móvil) y la
// barra lateral (PC) tienen que ofrecer exactamente lo mismo, y el header de
// escritorio usa la misma lista para saber en qué sección estás.
//
// El menú sigue a QUIÉN estás actuando:
//  · quien administra la plataforma (fuera de una tienda) → Tiendas y Equipo
//  · admin de tienda (o quien entró a una desde la plataforma) → todo el toolset
//  · miembro del equipo → Pedidos
//
// "Administra la plataforma" lo responde `alcance.ts`, no una bandera: el dueño
// y los operadores de Kross ven lo mismo porque hacen lo mismo. Lo que separa a
// un operador es qué NO puede destruir (`permisos.ts`), y eso no se dice en el
// menú — se dice en el botón que no aparece.
//
// **Tiendas**, no "Marcas": desde la plataforma lo que se administra son las
// tiendas clientes —encenderlas, cobrarles, entrar a operarlas—. *Marca* es
// otra cosa y por eso conserva su nombre un nivel más abajo: la identidad de
// UNA de ellas (su logo, sus colores, su subdominio), que es lo que edita su
// propio admin.
//
// **Equipo** en la plataforma es el equipo de Kross, no el de una tienda. Es la
// misma pantalla: `sellers` filtrado por `store_id`, y el de la plataforma es
// `platform`. Una segunda pantalla para la misma tabla se habría separado de la
// primera en la primera semana.
export function sellerNavLinks(effective: SellerProfile | null | undefined): SellerNavLink[] {
  const platform = administraLaPlataforma(effective)
  const storeAdmin = !!effective?.is_admin && !platform

  // **Conexiones** solo en la plataforma: son las APIs de las que depende Kross
  // entero —los rieles de cobro, los couriers, WhatsApp—. El admin de una marca
  // puede abrir la pantalla por URL y ve sus propios eventos, pero no la lleva
  // en el menú: cuando algo de esto se cae, quien lo destraba es Kross, y
  // ponérselo delante todos los días es enseñarle un tablero que no puede
  // accionar.
  if (platform) return [
    { to: '/vendedor/marca', icon: Store, label: 'Tiendas' },
    { to: '/vendedor/conexiones', icon: Plug, label: 'Conexiones' },
    { to: '/vendedor/equipo', icon: Users, label: 'Equipo' },
  ]

  if (storeAdmin) return [
    { to: '/vendedor/pedidos', icon: ShoppingBag, label: 'Pedidos' },
    { to: '/vendedor/clientes', icon: UserPlus, label: 'Clientes' },
    { to: '/vendedor/productos', icon: Package, label: 'Productos' },
    { to: '/vendedor/equipo', icon: Users, label: 'Equipo' },
    { to: '/vendedor/marca', icon: Store, label: 'Marca' },
  ]

  // El miembro del equipo tiene UNA entrada, y está bien: su trabajo entero es
  // la lista de pedidos. Los cuatro modos viven dentro, no en el menú.
  return [
    { to: '/vendedor/pedidos', icon: ShoppingBag, label: 'Pedidos' },
  ]
}

/** La sección activa según la URL (para el título del header en escritorio). */
export function activeNavLink(links: SellerNavLink[], pathname: string): SellerNavLink | undefined {
  return links.find(l => pathname === l.to || pathname.startsWith(`${l.to}/`))
}
