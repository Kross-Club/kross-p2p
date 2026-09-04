import { describe, it, expect } from 'vitest'
import { sellerNavLinks } from './seller-nav'
import type { SellerProfile } from './seller-session'
import { TIENDA_PLATAFORMA } from '../../supabase/functions/_shared/alcance.ts'

const perfil = (p: Partial<SellerProfile>): SellerProfile => ({
  id: 'x', auth_user_id: 'x', nombre: 'X', role_label: 'Equipo',
  store_id: 'st_marca', avatar_url: null, is_admin: false, available: true, ...p,
})

const etiquetas = (p: SellerProfile | null) => sellerNavLinks(p).map(l => l.label)

describe('el menú del panel', () => {
  it('desde la plataforma: tiendas, conexiones y equipo, que es lo que hay ahí', () => {
    expect(etiquetas(perfil({ store_id: TIENDA_PLATAFORMA, is_admin: true, is_super_admin: true })))
      .toEqual(['Tiendas', 'Conexiones', 'Equipo'])
  })

  // El caso que rompía: sin la bandera, un operador de Kross caía en el menú de
  // admin de tienda y lo que veía era el panel de `platform` — una tienda que
  // no vende, o sea cinco secciones vacías.
  it('el operador de Kross ve lo mismo que el dueño', () => {
    expect(etiquetas(perfil({ store_id: TIENDA_PLATAFORMA, is_admin: true, is_super_admin: false })))
      .toEqual(['Tiendas', 'Conexiones', 'Equipo'])
  })

  // Conexiones NO está acá: las APIs son de la plataforma y quien las destraba
  // es Kross. El admin de una marca puede abrir la pantalla por URL —y ve sus
  // propios eventos—, pero no la lleva en el menú (ver `seller-nav.ts`).
  it('el admin de una marca tiene su herramienta entera, sin Conexiones', () => {
    expect(etiquetas(perfil({ is_admin: true })))
      .toEqual(['Pedidos', 'Clientes', 'Productos', 'Equipo', 'Marca'])
  })

  // Entrar a una tienda es dejar la plataforma a propósito: ahí sí hay pedidos.
  it('quien entra a una marca desde la plataforma trabaja como su admin', () => {
    expect(etiquetas(perfil({ store_id: 'st_marca', is_admin: true, is_super_admin: false })))
      .toEqual(['Pedidos', 'Clientes', 'Productos', 'Equipo', 'Marca'])
  })

  it('el miembro del equipo, una sola entrada: sus pedidos', () => {
    expect(etiquetas(perfil({}))).toEqual(['Pedidos'])
    expect(etiquetas(null)).toEqual(['Pedidos'])
  })
})
