import type { DetectedPitch } from './types'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

export function normalizeNoteToken(noteName: string, octave: number): string {
  const semitone = NOTE_TO_SEMITONE[noteName]
  if (semitone === undefined) {
    return `UNK-${octave}`
  }
  return `${octave}:${semitone}`
}

export function noteNameToPitchClass(noteName: string): number | null {
  const semitone = NOTE_TO_SEMITONE[noteName]
  return semitone === undefined ? null : semitone % 12
}

export function frequencyToDetectedPitch(frequency: number, referenceA = 440): DetectedPitch | null {
  if (!frequency || frequency < 20) {
    return null
  }

  const midi = Math.round(12 * Math.log2(frequency / referenceA) + 69)
  const noteIndex = ((midi % 12) + 12) % 12
  const targetFrequency = referenceA * 2 ** ((midi - 69) / 12)
  const cents = Math.floor(1200 * Math.log2(frequency / targetFrequency))
  const octave = Math.floor(midi / 12) - 1
  const note = NOTE_NAMES[noteIndex]

  return {
    frequency,
    note,
    octave,
    cents,
    token: normalizeNoteToken(note, octave),
  }
}

const ROOT_TO_CLASS: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

export function chordLabelToPitchClasses(label: string): number[] {
  const cleaned = label.trim().replace(/\s+/g, '')
  const match = cleaned.match(/^([A-G](?:#|b)?)(?::?(.*))$/i)
  if (!match) {
    return []
  }

  const rootToken = `${match[1][0].toUpperCase()}${match[1].slice(1)}`
  const quality = (match[2] || '').toLowerCase()
  const root = ROOT_TO_CLASS[rootToken]
  if (root === undefined) {
    return []
  }

  let intervals = [0, 4, 7]

  if (
    quality.startsWith('min')
    || quality.startsWith('m')
    || quality === '-'
    || quality.startsWith('m7')
  ) {
    intervals = [0, 3, 7]
  }
  if (quality.startsWith('maj') || quality.startsWith('mjr') || quality === '') {
    intervals = [0, 4, 7]
  }
  if (quality.includes('dim')) {
    intervals = [0, 3, 6]
  }
  if (quality.includes('aug')) {
    intervals = [0, 4, 8]
  }
  if (quality.includes('sus2')) {
    intervals = [0, 2, 7]
  }
  if (quality.includes('sus4') || quality === 'sus') {
    intervals = [0, 5, 7]
  }

  if (quality.includes('maj7')) {
    intervals = [...intervals, 11]
  } else if (quality.includes('7')) {
    intervals = [...intervals, 10]
  }

  return Array.from(new Set(intervals.map((interval) => (root + interval) % 12))).sort((a, b) => a - b)
}

export function hpcpToWeightedPitchClasses(
  hpcp: number[],
): Array<{ pitchClass: number; weight: number }> {
  if (!hpcp.length) {
    return []
  }

  let chroma = hpcp
  if (hpcp.length > 12) {
    const folded = new Array(12).fill(0)
    for (let index = 0; index < hpcp.length; index += 1) {
      folded[index % 12] += hpcp[index]
    }
    chroma = folded
  }

  const max = Math.max(...chroma)
  if (!Number.isFinite(max) || max <= 0) {
    return []
  }

  return chroma
    .map((value, index) => ({
      pitchClass: index % 12,
      weight: value / max,
    }))
    .filter((item) => Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => b.weight - a.weight)
}

export function hpcpToPitchClasses(hpcp: number[]): number[] {
  const weighted = hpcpToWeightedPitchClasses(hpcp)
  if (!weighted.length) {
    return []
  }

  const classes: number[] = []
  for (const item of weighted) {
    if (item.weight >= 0.35) {
      classes.push(item.pitchClass)
    }
  }

  // Ensure at least triad candidates if chroma is noisy but has clear top bins.
  if (classes.length < 3) {
    for (const item of weighted.slice(0, 3)) {
      if (!classes.includes(item.pitchClass)) {
        classes.push(item.pitchClass)
      }
    }
  }

  return Array.from(new Set(classes)).sort((a, b) => a - b)
}
