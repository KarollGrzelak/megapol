import { useState, useRef, useEffect } from 'react'
import { socket } from '../socket'
import { sounds } from '../sounds'
import { BOARD, GROUP_COLORS } from '../../../shared/board'
import { ownsWholeGroup, minHousesInGroup } from '../../../shared/rules'
import type { GameState, Player, RoomView } from '../../../shared/types'
import Board, { PlayerList } from './Board'
import { useToast } from './Toast'

/* ─── Action Panel (compact) ──────────────────────────────────────────── */

function ActionPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const me = state.players.find((p) => p.id === myId)
  const { addToast } = useToast()
  if (!me) return null
  const cur = state.players[state.currentIdx]
  const isMyTurn = cur?.id === myId && state.phase === 'playing' && !state.trade

  const act = (action: Record<string, unknown>) => {
    const type = action.type as string
    if (type === 'roll') sounds.diceRoll()
    else if (type === 'buy') { sounds.buyProperty(); addToast('Kupiono!', 'success') }
    else if (type === 'end-turn') sounds.turnStart()
    else if (type === 'pay-bail' || type === 'use-jail-card') sounds.jail()
    else if (type === 'auction-bid') sounds.moneyGain()
    else if (type === 'buy-house' || type === 'sell-house') sounds.buyProperty()
    else if (type === 'decline-buy') addToast('Odmówiono — licytacja', 'info')
    socket.emit('action', { code, action })
  }

  // Auction
  if (state.auction) {
    const a = state.auction
    const myTurn = a.participants[a.turnIdx] === myId && !a.passed.includes(myId)
    const tile = BOARD[a.tileId]
    return (
      <div className="action-panel auction-panel">
        <div className="auction-property">
          <span className="auction-property-name">{tile?.name}</span>
          {tile?.group && <span className="auction-property-group" style={{ background: GROUP_COLORS[tile.group] }} />}
        </div>
        <p className="auction-info">Oferta: <b>{a.bid} zł</b>{a.winner && ` — ${state.players.find((p) => p.id === a.winner)?.name}`}</p>
        {a.passed.includes(myId) ? <p className="subtitle">Spasowałeś</p> : myTurn ? (
          <div className="auction-actions">
            <button className="btn primary" onClick={() => act({ type: 'auction-bid', amount: a.bid + 10 })}>+10</button>
            <button className="btn primary" onClick={() => act({ type: 'auction-bid', amount: a.bid + 50 })}>+50</button>
            <button className="btn secondary" onClick={() => act({ type: 'auction-pass' })}>Pas</button>
          </div>
        ) : <p className="subtitle">Czekaj…</p>}
      </div>
    )
  }

  // Incoming trade
  if (state.trade && state.trade.to === myId) {
    const t = state.trade
    const from = state.players.find((p) => p.id === t.from)
    return (
      <div className="action-panel">
        <h3>Handel od {from?.name}</h3>
        <div className="trade-summary">
          <div><b>{from?.name} →</b>{t.give.cash > 0 && <span className="trade-item">{t.give.cash} zł</span>}{t.give.properties.map((id) => <span key={id} className="trade-item">{BOARD[id]?.name}</span>)}</div>
          <div><b>← Ty</b>{t.get.cash > 0 && <span className="trade-item">{t.get.cash} zł</span>}{t.get.properties.map((id) => <span key={id} className="trade-item">{BOARD[id]?.name}</span>)}</div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => { act({ type: 'trade-accept' }); addToast('Handel!', 'success') }}>Akceptuj</button>
          <button className="btn secondary" onClick={() => { act({ type: 'trade-decline' }); addToast('Odrzucono', 'info') }}>Odrzuć</button>
        </div>
      </div>
    )
  }

  if (state.trade && state.trade.from === myId) {
    return <div className="action-panel"><p className="subtitle">Oczekiwanie na odpowiedź…</p><button className="btn secondary" style={{ marginTop: '.3rem' }} onClick={() => act({ type: 'trade-cancel' })}>Wycofaj</button></div>
  }

  // Not my turn
  if (!isMyTurn) {
    return (
      <div className="action-panel action-waiting">
        {state.phase === 'finished' && state.winner
          ? <p className="subtitle">{state.winner === myId ? 'Wygrałeś!' : `${state.players.find((p) => p.id === state.winner)?.name} wygrywa!`}</p>
          : <p className="subtitle"><span className="wait-name">{cur?.name}</span> gra…</p>}
      </div>
    )
  }

  // Jail
  if (me.inJail) {
    return (
      <div className="action-panel jail-panel">
        <div className="jail-actions">
          {me.jailCards > 0 && <button className="btn secondary" onClick={() => act({ type: 'use-jail-card' })}>🃏 Karta wyjścia</button>}
          {me.money >= 50 && <button className="btn primary" onClick={() => { act({ type: 'pay-bail' }); addToast('Kaucja 50 zł', 'info') }}>💰 Kaucja 50 zł</button>}
          <button className="btn primary big roll-btn" onClick={() => act({ type: 'roll' })}>🎲 Rzuć kośćmi</button>
        </div>
      </div>
    )
  }

  // Buy
  if (state.awaiting === 'buy' && state.pendingTile != null) {
    const tile = BOARD[state.pendingTile]
    const canAfford = me.money >= (tile.price ?? 0)
    return (
      <div className="action-panel buy-panel">
        <div className="buy-header">
          <span className="buy-tile-name">{tile.name}</span>
          {tile.group && <span className="buy-tile-group" style={{ background: GROUP_COLORS[tile.group] }} />}
        </div>
        <p className="buy-price">{tile.price} zł <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(masz {me.money} zł)</span></p>
        <div className="row">
          <button className="btn primary" disabled={!canAfford} onClick={() => act({ type: 'buy' })}>{canAfford ? 'Kup' : 'Brak'}</button>
          <button className="btn secondary" onClick={() => act({ type: 'decline-buy' })}>Odmów</button>
        </div>
      </div>
    )
  }

  // Main CTA
  return (
    <div className="action-panel">
      {state.awaiting === 'roll' && <button className="btn primary big roll-btn" onClick={() => act({ type: 'roll' })}>🎲 Rzuć kośćmi</button>}
      {state.awaiting === 'end' && <button className="btn primary big end-btn" onClick={() => act({ type: 'end-turn' })}>Zakończ turę</button>}
    </div>
  )
}

