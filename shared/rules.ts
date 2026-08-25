// ─── Wspólne funkcje zasad (używane przez serwer i klient) ───────────────────

import { BOARD, tilesInGroup } from './board'
import type { GameState, Tile } from './types'

/** Ile pól z grupy posiada dany gracz. */
export function ownedInGroup(state: GameState, group: string, ownerId: string): number {
  return tilesInGroup(group).filter(
    (t) => state.properties[t.id]?.owner === ownerId
  ).length
}

/** Czy gracz posiada całą grupę (monopol). */
export function ownsWholeGroup(state: GameState, group: string, ownerId: string): boolean {
  const tiles = tilesInGroup(group)
  return tiles.every((t) => state.properties[t.id]?.owner === ownerId)
}

/** Czy w całej grupie nie stoi żaden budynek (warunek hipoteki). */
export function groupHasNoBuildings(state: GameState, group: string): boolean {
  return tilesInGroup(group).every((t) => (state.properties[t.id]?.houses ?? 0) === 0)
}

/** Minimalna liczba domków w monopolu — warunek równomiernej zabudowy. */
export function minHousesInGroup(state: GameState, group: string): number {
  const tiles = tilesInGroup(group)
  return Math.min(...tiles.map((t) => state.properties[t.id]?.houses ?? 0))
}

/** Wyliczenie czynszu za pole. diceSum potrzebne dla użytków. */
export function calcRent(tile: Tile, state: GameState, diceSum: number): number | null {
  const prop = state.properties[tile.id]
  if (!prop || !prop.owner || tile.group == null) return null

  if (tile.type === 'street') {
    if (!tile.rent) return null
    if (prop.houses > 0) return tile.rent[prop.houses]
    // pusta nieruchomość z pełnym monopolem = podwójny czynsz
    if (ownsWholeGroup(state, tile.group, prop.owner)) return tile.rent[0] * 2
    return tile.rent[0]
  }
  if (tile.type === 'railroad') {
    const n = ownedInGroup(state, 'railroad', prop.owner)
    return 25 * Math.pow(2, n - 1)
  }
  if (tile.type === 'utility') {
    const n = ownedInGroup(state, 'utility', prop.owner)
    return (n === 2 ? 10 : 4) * diceSum
  }
  return null
}

/** Pozycja (row, col) na siatce 11x11 dla pola o danym id. */
export function gridPos(id: number): { row: number; col: number } {
  if (id <= 0) return { row: 11, col: 11 }          // START
  if (id < 10) return { row: 11, col: 11 - id }     // dolna krawędź →
  if (id === 10) return { row: 11, col: 1 }         // więzienie
  if (id < 20) return { row: 21 - id, col: 1 }      // lewa krawędź ↑
  if (id === 20) return { row: 1, col: 1 }          // parking
  if (id < 30) return { row: 1, col: id - 19 }      // górna krawędź →
  if (id === 30) return { row: 1, col: 11 }         // idź do więzienia
  return { row: 41 - id, col: 11 }                  // prawa krawędź ↓
}

export function tileById(id: number): Tile {
  return BOARD[id]
}
