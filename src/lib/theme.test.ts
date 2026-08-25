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
    theme.setThemePref('dark')
    systemIsDark = false
  })

  it('por defecto el panel es oscuro, diga lo que diga el sistema', () => {
    localStorage.clear()
    systemIsDark = false
    expect(theme.getThemePref()).toBe('dark')
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

  // 'system' ya no es el default, pero si alguien lo tiene guardado se respeta.
  it('respeta un "system" heredado', () => {
    theme.setThemePref('system')
    systemIsDark = true
    expect(theme.getThemePref()).toBe('system')
    theme.toggleTheme('dark')                 // desde oscuro pide claro, y queda fijo
    expect(theme.getThemePref()).toBe('light')
  })
})
