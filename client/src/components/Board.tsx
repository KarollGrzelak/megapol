import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { BOARD, GROUP_COLORS, GROUP_NAMES } from '../../../shared/board'
import { gridPos } from '../../../shared/rules'
import type { GameState, Player } from '../../../shared/types'
import { useGameAnimations, getInterpolatedPosition, type PawnAnimation } from '../animations'

const DICE_FACES: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }

interface TooltipData { x: number; y: number; tile: typeof BOARD[number]; state: GameState }

// ─── Tile ───────────────────────────────────────────────────────────────────

function TileView({ id, state, onHover, landedTile, landedAt }: {
  id: number; state: GameState
  onHover: (d: TooltipData | null, e: React.MouseEvent) => void
  landedTile: number | null; landedAt: number
}) {
  const tile = BOARD[id]
  const prop = state.properties[id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null
  const pos = gridPos(id)
  const isCorner = [0, 10, 20, 30].includes(id)
  const isLanded = landedTile === id && (Date.now() - landedAt) < 1200

  return (
    <div
      className={`tile ${isCorner ? 'corner' : ''} ${prop?.mortgaged ? 'mortgaged' : ''} ${isLanded ? 'landed' : ''}`}
      style={{ gridRow: pos.row, gridColumn: pos.col }}
      onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY, tile, state }, e)}
      onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, tile, state }, e)}
      onMouseLeave={() => onHover(null, null as any)}
    >
      {tile.group && <div className="band" style={{ background: GROUP_COLORS[tile.group] }} />}
      <div className="tile-body">
        <span className="tile-name">{tile.name}</span>
        {tile.price != null && <span className="tile-price">{tile.price}</span>}
        {prop && prop.houses > 0 && (
          <span className="houses">{prop.houses === 5 ? '🏨' : '🏠'.repeat(prop.houses)}</span>
        )}
        {prop?.mortgaged && <span className="lock">🔒</span>}
      </div>
      {owner && <div className="owner-indicator" style={{ background: owner.color }} />}
    </div>
  )
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function PropertyTooltip({ data }: { data: TooltipData }) {
  const { tile, state } = data
  const prop = state.properties[tile.id]
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
          {tile.type === 'street' && <>
            <div className="tt-rent-row"><span>Monopol:</span><span>{tile.rent[0] * 2} zł</span></div>
            {[1, 2, 3, 4, 5].map((h) => (
              <div key={h} className="tt-rent-row"><span>{h === 5 ? 'Hotel' : `${h} dom`}</span><span>{tile.rent![h]} zł</span></div>
            ))}
          </>}
          {tile.type === 'railroad' && [1, 2, 3, 4].map((n) => (
            <div key={n} className="tt-rent-row"><span>{n} dworzec{[2, 3, 4].includes(n) ? 'e' : ''}</span><span>{25 * Math.pow(2, n - 1)} zł</span></div>
          ))}
          {tile.type === 'utility' && <>
            <div className="tt-rent-row"><span>1 użytki:</span><span>4× Kość</span></div>
            <div className="tt-rent-row"><span>2 użytki:</span><span>10× Kość</span></div>
          </>}
        </div>
      )}
      {tile.type === 'tax' && <div style={{ fontSize: '.8rem', color: 'var(--danger)', marginTop: '.2rem' }}>Podatek: {tile.taxAmount} zł</div>}
      {prop?.mortgaged && <div style={{ fontSize: '.75rem', color: 'var(--text3)', marginTop: '.2rem', fontStyle: 'italic' }}>Hipoteka</div>}
    </div>
  )
}

// ─── Board Center ───────────────────────────────────────────────────────────

