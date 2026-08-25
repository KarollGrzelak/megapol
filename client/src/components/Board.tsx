import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { BOARD, GROUP_COLORS, GROUP_NAMES } from '../../../shared/board'
import { gridPos, calcRent, ownsWholeGroup } from '../../../shared/rules'
import type { GameState, Player } from '../../../shared/types'
import { useGameAnimations, getInterpolatedPosition, calculatePath, type PawnAnimation } from '../animations'

const DICE_FACES: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }

interface TooltipData {
  x: number
  y: number
  tile: typeof BOARD[number]
  state: GameState
}

// ─── Animowany pionek ──────────────────────────────────────────────────────

function AnimatedToken({
  player,
  animation,
  isCurrentTurn,
  now
}: {
  player: Player
  animation: PawnAnimation | undefined
  isCurrentTurn: boolean
  now: number
}) {
  if (animation) {
    const { pos } = getInterpolatedPosition(animation, now)
    const gridPosNow = gridPos(pos)
    return (
      <span
        className={`token ${isCurrentTurn ? 'active' : ''} animating`}
        title={player.name}
        style={{
          borderColor: player.color,
          gridRow: gridPosNow.row,
          gridColumn: gridPosNow.col,
          transition: 'none'
        }}
      >
        {player.token}
      </span>
    )
  }

  const pos = gridPos(player.position)
  return (
    <span
      className={`token ${isCurrentTurn ? 'active' : ''}`}
      title={player.name}
      style={{
        borderColor: player.color,
        gridRow: pos.row,
        gridColumn: pos.col
      }}
    >
      {player.token}
    </span>
  )
}

// ─── Widok pola ────────────────────────────────────────────────────────────

function TileView({ id, state, onHover, landedTile, landedAt }: {
  id: number
  state: GameState
  onHover: (data: TooltipData | null, e: React.MouseEvent) => void
  landedTile: number | null
  landedAt: number
}) {
  const tile = BOARD[id]
  const prop = state.properties[id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null
  const pos = gridPos(id)
  const here = state.players.filter((p) => !p.bankrupt && p.position === id)
  const isCorner = [0, 10, 20, 30].includes(id)
  const isLanded = landedTile === id && (Date.now() - landedAt) < 1500

  return (
    <div
      className={`tile ${isCorner ? 'corner' : ''} ${prop?.mortgaged ? 'mortgaged' : ''} ${isLanded ? 'landed' : ''}`}
      style={{ gridRow: pos.row, gridColumn: pos.col }}
      onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY, tile, state }, e)}
      onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, tile, state }, e)}
      onMouseLeave={() => onHover(null, null as any)}
    >
      {tile.group && (
        <div className="band" style={{ background: GROUP_COLORS[tile.group] }} />
      )}
      <div className="tile-body">
        <span className="tile-name">{tile.name}</span>
        {tile.price != null && <span className="tile-price">{tile.price}</span>}
        {prop && prop.houses > 0 && (
          <span className="houses">{prop.houses === 5 ? '🏨' : '🏠'.repeat(prop.houses)}</span>
        )}
        {prop?.mortgaged && <span className="lock">🔒</span>}
      </div>
      {owner && (
        <div className="owner-dot" style={{ background: owner.color }} />
      )}
      {/* Tokeny renderedowane na poziomie board, nie w tile */}
    </div>
  )
}

// ─── Tooltip nieruchomości ──────────────────────────────────────────────────

