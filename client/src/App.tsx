import { useEffect, useState, useCallback } from 'react'
import { socket, getPlayerId, saveRoomCode, getSavedRoomCode, clearRoomCode } from './socket'
import type { RoomView } from '../../shared/types'
import GameScreen from './components/GameScreen'
import { ToastProvider, useToast } from './components/Toast'

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

/** Hook do śledzenia stanu połączenia */
function useConnectionStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>(
    socket.connected ? 'connected' : 'disconnected'
  )
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  useEffect(() => {
    const onConnect = () => {
      setStatus('connected')
      setReconnectAttempt(0)
    }
    const onDisconnect = () => {
      setStatus('disconnected')
    }
    const onReconnectAttempt = (attempt: number) => {
      setStatus('reconnecting')
      setReconnectAttempt(attempt)
    }
    const onReconnect = () => {
      setStatus('connected')
      setReconnectAttempt(0)
    }
    const onReconnectFailed = () => {
      setStatus('disconnected')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.io.on('reconnect_attempt', onReconnectAttempt)
    socket.io.on('reconnect', onReconnect)
    socket.io.on('reconnect_failed', onReconnectFailed)

    // Sprawdź obecny stan
    if (socket.connected) setStatus('connected')

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.io.off('reconnect_attempt', onReconnectAttempt)
      socket.io.off('reconnect', onReconnect)
      socket.io.off('reconnect_failed', onReconnectFailed)
    }
  }, [])

  return { status, reconnectAttempt }
}

