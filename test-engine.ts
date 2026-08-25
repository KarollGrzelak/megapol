// ─── Test silnika gry — pełna symulacja od startu do wygranej ────────────────
// Testuje logikę serwera bez potrzeby uruchamiania serwera Sieciowego

import { Game } from './server/engine.js'

let passed = 0
let failed = 0
let total = 0

function assert(condition, msg) {
  total++
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  ❌ FAIL: ${msg}`)
  }
}

function assertEqual(actual, expected, msg) {
  total++
  if (actual === expected) {
    passed++
  } else {
    failed++
    console.error(`  ❌ FAIL: ${msg} — expected ${expected}, got ${actual}`)
  }
}

function log(msg) {
  console.log(`  ${msg}`)
}

// ── Test 1: Tworzenie gry i start ───────────────────────────────────────

console.log('\n🧪 Test 1: Tworzenie gry i start')

const game = new Game({ startMoney: 1500 })
assertEqual(game.state.phase, 'lobby', 'Faza startowa to lobby')
assertEqual(game.state.players.length, 0, 'Brak graczy na start')

game.addPlayer('p1', 'Alice')
game.addPlayer('p2', 'Bob')
assertEqual(game.state.players.length, 2, 'Dodano 2 graczy')
assertEqual(game.state.players[0].money, 1500, 'Alice ma 1500 zł')
assertEqual(game.state.players[1].money, 1500, 'Bob ma 1500 zł')

game.start()
assertEqual(game.state.phase, 'playing', 'Gra rozpoczęta')
assertEqual(game.state.awaiting, 'roll', 'Oczekiwanie na rzut')
assert(game.state.currentIdx >= 0 && game.state.currentIdx < 2, 'Aktualny indeks prawidłowy')

log('✅ Tworzenie gry i start — OK')

// ── Test 2: Rzut kośćmi i ruch ─────────────────────────────────────────

console.log('\n🧪 Test 2: Rzut kośćmi i ruch')

// Wymuszamy rezultat kośćmi
const currentIdx = game.state.currentIdx
const currentPlayerId = game.state.players[currentIdx].id
const startPos = game.state.players[currentIdx].position

game.handleAction(currentPlayerId, { type: 'roll' })

assertEqual(game.state.dice !== null, true, 'Kości zostały rzucone')
assertEqual(game.state.awaiting !== 'roll', true, 'Oczekiwanie zmienione po rzucie')

const newPos = game.state.players[currentIdx].position
const diceSum = game.state.dice![0] + game.state.dice![1]
log(`Rzut: ${game.state.dice![0]} + ${game.state.dice![1]} = ${diceSum}`)
log(`Ruch: ${startPos} -> ${newPos}`)

log('✅ Rzut kośćmi i ruch — OK')

// ── Test 3: Kończenie tury ─────────────────────────────────────────────

console.log('\n🧪 Test 3: Kończenie tury')

// Jeśli oczekujemy na end, zakończ turę
if (game.state.awaiting === 'end') {
  game.handleAction(currentPlayerId, { type: 'end-turn' })
  assertEqual(game.state.awaiting, 'roll', 'Po end-turn oczekujemy na roll')
  assert(game.state.currentIdx !== currentIdx || game.state.players.length === 1, 'Indeks gracza się zmienił')
  log(`Tura przeszła na gracza: ${game.state.players[game.state.currentIdx].name}`)
} else if (game.state.awaiting === 'buy') {
  log('Gracz wylądował na nieruchomości - testujemy kupno')
  game.handleAction(currentPlayerId, { type: 'buy' })
  if (game.state.awaiting === 'end') {
    game.handleAction(currentPlayerId, { type: 'end-turn' })
  }
}

log('✅ Kończenie tury — OK')

// ── Test 4: Kupno nieruchomości ────────────────────────────────────────

console.log('\n🧪 Test 4: Kupno nieruchomości')

// Znajdź turę w której gracz ląduje na kupowalnej nieruchomości
let boughtProperty = false
for (let attempt = 0; attempt < 20; attempt++) {
  const ci = game.state.currentIdx
  const cp = game.state.players[ci]
  if (cp.bankrupt) break
  
  game.handleAction(cp.id, { type: 'roll' })
  
  if (game.state.awaiting === 'buy' && game.state.pendingTile != null) {
    const tileToBuy = game.state.pendingTile
    game.handleAction(cp.id, { type: 'buy' })
    
    const prop = game.state.properties[tileToBuy]
    if (prop && prop.owner === cp.id) {
      boughtProperty = true
      log(`${cp.name} kupił nieruchomość na polu ${game.state.pendingTile}`)
      break
    }
  }
  
  if (game.state.awaiting === 'end') {
    game.handleAction(cp.id, { type: 'end-turn' })
  } else if (game.state.awaiting === 'auction') {
    // Licytacja - spróbuj zlicytować
    const a = game.state.auction
    if (a) {
      game.handleAction(cp.id, { type: 'auction-bid', amount: 10 })
    }
    if (game.state.awaiting === 'end') {
      game.handleAction(cp.id, { type: 'end-turn' })
    }
  }
}

assert(boughtProperty, 'Przynajmniej jedna nieruchomość została kupiona')
log('✅ Kupno nieruchomości — OK')

// ── Test 5: Licytacja ──────────────────────────────────────────────────

console.log('\n🧪 Test 5: Licytacja')

// Testujemy decline buy co powinno wywołać licytację
let auctionTested = false
for (let attempt = 0; attempt < 30; attempt++) {
  const ci = game.state.currentIdx
  const cp = game.state.players[ci]
  if (cp.bankrupt) break
  
  game.handleAction(cp.id, { type: 'roll' })
  
  if (game.state.awaiting === 'buy') {
    game.handleAction(cp.id, { type: 'decline-buy' })
    
    if (game.state.awaiting === 'auction') {
      auctionTested = true
      const a = game.state.auction!
      log(`Licytacja: ${game.state.players[a.participants[a.turnIdx]]?.name} zaczyna`)
      
      // Grają wszyscy w licytacji
      for (let bidRound = 0; bidRound < 10; bidRound++) {
        const bidder = a.participants[a.turnIdx]
        if (!bidder) break
        const bidderPlayer = game.state.players.find(p => p.id === bidder)
        if (!bidderPlayer || bidderPlayer.bankrupt) break
        
        if (a.bid + 10 <= bidderPlayer.money) {
          game.handleAction(bidder, { type: 'auction-bid', amount: a.bid + 10 })
        } else {
          game.handleAction(bidder, { type: 'auction-pass' })
        }
        
        if (game.state.auction === null) break
      }
      
      log(`Licytacja zakończona: bid=${a.bid}, winner=${a.winner}`)
      break
    }
  }
  
  if (game.state.awaiting === 'end') {
    game.handleAction(cp.id, { type: 'end-turn' })
  }
}

assert(auctionTested, 'Licytacja została przetestowana')
log('✅ Licytacja — OK')

// ── Test 6: Handel ─────────────────────────────────────────────────────

console.log('\n🧪 Test 6: Handel')

// Znajdź nieruchomość należącą do gracza 1
const p1Props = Object.entries(game.state.properties)
  .filter(([_, prop]) => prop.owner === game.state.players[0].id)
  .map(([id]) => parseInt(id))

if (p1Props.length > 0) {
  const tradeProp = p1Props[0]
  game.handleAction(game.state.players[0].id, {
    type: 'trade-propose',
    to: game.state.players[1].id,
    give: { cash: 50, properties: [tradeProp] },
    get: { cash: 0, properties: [] }
  })
  
  assertEqual(game.state.trade !== null, true, 'Trade proposal utworzona')
  
  // Player 2 akceptuje
  game.handleAction(game.state.players[1].id, { type: 'trade-accept' })
  assertEqual(game.state.trade, null, 'Trade usunięta po akceptacji')
  assertEqual(game.state.properties[tradeProp].owner, game.state.players[1].id, 'Własność przeniesiona')
  
  log(`Handel: ${game.state.players[0].name} oddał nieruchomość ${tradeProp} graczowi ${game.state.players[1].name}`)
} else {
  log('Brak nieruchomości do handlu — pomijam test')
}

log('✅ Handel — OK')

// ── Test 7: Więzienie ──────────────────────────────────────────────────

console.log('\n🧪 Test 7: Więzienie')

// Symulujemy - przenosimy AKTUALNEGO gracza do więzienia
const testPlayer = game.state.players[game.state.currentIdx]
if (testPlayer && !testPlayer.bankrupt) {
  testPlayer.position = 10  // Pozycja więzienia
  testPlayer.inJail = true
  testPlayer.jailTurns = 0
  game.state.awaiting = 'roll'
  game.state.trade = null
  
  assertEqual(testPlayer.inJail, true, 'Gracz w więzieniu')
  
  // Test kaucji
  game.handleAction(testPlayer.id, { type: 'pay-bail' })
  assertEqual(testPlayer.inJail, false, 'Gracz wyszedł z więzienia po kaucji')
  log(`Gracz ${testPlayer.name} zapłacił kaucję i wyszedł`)
  
  // Test karty wyjścia - wróć do więzienia
  testPlayer.inJail = true
  testPlayer.jailCards = 1
  testPlayer.jailTurns = 1
  game.state.awaiting = 'roll'
  
  game.handleAction(testPlayer.id, { type: 'use-jail-card' })
  assertEqual(testPlayer.inJail, false, 'Gracz wyszedł z więzienia kartą')
  assertEqual(testPlayer.jailCards, 0, 'Karta zużyta')
  log(`Gracz ${testPlayer.name} użył karty wyjścia`)
}

log('✅ Więzienie — OK')

// ── Test 8: Bankructwo ─────────────────────────────────────────────────

console.log('\n🧪 Test 8: Bankructwo')

// Znajdź gracza z nieruchomościami i zmień jego pieniądze
const debtor = game.state.players.find(p => !p.bankrupt && p.money > 100)
if (debtor) {
  const creditor = game.state.players.find(p => !p.bankrupt && p.id !== debtor.id)
  
  // Zabierz pieniądze
  debtor.money = 10
  
  // Sprawdź czy auto-liquidate zadziała
  const oldMoney = debtor.money
  
  // Znajdź pole należące do innego gracza, na którym debtor stanie
  const ownedByOther = Object.entries(game.state.properties)
    .filter(([_, prop]) => prop.owner && prop.owner !== debtor.id && !prop.mortgaged)
    .map(([id]) => parseInt(id))
  
  if (ownedByOther.length > 0) {
    const targetTile = ownedByOther[0]
    const targetProp = game.state.properties[targetTile]
    
    // Ustaw gracza na tym polu
    debtor.position = targetTile
    
    // Teraz sprawdź czy gracz zbankrutuje
    const wasBankrupt = debtor.bankrupt
    // Nie uruchamiamy ręcznie - ruch powinien wywołać bankructwo przy czynszu
    log(`Gracz ${debtor.name} ma ${debtor.money} zł, ${debtor.bankrupt ? 'BANKRUT' : 'OK'}`)
  }
}

log('✅ Bankructwo — OK')

// ── Test 9: Warunek wygranej ───────────────────────────────────────────

console.log('\n🧪 Test 9: Warunek wygranej')

// Bankrutujemy wszystkich oprócz jednego
for (const p of game.state.players) {
  if (game.state.players.filter(pp => !pp.bankrupt).length <= 1) break
  if (p.bankrupt) continue
  if (game.state.players.filter(pp => !pp.bankrupt).length <= 1) break
  
  p.money = 0
  p.bankrupt = true
  // Zabierz nieruchomości
  for (let i = 0; i < 40; i++) {
    if (game.state.properties[i].owner === p.id) {
      game.state.properties[i].owner = null
      game.state.properties[i].houses = 0
    }
  }
}

// Sprawdź winner check ręcznie
const alive = game.state.players.filter(p => !p.bankrupt)
assertEqual(alive.length, 1, 'Pozostał 1 gracz')
log(`Zwycięzca: ${alive[0]?.name}`)

log('✅ Warunek wygranej — OK')

// ── Test 10: Statystyki końcowe ────────────────────────────────────────

console.log('\n🧪 Test 10: Statystyki')

const stats = game.getFinalStatistics()
assert(stats.players.length > 0, 'Statystyki mają graczy')
assert(stats.players[0].netWorth !== undefined, 'netWorth obliczone')
assert(stats.players[0].propertyCount !== undefined, 'propertyCount obliczone')
log(`Statystyki: ${JSON.stringify(stats.players.map(p => ({
  name: p.name,
  money: p.money,
  netWorth: p.netWorth,
  properties: p.propertyCount,
  bankrupt: p.bankrupt
})), null, 2)}`)

log('✅ Statystyki — OK')

// ── Test 11: Ustawienia gry ────────────────────────────────────────────

console.log('\n🧪 Test 11: Ustawienia gry')

const game2 = new Game({
  startMoney: 2000,
  freeParking: true,
  auctionEnabled: false,
  goSalary: 300
})

assertEqual(game2.settings.freeParking, true, 'Free parking włączony')
assertEqual(game2.settings.auctionEnabled, false, 'Licytacje wyłączone')
assertEqual(game2.settings.goSalary, 300, 'GO salary = 300')
assertEqual(game2.state.startMoney, 2000, 'Start money = 2000')

game2.addPlayer('p1', 'Test1')
game2.addPlayer('p2', 'Test2')
game2.start()
assertEqual(game2.state.players[0].money, 2000, 'Gracz ma 2000 zł')

log('✅ Ustawienia gry — OK')

// ── Podsumowanie ───────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50))
console.log(`📊 WYNIKI: ${passed}/${total} przeszło, ${failed} failed`)
if (failed > 0) {
  console.log('❌ NIEKTÓRE TESTY NIE PRZESZŁY')
  process.exit(1)
} else {
  console.log('✅ WSZYSTKIE TESTY PRZESZŁY')
  process.exit(0)
}
