import { describe, it, expect } from 'vitest'
import {
  MIN_PASSWORD, RECOVERY_PATH, linkFromLocation, normalizeEmail, parseRecoveryLink,
  passwordProblem, recoveryRedirectUrl, sendErrorMessage,
} from './password-recovery'

describe('a dónde vuelve el enlace del correo', () => {
  // El panel es multi-tenant por subdominio: quien pide el enlace desde su
  // marca tiene que volver a SU marca, no al host de la plataforma.
  it('vuelve al mismo origen desde el que se pidió', () => {
    expect(recoveryRedirectUrl('https://kross-shop.krossclub.app'))
      .toBe(`https://kross-shop.krossclub.app${RECOVERY_PATH}`)
  })

  it('no duplica la barra si el origen ya la trae', () => {
    expect(recoveryRedirectUrl('http://localhost:5173/'))
      .toBe(`http://localhost:5173${RECOVERY_PATH}`)
  })

  it('el correo se normaliza: se escribe a mano y en móvil', () => {
    expect(normalizeEmail('  Equipo@Kross.Club ')).toBe('equipo@kross.club')
  })
})

describe('leer el enlace del correo', () => {
  // Flujo por defecto de supabase-js: la sesión viene en el hash.
  it('reconoce la sesión que llega en el hash', () => {
    const link = parseRecoveryLink(
      'https://kross-shop.krossclub.app/nueva-contrasena'
      + '#access_token=abc&refresh_token=def&token_type=bearer&type=recovery')
    expect(link).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def' })
  })

  it('reconoce el code de PKCE', () => {
    const link = parseRecoveryLink('https://kross-shop.krossclub.app/nueva-contrasena?code=xyz')
    expect(link).toEqual({ kind: 'code', code: 'xyz' })
  })

  // Con `token_hash` el enlace funciona en otro dispositivo (se abre el correo
  // en el celular y se pidió desde la laptop), que es lo que pasa de verdad.
  it('reconoce el token_hash y su tipo', () => {
    expect(parseRecoveryLink('https://x.krossclub.app/nueva-contrasena?token_hash=h1&type=recovery'))
      .toEqual({ kind: 'otp', tokenHash: 'h1', type: 'recovery' })
    expect(parseRecoveryLink('https://x.krossclub.app/nueva-contrasena?token_hash=h2&type=invite'))
      .toEqual({ kind: 'otp', tokenHash: 'h2', type: 'invite' })
  })

  // Auth rebota el enlace vencido por el hash, no por la query.
  it('detecta el enlace vencido y lo dice con el siguiente paso', () => {
    const link = parseRecoveryLink(
      'https://x.krossclub.app/nueva-contrasena'
      + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')
    expect(link.kind).toBe('expired')
    expect(link.kind === 'expired' && link.message).toMatch(/venció|usó/)
  })

  // El error manda sobre todo lo demás: un enlace rebotado no se canjea.
  it('el error gana aunque vengan tokens en la misma URL', () => {
    expect(parseRecoveryLink('https://x.app/nueva-contrasena#error_code=otp_expired&access_token=a&refresh_token=b').kind)
      .toBe('expired')
  })

  it('sin enlace no inventa nada', () => {
    expect(parseRecoveryLink('https://x.krossclub.app/nueva-contrasena')).toEqual({ kind: 'none' })
    expect(parseRecoveryLink('')).toEqual({ kind: 'none' })
  })

  // Un access_token suelto no alcanza para dejar la sesión utilizable.
  it('un token sin refresh no cuenta como sesión', () => {
    expect(parseRecoveryLink('https://x.app/nueva-contrasena#access_token=abc&type=recovery'))
      .toEqual({ kind: 'none' })
  })
})

describe('el enlace se lee solo en su pantalla', () => {
  const href = `https://x.krossclub.app${RECOVERY_PATH}#access_token=a&refresh_token=b`

  it('vale en /nueva-contrasena', () => {
    expect(linkFromLocation(RECOVERY_PATH, href).kind).toBe('tokens')
  })

  it('la barra del final no cambia nada', () => {
    expect(linkFromLocation(`${RECOVERY_PATH}/`, href).kind).toBe('tokens')
  })

  // El checkout y la web pública llegan con sus propios parámetros en la URL;
  // ninguno es el enlace del correo.
  it('en cualquier otra pantalla no hay enlace', () => {
    expect(linkFromLocation('/pago', 'https://x.krossclub.app/pago?code=PEDIDO-1'))
      .toEqual({ kind: 'none' })
  })
})

describe('contraseña nueva', () => {
  it('exige el mínimo', () => {
    expect(passwordProblem('corta', 'corta')).toMatch(String(MIN_PASSWORD))
  })

  // Se fija a ciegas (viene enmascarada): sin la confirmación, un dedazo deja
  // al vendedor afuera con una contraseña que nadie conoce.
  it('exige que las dos coincidan', () => {
    expect(passwordProblem('kross-2026', 'kross-2027')).toMatch(/no coinciden/)
  })

  it('acepta la que cumple', () => {
    expect(passwordProblem('kross-2026', 'kross-2026')).toBeNull()
  })

  // Los espacios de los extremos NO se recortan: son parte de la contraseña y
  // recortarlos acá la dejaría distinta de la que Auth guardó.
  it('no toca los espacios', () => {
    expect(passwordProblem(' kross-2026 ', ' kross-2026 ')).toBeNull()
    expect(passwordProblem(' kross-2026 ', 'kross-2026')).toMatch(/no coinciden/)
  })
})

describe('errores al enviar el correo', () => {
  it('el límite de envíos se dice, porque reintentar tampoco va a funcionar', () => {
    expect(sendErrorMessage(429)).toMatch(/Espera/)
    expect(sendErrorMessage(400, 'over_email_send_rate_limit')).toMatch(/Espera/)
  })

  it('cualquier otro error dice que no se envió', () => {
    expect(sendErrorMessage(500)).toMatch(/No pudimos enviar/)
  })

  // Un fallo de red llega con `status: 0` y sin código. Si eso pasara por
  // "enviado", el vendedor se queda esperando un correo que nunca salió.
  it('el fallo de red también se avisa', () => {
    expect(sendErrorMessage(0)).toMatch(/No pudimos enviar/)
    expect(sendErrorMessage()).toMatch(/No pudimos enviar/)
  })
})
