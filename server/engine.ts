// ─── SILNIK GRY — pełne zasady ───────────────────────────────────────────────

import { BOARD } from '../shared/board'
import { CARDS_CHEST, CARDS_CHANCE, type CardDef } from '../shared/cards'
import {
  calcRent, groupHasNoBuildings, minHousesInGroup, ownsWholeGroup
} from '../shared/rules'
import type { ClientAction, ChatMessage, GameState, LogEntry, Player } from '../shared/types'

export const MAX_PLAYERS = 6

const PLAYER_COLORS = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#9b5de5', '#f48c06']
const TOKENS = ['🎩', '🚗', '🐕', '🚀', '⛵', '🐱']

const JAIL_FINE = 50
const GO_SALARY = 200

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface GameSettings {
  startMoney: number
}

export class Game {
  state: GameState
  private logSeq = 0
  private chatSeq = 0
  private cardSeq = 0
  private chanceDeck: number[] = []
  private chestDeck: number[] = []

  constructor(settings: GameSettings) {
    this.state = {
      phase: 'lobby',
      players: [],
      currentIdx: 0,
      dice: null,
      doublesCount: 0,
      awaiting: 'roll',
      extraRoll: false,
      pendingTile: null,
      properties: {},
      auction: null,
      trade: null,
      log: [],
      lastCard: null,
      chat: [],
      winner: null,
      startMoney: settings.startMoney
    }
    for (let i = 0; i < BOARD.length; i++) {
      this.state.properties[i] = { owner: null, houses: 0, mortgaged: false }
    }
  }

  // ── Pomocnicze ─────────────────────────────────────────────────────────────

  private log(text: string, kind: LogEntry['kind'] = 'info') {
    this.state.log.push({ seq: ++this.logSeq, text, kind })
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }

  private player(id: string): Player | undefined {
    return this.state.players.find((p) => p.id === id)
  }

  private current(): Player | undefined {
    return this.state.players[this.state.currentIdx]
  }

  private activePlayers(): Player[] {
    return this.state.players.filter((p) => !p.bankrupt)
  }

  private isCurrent(id: string): boolean {
    return this.current()?.id === id && this.state.phase === 'playing' &&
      !this.state.trade // podczas oczekiwania na odpowiedź na handel nikt nie gra
  }

  private blockedByTrade(): boolean {
    return this.state.trade != null
  }

  addPlayer(id: string, name: string) {
    const i = this.state.players.length
    if (i >= MAX_PLAYERS) throw new Error('Pokój jest pełny')
    this.state.players.push({
      id, name,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      token: TOKENS[i % TOKENS.length],
      money: this.state.startMoney,
      position: 0, inJail: false, jailTurns: 0, jailCards: 0,
      bankrupt: false, connected: true
    })
  }

  start() {
    if (this.state.players.length < 2) throw new Error('Potrzeba co najmniej 2 graczy')
    this.chanceDeck = shuffle(CARDS_CHANCE.map((_, i) => i))
    this.chestDeck = shuffle(CARDS_CHEST.map((_, i) => i))
    for (const p of this.state.players) p.money = this.state.startMoney
    this.state.currentIdx = Math.floor(Math.random() * this.state.players.length)
    this.state.phase = 'playing'
    this.state.awaiting = 'roll'
    this.log(`🎉 Gra rozpoczęta! Zaczyna ${this.current()?.name}.`, 'big')
  }

  setConnected(id: string, connected: boolean) {
    const p = this.player(id)
    if (p) p.connected = connected
  }

  removePlayerFromLobby(id: string) {
    if (this.state.phase !== 'lobby') return
    const idx = this.state.players.findIndex((p) => p.id === id)
    if (idx === -1) return
    this.state.players.splice(idx, 1)
  }

  // ── Główna obsługa akcji ───────────────────────────────────────────────────

