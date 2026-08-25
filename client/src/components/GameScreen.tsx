import { useState, useRef, useEffect } from 'react'
import { socket } from '../socket'
import { sounds } from '../sounds'
import { BOARD, GROUP_COLORS } from '../../../shared/board'
import { ownsWholeGroup, calcRent, minHousesInGroup } from '../../../shared/rules'
import type { GameState, Player, RoomView } from '../../../shared/types'
import Board, { PlayerList } from './Board'
import { useToast } from './Toast'

/* ─── Akcje gracza ──────────────────────────────────────────────────────── */

function ActionPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const me = state.players.find((p) => p.id === myId)
  const { addToast } = useToast()
  if (!me) return null
  const cur = state.players[state.currentIdx]
  const isMyTurn = cur?.id === myId && state.phase === 'playing' && !state.trade

  const act = (action: Record<string, unknown>) => {
    const type = action.type as string
    if (type === 'roll') sounds.diceRoll()
    else if (type === 'buy') { sounds.buyProperty(); addToast('Nieruchomość kupiona!', 'success') }
    else if (type === 'end-turn') sounds.turnStart()
    else if (type === 'pay-bail' || type === 'use-jail-card') sounds.jail()
    else if (type === 'auction-bid') sounds.moneyGain()
    else if (type === 'buy-house' || type === 'sell-house') sounds.buyProperty()
    else if (type === 'decline-buy') addToast('Odmówiono zakupu — licytacja', 'info')
    socket.emit('action', { code, action })
  }

  // Licytacja
  if (state.auction) {
    const a = state.auction
    const myTurn = a.participants[a.turnIdx] === myId && !a.passed.includes(myId)
    const tile = BOARD[a.tileId]
    return (
      <div className="action-panel auction-panel">
        <h3>🔨 Licytacja</h3>
        <div className="auction-property">
          <span className="auction-property-name">{tile?.name}</span>
          {tile?.group &&          <span className="auction-property-group" style={{ background: GROUP_COLORS[tile.group] }} />}
        </div>
        <p className="auction-info">
          Aktualna oferta: <b>{a.bid} zł</b>
          {a.winner && ` — ${state.players.find((p) => p.id === a.winner)?.name}`}
        </p>
        {a.passed.includes(myId) ? (
          <p className="subtitle">Odmówiłeś udziału.</p>
        ) : myTurn ? (
          <div className="auction-actions">
            <button className="btn primary" onClick={() => act({ type: 'auction-bid', amount: a.bid + 10 })}>
              +10 zł ({a.bid + 10})
            </button>
            <button className="btn primary" onClick={() => act({ type: 'auction-bid', amount: a.bid + 50 })}>
              +50 zł
            </button>
            <button className="btn secondary" onClick={() => act({ type: 'auction-pass' })}>
              Pas
            </button>
          </div>
        ) : (
          <p className="subtitle">Czekaj na swoją kolejkę…</p>
        )}
      </div>
    )
  }

  // Handel (odbierający)
  if (state.trade && state.trade.to === myId) {
    const t = state.trade
    const from = state.players.find((p) => p.id === t.from)
    return (
      <div className="action-panel">
        <h3>🤝 Propozycja handlu od {from?.name}</h3>
        <div className="trade-summary">
          <div>
            <b>{from?.name} oddaje:</b>
            {t.give.cash > 0 && <span className="trade-item">💰 {t.give.cash} zł</span>}
            {t.give.properties.map((id) => (
              <span key={id} className="trade-item">{BOARD[id]?.name}</span>
            ))}
          </div>
          <div>
            <b>Ty oddajesz:</b>
            {t.get.cash > 0 && <span className="trade-item">💰 {t.get.cash} zł</span>}
            {t.get.properties.map((id) => (
              <span key={id} className="trade-item">{BOARD[id]?.name}</span>
            ))}
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => { act({ type: 'trade-accept' }); addToast('Handel zaakceptowany!', 'success') }}>✅ Akceptuj</button>
          <button className="btn secondary" onClick={() => { act({ type: 'trade-decline' }); addToast('Handel odrzucony', 'info') }}>❌ Odrzuć</button>
        </div>
      </div>
    )
  }

  if (state.trade && state.trade.from === myId) {
    return (
      <div className="action-panel">
        <h3>🤝 Oczekiwanie na odpowiedź…</h3>
        <button className="btn secondary" onClick={() => act({ type: 'trade-cancel' })}>Wycofaj</button>
      </div>
    )
  }

  if (!isMyTurn) {
    return (
      <div className="action-panel">
        <p className="subtitle">
          {state.phase === 'finished' && state.winner
            ? (state.winner === myId ? '🏆 Wygrałeś!' : `🏆 ${state.players.find((p) => p.id === state.winner)?.name} wygrywa!`)
            : `Czekaj na turę ${cur?.name}…`}
        </p>
      </div>
    )
  }

  // Jest moja tura
  const tile = state.pendingTile ? BOARD[state.pendingTile] : null
  const prop = state.pendingTile != null ? state.properties[state.pendingTile] : null

  // W więzieniu
  if (me.inJail) {
    return (
      <div className="action-panel jail-panel">
        <h3>🔒 Jesteś w więzieniu</h3>
        <p className="subtitle">Tura {me.jailTurns + 1} z 3</p>
        <div className="jail-actions">
          {me.jailCards > 0 && (
            <button className="btn secondary" onClick={() => act({ type: 'use-jail-card' })}>
              🃏 Użyj karty wyjścia
            </button>
          )}
          {me.money >= 50 && (
            <button className="btn primary" onClick={() => { act({ type: 'pay-bail' }); addToast('Zapłacono kaucję 50 zł', 'info') }}>
              💰 Zapłać kaucję (50 zł)
            </button>
          )}
          <button className="btn primary big" onClick={() => act({ type: 'roll' })}>
            🎲 Rzuć kośćmi
          </button>
        </div>
      </div>
    )
  }

  if (state.awaiting === 'buy' && tile) {
    const canAfford = me.money >= (tile.price ?? 0)
    return (
      <div className="action-panel buy-panel">
        <div className="buy-header">
          <span className="buy-tile-name">{tile.name}</span>
          {tile.group && <span className="buy-tile-group" style={{ background: GROUP_COLORS[tile.group] }} />}
        </div>
        <p className="buy-price">Cena: <b>{tile.price} zł</b></p>
        <p className="buy-balance">Twoje środki: <b>{me.money} zł</b></p>
        <div className="row">
          <button
            className="btn primary"
            disabled={!canAfford}
            onClick={() => act({ type: 'buy' })}
          >
            {canAfford ? `Kup za ${tile.price} zł` : 'Brak środków'}
          </button>
          <button className="btn secondary" onClick={() => act({ type: 'decline-buy' })}>
            Odmów
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="action-panel">
      {state.awaiting === 'roll' && (
        <button className="btn primary big roll-btn" onClick={() => act({ type: 'roll' })}>
          🎲 Rzuć kośćmi
        </button>
      )}
      {state.awaiting === 'end' && (
        <button className="btn primary big" onClick={() => act({ type: 'end-turn' })}>
          ✅ Zakończ turę
        </button>
      )}
      {state.phase === 'finished' && state.winner && (
        <h3>🏆 {state.players.find((p) => p.id === state.winner)?.name} wygrywa!</h3>
      )}
    </div>
  )
}

