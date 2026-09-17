// ─── KROSS FORM · la allowlist y el mensaje ──────────────────────────────────
// Lo puro del embed (`docs/18-KROSS-FORM.md` §4 y §7): quién puede usar una
// llave y qué le llega al WhatsApp de la tienda. Se prueba acá porque las dos
// cosas deciden solas —una autoriza, la otra es lo único que el vendedor lee—
// y ninguna se puede mirar a ojo en producción.

import { describe, expect, it } from 'vitest'
import {
  TOPE_MENSAJE, dominioPermitido, hostDelOrigen, mensajeWhatsApp, telefonoWhatsApp, urlWhatsApp,
} from '../../supabase/functions/_shared/kross-form.ts'

describe('hostDelOrigen · normalizar para comparar', () => {
  it('saca esquema, puerto y www', () => {
    for (const v of [
      'https://tienda.com', 'http://tienda.com', 'https://tienda.com:8443',
      'https://www.tienda.com', 'tienda.com', 'www.tienda.com', '  https://TIENDA.com/  ',
    ]) {
      expect(hostDelOrigen(v)).toBe('tienda.com')
    }
  })

  it('un subdominio NO es el dominio: solo se ignora el www', () => {
    expect(hostDelOrigen('https://shop.tienda.com')).toBe('shop.tienda.com')
    expect(hostDelOrigen('https://shop.tienda.com')).not.toBe(hostDelOrigen('https://tienda.com'))
  })

  it('lo que no es un origen usable es cadena vacía', () => {
    for (const v of ['', '   ', null, undefined, 5, {}, 'https://']) expect(hostDelOrigen(v)).toBe('')
  })
})

describe('dominioPermitido · lo que autoriza es el Origin, no la llave', () => {
  const lista = ['tienda.com', 'https://otra.pe']

  it('deja pasar el dominio de la lista, con o sin www', () => {
    for (const o of ['https://tienda.com', 'https://www.tienda.com', 'https://otra.pe']) {
      expect(dominioPermitido(o, lista)).toBe(true)
    }
  })

  it('no deja pasar nada más', () => {
    for (const o of [
      'https://tienda.com.evil.co',   // el dominio como prefijo de otro
      'https://eviltienda.com',       // el dominio como sufijo de otro
      'https://shop.tienda.com',      // un subdominio que nadie autorizó
      'https://otra.pe.evil.co',
    ]) {
      expect(dominioPermitido(o, lista)).toBe(false)
    }
  })

  it('sin Origin no se atiende: una petición sin él no viene de un formulario', () => {
    for (const o of ['', null, undefined]) expect(dominioPermitido(o, lista)).toBe(false)
  })

  it('una llave sin dominios configurados no atiende a nadie', () => {
    for (const l of [[], null, undefined, 'tienda.com']) {
      expect(dominioPermitido('https://tienda.com', l)).toBe(false)
    }
  })

  it('una entrada basura en la lista no abre la puerta a los Origin basura', () => {
    // El riesgo real: '' === '' emparejaría si no se descartaran los dos lados.
    expect(dominioPermitido('', ['', null])).toBe(false)
    expect(dominioPermitido('https://', ['https://'])).toBe(false)
  })
})

describe('telefonoWhatsApp · el número como lo quiere wa.me', () => {
  it('un celular peruano de 9 dígitos se prefija con 51', () => {
    expect(telefonoWhatsApp('987654321')).toBe('51987654321')
    expect(telefonoWhatsApp('987 654 321')).toBe('51987654321')
  })
  it('uno que ya trae código de país se respeta', () => {
    expect(telefonoWhatsApp('51987654321')).toBe('51987654321')
    expect(telefonoWhatsApp('+51 987-654-321')).toBe('51987654321')
  })
  it('sin dígitos no hay número', () => {
    for (const v of ['', '   ', 'abc', null, undefined]) expect(telefonoWhatsApp(v)).toBe('')
  })
})

describe('mensajeWhatsApp · el estado del pago va explícito', () => {
  const base = {
    orderId: 'ORD-1788900938194', producto: 'Gorra negra', pack: '2 unidades',
    nombre: 'Ana Quispe', telefono: '987654321', destino: 'Lima · a domicilio',
    total: 89, adelanto: 0,
  }

  it('contraentrega dice cuánto paga al recibir', () => {
    const m = mensajeWhatsApp(base)
    expect(m).toContain('ORD-1788900938194')
    expect(m).toContain('Pago contraentrega: S/89 al recibirlo.')
  })

  it('con adelanto parcial dice lo pagado Y el saldo', () => {
    const m = mensajeWhatsApp({ ...base, adelanto: 20 })
    expect(m).toContain('Ya adelanté S/20')
    expect(m).toContain('saldo de S/69')
  })

  it('pagado completo no inventa un saldo', () => {
    const m = mensajeWhatsApp({ ...base, adelanto: 89 })
    expect(m).toContain('Ya pagué el total: S/89.')
    expect(m).not.toContain('saldo')
  })

  it('un adelanto mayor que el total no produce un saldo negativo', () => {
    // No vale buscar un '-' suelto: el código del pedido ya trae uno.
    const m = mensajeWhatsApp({ ...base, adelanto: 200 })
    expect(m).toContain('Ya pagué el total')
    expect(m).not.toMatch(/saldo de S\/-?\d/)
  })

  it('la dirección solo sale si existe', () => {
    expect(mensajeWhatsApp(base)).not.toContain('🏠')
    expect(mensajeWhatsApp({ ...base, direccion: 'Av. Siempre Viva 742' })).toContain('🏠 Av. Siempre Viva 742')
  })

  it('un texto larguísimo se recorta, y lo que sobrevive es el código del pedido', () => {
    const m = mensajeWhatsApp({ ...base, producto: 'x'.repeat(5000) })
    expect(m.length).toBe(TOPE_MENSAJE)
    expect(m).toContain('ORD-1788900938194')
    expect(m.endsWith('…')).toBe(true)
  })
})

describe('urlWhatsApp · el enlace, o nada', () => {
  it('arma el wa.me con el texto escapado', () => {
    const url = urlWhatsApp('987654321', 'Hola, pedido ORD-1 👋')
    expect(url).toBe('https://wa.me/51987654321?text=Hola%2C%20pedido%20ORD-1%20%F0%9F%91%8B')
  })
  it('sin número usable devuelve null en vez de un enlace roto', () => {
    for (const n of ['', null, undefined, 'abc']) expect(urlWhatsApp(n, 'hola')).toBe(null)
  })
})