  handleAction(playerId: string, action: ClientAction): void {
    switch (action.type) {
      case 'roll': return this.rollDice(playerId)
      case 'buy': return this.buyProperty(playerId)
      case 'decline-buy': return this.declineBuy(playerId)
      case 'auction-bid': return this.auctionBid(playerId, action.amount)
      case 'auction-pass': return this.auctionPass(playerId)
      case 'end-turn': return this.endTurn(playerId)
      case 'buy-house': return this.buyHouse(playerId, action.tileId)
      case 'sell-house': return this.sellHouse(playerId, action.tileId)
      case 'mortgage': return this.mortgage(playerId, action.tileId)
      case 'unmortgage': return this.unmortgage(playerId, action.tileId)
      case 'pay-bail': return this.payBail(playerId)
      case 'use-jail-card': return this.useJailCard(playerId)
      case 'trade-propose': return this.proposeTrade(playerId, action)
      case 'trade-accept': return this.respondTrade(playerId, true)
      case 'trade-decline': return this.respondTrade(playerId, false)
      case 'trade-cancel': return this.cancelTrade(playerId)
      case 'chat': return this.sendChat(playerId, action.text)
    }
  }

  // ── Rzut kośćmi ────────────────────────────────────────────────────────────

  private rollDice(playerId: string) {
    const p = this.player(playerId)!
    if (!this.isCurrent(playerId)) return
    if (this.state.awaiting !== 'roll') return

    const d1 = 1 + Math.floor(Math.random() * 6)
    const d2 = 1 + Math.floor(Math.random() * 6)
    this.state.dice = [d1, d2]
    const sum = d1 + d2
    this.log(`🎲 ${p.name} wyrzuca ${d1} + ${d2} = ${sum}`)

    if (p.inJail) {
      p.jailTurns++
      if (d1 === d2) {
        this.log(`${p.name} wyrzuca dublet i wychodzi z więzienia!`)
        p.inJail = false
        p.jailTurns = 0
        this.moveAndLand(p, sum, false)
      } else if (p.jailTurns >= 3) {
        this.log(`${p.name}: trzecie podejście nieudane — płaci ${JAIL_FINE} kaucji.`)
        const ok = this.pay(p.id, JAIL_FINE, null)
        if (!ok || p.bankrupt) { this.state.awaiting = 'end'; return }
        p.inJail = false
        p.jailTurns = 0
        this.moveAndLand(p, sum, false)
      } else {
        this.log(`${p.name} zostaje w więzieniu.`)
        this.state.awaiting = 'end'
      }
      return
    }

    if (d1 === d2) {
      this.state.doublesCount = (this.state.doublesCount ?? 0) + 1
      if (this.state.doublesCount >= 3) {
        this.log(`${p.name} wyrzuca trzeciego dubleta — jedzie do więzienia! 🚔`, 'big')
        this.goToJail(p)
        this.state.awaiting = 'end'
        return
      }
    }
    this.moveAndLand(p, sum, d1 === d2)
  }

  private moveAndLand(p: Player, steps: number, isDoubles: boolean) {
    const old = p.position
    p.position = ((old + steps) % 40 + 40) % 40
    if (steps > 0 && p.position < old) {
      p.money += GO_SALARY
      this.log(`${p.name} przechodzi przez START (+${GO_SALARY})`, 'money')
    }
    this.state.extraRoll = isDoubles
    this.resolveLanding()
  }

  private moveTo(p: Player, target: number) {
    if (target !== 0 && target < p.position) {
      p.money += GO_SALARY
      this.log(`${p.name} przechodzi przez START (+${GO_SALARY})`, 'money')
    }
    p.position = target
    this.resolveLanding()
  }

  private goToJail(p: Player) {
    p.position = 10
    p.inJail = true
    p.jailTurns = 0
    this.state.extraRoll = false
    this.state.doublesCount = 0
  }

  /** Rozstrzyga pole, na którym stanął aktualny gracz. */
  private resolveLanding() {
    const p = this.current()!
    const tile = BOARD[p.position]
    const prop = this.state.properties[tile.id]

    switch (tile.type) {
      case 'street':
      case 'railroad':
      case 'utility': {
        if (!prop.owner) {
          this.state.pendingTile = tile.id
          this.state.awaiting = 'buy'
        } else if (prop.owner !== p.id && !prop.mortgaged) {
          const diceSum = (this.state.dice?.[0] ?? 0) + (this.state.dice?.[1] ?? 0)
          const rent = calcRent(tile, this.state, diceSum) ?? 0
          this.log(`${p.name} płaci ${rent} czynszu graczowi ${this.player(prop.owner)?.name}`, 'money')
          this.pay(p.id, rent, prop.owner)
          this.finishStep()
        } else {
          if (prop.mortgaged && prop.owner !== p.id) {
            this.log(`${tile.name} jest obciążona hipoteką — bez czynszu.`)
          }
          this.finishStep()
        }
        break
      }
      case 'tax': {
        this.log(`${p.name} płaci podatek ${tile.taxAmount}`, 'money')
        this.pay(p.id, tile.taxAmount!, null)
        this.finishStep()
        break
      }
      case 'gotojail': {
        this.log(`${p.name} jedzie do więzienia! 🚔`, 'big')
        this.goToJail(p)
        this.state.awaiting = 'end'
        break
      }
      case 'chance':
      case 'chest': {
        this.drawCard(tile.type)
        break
      }
      default:
        this.finishStep()
    }
  }