/* ─── Panel nieruchomości ────────────────────────────────────────────────── */

function PropertyPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const me = state.players.find((p) => p.id === myId)
  if (!me) return null
  const isMyTurn = state.players[state.currentIdx]?.id === myId && state.phase === 'playing' && !state.trade
  const act = (action: Record<string, unknown>) =>
    socket.emit('action', { code, action })

  const myProps = BOARD.filter((t) => {
    const p = state.properties[t.id]
    return p?.owner === myId && t.price
  })

  if (myProps.length === 0) return null

  return (
    <div className="property-panel">
      <h3>🏢 Twoje nieruchomości ({myProps.length})</h3>
      <div className="prop-list">
        {myProps.map((tile) => {
          const p = state.properties[tile.id]
          const group = tile.group ?? ''
          const hasWholeGroup = ownsWholeGroup(state, group, myId)
          const canBuild = isMyTurn && tile.type === 'street' && tile.houseCost &&
            hasWholeGroup && !p.mortgaged && p.houses < 5 &&
            minHousesInGroup(state, group) >= p.houses
          const canSell = isMyTurn && tile.type === 'street' && p.houses > 0 &&
            maxHousesInGroup(state, group) <= p.houses
          const canMortgage = isMyTurn && !p.mortgaged &&
            groupHasNoBuildingsInGroup(state, group)
          const canUnmortgage = isMyTurn && p.mortgaged && me.money >= Math.ceil((tile.price ?? 0) * 0.55)

          return (
            <div key={tile.id} className={`prop-card ${p.mortgaged ? 'mortgaged' : ''}`}>
              <div className="prop-header">
                {tile.group && (
                  <span className="prop-color-dot" style={{ background: GROUP_COLORS[group] }} />
                )}
                <span className="prop-name">{tile.name}</span>
                {p.houses > 0 && (
                  <span className="prop-houses">
                    {p.houses === 5 ? '🏨' : '🏠'.repeat(p.houses)}
                  </span>
                )}
              </div>
              {tile.type === 'street' && tile.rent && (
                <div className="prop-rent">
                  Czynsz: {p.houses > 0 ? tile.rent[p.houses] :
                    hasWholeGroup ? tile.rent[0] * 2 : tile.rent[0]} zł
                  {hasWholeGroup && p.houses === 0 && <span className="prop-monopol"> (monopol!)</span>}
                </div>
              )}
              <div className="prop-actions">
                {canBuild && tile.houseCost && (
                  <button className="btn tiny" onClick={() => act({ type: 'buy-house', tileId: tile.id })}>
                    + Domek ({tile.houseCost} zł)
                  </button>
                )}
                {canSell && tile.houseCost && (
                  <button className="btn tiny" onClick={() => act({ type: 'sell-house', tileId: tile.id })}>
                    - Domek (+{Math.floor(tile.houseCost / 2)} zł)
                  </button>
                )}
                {canMortgage && (
                  <button className="btn tiny" onClick={() => act({ type: 'mortgage', tileId: tile.id })}>
                    Hipoteka (+{Math.floor((tile.price ?? 0) / 2)} zł)
                  </button>
                )}
                {canUnmortgage && (
                  <button className="btn tiny" onClick={() => act({ type: 'unmortgage', tileId: tile.id })}>
                    Spłać ({Math.ceil((tile.price ?? 0) * 0.55)} zł)
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function groupHasNoBuildingsInGroup(state: GameState, group: string): boolean {
  return BOARD.filter((t) => t.group === group).every(
    (t) => (state.properties[t.id]?.houses ?? 0) === 0
  )
}

function maxHousesInGroup(state: GameState, group: string): number {
  const tiles = BOARD.filter((t) => t.group === group)
  return Math.max(...tiles.map((t) => state.properties[t.id]?.houses ?? 0))
}

/* ─── Panel handlu ────────────────────────────────────────────────────────── */

function TradePanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const [targetId, setTargetId] = useState('')
  const [cashGive, setCashGive] = useState(0)
  const [cashGet, setCashGet] = useState(0)
  const [propsGive, setPropsGive] = useState<number[]>([])
  const [propsGet, setPropsGet] = useState<number[]>([])
  const [open, setOpen] = useState(false)
  const { addToast } = useToast()

  const me = state.players.find((p) => p.id === myId)
  if (!me || me.bankrupt || state.phase !== 'playing' || state.trade) return null

  const others = state.players.filter((p) => p.id !== myId && !p.bankrupt)
  const myOwnable = BOARD.filter((t) => state.properties[t.id]?.owner === myId && t.price)
  const targetOwnable = targetId
    ? BOARD.filter((t) => state.properties[t.id]?.owner === targetId && t.price)
    : []

  const submit = () => {
    if (!targetId || (cashGive <= 0 && propsGive.length === 0 && cashGet <= 0 && propsGet.length === 0)) return
    socket.emit('action', {
      code,
      action: {
        type: 'trade-propose',
        to: targetId,
        give: { cash: cashGive, properties: propsGive },
        get: { cash: cashGet, properties: propsGet }
      }
    })
    setOpen(false)
    setCashGive(0); setCashGet(0); setPropsGive([]); setPropsGet([])
    addToast('Propozycja handlu wysłana', 'info')
  }

  if (!open) {
    return (
      <div className="trade-toggle">
        <button className="btn ghost" onClick={() => setOpen(true)}>🤝 Handluj</button>
      </div>
    )
  }

  return (
    <div className="trade-panel">
      <h3>🤝 Handel</h3>
      <label className="label">Z graczem:</label>
      <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
        <option value="">— wybierz —</option>
        {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {targetId && (
        <>
          <div className="trade-half">
            <b>Oddajesz:</b>
            <label className="label small">Gotówka: <input type="number" min={0} max={me.money} value={cashGive}
              onChange={(e) => setCashGive(Math.max(0, Number(e.target.value)))} className="input tiny" /> zł</label>
            {myOwnable.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={propsGive.includes(t.id)}
                  onChange={() => setPropsGive((prev) =>
                    prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                  )} />
                {t.name}
              </label>
            ))}
          </div>
          <div className="trade-half">
            <b>Żądasz:</b>
            {(() => {
              const tp = state.players.find((p) => p.id === targetId)
              return <label className="label small">Gotówka: <input type="number" min={0} max={tp?.money ?? 0} value={cashGet}
                onChange={(e) => setCashGet(Math.max(0, Number(e.target.value)))} className="input tiny" /> zł</label>
            })()}
            {targetOwnable.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={propsGet.includes(t.id)}
                  onChange={() => setPropsGet((prev) =>
                    prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                  )} />
                {t.name}
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" onClick={submit}>Wyślij propozycję</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>Anuluj</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Log gry ────────────────────────────────────────────────────────────── */

function LogPanel({ state }: { state: GameState }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [state.log.length])

  return (
    <div className="log-panel">
      <h3>📜 Dziennik</h3>
      <div className="log-scroll" ref={scrollRef}>
        {state.log.slice(-50).map((e) => (
          <div key={e.seq} className={`log-entry log-${e.kind}`}>{e.text}</div>
        ))}
      </div>
    </div>
  )
}

/* ─── Panel czatu ────────────────────────────────────────────────────────── */

function ChatPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const [msg, setMsg] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [soundOn, setSoundOn] = useState(sounds.isEnabled())

  const send = () => {
    if (!msg.trim()) return
    socket.emit('chat', { code, text: msg.trim() })
    setMsg('')
  }

  const toggleSound = () => {
    const on = sounds.toggle()
    setSoundOn(on)
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [state.chat?.length])

  return (
    <div className="chat-panel">
      <h3>💬 Czat</h3>
      <div className="chat-messages" ref={scrollRef}>
        {state.chat?.slice(-50).map((m) => (
          <div key={m.seq} className="chat-msg">
            <span className="chat-author" style={{ color: state.players.find((p) => p.id === m.playerId)?.color }}>
              {m.playerName}:
            </span>
            {m.text}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="input"
          placeholder="Napisz wiadomość..."
          value={msg}
          maxLength={200}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn secondary" onClick={send}>📨</button>
        <button className="sound-btn" onClick={toggleSound} title="Dźwięki">
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>
    </div>
  )
}

/* ─── Ekran wygranej ────────────────────────────────────────────────────── */

function WinnerScreen({ state, myId }: { state: GameState; myId: string }) {
  const winner = state.players.find(p => p.id === state.winner)
  const stats = state.finalStats
  const isWinner = state.winner === myId

  return (
    <div className="winner-screen">
      <div className="winner-card">
        <h2 className="winner-title">{isWinner ? '🏆 Wygrałeś!' : `🏆 ${winner?.name} wygrywa!`}</h2>
        {stats && (
          <div className="winner-stats">
            <h3>Statystyki końcowe</h3>
            <div className="stats-grid">
              {stats.players.map((p, i) => (
                <div key={p.id} className={`stat-row ${p.id === myId ? 'me' : ''} ${p.bankrupt ? 'bankrupt' : ''}`}>
                  <span className="stat-place">#{i + 1}</span>
                  <span className="stat-token" style={{ borderColor: p.color }}>●</span>
                  <span className="stat-name">{p.name}</span>
                  <span className="stat-money">{p.netWorth} zł</span>
                </div>
              ))}
            </div>
            <div className="stats-summary">
              <p>Tur rozegranych: {stats.turnsPlayed}</p>
              <p>Transakcji: {stats.tradesCompleted}</p>
              <p>Łączny obrót: {stats.totalMoneyTransferred} zł</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Główny ekran gry ──────────────────────────────────────────────────── */

export default function GameScreen({ room, myId }: { room: RoomView; myId: string }) {
  const state = room.game!
  const code = room.code
  const prevLogRef = useRef(state.log.length)
  const { addToast } = useToast()

  // Odtwarzaj dźwięki i toastify gdy pojawiają się nowe logi
  useEffect(() => {
    if (state.log.length > prevLogRef.current) {
      const lastLog = state.log[state.log.length - 1]
      if (lastLog.kind === 'big') {
        if (lastLog.text.includes('bankrut')) { sounds.bankrupt(); addToast(lastLog.text, 'error') }
        else if (lastLog.text.includes('wygrywa')) { sounds.win(); addToast(lastLog.text, 'success', 5000) }
        else if (lastLog.text.includes('więzienia')) { sounds.jail(); addToast(lastLog.text, 'warning') }
        else if (lastLog.text.includes('dublet')) { sounds.doubles(); addToast(lastLog.text, 'warning') }
      } else if (lastLog.kind === 'money') {
        if (lastLog.text.includes('płaci')) sounds.moneyLoss()
        else if (lastLog.text.includes('kupuje')) sounds.buyProperty()
        else sounds.moneyGain()
      } else if (lastLog.kind === 'card') {
        sounds.card()
        addToast(lastLog.text, 'info')
      }
    }
    prevLogRef.current = state.log.length
  }, [state.log.length, addToast])

  // Toast when it's my turn
  const cur = state.players[state.currentIdx]
  const prevTurnRef = useRef(state.currentIdx)
  useEffect(() => {
    if (state.currentIdx !== prevTurnRef.current && cur?.id === myId && state.phase === 'playing') {
      addToast('Twoja tura!', 'info')
    }
    prevTurnRef.current = state.currentIdx
  }, [state.currentIdx, cur?.id, myId, state.phase, addToast])

  // Winner screen
  if (state.phase === 'finished' && state.winner) {
    return <WinnerScreen state={state} myId={myId} />
  }

  return (
    <div className="screen game">
      <div className="game-layout">
        <div className="game-left">
          <Board state={state} />
        </div>
        <div className="game-right">
          <div className="game-header">
            <h2 className="logo small">MEGA<span>POL</span></h2>
            <span className="room-badge">Pokój: {room.code}</span>
          </div>
          <PlayerList state={state} myId={myId} />
          <ActionPanel state={state} myId={myId} code={code} />
          <PropertyPanel state={state} myId={myId} code={code} />
          <TradePanel state={state} myId={myId} code={code} />
          <ChatPanel state={state} myId={myId} code={code} />
          <LogPanel state={state} />
        </div>
      </div>
    </div>
  )
}