function BoardCenter({ state, dice, isRolling, displayDice }: {
  state: GameState; dice: [number, number] | null; isRolling: boolean; displayDice: [number, number] | null
}) {
  const cur = state.players[state.currentIdx]

  let actionText = ''
  if (state.phase === 'finished' && state.winner) {
    actionText = `${state.players.find((p) => p.id === state.winner)?.name} wygrywa!`
  } else if (cur) {
    if (state.awaiting === 'roll') actionText = 'Rzuć kośćmi'
    else if (state.awaiting === 'buy') actionText = `Kupić ${BOARD[state.pendingTile!]?.name}?`
    else if (state.awaiting === 'end') actionText = 'Zakończ turę'
    else if (state.auction) actionText = 'Licytacja'
    else if (state.trade) actionText = 'Handel'
  }

  return (
    <div className="board-center">
      <div className="center-logo">MEGA<span>POL</span></div>
      {cur && state.phase === 'playing' && (
        <div className="center-turn">
          <span className="turn-name" style={{ color: cur.color }}>{cur.name}</span>
        </div>
      )}
      <div className="center-dice">
        {displayDice ? (
          <>
            <span className={`die ${isRolling ? 'rolling' : ''} ${!isRolling && dice ? 'landed' : ''}`}>{DICE_FACES[displayDice[0]]}</span>
            <span className={`die ${isRolling ? 'rolling' : ''} ${!isRolling && dice ? 'landed' : ''}`}>{DICE_FACES[displayDice[1]]}</span>
          </>
        ) : (
          <span className="die idle">🎲</span>
        )}
      </div>
      {actionText && <div className="center-action">{actionText}</div>}
    </div>
  )
}

// ─── Main Board ─────────────────────────────────────────────────────────────

export default function Board({ state }: { state: GameState }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const dice = state.dice
  const { animations, checkPawnMovement, startDiceRoll, showGoBonusEffect, showPaymentEffect } = useGameAnimations()
  const [now, setNow] = useState(Date.now())
  const [isRolling, setIsRolling] = useState(false)
  const [rollingStep, setRollingStep] = useState(0)
  const prevDiceRef = useRef('')
  const prevLogLenRef = useRef(state.log.length)

  useEffect(() => {
    let frame: number
    const tick = () => { setNow(Date.now()); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => { checkPawnMovement(state.players) }, [state.players.map(p => `${p.id}:${p.position}`).join(','), checkPawnMovement])

  useEffect(() => {
    const key = dice ? `${dice[0]}-${dice[1]}` : ''
    if (key && key !== prevDiceRef.current) {
      prevDiceRef.current = key
      setIsRolling(true); setRollingStep(0); startDiceRoll()
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
        if (m) {
          const fp = state.players.find(p => p.name === m[1])
          const tp = state.players.find(p => p.name === m[3])
          if (fp && tp) showPaymentEffect(fp.id, tp.id, parseInt(m[2]))
        }
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

  return (
    <div className="board">
      {[...Array(40)].map((_, i) => (
        <TileView key={i} id={i} state={state} onHover={handleHover} landedTile={animations.landedTile} landedAt={animations.landedAt} />
      ))}

      {state.players.filter(p => !p.bankrupt).map(player => {
        const { pos } = getTokenPos(player)
        const gp = gridPos(pos)
        const anim = animations.pawns.get(player.id)
        const isCurrentTurn = state.players[state.currentIdx]?.id === player.id
        return (
          <div key={player.id}
            className={`board-token ${isCurrentTurn ? 'active' : ''} ${anim ? 'moving' : ''}`}
            style={{ gridRow: gp.row, gridColumn: gp.col, '--token-color': player.color, zIndex: isCurrentTurn ? 20 : 10 } as React.CSSProperties}
            title={player.name}
          >{player.token}</div>
        )
      })}

      <BoardCenter state={state} dice={dice} isRolling={isRolling} displayDice={displayDice} />

      {animations.showGoBonus && <div className="go-bonus-effect"><span>+200 zł</span></div>}
      {animations.showPayEffect && (() => {
        const fp = state.players.find(p => p.id === animations.showPayEffect!.from)
        const tp = state.players.find(p => p.id === animations.showPayEffect!.to)
        return (
          <div className="payment-effect">
            <span className="payment-from" style={{ color: fp?.color }}>{fp?.name}</span>
            <span className="payment-arrow">→</span>
            <span className="payment-amount">-{animations.showPayEffect.amount} zł</span>
            <span className="payment-arrow">→</span>
            <span className="payment-to" style={{ color: tp?.color }}>{tp?.name}</span>
          </div>
        )
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
          <span className="p-name">{p.name}{p.inJail && !p.bankrupt ? ' 🔒' : ''}{!p.connected && !p.bankrupt ? ' ⚠' : ''}</span>
          <span className="p-money">{p.bankrupt ? '—' : `${p.money} zł`}</span>
        </div>
      ))}
    </div>
  )
}