  private finishStep() {
    this.state.awaiting = this.state.extraRoll ? 'roll' : 'end'
  }

  // ── Karty ──────────────────────────────────────────────────────────────────

  private drawCard(kind: 'chance' | 'chest') {
    const deck = kind === 'chance' ? this.chanceDeck : this.chestDeck
    const cards = kind === 'chance' ? CARDS_CHANCE : CARDS_CHEST
    const idx = deck.shift()!
    deck.push(idx)
    const card: CardDef = cards[idx]
    const p = this.current()!
    this.cardSeq++
    this.state.lastCard = { seq: this.cardSeq, kind, text: card.text, playerName: p.name }
    this.log(`🃏 ${p.name} ciągnie kartę (${kind === 'chance' ? 'Szansa' : 'Kasa Społeczna'}): „${card.text}"`, 'card')
    this.applyCardEffect(p, card, kind)
  }

  private applyCardEffect(p: Player, card: CardDef, kind: 'chance' | 'chest') {
    const e = card.effect
    switch (e.kind) {
      case 'money':
        if (e.amount >= 0) {
          p.money += e.amount
        } else {
          this.pay(p.id, -e.amount, null)
        }
        this.finishStep()
        break
      case 'money-each': {
        const others = this.activePlayers().filter((o) => o.id !== p.id)
        if (e.amount >= 0) {
          for (const o of others) {
            const amt = Math.min(e.amount, o.money)
            o.money -= amt; p.money += amt
          }
          this.log(`${p.name} zbiera od każdego po ${e.amount}`, 'money')
        } else {
          for (const o of others) this.pay(p.id, -e.amount, o.id)
        }
        this.finishStep()
        break
      }
      case 'move-abs':
        this.moveTo(p, e.target)
        break
      case 'move-rel':
        this.moveAndLand(p, e.delta, false)
        break
      case 'jail':
        this.goToJail(p)
        this.state.awaiting = 'end'
        break
      case 'jailcard':
        p.jailCards++
        this.finishStep()
        break
      case 'repairs': {
        let houses = 0, hotels = 0
        for (const t of BOARD) {
          const prop = this.state.properties[t.id]
          if (prop.owner === p.id) {
            if (prop.houses === 5) hotels++
            else houses += prop.houses
          }
        }
        const cost = houses * e.house + hotels * e.hotel
        if (cost > 0) {
          this.log(`Remonty: ${houses} domków i ${hotels} hoteli — zapłać ${cost}`, 'money')
          this.pay(p.id, cost, null)
        }
        this.finishStep()
        break
      }
    }
  }

  // ── Płatności i bankructwo ────────────────────────────────────────────────

  /** Próbuje pobrać kwotę. Jeśli brak środków — automatyczna likwidacja majątku.
   *  Zwraca true, jeśli zapłacono. */
  private pay(fromId: string, amount: number, toId: string | null): boolean {
    if (amount <= 0) return true
    let p = this.player(fromId)!
    if (p.bankrupt) return false

    if (p.money < amount) {
      this.autoLiquidate(p)
      p = this.player(fromId)!
    }
    if (p.money >= amount) {
      p.money -= amount
      if (toId) {
        const to = this.player(toId)
        if (to) to.money += amount
      }
      return true
    }

    // Bankructwo
    const creditor = toId ? this.player(toId) : null
    this.log(
      creditor
        ? `💸 ${p.name} bankrutuje! Majątek przejmuje ${creditor.name}.`
        : `💸 ${p.name} bankrutuje!`,
      'big'
    )
    if (creditor && !creditor.bankrupt) {
      creditor.money += p.money
      for (let i = 0; i < BOARD.length; i++) {
        const prop = this.state.properties[i]
        if (prop.owner === p.id) {
          prop.owner = creditor.id
          // przejmowane nieruchomości pozostają z hipoteką
        }
      }
    } else {
      // majątek wraca do banku
      for (let i = 0; i < BOARD.length; i++) {
        const prop = this.state.properties[i]
        if (prop.owner === p.id) { prop.owner = null; prop.houses = 0; prop.mortgaged = false }
      }
    }
    p.money = 0
    p.bankrupt = true
    p.inJail = false
    if (this.state.auction && this.state.auction.participants.includes(p.id)) {
      if (!this.state.auction.passed.includes(p.id)) this.state.auction.passed.push(p.id)
    }
    this.checkWin()
    return false
  }

