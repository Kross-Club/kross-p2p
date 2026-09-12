import { describe, it, expect } from 'vitest'
import {
  SLUGS_RESERVADOS, PREFIJO_ALTA,
  slugDeLaMarca, esSlugValido, slugLibre,
  esTokenDeAlta, nuevoTokenDeAlta, revisarAlta,
} from '../../supabase/functions/_shared/alta-de-tienda.ts'

// Lo que decide dónde vive la tienda de alguien que acaba de pagar $67. El
// subdominio que esta función deriva es el que se le PROMETIÓ en la landing:
// si las dos mitades no coinciden, lo primero que pasa después de cobrarle es
// que su tienda no está donde le dijimos.

describe('el subdominio que le toca a una marca', () => {
  it('sin guiones: se dicta por teléfono y se escribe en una bio', () => {
    expect(slugDeLaMarca('Mono Shop')).toBe('monoshop')
    expect(slugDeLaMarca('  Casa Rosa 2  ')).toBe('casarosa2')
  })

  it('sin tildes ni símbolos', () => {
    expect(slugDeLaMarca('Bodegón Perú')).toBe('bodegonperu')
    expect(slugDeLaMarca('J&M Store!')).toBe('jmstore')
  })

  it('una marca sin letras no da subdominio', () => {
    expect(slugDeLaMarca('@#$%')).toBe('')
    expect(esSlugValido('')).toBe(false)
  })

  it('no deja tomar lo que ya significa algo nuestro', () => {
    // Ni las partes de la plataforma ni las rutas de la propia web: un
    // subdominio `bienvenido` volvería ambigua la pantalla del alta.
    expect(esSlugValido('kross')).toBe(false)
    expect(esSlugValido('bienvenido')).toBe(false)
    expect(esSlugValido('u')).toBe(false)
    expect(SLUGS_RESERVADOS.has('admin')).toBe(true)
  })
})

describe('el primer subdominio libre', () => {
  const tomados = (...xs: string[]) => (s: string) => xs.includes(s)

  it('el directo, cuando está libre', () => {
    expect(slugLibre('Mono Shop', tomados())).toBe('monoshop')
  })

  it('con sufijo cuando ya lo tomaron — y no un error', () => {
    // Esto corre DESPUÉS de que pagó: entre que reservó y que Stripe cobró
    // pudieron pasar minutos. Devolverle un error a alguien que ya pagó no es
    // una opción.
    expect(slugLibre('Mono Shop', tomados('monoshop'))).toBe('monoshop2')
    expect(slugLibre('Mono Shop', tomados('monoshop', 'monoshop2'))).toBe('monoshop3')
  })

  it('una marca que choca con un reservado igual consigue subdominio', () => {
    // «App» no puede ser `app.krossclub.app`, pero `app2` no le estorba a
    // nadie. Rechazar el alta sería castigar a alguien por su nombre.
    expect(slugLibre('App', tomados())).toBe('app2')
  })

  it('recorta la base para que el sufijo quepa', () => {
    // Un slug de 40 más un '12' daría 42, y lo que se cortaría es el sufijo:
    // dos marcas distintas acabarían con el mismo subdominio.
    const largo = 'a'.repeat(60)
    const ocupados = new Set(['a'.repeat(40)])
    for (let n = 2; n <= 9; n++) ocupados.add('a'.repeat(39) + n)      // sufijo de 1
    for (let n = 10; n <= 11; n++) ocupados.add('a'.repeat(38) + n)    // sufijo de 2
    const r = slugLibre(largo, s => ocupados.has(s))
    expect(r).toBe('a'.repeat(38) + '12')
    expect(r!.length).toBe(40)
  })

  it('una marca impronunciable no da nada', () => {
    expect(slugLibre('@#$', tomados())).toBe(null)
  })

  it('se rinde en vez de colgarse si todo está tomado', () => {
    expect(slugLibre('Mono Shop', () => true)).toBe(null)
  })
})

describe('el token de la intención', () => {
  it('lleva prefijo propio: no es un `store_id`', () => {
    // El webhook mira el prefijo para saber si le toca CREAR una tienda o
    // enlazar una que ya existía.
    expect(PREFIJO_ALTA).toBe('sg_')
    expect(esTokenDeAlta(nuevoTokenDeAlta())).toBe(true)
    expect(esTokenDeAlta('st_monoshop_lx9a2k')).toBe(false)
  })

  it('son 128 bits, no un número bonito', () => {
    // Esto abre una tienda. Un token adivinable significaría poder reclamar la
    // de otro.
    const t = nuevoTokenDeAlta()
    expect(t).toMatch(/^sg_[0-9a-f]{32}$/)
    const muchos = new Set(Array.from({ length: 500 }, nuevoTokenDeAlta))
    expect(muchos.size).toBe(500)
  })

  it('rechaza lo que no tiene esa forma', () => {
    expect(esTokenDeAlta('sg_corto')).toBe(false)
    expect(esTokenDeAlta('sg_' + 'Z'.repeat(32))).toBe(false)   // no es hex
    expect(esTokenDeAlta(null)).toBe(false)
  })
})

describe('lo que se acepta de un formulario público', () => {
  it('deja pasar lo razonable', () => {
    expect(revisarAlta({ marca: 'Mono Shop', nombre: 'Javier López' })).toBe(null)
  })

  it('dice QUÉ falta, no «datos inválidos»', () => {
    expect(revisarAlta({ marca: '', nombre: 'Javier' })).toBe('marca_corta')
    expect(revisarAlta({ marca: 'Mono Shop', nombre: '' })).toBe('nombre_corto')
    // Dos símbolos no son «corto» —son dos caracteres— pero no dan subdominio,
    // y ESE es el motivo que la persona puede accionar.
    expect(revisarAlta({ marca: '@#', nombre: 'Javier' })).toBe('marca_sin_letras')
    expect(revisarAlta({ marca: '@', nombre: 'Javier' })).toBe('marca_corta')
    expect(revisarAlta({ marca: 'Kross', nombre: 'Javier' })).toBe('slug_reservado')
  })
})
