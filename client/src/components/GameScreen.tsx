import { useState, useRef, useEffect } from 'react'
import { socket } from '../socket'
import { sounds } from '../sounds'
import { BOARD } from '../../../shared/board'
import { ownsWholeGroup, calcRent, minHousesInGroup } from '../../../shared/rules'
import type { GameState, Player } from '../../../shared/types'
import Board, { PlayerList } from './Board'
import type { RoomView } from '../../../shared/types'

/* ─── Akcje gracza ──────────────────────────────────────────────────────── */

function ActionPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const me = state.players.find((p) => p.id === myId)
  if (!me) return null
  const cur = state.players[state.currentIdx]
  const isMyTurn = cur?.id === myId && state.phase === 'playing' && !state.trade

  const act = (action: Record<string, unknown>) => {
    // Dźwięki dla różnych akcji
    const type = action.type as string
    if (type === 'roll') sounds.diceRoll()
    else if (type === 'buy') sounds.buyProperty()
    else if (type === 'end-turn') sounds.turnStart()
    else if (type === 'pay-bail' || type === 'use-jail-card') sounds.jail()
    else if (type === 'auction-bid') sounds.moneyGain()
    else if (type === 'buy-house' || type === 'sell-house') sounds.buyProperty()
    socket.emit('action', { code, action })
  }

  // — Licytacja —
  if (state.auction) {
    const a = state.auction
    const myTurn = a.participants[a.turnIdx] === myId && !a.passed.includes(myId)
    return (
      <div className="action-panel">
        <h3>🔨 Licytacja</h3>
        <p className="auction-info">
          {BOARD[a.tileId]?.name} — aktualna oferta: <b>{a.bid} zł</b>
          {a.winner && ` (${state.players.find((p) => p.id === a.winner)?.name})`}
        </p>
        {a.passed.includes(myId) ? (
          <p className="subtitle">Odmówiłeś udziału.</p>
        ) : myTurn ? (
          <div className="auction-actions">
            <button className="btn primary" onClick={() => act({ type: 'auction-bid', amount: a.bid + 10 })}>
              Licytuj {a.bid + 10} zł
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

  // — Handel (odbierający) —
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
          <button className="btn primary" onClick={() => act({ type: 'trade-accept' })}>✅ Akceptuj</button>
          <button className="btn secondary" onClick={() => act({ type: 'trade-decline' })}>❌ Odrzuć</button>
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

  if (!isMyTurn) return <div className="action-panel"><p className="subtitle">Czekaj na turę {cur?.name}…</p></div>

  // — Jest moja tura —
  const tile = state.pendingTile ? BOARD[state.pendingTile] : null
  const prop = state.pendingTile != null ? state.properties[state.pendingTile] : null

  // W więzieniu
  if (me.inJail) {
    return (
      <div className="action-panel">
        <h3>🔒 Jesteś w więzieniu</h3>
        <p className="subtitle">Tura {me.jailTurns + 1} z 3</p>
        {me.jailCards > 0 && (
          <button className="btn secondary" onClick={() => act({ type: 'use-jail-card' })}>
            🃏 Użyj karty wyjścia
          </button>
        )}
        {me.money >= 50 && (
          <button className="btn primary" onClick={() => act({ type: 'pay-bail' })}>
            💰 Zapłać kaucję (50 zł)
          </button>
        )}
        <button className="btn secondary" onClick={() => act({ type: 'roll' })}>
          🎲 Rzuć kośćmi
        </button>
      </div>
    )
  }

  if (state.awaiting === 'buy' && tile) {
    return (
      <div className="action-panel">
        <h3>{tile.name}</h3>
        <p>Cena: <b>{tile.price} zł</b></p>
        <div className="row">
          <button className="btn primary" disabled={me.money < (tile.price ?? 0)} onClick={() => act({ type: 'buy' })}>
            Kup za {tile.price} zł
          </button>
          <button className="btn secondary" onClick={() => act({ type: 'decline-buy' })}>
            Odmów (licytacja)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="action-panel">
      {state.awaiting === 'roll' && (
        <button className="btn primary big" onClick={() => act({ type: 'roll' })}>
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
      <h3>🏢 Twoje nieruchomości</h3>
      <div className="prop-list">
        {myProps.map((tile) => {
          const p = state.properties[tile.id]
          const group = tile.group ?? ''
          const canBuild = isMyTurn && tile.type === 'street' && tile.houseCost &&
            ownsWholeGroup(state, group, myId) &&
            groupHasNoBuildingsExceptTile(state, group, tile.id) &&
            !p.mortgaged && p.houses < 5
          const canSell = isMyTurn && tile.type === 'street' && p.houses > 0 &&
            minHousesInGroup(state, group) >= p.houses
          const canMortgage = isMyTurn && !p.mortgaged &&
            groupHasNoBuildingsInGroup(state, group)
          const canUnmortgage = isMyTurn && p.mortgaged

          return (
            <div key={tile.id} className={`prop-card ${p.mortgaged ? 'mortgaged' : ''}`}>
              <div className="prop-header">
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
                    ownsWholeGroup(state, group, myId) ? tile.rent[0] * 2 : tile.rent[0]} zł
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

function groupHasNoBuildingsExceptTile(state: GameState, group: string, exceptId: number): boolean {
  return BOARD.filter((t) => t.group === group && t.id !== exceptId).every(
    (t) => (state.properties[t.id]?.houses ?? 0) === 0
  )
}

function groupHasNoBuildingsInGroup(state: GameState, group: string): boolean {
  return BOARD.filter((t) => t.group === group).every(
    (t) => (state.properties[t.id]?.houses ?? 0) === 0
  )
}

/* ─── Panel handlu ────────────────────────────────────────────────────────── */

function TradePanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const [targetId, setTargetId] = useState('')
  const [cashGive, setCashGive] = useState(0)
  const [cashGet, setCashGet] = useState(0)
  const [propsGive, setPropsGive] = useState<number[]>([])
  const [propsGet, setPropsGet] = useState<number[]>([])
  const [open, setOpen] = useState(false)

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
            {targetId && (() => {
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
  return (
    <div className="log-panel">
      <h3>📜 Dziennik</h3>
      <div className="log-scroll">
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

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  // Auto-scroll na dół
  useEffect(() => {
    scrollToBottom()
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

/* ─── Główny ekran gry ──────────────────────────────────────────────────── */

export default function GameScreen({ room, myId }: { room: RoomView; myId: string }) {
  const state = room.game!
  const code = room.code
  const prevLogRef = useRef(state.log.length)
  const prevWinnerRef = useRef(state.winner)

  // Odtwarzaj dźwięki gdy pojawiają się nowe logi
  useEffect(() => {
    if (state.log.length > prevLogRef.current) {
      const lastLog = state.log[state.log.length - 1]
      if (lastLog.kind === 'big') {
        if (lastLog.text.includes('bankrut')) sounds.bankrupt()
        else if (lastLog.text.includes('wygrywa')) sounds.win()
        else if (lastLog.text.includes('więzienia')) sounds.jail()
        else if (lastLog.text.includes('dublet')) sounds.doubles()
      } else if (lastLog.kind === 'money') {
        if (lastLog.text.includes('płaci')) sounds.moneyLoss()
        else if (lastLog.text.includes('kupuje')) sounds.buyProperty()
        else sounds.moneyGain()
      } else if (lastLog.kind === 'card') {
        sounds.card()
      }
    }
    prevLogRef.current = state.log.length
  }, [state.log.length])

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
