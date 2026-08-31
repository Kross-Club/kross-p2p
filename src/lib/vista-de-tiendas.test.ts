import { describe, it, expect } from 'vitest'
import { vistaDeTiendas, estorboParaBorrar } from './vista-de-tiendas'
import { TIENDA_PLATAFORMA } from '../../supabase/functions/_shared/alcance.ts'

const TIENDAS = [{ id: 'st_kross' }, { id: 't1' }, { id: TIENDA_PLATAFORMA }]

const uxbriel = { store_id: TIENDA_PLATAFORMA, is_admin: true, is_super_admin: true }
const paolo = { store_id: TIENDA_PLATAFORMA, is_admin: true, is_super_admin: false }
const andrea = { store_id: 't1', is_admin: true }
const kevin = { store_id: 't1', is_admin: false }

const ids = (v: { visibles: { id: string }[] }) => v.visibles.map(t => t.id)

describe('la vista de Tiendas', () => {
  it('el dueño, en su casa: todas las marcas', () => {
    const v = vistaDeTiendas(TIENDAS, uxbriel, true)
    expect(v.plataforma).toBe(true)
    expect(ids(v)).toEqual(['st_kross', 't1'])
  })

  // `platform` sale de la misma tabla que las marcas y se pintaba como una más
  // —con enlace a un subdominio que no existe y botón de Entrar—, así que
  // parecía una tienda de pruebas olvidada. Tanto, que se intentó borrarla: es
  // donde viven las cuentas del equipo de Kross.
  it('la casa de Kross no es una tienda de la lista', () => {
    expect(ids(vistaDeTiendas(TIENDAS, uxbriel, true))).not.toContain(TIENDA_PLATAFORMA)
    expect(ids(vistaDeTiendas(TIENDAS, paolo, true))).not.toContain(TIENDA_PLATAFORMA)
    // Ni siquiera si alguien la tuviera como "su" tienda: sigue sin ser una marca.
    expect(ids(vistaDeTiendas(TIENDAS, { store_id: TIENDA_PLATAFORMA, is_admin: false }, false))).toEqual([])
  })

  // El caso que rompía: entrar como Paolo, que administra la plataforma igual
  // que el dueño, devolvía un cartel de "solo el administrador gestiona la
  // marca" — con Tiendas en el menú, o sea una sección que se ofrece y no abre.
  it('entrar como un operador de Kross enseña lo mismo', () => {
    const v = vistaDeTiendas(TIENDAS, paolo, true)
    expect(v.plataforma).toBe(true)
    expect(ids(v)).toEqual(['st_kross', 't1'])
  })

  // La otra mitad del mismo bloqueo: entrar a una marca para configurarla es la
  // razón número uno para entrar, y era justo lo que no se podía hacer.
  it('dentro de una marca se ve esa marca, y con mando de marca', () => {
    const v = vistaDeTiendas(TIENDAS, { ...uxbriel, store_id: 't1', is_super_admin: false }, true)
    expect(v.plataforma).toBe(false)   // ni crear tiendas, ni apagarlas, ni entrar
    expect(ids(v)).toEqual(['t1'])
  })

  it('el admin de una marca ve la suya', () => {
    const v = vistaDeTiendas([{ id: 't1' }], andrea, false)
    expect(v.plataforma).toBe(false)
    expect(ids(v)).toEqual(['t1'])
  })

  // Actuar solo REBAJA. El servidor manda cuando dice que no, y la vista manda
  // cuando dice que no: basta con que una de las dos lo diga.
  it('ninguna de las dos mitades puede ampliar por su cuenta', () => {
    // El servidor no le da alcance de plataforma aunque la vista lo tenga.
    expect(vistaDeTiendas(TIENDAS, uxbriel, false).plataforma).toBe(false)
    // Y la vista no lo da aunque el servidor sí.
    expect(vistaDeTiendas(TIENDAS, andrea, true).plataforma).toBe(false)
    expect(ids(vistaDeTiendas(TIENDAS, andrea, true))).toEqual(['t1'])
  })

  // Sin `store_id` no se ve ninguna: enseñarlas todas sería el caso que esto
  // evita, dicho al revés.
  it('sin sesión resuelta no se ve nada', () => {
    expect(vistaDeTiendas(TIENDAS, null, true)).toEqual({ plataforma: false, visibles: [] })
    expect(ids(vistaDeTiendas(TIENDAS, kevin, true))).toEqual(['t1'])
  })
})

// ─── Borrar ──────────────────────────────────────────────────────────────────
//
// Cada caso de acá es una manera concreta de perder algo que no vuelve. El
// servidor los rechaza igual; esto es para no ofrecer el botón.

describe('cuándo se puede ofrecer borrar una tienda', () => {
  const apagada = { id: 't1', active: false }

  it('una marca apagada, sí', () => {
    expect(estorboParaBorrar(apagada, uxbriel)).toBe(null)
  })

  it('encendida, no: primero se apaga, que eso sí se deshace', () => {
    expect(estorboParaBorrar({ id: 't1', active: true }, uxbriel)).toBe('encendida')
    // Sin el dato tampoco: no saber si está viva no es saber que está apagada.
    expect(estorboParaBorrar({ id: 't1' }, uxbriel)).toBe('encendida')
  })

  // La casa de Kross. Borrarla deja a todo el equipo sin tienda y a la regla de
  // alcance sin dónde apoyarse — el borrado se llevaría a quien lo ejecutó.
  it('la plataforma, nunca — ni apagada', () => {
    expect(estorboParaBorrar({ id: TIENDA_PLATAFORMA, active: false }, uxbriel)).toBe('plataforma')
  })

  it('ni la tienda de uno mismo', () => {
    expect(estorboParaBorrar({ id: 't1', active: false }, andrea)).toBe('la_tuya')
  })
})
