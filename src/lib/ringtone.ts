export function startRingtone(): () => void {
  let stopped = false
  let ctx: AudioContext | null = null

  function playRing() {
    if (stopped) return
    try {
      ctx?.close()
      ctx = new AudioContext()
      const now = ctx.currentTime

      function tone(freq: number, start: number, dur: number, vol = 0.22) {
        if (!ctx) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(vol, start + 0.025)
        gain.gain.setValueAtTime(vol, start + dur - 0.025)
        gain.gain.linearRampToValueAtTime(0, start + dur)
        osc.start(start)
        osc.stop(start + dur + 0.01)
      }

      // Double ring: two tones with harmony, 0.5s gap between rings
      tone(440, now,       0.4)
      tone(659, now,       0.4, 0.08) // E5 harmony
      tone(440, now + 0.6, 0.4)
      tone(659, now + 0.6, 0.4, 0.08)
    } catch { /* AudioContext blocked — ignore */ }
  }

  playRing()
  const id = setInterval(playRing, 3500)

  return () => {
    stopped = true
    clearInterval(id)
    ctx?.close()
    ctx = null
  }
}
