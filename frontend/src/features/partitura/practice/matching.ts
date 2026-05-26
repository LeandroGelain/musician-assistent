import type { ChordMatchResult, PracticeTarget, RealtimeDetection } from './types'
import { chordLabelToPitchClasses, noteNameToPitchClass } from './noteUtils'

export function matchPracticeTarget(
  target: PracticeTarget,
  detection: RealtimeDetection,
  confidenceThreshold: number,
  failOnExtras: boolean,
): ChordMatchResult {
  if (target.kind === 'note') {
    const expected = target.expectedTokens[0]
    const detected = detection.pitch?.token
    const expectedPitchClass = target.expectedPitchClasses[0]
    const detectedPitchClass = detection.pitch ? noteNameToPitchClass(detection.pitch.note) : null
    const isExactMatch = Boolean(expected && detected && expected === detected)
    const isPitchClassMatch = Boolean(
      expectedPitchClass !== undefined
      && detectedPitchClass !== null
      && expectedPitchClass === detectedPitchClass,
    )
    const isMatch = isExactMatch || isPitchClassMatch
    return {
      isMatch,
      confidence: isExactMatch ? 1 : isPitchClassMatch ? 0.8 : 0,
      extrasDetected: false,
    }
  }

  const expected = new Set(target.expectedPitchClasses)
  const candidateFromChordLabel = detection.chordLabel ? chordLabelToPitchClasses(detection.chordLabel) : []
  const candidateFromPitch = detection.pitch ? noteNameToPitchClass(detection.pitch.note) : null
  const candidate = new Set<number>([
    ...candidateFromChordLabel,
    ...detection.chordPitchClasses,
    ...(candidateFromPitch === null ? [] : [candidateFromPitch]),
  ])

  if (!expected.size || !candidate.size) {
    return {
      isMatch: false,
      confidence: 0,
      extrasDetected: false,
    }
  }

  let hitCount = 0
  for (const pitchClass of expected) {
    if (candidate.has(pitchClass)) {
      hitCount += 1
    }
  }

  const confidence = hitCount / expected.size

  let extrasDetected = false
  for (const pitchClass of candidate) {
    if (!expected.has(pitchClass)) {
      extrasDetected = true
      break
    }
  }

  if (failOnExtras && extrasDetected) {
    return {
      isMatch: false,
      confidence,
      extrasDetected: true,
    }
  }

  return {
    isMatch: confidence >= confidenceThreshold,
    confidence,
    extrasDetected,
  }
}