  /** Sprzedaje wszystkie domki za pół ceny i hipotekuje wszystkie nieruchomości. */
  private autoLiquidate(p: Player) {
    for (const t of BOARD) {
      const prop = this.state.properties[t.id]
      if (prop.owner !== p.id) continue
      while (prop.houses > 0) {
        const price = t.houseCost!
        if (prop.houses === 5) {
          p.money += Math.floor(price / 2)
          prop.houses = 4
        } else {
          p.money += Math.floor(price / 2)
          prop.houses--
        }
      }
    }
    for (const t of BOARD) {
      const prop = this.state.properties[t.id]
      if (prop.owner === p.id && !prop.mortgaged && t.price) {
        prop.mortgaged = true
        p.money += Math.floor(t.price / 2)
      }
    }
  }

  private checkWin() {
    const alive = this.activePlayers()
    if (alive.length <= 1) {
      this.state.phase = 'finished'
      this.state.awaiting = 'over'
      this.state.winner = alive[0]?.id ?? null
      if (alive[0]) this.log(`🏆 ${alive[0].name} wygrywa grę!`, 'big')
    }
  }

  // ── Kupno / licytacja ─────────────────────────────────────────────────────

  private buyProperty(playerId: string) {
    if (!this.isCurrent(playerId) || this.blockedByTrade()) return
    if (this.state.awaiting !== 'buy') return
    const p = this.current()!
    const tile = BOARD[this.state.pendingTile!]
    if (p.money < tile.price!) return
    p.money -= tile.price!
    this.state.properties[tile.id].owner = p.id
    this.log(`${p.name} kupuje ${tile.name} za ${tile.price}`, 'money')
    this.state.pendingTile = null
    this.finishStep()
  }

  private declineBuy(playerId: string) {
    if (!this.isCurrent(playerId) || this.blockedByTrade()) return
    if (this.state.awaiting !== 'buy') return
    this.startAuction(this.state.pendingTile!)
  }

  private startAuction(tileId: number) {
    const order = this.activePlayers().map((p) => p.id)
    // licytację zaczyna gracz po aktualnym
    const curPos = order.indexOf(this.current()!.id)
    const participants = [...order.slice(curPos + 1), ...order.slice(0, curPos + 1)]
    this.state.auction = { tileId, participants, turnIdx: 0, bid: 0, winner: null, passed: [] }
    this.state.pendingTile = null
    this.state.awaiting = 'auction'
    this.log(`🔨 Licytacja: ${BOARD[tileId].name} (start od 10)`)
  }

  private auctionBid(playerId: string, amount: number) {
    const a = this.state.auction
    if (!a || this.blockedByTrade()) return
    const cur = a.participants[a.turnIdx]
    if (cur !== playerId) return
    if (amount <= a.bid || amount < 10) return
    const p = this.player(playerId)
    if (!p || p.bankrupt || amount > p.money) return
    a.bid = amount
    a.winner = playerId
    this.advanceAuction(a)
  }

  private auctionPass(playerId: string) {
    const a = this.state.auction
    if (!a || this.blockedByTrade()) return
    const cur = a.participants[a.turnIdx]
    if (cur !== playerId) return
    a.passed.push(playerId)
    this.advanceAuction(a)
  }

  private advanceAuction(a: NonNullable<GameState['auction']>) {
    const remaining = a.participants.filter((id) => !a.passed.includes(id))
    if (remaining.length <= 1) {
      const last = remaining[0]
      if (last && a.winner === last && a.bid > 0) {
        const winner = this.player(last)!
        winner.money -= a.bid
        this.state.properties[a.tileId].owner = last
        this.log(`🔨 ${winner.name} wygrywa licytację ${BOARD[a.tileId].name} za ${a.bid}`, 'money')
      } else {
        this.log(`🔨 Nikt nie kupił ${BOARD[a.tileId].name} na licytacji.`)
      }
      this.state.auction = null
      this.finishStep()
      return
    }
    // następny uczestnik, który nie spasował
    do {
      a.turnIdx = (a.turnIdx + 1) % a.participants.length
    } while (a.passed.includes(a.participants[a.turnIdx]))
  }

