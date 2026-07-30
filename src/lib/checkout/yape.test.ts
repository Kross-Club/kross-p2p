// Tests del parser de notificaciones de Yape. Importa el módulo compartido que
// usa la Edge Function `yape-ingest`, así que lo que pasa aquí es exactamente lo
// que corre en producción — no una copia.
//
// ⚠️ Los textos de ejemplo son RECONSTRUIDOS, no capturados de un equipo real.
// Cuando llegue una notificación real hay que agregarla aquí como caso: es la
// única forma de saber que el patrón calza de verdad.

import { describe, expect, it } from 'vitest'
import {
  nameMatches, normalizeName, parseYapeNotification, yapeDedupeKey,
} from '../../../supabase/functions/_shared/yape'

describe('parser de Yape · monto', () => {
  it('lee las formas de escribir el monto', () => {
    expect(parseYapeNotification('Juan P. te envió un pago por S/ 20').amountPen).toBe(20)
    expect(parseYapeNotification('Juan P. te yapeó S/20.00').amountPen).toBe(20)
    expect(parseYapeNotification('Ana M. te envió S/ 1,250.50').amountPen).toBe(1250.5)
  })

  it('sin monto legible devuelve null, no un 0 que cuadraría con cualquier cosa', () => {
    expect(parseYapeNotification('Yape: tienes una solicitud').amountPen).toBeNull()
    expect(parseYapeNotification('').amountPen).toBeNull()
  })
})

describe('parser de Yape · quién pagó', () => {
  it('lee el nombre en las formas conocidas', () => {
    expect(parseYapeNotification('Juan Carlos P. te envió un pago por S/ 20').senderName)
      .toBe('Juan Carlos P.')
    expect(parseYapeNotification('Has recibido un pago de S/20 de ANA MARIA T.').senderName)
      .toBe('ANA MARIA T.')
    expect(parseYapeNotification('Pago recibido de Luis R.').senderName).toBe('Luis R.')
  })

  it('si no reconoce el patrón devuelve null en vez de inventar', () => {
    expect(parseYapeNotification('S/ 20').senderName).toBeNull()
  })
})

describe('parser de Yape · código y operación', () => {
  it('lee el código de seguridad cuando viene', () => {
    expect(parseYapeNotification('Juan P. te yapeó S/20. Código de seguridad: 481').securityCode).toBe('481')
    expect(parseYapeNotification('Juan P. te yapeó S/20').securityCode).toBeNull()
  })

  it('lee el número de operación cuando viene', () => {
    expect(parseYapeNotification('Pago recibido de Juan P. N° de operación 12345678').operationNumber)
      .toBe('12345678')
  })
})

describe('parser de Yape · qué SÍ es un pago recibido', () => {
  it('reconoce un pago entrante', () => {
    expect(parseYapeNotification('Juan P. te envió un pago por S/ 20').looksLikeYape).toBe(true)
  })

  // Si se aceptara un pago SALIENTE, nuestro propio gasto podría cuadrar el
  // adelanto de un pedido y darlo por pagado sin que nadie haya pagado nada.
  it('descarta un pago saliente', () => {
    expect(parseYapeNotification('¡Yapeaste S/20 a Juan P.!').looksLikeYape).toBe(false)
    expect(parseYapeNotification('Enviaste S/20 a Ana M.').looksLikeYape).toBe(false)
  })

  it('descarta texto que no tiene nada que ver', () => {
    expect(parseYapeNotification('Tu paquete llegó a la agencia').looksLikeYape).toBe(false)
  })
})

describe('deduplicación', () => {
  it('el mismo pago dos veces produce la misma llave', () => {
    const raw = 'Juan P. te envió un pago por S/ 20. N° de operación 998877'
    const a = parseYapeNotification(raw)
    // Aunque el celular la re-emita un minuto después, la operación manda.
    expect(yapeDedupeKey(a, '2026-07-30T10:00:00Z')).toBe(yapeDedupeKey(a, '2026-07-30T10:05:00Z'))
  })

  it('sin n° de operación la llave usa monto + nombre + minuto', () => {
    const p = parseYapeNotification('Juan P. te envió un pago por S/ 20')
    expect(yapeDedupeKey(p, '2026-07-30T10:00:30Z')).toBe(yapeDedupeKey(p, '2026-07-30T10:00:59Z'))
    expect(yapeDedupeKey(p, '2026-07-30T10:00:30Z')).not.toBe(yapeDedupeKey(p, '2026-07-30T10:01:00Z'))
  })

  it('dos pagos distintos no colisionan', () => {
    const a = parseYapeNotification('Juan P. te envió un pago por S/ 20')
    const b = parseYapeNotification('Ana M. te envió un pago por S/ 20')
    expect(yapeDedupeKey(a, '2026-07-30T10:00:00Z')).not.toBe(yapeDedupeKey(b, '2026-07-30T10:00:00Z'))
  })
})

describe('comparación de nombres', () => {
  it('tolera el apellido abreviado que usa Yape', () => {
    expect(nameMatches('Juan Carlos P.', 'Juan Carlos Pérez Ramos')).toBe(true)
    expect(nameMatches('JUAN C. P.', 'Juan Carlos Pérez')).toBe(true)
  })

  it('ignora tildes y mayúsculas', () => {
    expect(normalizeName('José Ángel P.')).toBe('JOSE ANGEL P')
    expect(nameMatches('JOSE A.', 'José Ángel Pérez')).toBe(true)
  })

  it('dice que no cuando de verdad son otras personas', () => {
    expect(nameMatches('Ana M.', 'Juan Carlos Pérez')).toBe(false)
  })

  // En COD paga la mamá, el vecino o el esposo. Por eso el nombre es señal de
  // apoyo y nunca decide solo: aquí solo se comprueba que la función avisa.
  it('sin nombre no afirma coincidencia', () => {
    expect(nameMatches(null, 'Juan Carlos Pérez')).toBe(false)
    expect(nameMatches('Juan P.', null)).toBe(false)
  })
})
