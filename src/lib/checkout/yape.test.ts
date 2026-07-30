// Tests del parser de notificaciones de Yape. Importa el módulo compartido que
// usa la Edge Function `yape-ingest`, así que lo que pasa aquí es exactamente lo
// que corre en producción — no una copia.
//
// El primer bloque usa el texto REAL capturado de un equipo Android; los demás
// son variantes reconstruidas, por si Yape cambia la redacción. Cualquier
// notificación nueva que se vea en producción se agrega aquí como caso.

import { describe, expect, it } from 'vitest'
import {
  nameMatches, normalizeName, parseYapeNotification, yapeDedupeKey,
} from '../../../supabase/functions/_shared/yape'

// ─── Texto real, capturado el 29-jul-2026 ───────────────────────────────────
const REAL_TITLE = 'Confirmación de Pago'
const REAL_BODY = 'Leonardo Pac* te envió un pago por S/ 1. El cód. de seguridad es: 965'

describe('notificación REAL de Yape', () => {
  it('lee todo del cuerpo tal cual llega', () => {
    const p = parseYapeNotification(REAL_BODY)
    expect(p.looksLikeYape).toBe(true)
    expect(p.amountPen).toBe(1)
    expect(p.senderName).toBe('Leonardo Pac*')
    expect(p.securityCode).toBe('965')
  })

  // Los automatizadores suelen mandar título + cuerpo en un solo campo. Sin
  // quitar el título, el nombre salía "Confirmación de Pago Leonardo Pac*".
  it('lo lee igual si viene con el título pegado', () => {
    for (const raw of [`${REAL_TITLE}\n${REAL_BODY}`, `${REAL_TITLE}: ${REAL_BODY}`, `Yape: ${REAL_TITLE} ${REAL_BODY}`]) {
      const p = parseYapeNotification(raw)
      expect(p.senderName).toBe('Leonardo Pac*')
      expect(p.amountPen).toBe(1)
      expect(p.securityCode).toBe('965')
    }
  })

  // Yape corta el apellido con ASTERISCO. Sin normalizarlo, "PAC*" nunca calza
  // con "PACAHUALA" y TODO pago quedaba marcado como nombre distinto.
  it('el apellido cortado con asterisco calza con el nombre completo', () => {
    expect(nameMatches('Leonardo Pac*', 'Leonardo Pacahuala Silva')).toBe(true)
    expect(nameMatches('Victor Cop*', 'Victor Copacondori')).toBe(true)
    expect(nameMatches('Leonardo Pac*', 'Rosa Quispe')).toBe(false)
  })

  // La misma notificación se re-emite al desbloquear el celular. Si entrara dos
  // veces podría cuadrar DOS pedidos y saldría un paquete que nadie pagó.
  it('una re-emisión minutos después no entra dos veces', () => {
    const p = parseYapeNotification(REAL_BODY)
    expect(yapeDedupeKey(p, '2026-07-29T21:06:00Z')).toBe(yapeDedupeKey(p, '2026-07-29T21:09:30Z'))
  })
})

// ─── Segundo pago Yape→Yape real (30-jul-2026) ──────────────────────────────
// Confirma dos cosas que faltaba comprobar: el patrón aguanta montos con
// decimales ("S/ 0.1") y **el código de seguridad SÍ llega** en este equipo —
// la censura de OTP que advierte Android 15 no lo está bloqueando.
const REAL_BODY_2 = 'Confirmación de Pago Paolo Car* te envió un pago por S/ 0.1. El cód. de seguridad es: 956'

describe('segundo pago real Yape→Yape', () => {
  it('lee nombre, monto decimal y código', () => {
    const p = parseYapeNotification(REAL_BODY_2)
    expect(p.looksLikeYape).toBe(true)
    expect(p.senderName).toBe('Paolo Car*')
    expect(p.amountPen).toBe(0.1)
    // El comprobante del pagador mostraba este mismo 956: es la llave que teclea
    // en el paso 3 y la que cierra el cruce sin ambigüedad.
    expect(p.securityCode).toBe('956')
  })
})

// ─── Pago hecho desde PLIN a un número Yape (real, 30-jul-2026) ──────────────
// Yape igual notifica, pero con otro cuerpo: lleva "Yape!" delante del nombre y
// —esto es lo importante— **no trae código de seguridad**. No es un fallo: es un
// caso permanente, porque el código lo genera Yape para sus propios pagos.
const PLIN_BODY = 'Yape! JHOANN PACAHUALA te envió un pago por S/ 1.5'

describe('pago recibido desde Plin', () => {
  it('lee nombre y monto pese al prefijo "Yape!"', () => {
    const p = parseYapeNotification(`Confirmación de Pago ${PLIN_BODY}`)
    expect(p.looksLikeYape).toBe(true)
    expect(p.senderName).toBe('JHOANN PACAHUALA')
    expect(p.amountPen).toBe(1.5)
  })

  // Sin código el cruce sigue siendo posible, pero solo por monto y con un
  // único candidato. Es la razón por la que el paso 3 pide el código al
  // comprador: cuando Yape no lo da, lo da él.
  it('sin código de seguridad no inventa uno', () => {
    expect(parseYapeNotification(PLIN_BODY).securityCode).toBeNull()
  })

  it('el nombre completo de Plin calza con el del pedido', () => {
    expect(nameMatches('JHOANN PACAHUALA', 'Jhoann Pacahuala')).toBe(true)
  })
})

// ─── Diagnóstico: variable del automatizador sin expandir ────────────────────
// Pasó de verdad y costó una tarde: MacroDroid mandaba el marcador literal, la
// función respondía 200 y no quedaba rastro. El parser debe reconocerlo como
// "esto no es un pago" para que se guarde con motivo y sea visible.
describe('texto que NO es una notificación', () => {
  it('un marcador sin expandir no se toma por un pago', () => {
    const p = parseYapeNotification('[not_title] [not_text]')
    expect(p.looksLikeYape).toBe(false)
    expect(p.amountPen).toBeNull()
  })
})

describe('parser de Yape · monto', () => {
  it('lee las formas de escribir el monto', () => {
    expect(parseYapeNotification('Juan P. te envió un pago por S/ 20').amountPen).toBe(20)
    expect(parseYapeNotification('Juan P. te yapeó S/20.00').amountPen).toBe(20)
    expect(parseYapeNotification('Ana M. te envió S/ 1,250.50').amountPen).toBe(1250.5)
  })

  // Regresión: el punto que cierra la oración se colaba en el número y
  // `Number("0.1.")` daba NaN → el pago se descartaba por "sin monto legible".
  it('no se traga el punto final de la oración', () => {
    expect(parseYapeNotification('Juan P. te envió un pago por S/ 0.1. El cód. de seguridad es: 956').amountPen).toBe(0.1)
    expect(parseYapeNotification('Juan P. te envió un pago por S/ 15. Gracias').amountPen).toBe(15)
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