function AppInner() {
  const room = useRoom()
  const [name, setName] = useState(() => localStorage.getItem('megapol-name') || '')
  const [joinCode, setJoinCode] = useState(
    () => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || ''
  )
  const [error, setError] = useState('')
  const [isReconnecting, setIsReconnecting] = useState(false)
  const { addToast } = useToast()
  const { status, reconnectAttempt } = useConnectionStatus()

  // Auto-connect i reconnect
  useEffect(() => {
    if (!socket.connected) {
      socket.connect()
    }

    const onConnect = () => {
      // Po połączeniu/reconnect — sprawdź czy mamy zapisany pokój
      const savedCode = getSavedRoomCode()
      if (savedCode && !room) {
        setIsReconnecting(true)
        const savedName = localStorage.getItem('megapol-name') || 'Gracz'
        socket.emit('room:join', {
          code: savedCode,
          name: savedName,
          playerId: myId
        })
      }
    }

    const onDisconnect = () => {
      setIsReconnecting(false)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    // Jeśli już jesteśmy połączeni i mamy zapisany pokój
    if (socket.connected) {
      const savedCode = getSavedRoomCode()
      if (savedCode && !room) {
        setIsReconnecting(true)
        const savedName = localStorage.getItem('megapol-name') || 'Gracz'
        socket.emit('room:join', {
          code: savedCode,
          name: savedName,
          playerId: myId
        })
      }
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Gdy dołączymy do pokoju — zapisz kod
  useEffect(() => {
    if (room?.code) {
      saveRoomCode(room.code)
      setIsReconnecting(false)
    }
  }, [room?.code])

  // Obsługa błędów
  useEffect(() => {
    const onError = ({ message }: { message: string }) => {
      setError(message)
      addToast(message, 'error')
      // Jeśli błąd to "pokój nie istnieje" — wyczyść zapisany kod
      if (message.includes('Nie ma takiego pokoju')) {
        clearRoomCode()
      }
    }
    socket.on('error-msg', onError)
    return () => { socket.off('error-msg', onError) }
  }, [addToast])

  const saveName = useCallback(() => {
    localStorage.setItem('megapol-name', name.trim())
    return name.trim() || 'Gracz'
  }, [name])

  const create = () => {
    socket.emit('room:create', { name: saveName(), playerId: myId })
  }

  const join = () => {
    if (!joinCode.trim()) return
    socket.emit('room:join', { code: joinCode.trim().toUpperCase(), name: saveName(), playerId: myId })
  }

  const leaveRoom = () => {
    socket.emit('leave-room')
    clearRoomCode()
  }

  // Overlay reconnecting
  if (status === 'reconnecting') {
    return (
      <div className="screen home">
        <div className="card reconnect-card">
          <div className="reconnect-spinner" />
          <h2>Ponowne łączenie...</h2>
          <p className="subtitle">Próba {reconnectAttempt}/20</p>
          <p className="subtitle">Trwa przywracanie połączenia z serwerem</p>
        </div>
      </div>
    )
  }

  if (status === 'disconnected' && !socket.connected) {
    return (
      <div className="screen home">
        <div className="card">
          <h2>⚠️ Brak połączenia</h2>
          <p className="subtitle">Serwer jest niedostępny</p>
          <button className="btn primary big" onClick={() => socket.connect()}>
            🔄 Połącz ponownie
          </button>
        </div>
      </div>
    )
  }

  // Nie pokazuj ekranu logowania jeśli reconnect do pokoju
  if (!room && isReconnecting) {
    return (
      <div className="screen home">
        <div className="card reconnect-card">
          <div className="reconnect-spinner" />
          <h2>Przywracanie gry...</h2>
          <p className="subtitle">Łączenie z pokojem</p>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="screen home">
        <div className="card">
          <h1 className="logo">MEGA<span>POL</span></h1>
          <p className="subtitle">Monopol online — za darmo, z przyjaciółmi</p>
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
    const amIConnected = room.players.find(p => p.id === myId)?.connected ?? true

    return (
      <div className="screen home">
        <div className="card">
          <div className="lobby-header">
            <h2>Lobby pokoju</h2>
            {!amIConnected && (
              <span className="offline-badge">⚠️ Offline</span>
            )}
          </div>
          <div className="room-code" title="Podaj znajomym ten kod">{room.code}</div>
          <div className="lobby-buttons">
            <button
              className="btn ghost small"
              onClick={() => {
                navigator.clipboard?.writeText(link)
                addToast('Link skopiowany!', 'success')
              }}
            >
              🔗 Kopiuj link
            </button>
            <button
              className="btn ghost small"
              onClick={() => {
                const fullLink = link
                if (navigator.share) {
                  navigator.share({ title: 'MEGAPOL', url: fullLink })
                } else {
                  navigator.clipboard?.writeText(fullLink)
                  addToast('Link skopiowany!', 'success')
                }
              }}
            >
              📤 Udostępnij
            </button>
          </div>
          <div className="player-chips">
            {room.players.map((p) => (
              <span key={p.id} className={`chip ${p.connected ? '' : 'off'}`}>
                {p.name}{p.id === room.hostId ? ' 👑' : ''}
                {!p.connected && ' (offline)'}
              </span>
            ))}
          </div>
          {isHost && (
            <>
              <div className="lobby-settings">
                <label className="label">Startowa gotówka</label>
                <select
                  className="input"
                  value={room.settings.startMoney}
                  onChange={(e) =>
                    socket.emit('room:settings', { code: room.code, settings: { startMoney: Number(e.target.value) } })
                  }
                >
                  {[500, 1000, 1500, 2000, 2500, 3000, 5000].map((v) => (
                    <option key={v} value={v}>{v} zł</option>
                  ))}
                </select>

                <label className="label">Pensja za START</label>
                <select
                  className="input"
                  value={room.settings.goSalary}
                  onChange={(e) =>
                    socket.emit('room:settings', { code: room.code, settings: { goSalary: Number(e.target.value) } })
                  }
                >
                  {[100, 200, 300, 400, 500].map((v) => (
                    <option key={v} value={v}>{v} zł</option>
                  ))}
                </select>

                <label className="check setting-check">
                  <input
                    type="checkbox"
                    checked={room.settings.auctionEnabled}
                    onChange={(e) =>
                      socket.emit('room:settings', { code: room.code, settings: { auctionEnabled: e.target.checked } })
                    }
                  />
                  Licytacje włączone
                </label>

                <label className="check setting-check">
                  <input
                    type="checkbox"
                    checked={room.settings.freeParking}
                    onChange={(e) =>
                      socket.emit('room:settings', { code: room.code, settings: { freeParking: e.target.checked } })
                    }
                  />
                  Darmowy Parking zbiera pieniądze
                </label>
              </div>
              <button
                className="btn primary big"
                disabled={room.players.length < 2}
                onClick={() => socket.emit('game:start', { code: room.code })}
              >
                {room.players.length < 2 ? 'Czekam na graczy (min. 2)…' : 'Rozpocznij grę!'}
              </button>
            </>
          )}
          {!isHost && (
            <p className="subtitle">Czekaj, aż gospodarz rozpocznie grę…</p>
          )}
          <button className="btn ghost leave-btn" onClick={leaveRoom}>
            ← Opuść pokój
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  return <GameScreen room={room} myId={myId} />
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
