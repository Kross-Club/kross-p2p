import { describe, it, expect } from 'vitest'
import { cabeEnElMismoPaquete } from '../../supabase/functions/_shared/upsell.ts'

// ─── ¿El upsell entra en el mismo pedido, o abre uno nuevo? ──────────────────
//
// No es una preferencia, es una pregunta física: ¿la caja todavía está acá?
// Equivocarse hacia un lado promete una entrega que no va a ocurrir; hacia el
// otro, abre un pedido paralelo con su propio envío por cobrar.

describe('sumar un producto al mismo pedido', () => {
  it('cabe mientras el paquete siga en la tienda', () => {
    for (const stage of ['nuevo', 'validando', 'confirmado', 'registrado']) {
      expect(cabeEnElMismoPaquete({ stage })).toBe(true)
    }
  })

  // Los dos que faltaban. `validando` es un pedido que ni se ha tocado, y
  // `registrado` es justo el momento en que se ARMA el pedido: la guía existe
  // pero la caja sigue acá, y es cuando más se agrega algo.
  it('cabe en validando y en registrado, que antes abrían un pedido aparte', () => {
    expect(cabeEnElMismoPaquete({ stage: 'validando' })).toBe(true)
    expect(cabeEnElMismoPaquete({ stage: 'registrado' })).toBe(true)
  })

  it('no cabe cuando el pedido ya salió o ya terminó', () => {
    for (const stage of ['en_camino', 'entregado', 'no_entregado']) {
      expect(cabeEnElMismoPaquete({ stage })).toBe(false)
    }
  })

  // La aguja del courier manda en cuanto aparece: la guía se emite ANTES de
  // entregarle el paquete, así que un `registrado` que Shalom ya reporta en su
  // sede de salida es un paquete que se fue, diga lo que diga el stage.
  it('lo que reporta el courier manda sobre la etapa', () => {
    expect(cabeEnElMismoPaquete({ stage: 'registrado', tracking_phase: 'EN_ORIGEN' })).toBe(false)
    expect(cabeEnElMismoPaquete({ stage: 'confirmado', tracking_phase: 'EN_TRANSITO' })).toBe(false)
    expect(cabeEnElMismoPaquete({ stage: 'registrado', tracking_phase: null })).toBe(true)
  })

  // Un pedido sin etapa es uno recién creado, no uno perdido: negarle el upsell
  // abriría un pedido aparte en el caso más común de todos.
  it('sin etapa se trata como recién creado', () => {
    expect(cabeEnElMismoPaquete({})).toBe(true)
  })
})