  // ── Więzienie ─────────────────────────────────────────────────────────────

  private payBail(playerId: string) {
    if (!this.isCurrent(playerId) || this.blockedByTrade()) return
    const p = this.current()!
    if (!p.inJail || this.state.awaiting !== 'roll') return
    if (p.money < JAIL_FINE) return
    p.money -= JAIL_FINE
    p.inJail = false
    p.jailTurns = 0
    this.log(`${p.name} płaci ${JAIL_FINE} kaucji i wychodzi z więzienia.`, 'money')
  }

  private useJailCard(playerId: string) {
    if (!this.isCurrent(playerId) || this.blockedByTrade()) return
    const p = this.current()!
    if (!p.inJail || this.state.awaiting !== 'roll' || p.jailCards < 1) return
    p.jailCards--
    p.inJail = false
    p.jailTurns = 0
    this.log(`${p.name} używa karty "wyjdź z więzienia".`)
  }

  // ── Koniec tury ───────────────────────────────────────────────────────────

  private endTurn(playerId: string) {
    if (!this.isCurrent(playerId) || this.blockedByTrade()) return
    if (this.state.awaiting !== 'end') return
    this.state.doublesCount = 0
    this.state.extraRoll = false
    this.state.dice = null

    const n = this.state.players.length
    let idx = this.state.currentIdx
    for (let i = 0; i < n; i++) {
      idx = (idx + 1) % n
      if (!this.state.players[idx].bankrupt) break
    }
    this.state.currentIdx = idx
    this.state.awaiting = 'roll'
  }

  // ── Budowa / sprzedaż / hipoteki ──────────────────────────────────────────

  private canActOnProperty(playerId: string, tileId: number): boolean {
    const p = this.player(playerId)
    if (!p || p.bankrupt || this.blockedByTrade()) return false
    if (playerId !== this.current()?.id) return false           // zarządzanie tylko w swojej turze
    if (!['roll', 'end'].includes(this.state.awaiting)) return false
    const prop = this.state.properties[tileId]
    return !!prop && prop.owner === playerId
  }

  private buyHouse(playerId: string, tileId: number) {
    if (!this.canActOnProperty(playerId, tileId)) return
    const p = this.player(playerId)!
    const tile = BOARD[tileId]
    if (tile.type !== 'street' || !tile.group || !tile.houseCost) return
    const group = tile.group
    if (!ownsWholeGroup(this.state, group, playerId)) return
    if (!groupHasNoBuildings(this.state, group) === false) { /* noop */ }
    const prop = this.state.properties[tileId]
    if (prop.mortgaged) return
    // cała grupa musi być wolna od hipotek
    for (const t of BOARD.filter((x) => x.group === group)) {
      if (this.state.properties[t.id].mortgaged) return
    }
    if (minHousesInGroup(this.state, group) < prop.houses) return  // równomierna zabudowa
    if (prop.houses >= 5) return
    if (p.money < tile.houseCost) return
    p.money -= tile.houseCost
    prop.houses++
    const label = prop.houses === 5 ? 'hotel 🏨' : `domek 🏠 (${prop.houses})`
    this.log(`🏗️ ${p.name} buduje ${label} przy ${tile.name} (-${tile.houseCost})`, 'money')
  }

  private sellHouse(playerId: string, tileId: number) {
    if (!this.canActOnProperty(playerId, tileId)) return
    const p = this.player(playerId)!
    const tile = BOARD[tileId]
    if (tile.type !== 'street' || !tile.group || !tile.houseCost) return
    const prop = this.state.properties[tileId]
    if (prop.houses === 0) return
    if (maxHousesInGroup(this.state, tile.group) > prop.houses) return  // równomierna zabudowa w dół
    prop.houses--
    p.money += Math.floor(tile.houseCost / 2)
    this.log(`🔧 ${p.name} sprzedaje budynek przy ${tile.name} (+${Math.floor(tile.houseCost / 2)})`, 'money')
  }

