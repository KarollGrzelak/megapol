import { io } from 'socket.io-client'

const SERVER = import.meta.env.VITE_SERVER_URL || ''
export const socket = io(SERVER || undefined, { autoConnect: false })

/** Trwały identyfikator gracza — pozwala wrócić do gry po odświeżeniu strony. */
export function getPlayerId(): string {
  let id = localStorage.getItem('megapol-player-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('megapol-player-id', id)
  }
  return id
}