/* ─── Property Panel (compact) ────────────────────────────────────────── */

function PropertyPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const me = state.players.find((p) => p.id === myId)
  if (!me) return null
  const isMyTurn = state.players[state.currentIdx]?.id === myId && state.phase === 'playing' && !state.trade
  const act = (action: Record<string, unknown>) => socket.emit('action', { code, action })

  const myProps = BOARD.filter((t) => state.properties[t.id]?.owner === myId && t.price)
  if (myProps.length === 0) return null

  return (
    <div className="property-panel">
      <h3>Nieruchomości ({myProps.length})</h3>
      <div className="prop-list">
        {myProps.map((tile) => {
          const p = state.properties[tile.id]
          const group = tile.group ?? ''
          const hasWhole = ownsWholeGroup(state, group, myId)
          const canBuild = isMyTurn && tile.type === 'street' && tile.houseCost && hasWhole && !p.mortgaged && p.houses < 5 && minHousesInGroup(state, group) >= p.houses
          const canSell = isMyTurn && tile.type === 'street' && p.houses > 0 && maxHousesInGroup(state, group) <= p.houses
          const canMortgage = isMyTurn && !p.mortgaged && groupHasNoBuildingsInGroup(state, group)
          const canUnmortgage = isMyTurn && p.mortgaged && me.money >= Math.ceil((tile.price ?? 0) * 0.55)
          const rent = tile.type === 'street' && tile.rent ? (p.houses > 0 ? tile.rent[p.houses] : hasWhole ? tile.rent[0] * 2 : tile.rent[0]) : null

          return (
            <div key={tile.id} className={`prop-card ${p.mortgaged ? 'mortgaged' : ''}`}>
              <div className="prop-color-bar" style={{ background: group ? GROUP_COLORS[group] : '#888' }} />
              <div className="prop-info">
                <span className="prop-name">{tile.name}</span>
                <span className="prop-meta">
                  {rent != null && <span>{rent} zł</span>}
                  {p.houses > 0 && <span className="prop-houses">{p.houses === 5 ? '🏨' : '🏠'.repeat(p.houses)}</span>}
                  {hasWhole && p.houses === 0 && <span className="prop-monopol">monopol</span>}
                </span>
                {(canBuild || canSell || canMortgage || canUnmortgage) && (
                  <div className="prop-actions">
                    {canBuild && tile.houseCost && <button className="btn tiny" onClick={() => act({ type: 'buy-house', tileId: tile.id })}>+🏠 {tile.houseCost}</button>}
                    {canSell && tile.houseCost && <button className="btn tiny" onClick={() => act({ type: 'sell-house', tileId: tile.id })}>-🏠 +{Math.floor(tile.houseCost / 2)}</button>}
                    {canMortgage && <button className="btn tiny" onClick={() => act({ type: 'mortgage', tileId: tile.id })}>Hip +{Math.floor((tile.price ?? 0) / 2)}</button>}
                    {canUnmortgage && <button className="btn tiny" onClick={() => act({ type: 'unmortgage', tileId: tile.id })}>Spłać {Math.ceil((tile.price ?? 0) * 0.55)}</button>}
                  </div>
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
  return BOARD.filter((t) => t.group === group).every((t) => (state.properties[t.id]?.houses ?? 0) === 0)
}
function maxHousesInGroup(state: GameState, group: string): number {
  return Math.max(...BOARD.filter((t) => t.group === group).map((t) => state.properties[t.id]?.houses ?? 0))
}

/* ─── Trade (modal) ───────────────────────────────────────────────────── */

function TradeButton({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const [open, setOpen] = useState(false)
  const me = state.players.find((p) => p.id === myId)
  if (!me || me.bankrupt || state.phase !== 'playing' || state.trade) return null
  return (
    <>
      <button className="btn ghost" style={{ width: '100%' }} onClick={() => setOpen(true)}>🤝 Handluj</button>
      {open && <TradeModal state={state} myId={myId} code={code} onClose={() => setOpen(false)} />}
    </>
  )
}

function TradeModal({ state, myId, code, onClose }: { state: GameState; myId: string; code: string; onClose: () => void }) {
  const [targetId, setTargetId] = useState('')
  const [cashGive, setCashGive] = useState(0)
  const [cashGet, setCashGet] = useState(0)
  const [propsGive, setPropsGive] = useState<number[]>([])
  const [propsGet, setPropsGet] = useState<number[]>([])
  const { addToast } = useToast()
  const me = state.players.find((p) => p.id === myId)
  if (!me) return null
  const others = state.players.filter((p) => p.id !== myId && !p.bankrupt)
  const myOwnable = BOARD.filter((t) => state.properties[t.id]?.owner === myId && t.price)
  const targetOwnable = targetId ? BOARD.filter((t) => state.properties[t.id]?.owner === targetId && t.price) : []

  const submit = () => {
    if (!targetId || (cashGive <= 0 && propsGive.length === 0 && cashGet <= 0 && propsGet.length === 0)) return
    socket.emit('action', { code, action: { type: 'trade-propose', to: targetId, give: { cash: cashGive, properties: propsGive }, get: { cash: cashGet, properties: propsGet } } })
    onClose(); addToast('Propozycja wysłana', 'info')
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>🤝 Handel</h3>
        <label className="label">Z graczem:</label>
        <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">— wybierz —</option>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {targetId && <>
          <div className="trade-half">
            <b style={{ fontSize: '.85rem' }}>Oddajesz:</b>
            <label className="label small">Gotówka: <input type="number" min={0} max={me.money} value={cashGive} onChange={(e) => setCashGive(Math.max(0, Number(e.target.value)))} className="input tiny" /> zł</label>
            {myOwnable.map((t) => <label key={t.id} className="check"><input type="checkbox" checked={propsGive.includes(t.id)} onChange={() => setPropsGive((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id])} />{t.name}</label>)}
          </div>
          <div className="trade-half">
            <b style={{ fontSize: '.85rem' }}>Żądasz:</b>
            <label className="label small">Gotówka: <input type="number" min={0} max={state.players.find((p) => p.id === targetId)?.money ?? 0} value={cashGet} onChange={(e) => setCashGet(Math.max(0, Number(e.target.value)))} className="input tiny" /> zł</label>
            {targetOwnable.map((t) => <label key={t.id} className="check"><input type="checkbox" checked={propsGet.includes(t.id)} onChange={() => setPropsGet((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id])} />{t.name}</label>)}
          </div>
          <div className="row">
            <button className="btn primary" onClick={submit}>Wyślij</button>
            <button className="btn ghost" onClick={onClose}>Anuluj</button>
          </div>
        </>}
      </div>
    </div>
  )
}

/* ─── Tabs (Log + Chat) ───────────────────────────────────────────────── */

function TabsPanel({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const [tab, setTab] = useState<'log' | 'chat'>('log')
  const [msg, setMsg] = useState('')
  const [soundOn, setSoundOn] = useState(sounds.isEnabled())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [state.log.length, state.chat?.length, tab])

  const send = () => { if (!msg.trim()) return; socket.emit('chat', { code, text: msg.trim() }); setMsg('') }

  return (
    <div className="tabs-panel">
      <div className="tabs-header">
        <button className={`tab-btn ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Dziennik</button>
        <button className={`tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Czat</button>
        <button className="sound-btn" onClick={() => { const on = sounds.toggle(); setSoundOn(on) }} title="Dźwięki" style={{ margin: '.3rem' }}>{soundOn ? '🔊' : '🔇'}</button>
      </div>
      <div className="tabs-content" ref={scrollRef}>
        {tab === 'log' && state.log.slice(-50).map((e) => (
          <div key={e.seq} className={`log-entry log-${e.kind}`}>{e.text}</div>
        ))}
        {tab === 'chat' && state.chat?.slice(-50).map((m) => (
          <div key={m.seq} className="chat-msg">
            <span className="chat-author" style={{ color: state.players.find((p) => p.id === m.playerId)?.color }}>{m.playerName}:</span>
            {m.text}
          </div>
        ))}
      </div>
      {tab === 'chat' && (
        <div className="chat-input-row">
          <input className="input" placeholder="Napisz…" value={msg} maxLength={200} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="btn secondary" onClick={send}>→</button>
        </div>
      )}
    </div>
  )
}

/* ─── Winner Screen ───────────────────────────────────────────────────── */

function WinnerScreen({ state, myId }: { state: GameState; myId: string }) {
  const winner = state.players.find(p => p.id === state.winner)
  const stats = state.finalStats
  const isWinner = state.winner === myId
  return (
    <div className="winner-screen">
      <div className="winner-card">
        <h2 className="winner-title">{isWinner ? '🏆 Wygrałeś!' : `🏆 ${winner?.name} wygrywa!`}</h2>
        {stats && <div className="winner-stats">
          <h3>Statystyki</h3>
          <div className="stats-grid">
            {stats.players.map((p, i) => (
              <div key={p.id} className={`stat-row ${p.id === myId ? 'me' : ''} ${p.bankrupt ? 'bankrupt' : ''}`}>
                <span className="stat-place">#{i + 1}</span>
                <span className="stat-token" style={{ color: p.color }}>●</span>
                <span className="stat-name">{p.name}</span>
                <span className="stat-money">{p.netWorth} zł</span>
              </div>
            ))}
          </div>
          <div className="stats-summary">
            <p>Tur: {stats.turnsPlayed} · Transakcji: {stats.tradesCompleted} · Obrót: {stats.totalMoneyTransferred} zł</p>
          </div>
        </div>}
      </div>
    </div>
  )
}

/* ─── Main Game Screen ────────────────────────────────────────────────── */

export default function GameScreen({ room, myId }: { room: RoomView; myId: string }) {
  const state = room.game!
  const code = room.code
  const prevLogRef = useRef(state.log.length)
  const { addToast } = useToast()

  useEffect(() => {
    if (state.log.length > prevLogRef.current) {
      const last = state.log[state.log.length - 1]
      if (last.kind === 'big') {
        if (last.text.includes('bankrut')) { sounds.bankrupt(); addToast(last.text, 'error') }
        else if (last.text.includes('wygrywa')) { sounds.win(); addToast(last.text, 'success', 5000) }
        else if (last.text.includes('więzienia')) { sounds.jail(); addToast(last.text, 'warning') }
        else if (last.text.includes('dublet')) { sounds.doubles(); addToast(last.text, 'warning') }
      } else if (last.kind === 'money') {
        if (last.text.includes('płaci')) sounds.moneyLoss()
        else if (last.text.includes('kupuje')) sounds.buyProperty()
        else sounds.moneyGain()
      } else if (last.kind === 'card') { sounds.card(); addToast(last.text, 'info') }
    }
    prevLogRef.current = state.log.length
  }, [state.log.length, addToast])

  const cur = state.players[state.currentIdx]
  const prevTurnRef = useRef(state.currentIdx)
  useEffect(() => {
    if (state.currentIdx !== prevTurnRef.current && cur?.id === myId && state.phase === 'playing') addToast('Twoja tura!', 'info')
    prevTurnRef.current = state.currentIdx
  }, [state.currentIdx, cur?.id, myId, state.phase, addToast])

  if (state.phase === 'finished' && state.winner) return <WinnerScreen state={state} myId={myId} />

  return (
    <div className="screen game">
      <div className="game-layout">
        <div className="game-left"><Board state={state} /></div>
        <div className="game-right">
          <div className="game-header">
            <h2 className="logo small">MEGA<span>POL</span></h2>
            <span className="room-badge">{room.code}</span>
          </div>
          <PlayerList state={state} myId={myId} />
          <ActionPanel state={state} myId={myId} code={code} />
          <PropertyPanel state={state} myId={myId} code={code} />
          <TradeButton state={state} myId={myId} code={code} />
          <TabsPanel state={state} myId={myId} code={code} />
        </div>
      </div>
    </div>
  )
}
