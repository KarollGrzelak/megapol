import { io } from 'socket.io-client'

const SERVER = import.meta.env.VITE_SERVER_URL || ''

export const socket = io(SERVER || undefined, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000
})

/** Trwały identyfikator gracza — pozwala wrócić do gry po odświeżeniu strony. */
export function getPlayerId(): string {
  let id = localStorage.getItem('megapol-player-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('megapol-player-id', id)
  }
  return id
}

/** Zapisuje kod pokoju w localStorage */
export function saveRoomCode(code: string) {
  localStorage.setItem('megapol-room-code', code)
}

/** Odczytuje zapisany kod pokoju */
export function getSavedRoomCode(): string | null {
  return localStorage.getItem('megapol-room-code')
}

/** Usuwa zapisany kod pokoju */
export function clearRoomCode() {
  localStorage.removeItem('megapol-room-code')
}

/** Zapisuje imię gracza */
export function savePlayerName(name: string) {
  localStorage.setItem('megapol-name', name)
}

/** Odczytuje imię gracza */
export function getPlayerName(): string {
  return localStorage.getItem('megapol-name') || ''
}
