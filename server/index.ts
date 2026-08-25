// ─── SERWER — pokoje graczy + Socket.IO ──────────────────────────────────────

import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server, type Socket } from 'socket.io'
import { Game } from './engine'
import type { ClientAction, RoomView } from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)

interface RoomPlayer {
  id: string
  name: string
}

class Room {
  code: string
  hostId: string
  players = new Map<string, RoomPlayer>() // playerId -> player
  settings = { startMoney: 1500, freeParking: false, auctionEnabled: true, goSalary: 200 }
  game: Game | null = null

  constructor(code: string, hostId: string) {
    this.code = code
    this.hostId = hostId
  }

  view(): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name,
        connected: this.game?.state.players.find((gp) => gp.id === p.id)?.connected ?? true
      })),
      settings: this.settings,
      started: this.game != null,
      game: this.game?.state ?? null
    }
  }
}

const rooms = new Map<string, Room>()

// playerId -> socket (do ponownego połączenia)
const socketsByPlayer = new Map<string, Socket>()
// socket.id -> playerId
let playerOfSocket = new Map<string, string>()
// playerId -> timeout dyskonect (grace period)
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

const DISCONNECT_GRACE_MS = 10000 // 10 sekund na reconnect

function genRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = ''
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
    if (!rooms.has(code)) return code
  }
  return `R${Date.now().toString(36).toUpperCase()}`
}

function sanitizeName(name: unknown): string {
  const s = String(name ?? '').trim().slice(0, 16)
  return s.length > 0 ? s : 'Gracz'
}

function broadcast(room: Room) {
  globalThis.io.to(room.code).emit('state', room.view())
}

declare global {
  // eslint-disable-next-line no-var
  var io: Server
}

const app = express()
const server = http.createServer(app)

// W produkcji serwujemy zbudowaną aplikację kliencką
app.use(express.static(path.join(__dirname, '../dist/public')))
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/public/index.html'))
})

globalThis.io = new Server(server, { cors: { origin: '*' } })

