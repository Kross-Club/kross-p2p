// Sonidos de aviso del panel — mismo enfoque WebAudio que ringtone.ts: nada de
// archivos de audio que descargar, y cada evento suena distinto para que el
// oído lo distinga sin mirar la pantalla.
//   · nuevo cliente → arpegio ascendente tipo "caja registradora": celebra una venta
//   · nuevo mensaje → doble pop corto y suave: pide atención sin celebrar nada

export type NotificationSound = 'new_client' | 'new_message'

function tone(ctx: AudioContext, freq: number, start: number, dur: number, vol = 0.2, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(vol, start + 0.015)
  gain.gain.setValueAtTime(vol, start + dur - 0.03)
  gain.gain.linearRampToValueAtTime(0, start + dur)
  osc.start(start)
  osc.stop(start + dur + 0.01)
}

export function playNotificationSound(kind: NotificationSound) {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime

    if (kind === 'new_client') {
      // Do mayor ascendente rematado en la octava: C5 · E5 · G5 · C6
      tone(ctx, 523.25, now, 0.12, 0.18, 'triangle')
      tone(ctx, 659.25, now + 0.1, 0.12, 0.18, 'triangle')
      tone(ctx, 783.99, now + 0.2, 0.12, 0.18, 'triangle')
      tone(ctx, 1046.5, now + 0.3, 0.32, 0.22, 'triangle')
      tone(ctx, 1318.5, now + 0.3, 0.32, 0.07, 'sine') // brillo (E6) sobre la nota final
    } else {
      // Pop-pop: G5 corto → C6 corto
      tone(ctx, 784, now, 0.09, 0.2)
      tone(ctx, 1047, now + 0.13, 0.14, 0.2)
    }

    // Cerrar el contexto cuando ya sonó todo (evita acumular AudioContexts)
    setTimeout(() => { ctx.close().catch(() => {}) }, 900)
  } catch { /* AudioContext bloqueado (sin gesto previo) — se pierde el sonido, no la notificación */ }
}
