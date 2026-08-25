// ─── PLANSZA — tu personalizujesz grę po swojemu! ────────────────────────────
// Zmień nazwy pól, ceny, grupy kolorów itd. Plansza ma zawsze 40 pól (0–39),
// pole 0 to START, 10 = więzienie, 20 = darmowy parking, 30 = idź do więzienia.

import type { Tile } from './types'

export const GROUP_COLORS: Record<string, string> = {
  brown: '#9c6b3f',
  lightblue: '#7fd4f0',
  pink: '#e23b8f',
  orange: '#f28c28',
  red: '#e03131',
  yellow: '#f5c518',
  green: '#27ae60',
  darkblue: '#2456c7',
  railroad: '#3a3f52',
  utility: '#2a9d8f'
}

export const GROUP_NAMES: Record<string, string> = {
  brown: 'Brązowa',
  lightblue: 'Błękitna',
  pink: 'Różowa',
  orange: 'Pomarańczowa',
  red: 'Czerwona',
  yellow: 'Żółta',
  green: 'Zielona',
  darkblue: 'Granatowa',
  railroad: 'Dworce',
  utility: 'Użytki'
}

export const BOARD: Tile[] = [
  { id: 0, name: 'START', type: 'go' },

  // Brązowa
  { id: 1, name: 'Sosnowiec', type: 'street', group: 'brown', price: 60,
    rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  { id: 2, name: 'Kasa Społeczna', type: 'chest' },
  { id: 3, name: 'Radom', type: 'street', group: 'brown', price: 60,
    rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  { id: 4, name: 'Podatek dochodowy', type: 'tax', taxAmount: 200 },
  { id: 5, name: 'Dworzec Południowy', type: 'railroad', group: 'railroad', price: 200 },

  // Błękitna
  { id: 6, name: 'Łódź', type: 'street', group: 'lightblue', price: 100,
    rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 7, name: 'Szansa', type: 'chance' },
  { id: 8, name: 'Lublin', type: 'street', group: 'lightblue', price: 100,
    rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 9, name: 'Białystok', type: 'street', group: 'lightblue', price: 120,
    rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  { id: 10, name: 'Więzienie / Tylko odwiedzasz', type: 'jail' },

  // Różowa
  { id: 11, name: 'Koszalin', type: 'street', group: 'pink', price: 140,
    rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 12, name: 'Elektrownia', type: 'utility', group: 'utility', price: 150 },
  { id: 13, name: 'Olsztyn', type: 'street', group: 'pink', price: 140,
    rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 14, name: 'Toruń', type: 'street', group: 'pink', price: 160,
    rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  { id: 15, name: 'Dworzec Zachodni', type: 'railroad', group: 'railroad', price: 200 },

  // Pomarańczowa
  { id: 16, name: 'Rzeszów', type: 'street', group: 'orange', price: 180,
    rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 17, name: 'Kasa Społeczna', type: 'chest' },
  { id: 18, name: 'Zamość', type: 'street', group: 'orange', price: 180,
    rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 19, name: 'Kielce', type: 'street', group: 'orange', price: 200,
    rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  { id: 20, name: 'Darmowy Parking', type: 'parking' },

  // Czerwona
  { id: 21, name: 'Opole', type: 'street', group: 'red', price: 220,
    rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 22, name: 'Szansa', type: 'chance' },
  { id: 23, name: 'Wrocław', type: 'street', group: 'red', price: 220,
    rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 24, name: 'Kraków', type: 'street', group: 'red', price: 240,
    rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  { id: 25, name: 'Dworzec Północny', type: 'railroad', group: 'railroad', price: 200 },

  // Żółta
  { id: 26, name: 'Poznań', type: 'street', group: 'yellow', price: 260,
    rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 27, name: 'Gdańsk', type: 'street', group: 'yellow', price: 260,
    rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 28, name: 'Wodociągi', type: 'utility', group: 'utility', price: 150 },
  { id: 29, name: 'Szczecin', type: 'street', group: 'yellow', price: 280,
    rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  { id: 30, name: 'Idź do więzienia', type: 'gotojail' },

  // Zielona
  { id: 31, name: 'Katowice', type: 'street', group: 'green', price: 300,
    rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 32, name: 'Warszawa', type: 'street', group: 'green', price: 300,
    rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 33, name: 'Kasa Społeczna', type: 'chest' },
  { id: 34, name: 'Gdynia', type: 'street', group: 'green', price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  { id: 35, name: 'Dworzec Wschodni', type: 'railroad', group: 'railroad', price: 200 },

  // Granatowa
  { id: 36, name: 'Szansa', type: 'chance' },
  { id: 37, name: 'Bydgoszcz', type: 'street', group: 'darkblue', price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  { id: 38, name: 'Podatek od luksusu', type: 'tax', taxAmount: 100 },
  { id: 39, name: 'Sopot', type: 'street', group: 'darkblue', price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 }
]

/** Pola danej grupy (po id). */
export function tilesInGroup(group: string): Tile[] {
  return BOARD.filter((t) => t.group === group)
}
