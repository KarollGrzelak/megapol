import { useEffect, useState, useCallback } from 'react'
import { socket, getPlayerId, saveRoomCode, getSavedRoomCode, clearRoomCode } from './socket'
import { AVAILABLE_TOKENS, AVAILABLE_COLORS } from '../../shared/tokens'
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

  const [selectedToken, setSelectedToken] = useState(() => localStorage.getItem('megapol-token') || '')
  const [selectedColor, setSelectedColor] = useState(() => localStorage.getItem('megapol-color') || '')

  const saveName = useCallback(() => {
    localStorage.setItem('megapol-name', name.trim())
    return name.trim() || 'Gracz'
  }, [name])

  const create = () => {
    const playerName = saveName()
    if (selectedToken) localStorage.setItem('megapol-token', selectedToken)
    if (selectedColor) localStorage.setItem('megapol-color', selectedColor)
    socket.emit('room:create', { name: playerName, playerId: myId })
    // Po utworzeniu pokoju ustaw token/kolor
    setTimeout(() => {
      if (selectedToken || selectedColor) {
        // Poczekaj na state z kodem pokoju
      }
    }, 100)
  }

  const join = () => {
    if (!joinCode.trim()) return
    const playerName = saveName()
    if (selectedToken) localStorage.setItem('megapol-token', selectedToken)
    if (selectedColor) localStorage.setItem('megapol-color', selectedColor)
    socket.emit('room:join', { code: joinCode.trim().toUpperCase(), name: playerName, playerId: myId })
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
          
          {/* Wybór pionka */}
          <label className="label">Wybierz pionka</label>
          <div className="token-selector">
            {AVAILABLE_TOKENS.map((t) => (
              <button
                key={t.emoji}
                className={`token-option ${selectedToken === t.emoji ? 'selected' : ''}`}
                onClick={() => setSelectedToken(t.emoji)}
                title={t.name}
              >
                {t.emoji}
              </button>
            ))}
          </div>

          {/* Wybór koloru */}
          <label className="label">Wybierz kolor</label>
          <div className="color-selector">
            {AVAILABLE_COLORS.map((c) => (
              <button
                key={c.hex}
                className={`color-option ${selectedColor === c.hex ? 'selected' : ''}`}
                style={{ background: c.hex }}
                onClick={() => setSelectedColor(c.hex)}
                title={c.name}
              />
            ))}
          </div>

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
          <div className="player-chips lobby-players">
            {room.players.map((p) => (
              <div key={p.id} className={`lobby-player ${p.connected ? '' : 'off'} ${p.id === myId ? 'me' : ''}`}>
                <span className="lobby-player-token" style={{ borderColor: p.color || '#888' }}>
                  {p.token || '🎲'}
                </span>
                <span className="lobby-player-name">
                  {p.name}{p.id === room.hostId ? ' 👑' : ''}{p.id.startsWith('bot-') ? ' 🤖' : ''}
                </span>
                {!p.connected && <span className="offline-tag">offline</span>}
                {isHost && p.id.startsWith('bot-') && (
                  <button className="btn tiny" style={{ fontSize: '.6rem', padding: '.15rem .4rem' }} onClick={() => socket.emit('room:remove-bot', { code: room.code, botId: p.id })}>✕</button>
                )}
              </div>
            ))}
          </div>
          {isHost && room.players.length < 6 && (
            <button className="btn ghost" style={{ width: '100%', fontSize: '.8rem', marginTop: '.3rem' }} onClick={() => socket.emit('room:add-bot', { code: room.code })}>🤖 Dodaj bota</button>
          )}

          {/* Wybór pionka dla bieżącego gracza */}
          {(() => {
            const myPlayer = room.players.find(p => p.id === myId)
            if (!myPlayer) return null
            return (
              <div className="my-token-select">
                <label className="label">Twój pionek</label>
                <div className="token-selector small">
                  {AVAILABLE_TOKENS.map((t) => (
                    <button
                      key={t.emoji}
                      className={`token-option ${(myPlayer.token || selectedToken) === t.emoji ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedToken(t.emoji)
                        socket.emit('room:select-token', { code: room.code, token: t.emoji, color: '' })
                      }}
                      title={t.name}
                    >
                      {t.emoji}
                    </button>
                  ))}
                </div>
                <label className="label">Twój kolor</label>
                <div className="color-selector small">
                  {AVAILABLE_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      className={`color-option ${(myPlayer.color || selectedColor) === c.hex ? 'selected' : ''}`}
                      style={{ background: c.hex }}
                      onClick={() => {
                        setSelectedColor(c.hex)
                        socket.emit('room:select-token', { code: room.code, token: '', color: c.hex })
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            )
          })()}
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
