import { useEffect, useState } from 'react'
import { socket, getPlayerId } from './socket'
import type { RoomView } from '../../shared/types'
import GameScreen from './components/GameScreen'

const myId = getPlayerId()

export function useRoom(): RoomView | null {
  const [room, setRoom] = useState<RoomView | null>(null)
  useEffect(() => {
    const onState = (view: RoomView) => setRoom(view)
    socket.on('state', onState)
    return () => { socket.off('state', onState) }
  }, [])
  return room
}

export default function App() {
  const room = useRoom()
  const [name, setName] = useState(() => localStorage.getItem('megapol-name') || '')
  const [joinCode, setJoinCode] = useState(
    () => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || ''
  )
  const [error, setError] = useState('')

  useEffect(() => {
    const onError = ({ message }: { message: string }) => setError(message)
    socket.on('error-msg', onError)
    return () => { socket.off('error-msg', onError) }
  }, [])

  // automatyczne połączenie przy wejściu z linku ?room=KOD
  useEffect(() => {
    if (!socket.connected) socket.connect()
    return () => { /* zostajemy połączeni */ }
  }, [])

  const saveName = () => {
    localStorage.setItem('megapol-name', name.trim())
    return name.trim() || 'Gracz'
  }

  const create = () => {
    socket.emit('room:create', { name: saveName(), playerId: myId })
  }

  const join = () => {
    if (!joinCode.trim()) return
    socket.emit('room:join', { code: joinCode.trim().toUpperCase(), name: saveName(), playerId: myId })
  }

  if (!room) {
    return (
      <div className="screen home">
        <div className="card">
          <h1 className="logo">MEGA<span>POL</span> 🎲</h1>
          <p className="subtitle">Twój własny monopol online — za darmo</p>
          <input
            className="input"
            placeholder="Twój nick"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn primary big" onClick={create}>Stwórz pokój</button>
          <div className="divider">lub</div>
          <div className="row">
            <input
              className="input code"
              placeholder="KOD POKOJU"
              value={joinCode}
              maxLength={5}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
            <button className="btn secondary" onClick={join}>Dołącz</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  if (!room.game) {
    const isHost = room.hostId === myId
    const link = `${window.location.origin}/?room=${room.code}`
    return (
      <div className="screen home">
        <div className="card">
          <h2>Lobby pokoju</h2>
          <div className="room-code" title="Podaj znajomym ten kod">{room.code}</div>
          <button
            className="btn ghost small"
            onClick={() => navigator.clipboard?.writeText(link)}
          >
            🔗 Kopiuj link zaproszenia
          </button>
          <div className="player-chips">
            {room.players.map((p) => (
              <span key={p.id} className={`chip ${p.connected ? '' : 'off'}`}>
                {p.name}{p.id === room.hostId ? ' 👑' : ''}
              </span>
            ))}
          </div>
          {isHost ? (
            <>
              <label className="label">Startowa gotówka</label>
              <select
                className="input"
                value={room.settings.startMoney}
                onChange={(e) =>
                  socket.emit('room:start-money', { code: room.code, amount: Number(e.target.value) })
                }
              >
                {[1000, 1500, 2000, 2500].map((v) => (
                  <option key={v} value={v}>{v} zł</option>
                ))}
              </select>
              <button
                className="btn primary big"
                disabled={room.players.length < 2}
                onClick={() => socket.emit('game:start', { code: room.code })}
              >
                {room.players.length < 2 ? 'Czekam na graczy (min. 2)…' : 'Rozpocznij grę!'}
              </button>
            </>
          ) : (
            <p className="subtitle">Czekaj, aż gospodarz rozpocznie grę…</p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  return <GameScreen room={room} myId={myId} />
}
