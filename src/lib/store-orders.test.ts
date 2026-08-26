import { describe, it, expect } from 'vitest'
import { alcanceDePedidos, estaVivo } from './store-orders'
import type { SellerProfile } from './seller-session'

const perfil = (p: Partial<SellerProfile>): SellerProfile => ({
  id: 's1', auth_user_id: 'auth-1', nombre: 'Quien Sea', role_label: 'Ventas',
  store_id: 'st_1', avatar_url: null, is_admin: false, available: true, ...p,
})

describe('quién ve qué pedidos', () => {
  it('el admin de la tienda ve toda la tienda', () => {
    expect(alcanceDePedidos(perfil({ is_admin: true }))).toEqual({ sellerId: null })
  })

  it('un miembro del equipo ve solo los suyos', () => {
    expect(alcanceDePedidos(perfil({ auth_user_id: 'auth-9' })))
      .toEqual({ sellerId: 'auth-9' })
  })

  // El admin que entra "como" un miembro tiene que ver lo que ve ese miembro:
  // para eso existe la función. Manda el perfil que se está actuando.
  it('el admin actuando como un miembro ve lo del miembro', () => {
    expect(alcanceDePedidos(perfil({ auth_user_id: 'auth-7', is_admin: false })))
      .toEqual({ sellerId: 'auth-7' })
  })

  // EL CASO QUE ESTABA ROTO. El super admin entra a una marca y MarcaPage le
  // arma un perfil `is_admin: true` con SU MISMO auth_user_id — justamente para
  // que el toolset completo funcione en una marca que todavía no tiene equipo.
  //
  // CRM y Stats miraban `real.is_admin && !impersonating`, y al entrar a una
  // marca `impersonating` es true, así que filtraban por su auth_user_id. Como
  // el super admin no está en `involved_seller_ids` de ningún pedido, las dos
  // pantallas salían VACÍAS mientras Chats y el mapa mostraban todo.
  it('el super admin que entró a una marca ve toda esa marca', () => {
    const entrado = perfil({ auth_user_id: 'auth-super', is_admin: true, is_super_admin: false, store_id: 'st_otra' })
    expect(alcanceDePedidos(entrado)).toEqual({ sellerId: null })
  })

  it('sin perfil todavía no se pide nada', () => {
    expect(alcanceDePedidos(null)).toBeNull()
    expect(alcanceDePedidos(undefined)).toBeNull()
  })
})

describe('qué pedido sigue vivo', () => {
  it('cancelado no está vivo', () => {
    expect(estaVivo({ status: 'cancelado' })).toBe(false)
  })

  it('activo y sin status sí', () => {
    expect(estaVivo({ status: 'active' })).toBe(true)
    expect(estaVivo({})).toBe(true)
  })

  // `no_entregado` es un cierre de FRACASO, no una cancelación: el pedido
  // existió, salió y no llegó. Cuenta para la tasa de entrega, así que no se
  // puede esconder junto a los cancelados.
  it('no entregado sigue siendo un pedido vivo', () => {
    expect(estaVivo({ status: 'active', stage: 'no_entregado' })).toBe(true)
  })
})
