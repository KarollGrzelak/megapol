import { useState, useCallback, useRef } from 'react'
import { BOARD, GROUP_COLORS, GROUP_NAMES } from '../../../shared/board'
import { gridPos, calcRent, ownsWholeGroup } from '../../../shared/rules'
import type { GameState, Player } from '../../../shared/types'

const DICE_FACES: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }

interface TooltipData {
  x: number
  y: number
  tile: typeof BOARD[number]
  state: GameState
}

function TileView({ id, state, onHover }: {
  id: number
  state: GameState
  onHover: (data: TooltipData | null, e: React.MouseEvent) => void
}) {
  const tile = BOARD[id]
  const prop = state.properties[id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null
  const pos = gridPos(id)
  const here = state.players.filter((p) => !p.bankrupt && p.position === id)
  const isCorner = [0, 10, 20, 30].includes(id)

  return (
    <div
      className={`tile ${isCorner ? 'corner' : ''} ${prop?.mortgaged ? 'mortgaged' : ''}`}
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
      <div className="tokens">
        {here.map((p) => (
          <span key={p.id} className={`token ${state.players[state.currentIdx]?.id === p.id ? 'active' : ''}`}
            title={p.name}
            style={{ borderColor: p.color }}>
            {p.token}
          </span>
        ))}
      </div>
    </div>
  )
}

function PropertyTooltip({ data }: { data: TooltipData }) {
  const tile = data.tile
  const state = data.state
  const prop = state.properties[tile.id]
  const owner = prop?.owner ? state.players.find((p) => p.id === prop.owner) : null

  const isProperty = tile.type === 'street' || tile.type === 'railroad' || tile.type === 'utility'

  return (
    <div
      className="tile-tooltip"
      style={{ left: data.x + 15, top: data.y + 15 }}
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
                  <span>{h === 5 ? '🏨 Hotel' : `🏠 ${h} dom${h > 1 ? (h < 5 ? 'ki' : '') : 'ek'}`}:</span>
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
              <div className="tt-rent-row"><span>1 utilisé:</span><span>4× Kość</span></div>
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
      {tile.type === 'chance' && (
        <div style={{ fontSize: '.85rem', color: 'var(--secondary)', marginTop: '.3rem' }}>
          ❓ Karta Szansa — podejmij decyzję!
        </div>
      )}
      {tile.type === 'chest' && (
        <div style={{ fontSize: '.85rem', color: 'var(--secondary)', marginTop: '.3rem' }}>
          📋 Kasa Społeczna — podejmij decyzję!
        </div>
      )}
      {tile.type === 'jail' && (
        <div style={{ fontSize: '.85rem', color: 'var(--text2)', marginTop: '.3rem' }}>
          🔒 Tylko odwiedzasz / Więzienie
        </div>
      )}
      {tile.type === 'parking' && (
        <div style={{ fontSize: '.85rem', color: 'var(--ok)', marginTop: '.3rem' }}>
          🅿️ Darmowy Parking — nic się nie dzieje
        </div>
      )}
      {tile.type === 'gotojail' && (
        <div style={{ fontSize: '.85rem', color: 'var(--danger)', marginTop: '.3rem' }}>
          🚔 Idź do więzienia!
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

export default function Board({ state }: { state: GameState }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const cur = state.players[state.currentIdx]
  const dice = state.dice
  const [isRolling, setIsRolling] = useState(false)
  const prevDiceRef = useRef<string>('')

  const handleHover = useCallback((data: TooltipData | null, e: React.MouseEvent) => {
    if (data) {
      setTooltip(data)
    } else {
      setTooltip(null)
    }
  }, [])

  // Detect dice roll for animation
  const diceKey = dice ? `${dice[0]}-${dice[1]}` : ''
  if (diceKey && diceKey !== prevDiceRef.current) {
    prevDiceRef.current = diceKey
    setIsRolling(true)
    setTimeout(() => setIsRolling(false), 500)
  }

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
      {[...Array(40)].map((_, i) => (
        <TileView key={i} id={i} state={state} onHover={handleHover} />
      ))}
      <div className="board-center">
        <div className="center-logo">MEGA<span>POL</span></div>
        <div className="dice-row">
          {dice ? (
            <>
              <span key={`d1-${dice[0]}`} className={`die ${isRolling ? 'rolling' : ''}`}>
                {DICE_FACES[dice[0]]}
              </span>
              <span key={`d2-${dice[1]}`} className={`die ${isRolling ? 'rolling' : ''}`}>
                {DICE_FACES[dice[1]]}
              </span>
            </>
          ) : (
            <span className="die idle">🎲</span>
          )}
        </div>
        <div className="prompt">{prompt}</div>
      </div>
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
