import { describe, it, expect } from 'vitest'
import { puedeAdministrar, esOperador, puedeBorrar, puedeNombrarAdmins, etiquetaDeRol } from './permisos'

const MIEMBRO = { is_admin: false, role_label: 'Logística' }
const OPERADOR = { is_admin: true, is_operator: true, role_label: 'Operador' }
const ADMIN = { is_admin: true, role_label: 'Admin' }
const SUPER = { is_admin: true, is_super_admin: true, role_label: 'Admin' }
const SUPER_OPERADOR = { is_admin: true, is_super_admin: true, is_operator: true, role_label: 'Operador' }

describe('los tres niveles', () => {
  // La promesa del rol es literal: hace todo lo que hace el admin. Por eso
  // todos los `is_admin` que ya había en el repo valen tal cual para él.
  it('el operador administra igual que el admin', () => {
    expect(puedeAdministrar(OPERADOR)).toBe(true)
    expect(puedeAdministrar(ADMIN)).toBe(true)
    expect(puedeAdministrar(MIEMBRO)).toBe(false)
  })

  it('pero no destruye', () => {
    expect(puedeBorrar(ADMIN)).toBe(true)
    expect(puedeBorrar(OPERADOR)).toBe(false)
    expect(puedeBorrar(MIEMBRO)).toBe(false)
  })

  // Sin esto lo de arriba no vale nada: un operador que puede nombrar admins se
  // nombra a sí mismo y la restricción dura lo que tarde en darse cuenta.
  it('y no puede nombrar administradores, que es cómo se saltaría lo anterior', () => {
    expect(puedeNombrarAdmins(OPERADOR)).toBe(false)
    expect(puedeNombrarAdmins(ADMIN)).toBe(true)
    expect(puedeNombrarAdmins(MIEMBRO)).toBe(false)
  })

  // Alcance y restricción son ejes independientes: "operador de una marca" y
  // "operador de la plataforma" son la misma regla en distinto alcance.
  it('el alcance y la restricción no se mezclan', () => {
    expect(puedeAdministrar(SUPER_OPERADOR)).toBe(true)
    expect(puedeBorrar(SUPER_OPERADOR)).toBe(false)
    expect(puedeBorrar(SUPER)).toBe(true)
  })

  // `is_operator` sin `is_admin` no existe como estado válido, pero la BD no lo
  // impide: si aparece, no debe convertirse en un permiso por accidente.
  it('un `is_operator` suelto no otorga nada', () => {
    const raro = { is_admin: false, is_operator: true }
    expect(puedeAdministrar(raro)).toBe(false)
    expect(esOperador(raro)).toBe(false)
    expect(puedeBorrar(raro)).toBe(false)
  })

  it('sin sesión resuelta no se puede nada', () => {
    for (const q of [null, undefined]) {
      expect(puedeAdministrar(q)).toBe(false)
      expect(puedeBorrar(q)).toBe(false)
      expect(esOperador(q)).toBe(false)
    }
  })
})

// La etiqueta sale de las banderas y no de `role_label`, que es texto libre: si
// la escribiera una persona, un "Operador" con dedazo se vería como miembro
// raso teniendo todos los permisos.
describe('cómo se rotula a cada quien', () => {
  it('la etiqueta la decide el permiso, no lo que alguien tecleó', () => {
    expect(etiquetaDeRol(OPERADOR)).toBe('Operador')
    expect(etiquetaDeRol(ADMIN)).toBe('Admin')
    expect(etiquetaDeRol(MIEMBRO)).toBe('Logística')
  })

  it('un role_label mentiroso no infla ni desinfla el permiso que se muestra', () => {
    // Tiene el permiso pero el texto dice otra cosa: gana el permiso.
    expect(etiquetaDeRol({ is_admin: true, is_operator: true, role_label: 'Admin' })).toBe('Operador')
    // No tiene el permiso pero el texto se lo pone: no se rotula como operador.
    expect(etiquetaDeRol({ is_admin: false, role_label: 'Operador' })).not.toBe('Admin')
    expect(esOperador({ is_admin: false, role_label: 'Operador' })).toBe(false)
  })

  it('sin rol escrito y sin banderas, algo se dice igual', () => {
    expect(etiquetaDeRol({ is_admin: false })).toBe('Equipo')
    expect(etiquetaDeRol(null)).toBe('—')
  })
})
