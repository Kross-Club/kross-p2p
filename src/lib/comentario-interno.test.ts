import { describe, it, expect } from 'vitest'
import {
  VISIBILIDAD, esInterno, consultaDeArroba, candidatos, insertarMencion,
  mencionadosEn, trozosConMenciones, primerNombre,
  BORRADORES_VACIOS, borradorDe, guardarBorrador, borradorEnviado,
} from './comentario-interno'
import type { Etiquetable } from './comentario-interno'

const EQUIPO: Etiquetable[] = [
  { id: 'a1', nombre: 'Andrea Quiroz', role_label: 'Admin' },
  { id: 'k1', nombre: 'Kevin Salas', role_label: 'Ventas' },
  { id: 'r1', nombre: 'Renzo Aguilar', role_label: 'Despacho' },
  { id: 'm1', nombre: 'Milagros Pinto', role_label: 'Ventas' },
]

describe('qué es un comentario interno', () => {
  it('lo marca `visibility`, y nada más', () => {
    expect(esInterno({ visibility: VISIBILIDAD.equipo })).toBe(true)
    expect(esInterno({ visibility: VISIBILIDAD.todos })).toBe(false)
  })

  // Las filas de antes de la columna. Tratarlas como internas escondería de
  // golpe conversaciones que el comprador ya había leído.
  it('lo viejo, sin visibilidad, es público', () => {
    expect(esInterno({})).toBe(false)
    expect(esInterno({ visibility: null })).toBe(false)
  })
})

describe('el buscador de @', () => {
  it('se abre al escribir @ y con lo que se lleva tecleado', () => {
    expect(consultaDeArroba('ojo @', 5)).toEqual({ desde: 4, busca: '' })
    expect(consultaDeArroba('ojo @ren', 8)).toEqual({ desde: 4, busca: 'ren' })
  })

  // Sin esta regla el buscador se queda abierto para siempre en cuanto alguien
  // escribe una dirección de correo.
  it('no se abre a mitad de una palabra', () => {
    expect(consultaDeArroba('hola@ejemplo.com', 16)).toBe(null)
  })

  // Un @ con un espacio detrás ya no es una mención a medias: es texto.
  it('se cierra al separar con un espacio', () => {
    expect(consultaDeArroba('@renzo mira esto', 16)).toBe(null)
  })

  it('mira dónde está el cursor, no el final del texto', () => {
    expect(consultaDeArroba('@ren mira esto', 4)).toEqual({ desde: 0, busca: 'ren' })
  })

  // Quien escribe "despacho" está buscando a quien despacha, no un nombre.
  it('ofrece por nombre y por rol, sin acentos ni mayúsculas', () => {
    expect(candidatos(EQUIPO, 'ren').map(p => p.id)).toEqual(['r1'])
    expect(candidatos(EQUIPO, 'despacho').map(p => p.id)).toEqual(['r1'])
    expect(candidatos(EQUIPO, 'ventas').map(p => p.id)).toEqual(['k1', 'm1'])
    expect(candidatos(EQUIPO, '').length).toBe(4)
  })

  it('mete la mención dejando el cursor listo para seguir', () => {
    const r = insertarMencion('ojo @ren', 4, 8, EQUIPO[2])
    expect(r.texto).toBe('ojo @Renzo ')
    expect(r.caret).toBe(r.texto.length)
  })

  it('y no se come lo que venía después del cursor', () => {
    const r = insertarMencion('@ke revisa el pago', 0, 3, EQUIPO[1])
    expect(r.texto).toBe('@Kevin revisa el pago')
  })
})

describe('a quién se etiquetó', () => {
  it('resuelve los nombres contra el equipo y guarda ids', () => {
    expect(mencionadosEn('@Renzo @Kevin ¿quién lo despacha?', EQUIPO).sort()).toEqual(['k1', 'r1'])
  })

  // Guardar el texto sería perder la referencia en cuanto alguien cambie de
  // nombre; y un `@` que no apunta a nadie es texto, no una mención.
  it('ignora los @ que no son de nadie', () => {
    expect(mencionadosEn('@nadie mira esto', EQUIPO)).toEqual([])
    expect(mencionadosEn('sin arrobas', EQUIPO)).toEqual([])
  })

  it('no se repite si se etiqueta dos veces a la misma persona', () => {
    expect(mencionadosEn('@Renzo y otra vez @renzo', EQUIPO)).toEqual(['r1'])
  })
})

describe('cómo se pinta', () => {
  it('resalta solo lo que apunta a alguien', () => {
    const trozos = trozosConMenciones('@Renzo revisa @nadie y escribe a hola@x.com', EQUIPO)
    expect(trozos.filter(t => t.mencion).map(t => t.texto)).toEqual(['@Renzo'])
    // Y el texto se reconstruye entero: pintar por trozos no puede perder nada.
    expect(trozos.map(t => t.texto).join('')).toBe('@Renzo revisa @nadie y escribe a hola@x.com')
  })

  it('un texto sin menciones sale de una pieza', () => {
    expect(trozosConMenciones('ya lo llamé dos veces', EQUIPO)).toEqual([
      { texto: 'ya lo llamé dos veces', mencion: false },
    ])
  })

  it('el primer nombre es como se llama a alguien en un chat de trabajo', () => {
    expect(primerNombre('Milagros Pinto')).toBe('Milagros')
    expect(primerNombre('Renzo')).toBe('Renzo')
  })
})

// ─── Dos borradores, uno por audiencia ───────────────────────────────────────
//
// El error que esto evita no se deshace: escribir media nota, tocar el
// interruptor por costumbre y enviarle al cliente "ya lo llamé dos veces y no
// contesta" — que además le sale por push y por WhatsApp.

describe('los borradores del redactor', () => {
  it('lo escrito en una audiencia no aparece en la otra', () => {
    const b = guardarBorrador(BORRADORES_VACIOS, true, 'ojo con el pago')
    expect(borradorDe(b, true)).toBe('ojo con el pago')
    expect(borradorDe(b, false)).toBe('')
  })

  it('y volver al modo devuelve lo que había, sin perderlo', () => {
    let b = guardarBorrador(BORRADORES_VACIOS, true, 'ojo con el pago')
    b = guardarBorrador(b, false, 'Hola, tu pedido sale hoy')
    expect(borradorDe(b, true)).toBe('ojo con el pago')
    expect(borradorDe(b, false)).toBe('Hola, tu pedido sale hoy')
  })

  it('enviar vacía solo el lado enviado', () => {
    let b = guardarBorrador(BORRADORES_VACIOS, true, 'ojo con el pago')
    b = guardarBorrador(b, false, 'Hola')
    b = borradorEnviado(b, false)
    expect(borradorDe(b, false)).toBe('')
    expect(borradorDe(b, true)).toBe('ojo con el pago')
  })

  it('no muta el que recibe: el estado de React compara por referencia', () => {
    const b = guardarBorrador(BORRADORES_VACIOS, true, 'x')
    expect(BORRADORES_VACIOS.nota).toBe('')
    expect(b).not.toBe(BORRADORES_VACIOS)
  })
})
