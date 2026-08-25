import { BOARD, GROUP_COLORS } from '../../../shared/board'
import { gridPos } from '../../../shared/rules'
import type { GameState, Player } from '../../../shared/types'

const DICE_FACES: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }

function TileView({ id, state }: { id: number; state: GameState }) {
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

export default function Board({ state }: { state: GameState }) {
  const cur = state.players[state.currentIdx]
  const dice = state.dice

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
        <TileView key={i} id={i} state={state} />
      ))}
      <div className="board-center">
        <div className="center-logo">MEGA<span>POL</span></div>
        <div className="dice-row">
          {dice ? (
            <>
              <span key={dice[0]} className="die">{DICE_FACES[dice[0]]}</span>
              <span key={dice[1]} className="die">{DICE_FACES[dice[1]]}</span>
            </>
          ) : (
            <span className="die idle">🎲</span>
          )}
        </div>
        <div className="prompt">{prompt}</div>
      </div>
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
