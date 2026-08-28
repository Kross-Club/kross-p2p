import { ShoppingBag, Users, Package, Store, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SellerProfile } from './seller-session'

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
//  · super admin (plataforma Kross, fuera de una tienda) → Tiendas y Equipo
//  · admin de tienda (o super admin que entró a una) → todo el toolset
//  · miembro del equipo → Pedidos
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
  const platform = !!effective?.is_super_admin
  const storeAdmin = !!effective?.is_admin && !effective?.is_super_admin

  if (platform) return [
    { to: '/vendedor/marca', icon: Store, label: 'Tiendas' },
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
