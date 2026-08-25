import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { BOARD, GROUP_COLORS, GROUP_NAMES } from '../../../shared/board'
import { gridPos } from '../../../shared/rules'
import type { GameState, Player } from '../../../shared/types'
import { useGameAnimations, getInterpolatedPosition, type PawnAnimation } from '../animations'
import { socket } from '../socket'
import { sounds } from '../sounds'
import { useToast } from './Toast'

const DICE_FACES: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }

const CORNER_CLASSES: Record<number, string> = { 0: 'corner-go', 10: 'corner-jail', 20: 'corner-parking', 30: 'corner-gotojail' }
const CORNER_ICONS: Record<number, string> = { 0: '➡', 10: '🔒', 20: '🅿', 30: '👮' }

interface TooltipData { x: number; y: number; tile: typeof BOARD[number]; state: GameState }

function TileView({ id, state, onHover, landedTile, landedAt }: {
  id: number; state: GameState; onHover: (d: TooltipData | null, e: React.MouseEvent) => void; landedTile: number | null; landedAt: number
}) {
  const tile = BOARD[id]; const prop = state.properties[id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null
  const pos = gridPos(id); const isCorner = [0, 10, 20, 30].includes(id)
  const isLanded = landedTile === id && (Date.now() - landedAt) < 1200
  return (
    <div className={`tile ${isCorner ? 'corner' : ''} ${CORNER_CLASSES[id] || ''} ${prop?.mortgaged ? 'mortgaged' : ''} ${isLanded ? 'landed' : ''}`}
      style={{ gridRow: pos.row, gridColumn: pos.col }}
      onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY, tile, state }, e)}
      onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, tile, state }, e)}
      onMouseLeave={() => onHover(null, null as any)}>
      {tile.group && <div className="band" style={{ background: GROUP_COLORS[tile.group] }} />}
      <div className="tile-body">
        {isCorner ? (
          <><span className="tile-name" style={{ fontSize: 'clamp(6px, 1.2vw, 12px)' }}>{tile.name.split('/')[0].trim()}</span>
          <span style={{ fontSize: 'clamp(10px, 2vw, 20px)', marginTop: '2px' }}>{CORNER_ICONS[id]}</span></>
        ) : (<><span className="tile-name">{tile.name}</span>{tile.price != null && <span className="tile-price">{tile.price} zł</span>}</>)}
        {!isCorner && prop && prop.houses > 0 && <span className="houses">{prop.houses === 5 ? '🏨' : '🏠'.repeat(prop.houses)}</span>}
        {prop?.mortgaged && <span className="lock">🔒</span>}
      </div>
      {owner && !isCorner && <div className="owner-indicator" style={{ background: owner.color }} />}
    </div>
  )
}