  private mortgage(playerId: string, tileId: number) {
    if (!this.canActOnProperty(playerId, tileId)) return
    const p = this.player(playerId)!
    const tile = BOARD[tileId]
    const prop = this.state.properties[tileId]
    if (!tile.price || prop.mortgaged || !tile.group) return
    if (!groupHasNoBuildings(this.state, tile.group)) return
    prop.mortgaged = true
    const gain = Math.floor(tile.price / 2)
    p.money += gain
    this.log(`🏦 ${p.name} hipotekuje ${tile.name} (+${gain})`, 'money')
  }

  private unmortgage(playerId: string, tileId: number) {
    if (!this.canActOnProperty(playerId, tileId)) return
    const p = this.player(playerId)!
    const tile = BOARD[tileId]
    const prop = this.state.properties[tileId]
    if (!tile.price || !prop.mortgaged) return
    const cost = Math.ceil(tile.price * 0.55)
    if (p.money < cost) return
    p.money -= cost
    prop.mortgaged = false
    this.log(`🏦 ${p.name} spłaca hipotekę na ${tile.name} (-${cost})`, 'money')
  }

  // ── Handel ────────────────────────────────────────────────────────────────

  private proposeTrade(playerId: string, action: Extract<ClientAction, { type: 'trade-propose' }>) {
    if (this.state.trade || this.state.phase !== 'playing') return
    const from = this.player(playerId)
    const to = this.player(action.to)
    if (!from || !to || to.bankrupt || from.bankrupt) return
    if (from.id === to.id) return
    // walidacja własności
    for (const tid of action.give.properties) {
      if (this.state.properties[tid]?.owner !== from.id) return
    }
    for (const tid of action.get.properties) {
      if (this.state.properties[tid]?.owner !== to.id) return
    }
    if (action.give.cash < 0 || action.get.cash < 0) return
    if (action.give.cash > from.money || action.get.cash > to.money) return
    this.state.trade = { from: from.id, to: to.id, give: action.give, get: action.get }
    this.log(`🤝 ${from.name} proponuje handel graczowi ${to.name}.`)
  }

  private respondTrade(playerId: string, accept: boolean) {
    const trade = this.state.trade
    if (!trade || trade.to !== playerId) return
    const giver = this.player(trade.from)
    const receiver = this.player(trade.to)
    if (!accept || !giver || !receiver || giver.bankrupt || receiver.bankrupt) {
      this.log(accept ? '' : `❌ ${receiver?.name} odrzuca propozycję handlu.`.trim())
      this.state.trade = null
      return
    }
    // ponowna walidacja przed wykonaniem
    for (const tid of trade.give.properties) {
      if (this.state.properties[tid]?.owner !== giver.id) { this.state.trade = null; return }
    }
    for (const tid of trade.get.properties) {
      if (this.state.properties[tid]?.owner !== receiver.id) { this.state.trade = null; return }
    }
    if (trade.give.cash > giver.money || trade.get.cash > receiver.money) {
      this.state.trade = null
      return
    }
    // wykonanie wymiany
    giver.money -= trade.give.cash
    receiver.money += trade.give.cash
    receiver.money -= trade.get.cash
    giver.money += trade.get.cash
    for (const tid of trade.give.properties) this.state.properties[tid].owner = receiver.id
    for (const tid of trade.get.properties) this.state.properties[tid].owner = giver.id
    this.log(`✅ Handel zawarty między ${giver.name} i ${receiver.name}!`, 'big')
    this.state.trade = null
  }

  private cancelTrade(playerId: string) {
    const trade = this.state.trade
    if (!trade || trade.from !== playerId) return
    this.state.trade = null
    this.log(`🤝 ${this.player(playerId)?.name} wycofuje propozycję handlu.`)
  }

  // ── Czat ──────────────────────────────────────────────────────────────────

  private sendChat(playerId: string, text: string) {
    const p = this.player(playerId)
    if (!p || p.bankrupt) return
    const trimmed = String(text ?? '').trim().slice(0, 200)
    if (trimmed.length === 0) return
    this.state.chat.push({
      seq: ++this.chatSeq,
      playerId: p.id,
      playerName: p.name,
      text: trimmed,
      timestamp: Date.now()
    })
    if (this.state.chat.length > 100) this.state.chat.splice(0, this.state.chat.length - 100)
  }
}

function maxHousesInGroup(state: GameState, group: string): number {
  const tiles = BOARD.filter((t) => t.group === group)
  return Math.max(...tiles.map((t) => state.properties[t.id]?.houses ?? 0))
}