io.on('connection', (socket) => {
  // ── Dołączanie / tworzenie ────────────────────────────────────────────────

  socket.on('room:create', ({ name, playerId }: { name: string; playerId: string }) => {
    try {
      const code = genRoomCode()
      const room = new Room(code, playerId)
      room.players.set(playerId, { id: playerId, name: sanitizeName(name) })
      rooms.set(code, room)
      bindSocket(socket, playerId)
      socket.join(code)
      broadcast(room)
    } catch { /* ignore */ }
  })

  socket.on('room:join', ({ code, name, playerId }: { code: string; name: string; playerId: string }) => {
    const room = rooms.get(String(code || '').toUpperCase())
    if (!room) return emitError(socket, 'Nie ma takiego pokoju.')
    if (room.game) {
      // dozwolone tylko ponowne połączenie istniejącego gracza
      if (!room.players.has(playerId)) return emitError(socket, 'Gra już się rozpoczęła.')
    } else if (!room.players.has(playerId) && room.players.size >= 6) {
      return emitError(socket, 'Pokój jest pełny.')
    }
    if (!room.players.has(playerId)) {
      room.players.set(playerId, { id: playerId, name: sanitizeName(name) })
      room.game?.addPlayer(playerId, sanitizeName(name))
    }
    bindSocket(socket, playerId)
    socket.join(room.code)
    room.game?.setConnected(playerId, true)
    broadcast(room)
  })

  // ── Ustawienia lobby ────────────────────────────────────────────────────

  socket.on('room:settings', ({ code, settings }: { code: string; settings: { startMoney?: number; freeParking?: boolean; auctionEnabled?: boolean; goSalary?: number } }) => {
    const room = rooms.get(String(code || '').toUpperCase())
    if (!room || room.game || socket.data.playerId !== room?.hostId) return
    if (settings.startMoney !== undefined) {
      room.settings.startMoney = Math.max(500, Math.min(5000, Math.round(Number(settings.startMoney) || 1500)))
    }
    if (settings.freeParking !== undefined) room.settings.freeParking = !!settings.freeParking
    if (settings.auctionEnabled !== undefined) room.settings.auctionEnabled = !!settings.auctionEnabled
    if (settings.goSalary !== undefined) {
      room.settings.goSalary = Math.max(100, Math.min(500, Math.round(Number(settings.goSalary) || 200)))
    }
    broadcast(room)
  })

  // Kompatybilność wsteczna
  socket.on('room:start-money', ({ code, amount }: { code: string; amount: number }) => {
    const room = rooms.get(String(code || '').toUpperCase())
    if (!room || room.game || socket.data.playerId !== room?.hostId) return
    const amt = Math.max(500, Math.min(5000, Math.round(Number(amount) || 1500)))
    room.settings.startMoney = amt
    broadcast(room)
  })

  socket.on('game:start', ({ code }: { code: string }) => {
    const room = rooms.get(String(code || '').toUpperCase())
    if (!room || room.game || socket.data.playerId !== room?.hostId) return
    try {
      const game = new Game(room.settings)
      for (const p of room.players.values()) game.addPlayer(p.id, p.name)
      game.start()
      room.game = game
      broadcast(room)
    } catch (e) {
      emitError(socket, e instanceof Error ? e.message : 'Nie udało się rozpocząć gry.')
    }
  })

  // ── Akcje w grze ────────────────────────────────────────────────────────

  socket.on('action', ({ code, action }: { code: string; action: ClientAction }) => {
    const room = rooms.get(String(code || '').toUpperCase())
    const pid = socket.data.playerId as string | undefined
    if (!room?.game || !pid) return
    try {
      room.game.handleAction(pid, action)
      broadcast(room)
    } catch { /* nieprawidłowe akcje ignorujemy */ }
  })

  socket.on('chat', ({ code, text }: { code: string; text: string }) => {
    const room = rooms.get(String(code || '').toUpperCase())
    const pid = socket.data.playerId as string | undefined
    if (!room?.game || !pid) return
    room.game.handleAction(pid, { type: 'chat', text })
    broadcast(room)
  })

  socket.on('leave-room', () => {
    // Oczyść zapisany pokój po stronie klienta
    const pid = socket.data.playerId as string | undefined
    if (pid) {
      // Usuń z pokoi bez grace period
      for (const room of rooms.values()) {
        if (!room.players.has(pid)) continue
        if (!room.game) {
          room.players.delete(pid)
          if (room.hostId === pid && room.players.size > 0) {
            room.hostId = [...room.players.keys()][0]
          }
          if (room.players.size === 0) rooms.delete(room.code)
        } else {
          room.game.setConnected(pid, false)
        }
        broadcast(room)
      }
    }
    socket.rooms.forEach((room) => socket.leave(room))
  })

  socket.on('disconnect', () => handleDisconnect(socket))

  function handleDisconnect(socket: Socket) {
    const pid = socket.data.playerId as string | undefined
    if (!pid) return

    // Jeśli gracz ma pokój w trakcie gry — grace period
    let inActiveGame = false
    for (const room of rooms.values()) {
      if (room.players.has(pid) && room.game) {
        inActiveGame = true
        break
      }
    }

    if (inActiveGame) {
      // Daj 10 sekund na reconnect przed oznaczeniem jako offline
      const existingTimer = disconnectTimers.get(pid)
      if (existingTimer) clearTimeout(existingTimer)

      // Od razu oznacz jako offline wizualnie
      for (const room of rooms.values()) {
        if (room.players.has(pid) && room.game) {
          room.game.setConnected(pid, false)
          broadcast(room)
        }
      }

      // Timer na pełne usunięcie
      const timer = setTimeout(() => {
        disconnectTimers.delete(pid)
        // Gracz nie wrócił — usuń z pokoi
        for (const room of rooms.values()) {
          if (!room.players.has(pid)) continue
          if (!room.game) {
            room.players.delete(pid)
            if (room.hostId === pid && room.players.size > 0) {
              room.hostId = [...room.players.keys()][0]
            }
            if (room.players.size === 0) rooms.delete(room.code)
          }
        }
        socketsByPlayer.delete(pid)
      }, DISCONNECT_GRACE_MS)

      disconnectTimers.set(pid, timer)
    } else {
      // Lobby — usuń od razu
      for (const room of rooms.values()) {
        if (!room.players.has(pid)) continue
        room.players.delete(pid)
        if (room.hostId === pid && room.players.size > 0) {
          room.hostId = [...room.players.keys()][0]
        }
        if (room.players.size === 0) rooms.delete(room.code)
      }
    }

    socketsByPlayer.delete(pid)
    playerOfSocket.delete(socket.id)
  }

  function bindSocket(socket: Socket, playerId: string) {
    socket.data.playerId = playerId
    socketsByPlayer.set(playerId, socket)
    playerOfSocket.set(socket.id, playerId)

    // Anuluj timer disconnect jeśli istnieje (reconnect!)
    const existingTimer = disconnectTimers.get(playerId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      disconnectTimers.delete(playerId)
    }
  }

  function emitError(socket: Socket, message: string) {
    socket.emit('error-msg', { message })
  }
})

server.listen(PORT, () => {
  console.log(`🎮 Serwer MEGAPOL działa na porcie ${PORT}`)
})
