import { ShoppingBag, Users, Package, Store, UserPlus, TrendingUp } from 'lucide-react'
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
//  · super admin (plataforma Kross, fuera de una tienda) → solo Marcas
//  · admin de tienda (o super admin que entró a una) → todo el toolset
//  · miembro del equipo → Pedidos
export function sellerNavLinks(effective: SellerProfile | null | undefined): SellerNavLink[] {
  const platform = !!effective?.is_super_admin
  const storeAdmin = !!effective?.is_admin && !effective?.is_super_admin

  if (platform) return [{ to: '/vendedor/marca', icon: Store, label: 'Marcas' }]

  if (storeAdmin) return [
    { to: '/vendedor/pedidos', icon: ShoppingBag, label: 'Pedidos' },
    { to: '/vendedor/clientes', icon: UserPlus, label: 'Clientes' },
    { to: '/vendedor/retencion', icon: TrendingUp, label: 'Retención' },
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