function PropertyTooltip({ data }: { data: TooltipData }) {
  const tile = data.tile
  const state = data.state
  const prop = state.properties[tile.id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null

  const isProperty = tile.type === 'street' || tile.type === 'railroad' || tile.type === 'utility'

  return (
    <div
      className="tile-tooltip"
      style={{ left: Math.min(data.x + 15, window.innerWidth - 250), top: Math.min(data.y + 15, window.innerHeight - 300) }}
    >
      <div className="tt-name" style={{ color: tile.group ? GROUP_COLORS[tile.group] : undefined }}>
        {tile.name}
      </div>
      {tile.group && (
        <div className="tt-group">{GROUP_NAMES[tile.group]}</div>
      )}
      {tile.price != null && (
        <div className="tt-price">💰 {tile.price} zł</div>
      )}
      {owner && (
        <div style={{ fontSize: '.8rem', color: 'var(--text2)', marginBottom: '.4rem' }}>
          Właściciel: <span style={{ color: owner.color, fontWeight: 600 }}>{owner.name}</span>
        </div>
      )}
      {isProperty && tile.rent && (
        <div style={{ marginTop: '.4rem' }}>
          <div className="tt-rent-row">
            <span>Czynsz (pusty):</span>
            <span>{tile.rent[0]} zł</span>
          </div>
          {tile.type === 'street' && (
            <>
              <div className="tt-rent-row">
                <span>Monopol (×2):</span>
                <span>{tile.rent[0] * 2} zł</span>
              </div>
              {[1, 2, 3, 4, 5].map((h) => (
                <div key={h} className="tt-rent-row">
                  <span>{h === 5 ? '🏨 Hotel' : `🏠 ${h} dom`}</span>
                  <span>{tile.rent![h]} zł</span>
                </div>
              ))}
            </>
          )}
          {tile.type === 'railroad' && (
            <>
              <div className="tt-rent-row"><span>1 dworzec:</span><span>25 zł</span></div>
              <div className="tt-rent-row"><span>2 dworce:</span><span>50 zł</span></div>
              <div className="tt-rent-row"><span>3 dworce:</span><span>100 zł</span></div>
              <div className="tt-rent-row"><span>4 dworce:</span><span>200 zł</span></div>
            </>
          )}
          {tile.type === 'utility' && (
            <>
              <div className="tt-rent-row"><span>1 utilise:</span><span>4× Kość</span></div>
              <div className="tt-rent-row"><span>2 użytki:</span><span>10× Kość</span></div>
            </>
          )}
        </div>
      )}
      {tile.type === 'tax' && (
        <div style={{ fontSize: '.85rem', color: 'var(--danger)', marginTop: '.3rem' }}>
          💸 Podatek: {tile.taxAmount} zł
        </div>
      )}
      {prop?.mortgaged && (
        <div style={{ fontSize: '.8rem', color: 'var(--text3)', marginTop: '.3rem', fontStyle: 'italic' }}>
          🔒 Obciążone hipoteką
        </div>
      )}
    </div>
  )
}

// ─── Efekt GO bonus ────────────────────────────────────────────────────────

function GoBonusEffect({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="go-bonus-effect">
      <span>+200 zł</span>
    </div>
  )
}

// ─── Efekt płatności ───────────────────────────────────────────────────────

function PaymentEffect({ from, to, amount, players }: {
  from: string
  to: string
  amount: number
  players: Player[]
}) {
  const fromPlayer = players.find(p => p.id === from)
  const toPlayer = players.find(p => p.id === to)
  return (
    <div className="payment-effect">
      <span className="payment-from" style={{ color: fromPlayer?.color }}>
        {fromPlayer?.name}
      </span>
      <span className="payment-arrow">→</span>
      <span className="payment-amount">-{amount} zł</span>
      <span className="payment-arrow">→</span>
      <span className="payment-to" style={{ color: toPlayer?.color }}>
        {toPlayer?.name}
      </span>
    </div>
  )
}

// ─── Główny komponent Board ─────────────────────────────────────────────────

export default function Board({ state }: { state: GameState }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const cur = state.players[state.currentIdx]
  const dice = state.dice
  const {
    animations,
    checkPawnMovement,
    startDiceRoll,
    showGoBonusEffect,
    showPaymentEffect
  } = useGameAnimations()

  const [now, setNow] = useState(Date.now())
  const [rollingStep, setRollingStep] = useState(0)
  const [isRolling, setIsRolling] = useState(false)
  const prevDiceRef = useRef<string>('')
  const prevLogLenRef = useRef(state.log.length)
  const prevPositionsRef = useRef<Map<string, number>>(new Map())

  // Animacja pętli dla płynnych ruchów
  useEffect(() => {
    let frame: number
    const tick = () => {
      setNow(Date.now())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Wykryj zmianę pozycji graczy
  useEffect(() => {
    checkPawnMovement(state.players)
  }, [state.players.map(p => `${p.id}:${p.position}`).join(','), checkPawnMovement])

  // Animacja kości
  useEffect(() => {
    const diceKey = dice ? `${dice[0]}-${dice[1]}` : ''
    if (diceKey && diceKey !== prevDiceRef.current) {
      prevDiceRef.current = diceKey
      setIsRolling(true)
      setRollingStep(0)
      startDiceRoll()

      // Animacja przeskakiwania liczb
      const interval = setInterval(() => {
        setRollingStep(prev => prev + 1)
      }, 80)

      setTimeout(() => {
        setIsRolling(false)
        clearInterval(interval)
      }, 800)
    }
  }, [dice, startDiceRoll])

  // Wykryj efekty z logów
  useEffect(() => {
    if (state.log.length > prevLogLenRef.current) {
      const lastLog = state.log[state.log.length - 1]
      if (lastLog.text.includes('przechodzi przez START')) {
        showGoBonusEffect()
      }
      if (lastLog.text.includes('płaci') && lastLog.text.includes('czynszu')) {
        // Wyciągnij dane z loga
        const match = lastLog.text.match(/(\w+) płaci (\d+) czynszu graczowi (\w+)/)
        if (match) {
          const fromPlayer = state.players.find(p => p.name === match[1])
          const toPlayer = state.players.find(p => p.name === match[3])
          if (fromPlayer && toPlayer) {
            showPaymentEffect(fromPlayer.id, toPlayer.id, parseInt(match[2]))
          }
        }
      }
    }
    prevLogLenRef.current = state.log.length
  }, [state.log.length, state.log, state.players, showGoBonusEffect, showPaymentEffect])

  const handleHover = useCallback((data: TooltipData | null, e: React.MouseEvent) => {
    setTooltip(data)
  }, [])

  // Pobierz animowaną pozycję pionka
  const getTokenPosition = useCallback((player: Player) => {
    const anim = animations.pawns.get(player.id)
    if (anim) {
      return getInterpolatedPosition(anim, now)
    }
    return { pos: player.position, progress: 1, stepIdx: 0 }
  }, [animations.pawns, now])

  // Wygeneruj losowe kości podczas animacji
  const displayDice = useMemo(() => {
    if (!dice) return null
    if (isRolling) {
      return [
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6)
      ] as [number, number]
    }
    return dice
  }, [dice, isRolling, rollingStep])

  let prompt = ''
  if (state.phase === 'finished' && state.winner) {
    prompt = `🏆 ${state.players.find((p) => p.id === state.winner)?.name} wygrywa!`
  } else if (cur) {
    if (state.auction) prompt = '🔨 Licytacja w toku'
    else if (state.trade) prompt = '🤝 Propozycja handlu'
    else if (state.awaiting === 'buy') prompt = `${cur.name}: kupić ${BOARD[state.pendingTile!]?.name}?`
    else if (state.awaiting === 'end') prompt = `${cur.name}: koniec tury`
    else prompt = `${cur.name}: rzuć kośćmi`
  }

  return (
    <div className="board">
      {/* Pola planszy */}
      {[...Array(40)].map((_, i) => (
        <TileView
          key={i}
          id={i}
          state={state}
          onHover={handleHover}
          landedTile={animations.landedTile}
          landedAt={animations.landedAt}
        />
      ))}

      {/* Animowane pionki */}
      {state.players.filter(p => !p.bankrupt).map(player => {
        const { pos } = getTokenPosition(player)
        const gridPosNow = gridPos(pos)
        const anim = animations.pawns.get(player.id)
        const isMoving = !!anim
        const isCurrentTurn = state.players[state.currentIdx]?.id === player.id

        return (
          <div
            key={player.id}
            className={`board-token ${isCurrentTurn ? 'active' : ''} ${isMoving ? 'moving' : ''}`}
            style={{
              gridRow: gridPosNow.row,
              gridColumn: gridPosNow.col,
              '--token-color': player.color,
              zIndex: isCurrentTurn ? 20 : 10
            } as React.CSSProperties}
            title={player.name}
          >
            {player.token}
          </div>
        )
      })}

      {/* Centrum planszy */}
      <div className="board-center">
        <div className="center-logo">MEGA<span>POL</span></div>

        {/* Kości */}
        <div className="dice-row">
          {displayDice ? (
            <>
              <span className={`die ${isRolling ? 'rolling' : ''} ${!isRolling && dice ? 'landed' : ''}`}>
                {DICE_FACES[displayDice[0]]}
              </span>
              <span className={`die ${isRolling ? 'rolling' : ''} ${!isRolling && dice ? 'landed' : ''}`}>
                {DICE_FACES[displayDice[1]]}
              </span>
            </>
          ) : (
            <span className="die idle">🎲</span>
          )}
        </div>

        <div className="prompt">{prompt}</div>
      </div>

      {/* Efekty */}
      <GoBonusEffect show={animations.showGoBonus} />

      {animations.showPayEffect && (
        <PaymentEffect
          from={animations.showPayEffect.from}
          to={animations.showPayEffect.to}
          amount={animations.showPayEffect.amount}
          players={state.players}
        />
      )}

      {/* Tooltip */}
      {tooltip && <PropertyTooltip data={tooltip} />}
    </div>
  )
}

export function PlayerList({ state, myId }: { state: GameState; myId: string }) {
  return (
    <div className="players">
      {state.players.map((p: Player) => (
        <div
          key={p.id}
          className={`player-row ${p.id === myId ? 'me' : ''} ${p.bankrupt ? 'bankrupt' : ''} ${
            state.players[state.currentIdx]?.id === p.id && state.phase === 'playing' ? 'turn' : ''
          }`}
        >
          <span className="token small" style={{ borderColor: p.color }}>{p.token}</span>
          <span className="p-name">
            {p.name}{p.inJail && !p.bankrupt ? ' 🔒' : ''}
            {!p.connected && !p.bankrupt ? ' (offline)' : ''}
          </span>
          <span className="p-money">{p.bankrupt ? '— bankrut —' : `${p.money} zł`}</span>
        </div>
      ))}
    </div>
  )
}
