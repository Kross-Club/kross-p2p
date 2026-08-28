import { describe, it, expect } from 'vitest'
import { cuantasPintar, faltanFilas, resumenDePaginado, POR_PAGINA } from './paginacion'

describe('cuántas filas pintar', () => {
  it('pinta lo pedido mientras haya de sobra', () => {
    expect(cuantasPintar(500, POR_PAGINA, -1)).toBe(100)
    expect(cuantasPintar(500, 200, -1)).toBe(200)
  })

  it('nunca pinta más de las que hay', () => {
    expect(cuantasPintar(37, POR_PAGINA, -1)).toBe(37)
    expect(cuantasPintar(0, POR_PAGINA, -1)).toBe(0)
  })

  // EL PUNTO DE TODO ESTO. El botón "ir al pedido seleccionado" lo centra
  // desplazando la pantalla hasta él, y para eso tiene que existir en el DOM.
  // Si el pedido abierto es el 340 y solo hay cien pintadas, no hay a dónde ir.
  it('estira la ventana hasta alcanzar la fila marcada', () => {
    expect(cuantasPintar(500, POR_PAGINA, 339)).toBe(340)
    expect(cuantasPintar(500, POR_PAGINA, 99)).toBe(100)
  })

  it('una marcada que ya está dentro no estira nada', () => {
    expect(cuantasPintar(500, 200, 12)).toBe(200)
  })

  it('sin fila marcada no estira', () => {
    expect(cuantasPintar(500, POR_PAGINA, -1)).toBe(100)
  })

  // Que la marcada esté fuera de la lista (el filtro la sacó, o llegó una lista
  // nueva sin ella) no puede pintar filas que no existen.
  it('una marcada fuera de rango sigue topando en el total', () => {
    expect(cuantasPintar(40, POR_PAGINA, 900)).toBe(40)
  })
})

describe('el final de la lista', () => {
  it('sabe cuándo falta', () => {
    expect(faltanFilas(500, 100)).toBe(true)
    expect(faltanFilas(100, 100)).toBe(false)
    expect(faltanFilas(0, 0)).toBe(false)
  })

  // Solo se dice cuando falta: "100 de 100" es ruido, y decirlo siempre entrena
  // a no leerlo.
  it('solo cuenta en voz alta mientras falte algo', () => {
    expect(resumenDePaginado(500, 100)).toBe('Mostrando 100 de 500')
    expect(resumenDePaginado(80, 80)).toBeNull()
  })
})
