// ─── Dźwięki gry using Web Audio API ──────────────────────────────────────

class SoundManager {
  private ctx: AudioContext | null = null
  private enabled = true

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    return this.ctx
  }

  toggle() {
    this.enabled = !this.enabled
    return this.enabled
  }

  isEnabled() {
    return this.enabled
  }

  private play(freq: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (!this.enabled) return
    try {
      const ctx = this.getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      gain.gain.setValueAtTime(volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration)
    } catch { /* ignore */ }
  }

  // Rzut kośćmi
  diceRoll() {
    this.play(800, 0.1, 'square', 0.15)
    setTimeout(() => this.play(600, 0.1, 'square', 0.15), 50)
    setTimeout(() => this.play(1000, 0.15, 'square', 0.2), 100)
  }

  // Kupno nieruchomości
  buyProperty() {
    this.play(523, 0.15, 'sine', 0.25)
    setTimeout(() => this.play(659, 0.15, 'sine', 0.25), 100)
    setTimeout(() => this.play(784, 0.2, 'sine', 0.3), 200)
  }

  // Pobranie pieniędzy
  moneyGain() {
    this.play(880, 0.1, 'sine', 0.2)
    setTimeout(() => this.play(1100, 0.15, 'sine', 0.25), 80)
  }

  // Zapłata czynszu
  moneyLoss() {
    this.play(400, 0.15, 'sawtooth', 0.15)
    setTimeout(() => this.play(300, 0.2, 'sawtooth', 0.15), 100)
  }

  // Dublet
  doubles() {
    this.play(660, 0.1, 'sine', 0.2)
    setTimeout(() => this.play(880, 0.15, 'sine', 0.25), 80)
  }

  // Więzienie
  jail() {
    this.play(200, 0.3, 'sawtooth', 0.2)
    setTimeout(() => this.play(150, 0.4, 'sawtooth', 0.15), 200)
  }

  // Karta
  card() {
    this.play(440, 0.1, 'triangle', 0.2)
    setTimeout(() => this.play(550, 0.1, 'triangle', 0.2), 70)
    setTimeout(() => this.play(660, 0.15, 'triangle', 0.25), 140)
  }

  // Wygrana
  win() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      setTimeout(() => this.play(freq, 0.3, 'sine', 0.25), i * 150)
    })
  }

  // Bankructwo
  bankrupt() {
    this.play(300, 0.2, 'sawtooth', 0.2)
    setTimeout(() => this.play(200, 0.3, 'sawtooth', 0.2), 150)
    setTimeout(() => this.play(100, 0.5, 'sawtooth', 0.15), 300)
  }

  // Start tury
  turnStart() {
    this.play(523, 0.1, 'sine', 0.15)
    setTimeout(() => this.play(659, 0.1, 'sine', 0.2), 60)
  }

  // Nowa wiadomość czatu
  chatMessage() {
    this.play(800, 0.08, 'sine', 0.1)
  }
}

export const sounds = new SoundManager()
