// ─── SALES ENGINE · Voice Closer (ElevenLabs) ───────────────────────────────────
// Hook que conecta el agente de voz al estado del checkout guiado. Le da CONTEXTO
// DINÁMICO en tiempo real (paso actual, provincia/Lima, pago) y dispara un "nudge"
// cuando el usuario se congela >5s en un paso.
//
// Diseño MVP (YAGNI): el transporte de audio es PLUGGABLE. Si no hay agente
// configurado (VITE_ELEVENLABS_AGENT_ID), el hook queda DORMIDO y no rompe nada.
// La tubería de audio real (@elevenlabs/react) se enchufa en `transport` cuando el
// agente exista, sin tocar esta lógica. Ver docs/01-SALES-ENGINE.md.

import { useEffect, useRef, useCallback } from 'react'
import type { CheckoutState } from './checkout-flow'
import { DEFAULT_ADVANCE_PEN } from './checkout-flow'

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined
const IDLE_MS = 5000

// Contrato del transporte de voz. Un adaptador de ElevenLabs lo implementa.
export interface VoiceTransport {
  start(agentId: string, signedUrl: string | null): Promise<void>
  stop(): void
  // Empuja contexto a la conversación (contextual update) sin interrumpir.
  updateContext(context: string): void
  // Mensaje proactivo hablado (el nudge).
  say(prompt: string): void
}

// Transporte por defecto: no-op. Mantiene el build verde y el hook dormido hasta
// enchufar el SDK real. Cámbialo por createElevenLabsTransport() cuando el agente viva.
export const noopTransport: VoiceTransport = {
  async start() { /* dormido */ },
  stop() {},
  updateContext() {},
  say() {},
}

// Construye el contexto que la IA necesita para guiar la venta en este instante.
export function buildCloserContext(s: CheckoutState): string {
  const a = s.answers
  const lugar = a.deliveryType === 'AGENCIA_PROVINCIA'
    ? `provincia (agencia ${a.agencyName ?? 'por definir'})`
    : a.deliveryType === 'MOTORIZADO_LIMA' ? 'Lima Metropolitana' : 'sin definir'

  const lines = [
    `Paso actual del checkout: ${s.step}.`,
    `Cliente: ${a.resolvedName ?? 'sin validar DNI'}, WhatsApp ${a.whatsapp || 'pendiente'}.`,
    `Entrega: ${lugar}.`,
    `Pago: ${a.paymentMethod} (estado adelanto: ${s.paymentStatus}).`,
  ]
  if (a.deliveryType === 'AGENCIA_PROVINCIA' && s.step === 'entrega') {
    lines.push(`Regla provincia: pedir adelanto de S/${DEFAULT_ADVANCE_PEN} para el flete (Shalom/Olva); el saldo se paga por la app cuando el envío ya tiene guía —nunca en la agencia—, y la clave de recojo se entrega con el saldo pagado.`)
  }
  if (s.step === 'pago_adelanto') {
    lines.push('Guía al cliente a yapear el adelanto al número en pantalla y adjuntar la foto del comprobante o el número de operación.')
  }
  return lines.join(' ')
}

// Nudge según el paso donde se congeló el usuario.
function nudgeFor(s: CheckoutState): string {
  switch (s.step) {
    case 'contacto': return '¿Alguna duda con tu DNI o tu número? Yo te ayudo a completarlo.'
    case 'entrega': return s.answers.deliveryType === 'AGENCIA_PROVINCIA'
      ? '¿Te ayudo con el adelanto para tu envío por agencia?'
      : '¿Necesitas ayuda para fijar el pin de tu dirección en el mapa?'
    case 'pago_adelanto': return 'Cuando hagas el yapeo, solo adjúntame la fotito y confirmamos tu pedido al toque.'
    default: return '¿Te ayudo a terminar tu pedido?'
  }
}

export function useVoiceCloser(state: CheckoutState, opts?: { enabled?: boolean; transport?: VoiceTransport }) {
  const transport = opts?.transport ?? noopTransport
  const enabled = (opts?.enabled ?? true) && !!AGENT_ID
  const startedRef = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Arranca el agente al montar (cuando el popup se abre).
  useEffect(() => {
    if (!enabled || startedRef.current) return
    startedRef.current = true
    ;(async () => {
      let signedUrl: string | null = null
      try {
        // La API key vive en el backend; pedimos una signed URL efímera.
        const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
        const r = await fetch(`${base}/elevenlabs-signed-url`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: AGENT_ID }),
        })
        if (r.ok) signedUrl = (await r.json())?.signed_url ?? null
      } catch { /* sin signed url → el transporte decide */ }
      try { await transport.start(AGENT_ID!, signedUrl) } catch { /* dormido */ }
    })()
    return () => { transport.stop(); startedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Empuja contexto cada vez que cambia el estado + reinicia el timer de inactividad.
  useEffect(() => {
    if (!enabled) return
    transport.updateContext(buildCloserContext(state))
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => transport.say(nudgeFor(state)), IDLE_MS)
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state.step, state.paymentStatus, state.answers.deliveryType, state.answers.agencyName])

  const nudgeNow = useCallback(() => { if (enabled) transport.say(nudgeFor(state)) }, [enabled, transport, state])

  return { enabled, nudgeNow }
}
