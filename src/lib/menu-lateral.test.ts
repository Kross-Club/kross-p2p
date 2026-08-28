import { describe, it, expect, beforeEach } from 'vitest'
import { menuPlegado, setMenuPlegado } from './menu-lateral'

describe('el menú lateral plegado', () => {
  beforeEach(() => { setMenuPlegado(false); localStorage.clear(); setMenuPlegado(false) })

  // El menú ancho es el que se explica solo: si no hay nada guardado, ese.
  it('arranca ancho', () => {
    expect(menuPlegado()).toBe(false)
  })

  it('se pliega y se despliega', () => {
    setMenuPlegado(true)
    expect(menuPlegado()).toBe(true)
    setMenuPlegado(false)
    expect(menuPlegado()).toBe(false)
  })

  // Vive en el dispositivo, como el tema: quien trabaja en una laptop chica lo
  // quiere plegado y quien tiene monitor grande no, y ninguno decide por el otro.
  it('se recuerda en este dispositivo', () => {
    setMenuPlegado(true)
    expect(localStorage.getItem('kross-menu-plegado')).toBe('1')
    setMenuPlegado(false)
    expect(localStorage.getItem('kross-menu-plegado')).toBeNull()
  })
})
