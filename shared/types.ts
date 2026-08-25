// ─── Wspólne typy używane przez serwer i klient ──────────────────────────────

export type TileType =
  | 'go' | 'street' | 'railroad' | 'utility'
  | 'tax' | 'chance' | 'chest'
  | 'jail' | 'parking' | 'gotojail'

export interface Tile {
  id: number
  name: string
  type: TileType
  group?: string        // tylko street/railroad/utility
  price?: number        // cena zakupu
  rent?: number[]       // [podstawa, 1 dom, 2, 3, 4, hotel] — tylko street
  houseCost?: number    // koszt domku/hotelu
  taxAmount?: number    // tylko tax
}

export interface PropertyState {
  owner: string | null
  houses: number        // 0-4 = domki, 5 = hotel
  mortgaged: boolean
}

export interface Player {
  id: string
  name: string
  color: string
  token: string         // emoji jako pionek
  money: number
  position: number      // 0-39
  inJail: boolean
  jailTurns: number
  jailCards: number     // karty "wyjdź z więzienia"
  bankrupt: boolean
  connected: boolean
}

export interface Auction {
  tileId: number
  participants: string[]
  turnIdx: number       // indeks w participants, czyj kolej na licytację
  bid: number           // aktualna najwyższa oferta
  winner: string | null
  passed: string[]      // gracze, którzy odmówili
}

export interface TradeSide {
  cash: number
  properties: number[]  // id pól
}

export interface TradeOffer {
  from: string
  to: string
  give: TradeSide       // co "from" oddaje
  get: TradeSide        // czego "from" żąda
}

export interface LogEntry {
  seq: number
  text: string
  kind: 'info' | 'money' | 'card' | 'big'
}

export interface ChatMessage {
  seq: number
  playerId: string
  playerName: string
  text: string
  timestamp: number
}

export interface LastCard {
  seq: number
  kind: 'chance' | 'chest'
  text: string
  playerName: string
}

export interface GameSettings {
  startMoney: number
  freeParking: boolean
  auctionEnabled: boolean
  goSalary: number
}

export interface FinalStatistics {
  players: Array<{
    id: string
    name: string
    color: string
    money: number
    netWorth: number
    propertyCount: number
    totalHouses: number
    totalHotels: number
    rentCollected: number
    rentPaid: number
    propertiesBought: number
    housesBuilt: number
    bankrupt: boolean
  }>
  tradesCompleted: number
  totalMoneyTransferred: number
  turnsPlayed: number
}

export interface GameState {
  phase: 'lobby' | 'playing' | 'finished'
  players: Player[]
  currentIdx: number
  dice: [number, number] | null
  doublesCount: number
  awaiting: 'roll' | 'buy' | 'end' | 'auction' | 'over'
  extraRoll: boolean          // dublet => po rozstrzygnięciu jeszcze jeden rzut
  pendingTile: number | null  // pole do kupienia / licytacji
  properties: Record<number, PropertyState>
  auction: Auction | null
  trade: TradeOffer | null
  log: LogEntry[]
  chat: ChatMessage[]
  lastCard: LastCard | null
  winner: string | null
  startMoney: number
  settings: GameSettings
  finalStats: FinalStatistics | null
}

export interface RoomView {
  code: string
  hostId: string
  players: { id: string; name: string; token?: string; color?: string; connected: boolean }[]
  settings: { startMoney: number; freeParking: boolean; auctionEnabled: boolean; goSalary: number }
  started: boolean
  game: GameState | null
}

export type ClientAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline-buy' }
  | { type: 'auction-bid'; amount: number }
  | { type: 'auction-pass' }
  | { type: 'end-turn' }
  | { type: 'buy-house'; tileId: number }
  | { type: 'sell-house'; tileId: number }
  | { type: 'mortgage'; tileId: number }
  | { type: 'unmortgage'; tileId: number }
  | { type: 'pay-bail' }
  | { type: 'use-jail-card' }
  | { type: 'trade-propose'; to: string; give: TradeSide; get: TradeSide }
  | { type: 'trade-accept' }
  | { type: 'trade-decline' }
  | { type: 'trade-cancel' }
  | { type: 'chat'; text: string }