function PropertyTooltip({ data }: { data: TooltipData }) {
  const { tile, state } = data; const prop = state.properties[tile.id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null
  const isProp = tile.type === 'street' || tile.type === 'railroad' || tile.type === 'utility'
  return (
    <div className="tile-tooltip" style={{ left: Math.min(data.x + 12, window.innerWidth - 220), top: Math.min(data.y + 12, window.innerHeight - 280) }}>
      <div className="tt-name" style={{ color: tile.group ? GROUP_COLORS[tile.group] : undefined }}>{tile.name}</div>
      {tile.group && <div className="tt-group">{GROUP_NAMES[tile.group]}</div>}
      {tile.price != null && <div className="tt-price">{tile.price} zł</div>}
      {owner && <div style={{ fontSize: '.75rem', color: 'var(--text2)', marginBottom: '.3rem' }}>Właściciel: <span style={{ color: owner.color, fontWeight: 600 }}>{owner.name}</span></div>}
      {isProp && tile.rent && (
        <div style={{ marginTop: '.3rem' }}>
          <div className="tt-rent-row"><span>Pusty:</span><span>{tile.rent[0]} zł</span></div>
          {tile.type === 'street' && <><div className="tt-rent-row"><span>Monopol:</span><span>{tile.rent[0] * 2} zł</span></div>
            {[1, 2, 3, 4, 5].map((h) => <div key={h} className="tt-rent-row"><span>{h === 5 ? 'Hotel' : `${h} dom`}</span><span>{tile.rent![h]} zł</span></div>)}</>}
          {tile.type === 'railroad' && [1, 2, 3, 4].map((n) => <div key={n} className="tt-rent-row"><span>{n} dworzec{[2, 3, 4].includes(n) ? 'e' : ''}</span><span>{25 * Math.pow(2, n - 1)} zł</span></div>)}
          {tile.type === 'utility' && <><div className="tt-rent-row"><span>1 użytki:</span><span>4× Kość</span></div><div className="tt-rent-row"><span>2 użytki:</span><span>10× Kość</span></div></>}
        </div>
      )}
      {tile.type === 'tax' && <div style={{ fontSize: '.8rem', color: 'var(--danger)', marginTop: '.2rem' }}>Podatek: {tile.taxAmount} zł</div>}
      {prop?.mortgaged && <div style={{ fontSize: '.75rem', color: 'var(--text3)', marginTop: '.2rem', fontStyle: 'italic' }}>Hipoteka</div>}
    </div>
  )
}

// ─── Board Center — CLEAN: logo + dice + CTA only, NO log ──────────────────

function BoardCenter({ state, dice, isRolling, displayDice, myId, code }: {
  state: GameState; dice: [number, number] | null; isRolling: boolean
  displayDice: [number, number] | null; myId: string; code: string
}) {
  const cur = state.players[state.currentIdx]; const isMyTurn = cur?.id === myId
  const me = state.players.find(p => p.id === myId)
  const { addToast } = useToast()

  const act = (action: Record<string, unknown>) => {
    const type = action.type as string
    if (type === 'roll') sounds.diceRoll()
    else if (type === 'buy') { sounds.buyProperty(); addToast('Kupiono!', 'success') }
    else if (type === 'end-turn') sounds.turnStart()
    socket.emit('action', { code, action })
  }

  let actionText = '', actionContext = ''
  if (state.phase === 'finished' && state.winner) {
    actionText = `${state.players.find((p) => p.id === state.winner)?.name} wygrywa!`; actionContext = '🏆'
  } else if (cur) {
    if (state.awaiting === 'roll') { actionText = isMyTurn ? 'Rzuć kośćmi' : `${cur.name} rzuca...`; actionContext = '🎲' }
    else if (state.awaiting === 'buy') { actionText = `Kupić ${BOARD[state.pendingTile!]?.name}?`; actionContext = '🏷' }
    else if (state.awaiting === 'end') { actionText = isMyTurn ? 'Zakończ turę' : `${cur.name} kończy turę`; actionContext = '⏱' }
    else if (state.auction) { actionText = 'Licytacja'; actionContext = '🔨' }
    else if (state.trade) { actionText = 'Handel'; actionContext = '🤝' }
  }

  const diceResult = useMemo(() => {
    if (!dice || isRolling) return null
    const sum = dice[0] + dice[1]
    return dice[0] === dice[1] ? `Dublet! ${sum}` : `Wyrzuciłeś ${sum}`
  }, [dice, isRolling])

  const lastCard = state.lastCard
  const showRollCTA = isMyTurn && state.awaiting === 'roll' && !state.auction && !state.trade && !me?.inJail
  const showEndCTA = isMyTurn && state.awaiting === 'end'
  const showBuyCTA = isMyTurn && state.awaiting === 'buy' && state.pendingTile != null

  return (
    <div className="board-center">
      <div className="center-top">
        <div className="center-logo">MEGA<span>POL</span></div>
        {cur && state.phase === 'playing' && (
          <div className="center-turn">
            <span className="turn-name" style={{ color: cur.color }}>{cur.name}</span>
            {isMyTurn && <span className="turn-mine">Twoja tura</span>}
          </div>
        )}
      </div>

      <div className="center-dice">
        {displayDice ? (
          <><span className={`die ${isRolling ? 'rolling' : ''} ${!isRolling && dice ? 'landed' : ''}`}>{DICE_FACES[displayDice[0]]}</span>
          <span className={`die ${isRolling ? 'rolling' : ''} ${!isRolling && dice ? 'landed' : ''}`}>{DICE_FACES[displayDice[1]]}</span></>
        ) : <span className="die idle">🎲</span>}
      </div>

      {diceResult && !isRolling && (
        <div className={`center-dice-result ${dice && dice[0] === dice[1] ? 'doubles' : ''}`}>{diceResult}</div>
      )}

      {actionText && !diceResult && !showRollCTA && !showEndCTA && !showBuyCTA && (
        <div className="center-action">{actionContext} {actionText}</div>
      )}

      {showRollCTA && <button className="btn center-action-btn roll-cta" onClick={() => act({ type: 'roll' })}>🎲 Rzuć kośćmi</button>}
      {showEndCTA && <button className="btn center-action-btn end-cta" onClick={() => act({ type: 'end-turn' })}>⏱ Zakończ turę</button>}
      {showBuyCTA && me && (() => {
        const tile = BOARD[state.pendingTile!]; const canAfford = me.money >= (tile.price ?? 0)
        return (
          <div style={{ display: 'flex', gap: '.3rem', width: '100%', maxWidth: '90%', marginTop: '.1rem' }}>
            <button className="btn center-action-btn buy-cta" style={{ flex: 2 }} disabled={!canAfford} onClick={() => act({ type: 'buy' })}>
              🏷 {canAfford ? `Kup za ${tile.price} zł` : 'Brak środków'}
            </button>
            <button className="btn center-action-btn" style={{ flex: 1, background: 'var(--surface3)', color: 'var(--text2)', boxShadow: 'none' }} onClick={() => act({ type: 'decline-buy' })}>Odmów</button>
          </div>
        )
      })()}

      {lastCard && <div className="center-card-msg">{lastCard.playerName}: {lastCard.text}</div>}

      {me && state.phase === 'playing' && (
        <div className="center-money">{isMyTurn ? `💰 ${me.money} zł` : `${cur?.name}: 💰 ${cur?.money} zł`}</div>
      )}
    </div>
  )
}

function getPawnOffset(playerIdx: number, totalOnTile: number): { row: number; col: number } {
  if (totalOnTile <= 1) return { row: 0, col: 0 }
  return [[-0.15, -0.15], [-0.15, 0.15], [0.15, -0.15], [0.15, 0.15], [0, 0]][playerIdx % 5].reduce((a, v) => ({ row: a.row, col: a.col }), { row: 0, col: 0 }) || { row: 0, col: 0 }
}

export default function Board({ state, myId, code }: { state: GameState; myId: string; code: string }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const dice = state.dice
  const { animations, checkPawnMovement, startDiceRoll, showGoBonusEffect, showPaymentEffect } = useGameAnimations()
  const [now, setNow] = useState(Date.now())
  const [isRolling, setIsRolling] = useState(false)
  const [rollingStep, setRollingStep] = useState(0)
  const prevDiceRef = useRef('')
  const prevLogLenRef = useRef(state.log.length)

  useEffect(() => { let f: number; const t = () => { setNow(Date.now()); f = requestAnimationFrame(t) }; f = requestAnimationFrame(t); return () => cancelAnimationFrame(f) }, [])
  useEffect(() => { checkPawnMovement(state.players) }, [state.players.map(p => `${p.id}:${p.position}`).join(','), checkPawnMovement])
  useEffect(() => {
    const key = dice ? `${dice[0]}-${dice[1]}` : ''
    if (key && key !== prevDiceRef.current) {
      prevDiceRef.current = key; setIsRolling(true); setRollingStep(0); startDiceRoll()
      const iv = setInterval(() => setRollingStep(p => p + 1), 80)
      setTimeout(() => { setIsRolling(false); clearInterval(iv) }, 800)
    }
  }, [dice, startDiceRoll])
  useEffect(() => {
    if (state.log.length > prevLogLenRef.current) {
      const last = state.log[state.log.length - 1]
      if (last.text.includes('przechodzi przez START')) showGoBonusEffect()
      if (last.text.includes('płaci') && last.text.includes('czynszu')) {
        const m = last.text.match(/(\w+) płaci (\d+) czynszu graczowi (\w+)/)
        if (m) { const fp = state.players.find(p => p.name === m[1]); const tp = state.players.find(p => p.name === m[3]); if (fp && tp) showPaymentEffect(fp.id, tp.id, parseInt(m[2])) }
      }
    }
    prevLogLenRef.current = state.log.length
  }, [state.log.length, state.log, state.players, showGoBonusEffect, showPaymentEffect])

  const handleHover = useCallback((d: TooltipData | null) => setTooltip(d), [])
  const getTokenPos = useCallback((player: Player) => {
    const anim = animations.pawns.get(player.id)
    return anim ? getInterpolatedPosition(anim, now) : { pos: player.position, progress: 1, stepIdx: 0 }
  }, [animations.pawns, now])
  const displayDice = useMemo(() => {
    if (!dice) return null
    if (isRolling) return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)] as [number, number]
    return dice
  }, [dice, isRolling, rollingStep])
  const playersPerTile = useMemo(() => {
    const c = new Map<number, number>()
    state.players.filter(p => !p.bankrupt).forEach(p => { const pos = animations.pawns.get(p.id) ? getInterpolatedPosition(animations.pawns.get(p.id)!, now).pos : p.position; c.set(pos, (c.get(pos) || 0) + 1) })
    return c
  }, [state.players, animations.pawns, now])
  const tilePlayerIdx = useMemo(() => {
    const m = new Map<string, number>(); const tc = new Map<number, number>()
    state.players.filter(p => !p.bankrupt).forEach(p => { const pos = animations.pawns.get(p.id) ? getInterpolatedPosition(animations.pawns.get(p.id)!, now).pos : p.position; const c = tc.get(pos) || 0; m.set(p.id, c); tc.set(pos, c + 1) })
    return m
  }, [state.players, animations.pawns, now])

  return (
    <div className="board">
      {[...Array(40)].map((_, i) => <TileView key={i} id={i} state={state} onHover={handleHover} landedTile={animations.landedTile} landedAt={animations.landedAt} />)}
      {state.players.filter(p => !p.bankrupt).map((player, pi) => {
        const { pos } = getTokenPos(player); const gp = gridPos(pos); const anim = animations.pawns.get(player.id)
        const isCurrentTurn = state.players[state.currentIdx]?.id === player.id
        const totalOnTile = playersPerTile.get(pos) || 1; const myIdx = tilePlayerIdx.get(player.id) || 0
        const positions = [[-0.15, -0.15], [-0.15, 0.15], [0.15, -0.15], [0.15, 0.15], [0, 0]]
        const off = positions[myIdx % 5]
        return (
          <div key={player.id} className={`board-token ${isCurrentTurn ? 'active' : ''} ${anim ? 'moving' : ''}`}
            style={{ gridRow: gp.row + (totalOnTile > 1 ? off[0] * 0.3 : 0), gridColumn: gp.col + (totalOnTile > 1 ? off[1] * 0.3 : 0), '--token-color': player.color, zIndex: isCurrentTurn ? 20 : 10 + pi } as React.CSSProperties}
            title={player.name}>{player.token}</div>
        )
      })}
      <BoardCenter state={state} dice={dice} isRolling={isRolling} displayDice={displayDice} myId={myId} code={code} />
      {animations.showGoBonus && <div className="go-bonus-effect"><span>+200 zł</span></div>}
      {animations.showPayEffect && (() => {
        const fp = state.players.find(p => p.id === animations.showPayEffect!.from); const tp = state.players.find(p => p.id === animations.showPayEffect!.to)
        return <div className="payment-effect"><span className="payment-from" style={{ color: fp?.color }}>{fp?.name}</span><span className="payment-arrow">→</span><span className="payment-amount">-{animations.showPayEffect.amount} zł</span><span className="payment-arrow">→</span><span className="payment-to" style={{ color: tp?.color }}>{tp?.name}</span></div>
      })()}
      {tooltip && <PropertyTooltip data={tooltip} />}
    </div>
  )
}

export function PlayerList({ state, myId }: { state: GameState; myId: string }) {
  return (
    <div className="players">
      {state.players.map((p: Player) => (
        <div key={p.id} className={`player-row ${p.id === myId ? 'me' : ''} ${p.bankrupt ? 'bankrupt' : ''} ${state.players[state.currentIdx]?.id === p.id && state.phase === 'playing' ? 'turn' : ''}`}>
          <span className="token small" style={{ borderColor: p.color }}>{p.token}</span>
          <span className="p-name">{p.name}{p.inJail && !p.bankrupt ? ' 🔒' : ''}{!p.connected && !p.bankrupt ? ' ⚠' : ''}{(p as any).isBot && ' 🤖'}</span>
          <span className="p-money">{p.bankrupt ? 'bankrut' : `${p.money} zł`}</span>
        </div>
      ))}
    </div>
  )
}
