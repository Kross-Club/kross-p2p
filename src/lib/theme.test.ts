import { describe, it, expect, beforeEach } from 'vitest'

// Los tests corren en Node: `window` no existe. El módulo del tema lo consulta
// al cargarse, así que el stub va ANTES del import dinámico.
let systemIsDark = false
;(globalThis as unknown as { window: unknown }).window = {
  matchMedia: () => ({
    get matches() { return systemIsDark },
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
}

const theme = await import('./theme')

describe('tema del panel', () => {
  beforeEach(() => {
    localStorage.clear()
    theme.setThemePref('system')
    systemIsDark = false
  })

  it('por defecto sigue al sistema', () => {
    localStorage.clear()
    expect(theme.getThemePref()).toBe('system')
  })

  it('la elección del vendedor se guarda', () => {
    theme.setThemePref('dark')
    expect(theme.getThemePref()).toBe('dark')
    expect(localStorage.getItem('kross-theme')).toBe('dark')
  })

  // El botón siempre tiene que producir un cambio VISIBLE: si estás viendo
  // claro y tocas, ves oscuro. Da igual de dónde venía ese claro.
  it('el botón cambia a lo contrario de lo que se está viendo', () => {
    theme.toggleTheme('light')
    expect(theme.getThemePref()).toBe('dark')
  })

  // …y cuando lo que eliges es lo que ya pide el sistema, el panel vuelve solo
  // a seguirlo: sin esto haría falta un tercer botón "automático".
  it('elegir el tema del sistema vuelve a "system"', () => {
    theme.setThemePref('dark')
    theme.toggleTheme('dark')                 // pide claro, y el sistema es claro
    expect(theme.getThemePref()).toBe('system')

    systemIsDark = true
    theme.setThemePref('light')
    theme.toggleTheme('light')                // pide oscuro, y el sistema es oscuro
    expect(theme.getThemePref()).toBe('system')
  })
})
