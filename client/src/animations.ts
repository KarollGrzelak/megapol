// ─── System animacji gry ───────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react'

export interface PawnAnimation {
  playerId: string
  fromPos: number
  toPos: number
  startTime: number
  duration: number
  path: number[] // kolejne pola po których się porusza
}

export interface GameAnimations {
  pawns: Map<string, PawnAnimation>
  rollingDice: boolean
  landedTile: number | null
  landedAt: number
  showGoBonus: boolean
  showPayEffect: { from: string; to: string; amount: number } | null
}

// Czas trwania animacji ruchu jednego pola (ms)
const STEP_DURATION = 150
// Całkowity czas animacji rzutu kośćmi
const DICE_ANIMATION_DURATION = 800
// Czas pokazania efektu lądowania
const LANDING_EFFECT_DURATION = 1500

/** Oblicza ścieżkę ruchu pionka (przez START itd.) */
export function calculatePath(from: number, to: number, steps: number): number[] {
  const path: number[] = []
  let current = from
  for (let i = 0; i < steps; i++) {
    current = (current + 1) % 40
    path.push(current)
  }
  return path
}

/** Hook do zarządzania animacjami w grze */
export function useGameAnimations() {
  const [animations, setAnimations] = useState<GameAnimations>({
    pawns: new Map(),
    rollingDice: false,
    landedTile: null,
    landedAt: 0,
    showGoBonus: false,
    showPayEffect: null
  })

  const prevPositionsRef = useRef<Map<string, number>>(new Map())
  const animatingRef = useRef(false)

  // Wykryj zmianę pozycji i rozpocznij animację
  const checkPawnMovement = useCallback((players: Array<{ id: string; position: number; name: string }>) => {
    if (animatingRef.current) return

    const newPawns = new Map<string, PawnAnimation>()
    let hasMovement = false

    for (const player of players) {
      const prevPos = prevPositionsRef.current.get(player.id)
      if (prevPos !== undefined && prevPos !== player.position) {
        hasMovement = true
        const steps = player.position >= prevPos
          ? player.position - prevPos
          : 40 - prevPos + player.position

        const path = calculatePath(prevPos, player.position, steps)
        const now = Date.now()

        newPawns.set(player.id, {
          playerId: player.id,
          fromPos: prevPos,
          toPos: player.position,
          startTime: now,
          duration: steps * STEP_DURATION + 200,
          path
        })
      }
    }

    if (hasMovement) {
      animatingRef.current = true
      setAnimations(prev => ({
        ...prev,
        pawns: newPawns,
        rollingDice: false
      }))

      // Zakończ animację po czasie
      const maxDuration = Math.max(...Array.from(newPawns.values()).map(a => a.duration))
      setTimeout(() => {
        animatingRef.current = false
        setAnimations(prev => ({
          ...prev,
          pawns: new Map(),
          landedTile: players[0]?.position ?? null,
          landedAt: Date.now()
        }))
        // Ukryj efekt lądowania po czasie
        setTimeout(() => {
          setAnimations(prev => ({ ...prev, landedTile: null }))
        }, LANDING_EFFECT_DURATION)
      }, maxDuration)
    }

    // Zapisz obecne pozycje
    const posMap = new Map<string, number>()
    for (const player of players) {
      posMap.set(player.id, player.position)
    }
    prevPositionsRef.current = posMap
  }, [])

  // Rozpocznij animację kości
  const startDiceRoll = useCallback(() => {
    setAnimations(prev => ({ ...prev, rollingDice: true }))
    setTimeout(() => {
      setAnimations(prev => ({ ...prev, rollingDice: false }))
    }, DICE_ANIMATION_DURATION)
  }, [])

  // Pokaż efekt przejścia przez START
  const showGoBonusEffect = useCallback(() => {
    setAnimations(prev => ({ ...prev, showGoBonus: true }))
    setTimeout(() => {
      setAnimations(prev => ({ ...prev, showGoBonus: false }))
    }, 2000)
  }, [])

  // Pokaż efekt płatności
  const showPaymentEffect = useCallback((from: string, to: string, amount: number) => {
    setAnimations(prev => ({ ...prev, showPayEffect: { from, to, amount } }))
    setTimeout(() => {
      setAnimations(prev => ({ ...prev, showPayEffect: null }))
    }, 2000)
  }, [])

  return {
    animations,
    checkPawnMovement,
    startDiceRoll,
    showGoBonusEffect,
    showPaymentEffect,
    animating: animatingRef.current
  }
}

/** Pobiera interpolowaną pozycję pionka w animacji */
export function getInterpolatedPosition(
  animation: PawnAnimation,
  currentTime: number
): { pos: number; progress: number; stepIdx: number } {
  const elapsed = currentTime - animation.startTime
  const progress = Math.min(1, elapsed / animation.duration)

  if (progress >= 1) {
    return { pos: animation.toPos, progress: 1, stepIdx: animation.path.length - 1 }
  }

  const totalSteps = animation.path.length
  const currentStepFloat = progress * totalSteps
  const stepIdx = Math.floor(currentStepFloat)
  const stepProgress = currentStepFloat - stepIdx

  const pos = stepIdx < totalSteps
    ? animation.path[stepIdx]
    : animation.toPos

  return { pos, progress, stepIdx }
}
