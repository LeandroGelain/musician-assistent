import type { PartituraEvent } from '../partituraController'

export type DetectedPitch = {
  frequency: number
  note: string
  octave: number
  cents: number
  token: string
}

export type RealtimeDetection = {
  pitch: DetectedPitch | null
  chordLabel: string | null
  chordPitchClasses: number[]
  chordPitchClassWeights?: Array<{
    pitchClass: number
    weight: number
  }>
}

export type PracticeTarget = {
  id: string
  eventIds: number[]
  orderIndex: number
  expectedPitchClasses: number[]
  expectedTokens: string[]
  kind: 'note' | 'chord'
  events: PartituraEvent[]
}

export type ChordMatchResult = {
  isMatch: boolean
  confidence: number
  extrasDetected: boolean
}
