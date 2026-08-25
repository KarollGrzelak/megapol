// ─── Dostępne pionki i kolory dla graczy ──────────────────────────────────

export interface TokenOption {
  emoji: string
  name: string
}

export interface ColorOption {
  hex: string
  name: string
}

export const AVAILABLE_TOKENS: TokenOption[] = [
  { emoji: '🎩', name: 'Cylindryk' },
  { emoji: '🚗', name: 'Samochód' },
  { emoji: '🐕', name: 'Pies' },
  { emoji: '🚀', name: 'Rakieta' },
  { emoji: '⛵', name: 'Łódka' },
  { emoji: '🐱', name: 'Kot' },
  { emoji: '💎', name: 'Diament' },
  { emoji: '🎯', name: 'Tarcza' },
  { emoji: '🎲', name: 'Kostka' },
  { emoji: '🏆', name: 'Puchar' },
  { emoji: '🔑', name: 'Klucz' },
  { emoji: '🎵', name: 'Nuta' },
]

export const AVAILABLE_COLORS: ColorOption[] = [
  { hex: '#ef476f', name: 'Różowy' },
  { hex: '#118ab2', name: 'Błękitny' },
  { hex: '#06d6a0', name: 'Zielony' },
  { hex: '#ffd166', name: 'Żółty' },
  { hex: '#9b5de5', name: 'Fioletowy' },
  { hex: '#f48c06', name: 'Pomarańczowy' },
  { hex: '#e63946', name: 'Czerwony' },
  { hex: '#457b9d', name: 'Stalowy' },
  { hex: '#2a9d8f', name: 'Morski' },
  { hex: '#e9c46a', name: 'Złoty' },
]

/** Domyślny pionek dla danego indeksu gracza */
export function getDefaultToken(index: number): string {
  return AVAILABLE_TOKENS[index % AVAILABLE_TOKENS.length].emoji
}

/** Domyślny kolor dla danego indeksu gracza */
export function getDefaultColor(index: number): string {
  return AVAILABLE_COLORS[index % AVAILABLE_COLORS.length].hex
}
