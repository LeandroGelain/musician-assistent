import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  exportPartitura,
  getPartitura,
  type PartituraDetail,
  type PartituraEvent,
  type PartituraMeasureMark,
} from '../features/partitura/partituraController'
import { EssentiaRealtime } from '../features/partitura/practice/essentiaRealtime'
import { matchPracticeTarget } from '../features/partitura/practice/matching'
import { buildPracticeTargets } from '../features/partitura/practice/targets'
import type { DetectedPitch, PracticeTarget } from '../features/partitura/practice/types'

const STAFF_GAP = 14
const MEASURE_WIDTH = 200
const MEASURES_PER_SYSTEM = 5
const BASE_SYSTEM_GAP = 78
const TOP_PADDING = 40
const LEFT_PADDING = 36
const NOTE_HEAD_ROTATION = -6
const FIRST_MEASURE_NOTE_OFFSET = 70
const DEFAULT_MEASURE_NOTE_OFFSET = 18
const STEM_LENGTH = 32
const BEAM_THICKNESS = 3
const BEAM_GAP = 6
const CLEF_FONT_SIZE = 48
const KEY_SIGNATURE_STEP_X = 11
const STAFF_LINE_WIDTH = 1.2
const BAR_LINE_WIDTH = 1.4
const SYSTEM_CLEF_X = -20
const SYSTEM_KEY_SIGNATURE_GAP = 10
const SYSTEM_TIME_SIGNATURE_GAP = 16
const INLINE_CLEF_X = 6
const INLINE_CLEF_FONT_SIZE = 32
const INLINE_KEY_SIGNATURE_GAP = 8
const INLINE_TIME_SIGNATURE_GAP = 12
const MAX_CENTS_TOLERANCE = 20
const REQUIRED_STABLE_FRAMES = 4
const CHORD_MATCH_THRESHOLD = 0.8
const CHORD_WINDOW_FRAMES = 8

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

type RenderedNote = {
  event: PartituraEvent
  x: number
  y: number
  accidental: string
  accidentalX: number
  hollow: boolean
  hasStem: boolean
  isStemUp: boolean
  stemX: number
  stemEndY: number
  ledgerYs: number[]
  beamLevel: number
  beamGroupId: number | null
}

type PracticeSummary = {
  totalNotes: number
  firstTryHits: number
}

function noteStepIndex(noteName: string, octave: number): number {
  const map: Record<string, number> = {
    C: 0,
    D: 1,
    E: 2,
    F: 3,
    G: 4,
    A: 5,
    B: 6,
  }
  const key = noteName[0]?.toUpperCase() ?? 'C'
  return octave * 7 + (map[key] ?? 0)
}

function clefBottomLineStep(mark: PartituraMeasureMark): number {
  const key = `${mark.clef_sign.toUpperCase()}${mark.clef_line}`
  const octaveShift = (mark.clef_octave_change ?? 0) * 7
  if (key === 'F4') {
    return noteStepIndex('G', 2) + octaveShift
  }
  if (key === 'C3') {
    return noteStepIndex('F', 3) + octaveShift
  }
  return noteStepIndex('E', 4) + octaveShift
}

function noteYForClef(noteName: string, octave: number, baseY: number, mark: PartituraMeasureMark): number {
  const bottomLineY = baseY + STAFF_GAP * 4
  const stepsFromBottom = noteStepIndex(noteName, octave) - clefBottomLineStep(mark)
  return bottomLineY - stepsFromBottom * (STAFF_GAP / 2)
}

function ledgerLineYs(noteY: number, baseY: number): number[] {
  const ys: number[] = []
  const topY = baseY
  const bottomY = baseY + STAFF_GAP * 4

  if (noteY < topY - STAFF_GAP / 2) {
    for (let y = topY - STAFF_GAP; y >= noteY - 0.1; y -= STAFF_GAP) {
      ys.push(y)
    }
  }

  if (noteY > bottomY + STAFF_GAP / 2) {
    for (let y = bottomY + STAFF_GAP; y <= noteY + 0.1; y += STAFF_GAP) {
      ys.push(y)
    }
  }

  return ys
}

function renderAccidental(noteName: string): string {
  if (noteName.includes('#')) return '\u266F'
  if (noteName.includes('b')) return '\u266D'
  return ''
}

function accidentalToken(noteName: string): '' | '#' | 'b' {
  if (noteName.includes('#')) return '#'
  if (noteName.includes('b')) return 'b'
  return ''
}

function accidentalSymbol(token: '' | '#' | 'b' | 'n'): string {
  if (token === '#') return '\u266F'
  if (token === 'b') return '\u266D'
  if (token === 'n') return '\u266E'
  return ''
}

function keySignatureMap(fifths: number): Map<string, '' | '#' | 'b'> {
  const map = new Map<string, '' | '#' | 'b'>([
    ['A', ''], ['B', ''], ['C', ''], ['D', ''], ['E', ''], ['F', ''], ['G', ''],
  ])

  if (fifths > 0) {
    for (let i = 0; i < Math.min(fifths, SHARP_ORDER.length); i += 1) {
      map.set(SHARP_ORDER[i], '#')
    }
  } else if (fifths < 0) {
    for (let i = 0; i < Math.min(Math.abs(fifths), FLAT_ORDER.length); i += 1) {
      map.set(FLAT_ORDER[i], 'b')
    }
  }

  return map
}

function keySignatureWidth(fifths: number): number {
  return Math.abs(fifths) * KEY_SIGNATURE_STEP_X
}

function keySignatureSlots(mark: PartituraMeasureMark): Array<{ note: string; octave: number; token: '#' | 'b' }> {
  const key = `${mark.clef_sign.toUpperCase()}${mark.clef_line}`
  const sharps = key === 'F4'
    ? ['F3', 'C3', 'G3', 'D3', 'A2', 'E3', 'B2']
    : ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4']
  const flats = key === 'F4'
    ? ['B2', 'E3', 'A2', 'D3', 'G2', 'C3', 'F2']
    : ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4']

  const slots = mark.key_fifths >= 0 ? sharps : flats
  const count = Math.min(Math.abs(mark.key_fifths), slots.length)
  const token: '#' | 'b' = mark.key_fifths >= 0 ? '#' : 'b'

  return slots.slice(0, count).map((slot) => ({
    note: slot[0],
    octave: Number(slot.slice(1)) || 4,
    token,
  }))
}

function applyMeasureAccidentals(notes: RenderedNote[], mark: PartituraMeasureMark): RenderedNote[] {
  const byMoment = [...notes].sort(
    (a, b) => a.event.beat_start - b.event.beat_start || a.event.voice - b.event.voice || a.y - b.y,
  )
  const signature = keySignatureMap(mark.key_fifths)
  const active = new Map<string, '' | '#' | 'b'>()

  for (const item of byMoment) {
    const noteLetter = item.event.note_name[0]?.toUpperCase() ?? 'C'
    const octave = item.event.octave
    const key = `${noteLetter}${octave}`
    const inKey = signature.get(noteLetter) ?? ''
    const current = active.get(key) ?? inKey
    const written = accidentalToken(item.event.note_name)

    if (written === current) {
      item.accidental = ''
      continue
    }

    if (written === '' && current !== '') {
      item.accidental = accidentalSymbol('n')
      active.set(key, '')
      continue
    }

    item.accidental = accidentalSymbol(written)
    active.set(key, written)
  }

  return notes
}

function groupByMeasure(events: PartituraEvent[]) {
  const grouped = new Map<number, PartituraEvent[]>()
  for (const item of events) {
    if (!grouped.has(item.measure_number)) grouped.set(item.measure_number, [])
    grouped.get(item.measure_number)?.push(item)
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])
}

function chunkMeasures(measures: Array<[number, PartituraEvent[]]>) {
  const systems: Array<Array<[number, PartituraEvent[]]>> = []
  for (let index = 0; index < measures.length; index += MEASURES_PER_SYSTEM) {
    systems.push(measures.slice(index, index + MEASURES_PER_SYSTEM))
  }
  return systems
}

function clefSymbol(mark: PartituraMeasureMark): string {
  const key = `${mark.clef_sign.toUpperCase()}${mark.clef_line}`
  if (key === 'F4') return '\uD834\uDD22'
  if (key === 'C3') return '\uD834\uDD21'
  return '\uD834\uDD1E'
}

function clefAnchorWidth(mark: PartituraMeasureMark, inline = false): number {
  const key = `${mark.clef_sign.toUpperCase()}${mark.clef_line}`
  if (inline) {
    if (key === 'F4') return 20
    if (key === 'C3') return 18
    return 22
  }
  if (key === 'F4') return 26
  if (key === 'C3') return 24
  return 30
}

function sortedMarks(marks: PartituraMeasureMark[]) {
  return [...marks].sort((a, b) => a.measure_number - b.measure_number)
}

function resolveMarkForMeasure(
  measureNumber: number,
  marks: PartituraMeasureMark[],
  fallbackTimeSignature: string,
): PartituraMeasureMark {
  const ordered = sortedMarks(marks)
  let resolved: PartituraMeasureMark | null = null
  for (const mark of ordered) {
    if (mark.measure_number <= measureNumber) {
      resolved = mark
    } else {
      break
    }
  }

  if (resolved) {
    return resolved
  }

  return {
    id: 0,
    measure_number: 1,
    clef_sign: 'G',
    clef_line: 2,
    time_signature: fallbackTimeSignature || '4/4',
    key_fifths: 0,
    clef_octave_change: 0,
  }
}

function parseTimeSignature(value: string): { numerator: string; denominator: string } {
  const [numerator, denominator] = value.split('/')
  return {
    numerator: numerator || '4',
    denominator: denominator || '4',
  }
}

function beamLevelFromDuration(durationLabel: string): number {
  if (durationLabel === 'e') {
    return 1
  }
  if (durationLabel === 's') {
    return 2
  }
  return 0
}

function flagPath(x: number, y: number, isStemUp: boolean, level: number): string {
  const dir = isStemUp ? 1 : -1
  const startY = isStemUp ? y - STEM_LENGTH : y + STEM_LENGTH
  const y1 = startY + level * BEAM_GAP * dir
  const y2 = y1 + 7 * dir
  const y3 = y1 + 12 * dir
  const y4 = y1 + 9 * dir
  const y5 = y1 + 4 * dir
  return `M ${x} ${y1} C ${x + 7} ${y2}, ${x + 12} ${y2}, ${x + 15} ${y3} L ${x + 12} ${y4} C ${x + 8} ${y5}, ${x + 4} ${y5}, ${x} ${y1} Z`
}

function pulseBucket(beatStart: number, pulseLength: number): number {
  const safePulse = pulseLength > 0 ? pulseLength : 1
  return Math.floor((beatStart + 1e-6) / safePulse)
}

function applyAccidentalSpacing(notes: RenderedNote[]): RenderedNote[] {
  for (const item of notes) {
    item.accidentalX = item.x - 14
  }

  const accidentals = notes
    .filter((item) => item.accidental)
    .sort((a, b) => a.event.beat_start - b.event.beat_start || a.y - b.y)

  let index = 0
  while (index < accidentals.length) {
    const currentBeat = accidentals[index].event.beat_start
    let nextIndex = index
    const cluster: RenderedNote[] = []

    while (nextIndex < accidentals.length) {
      const candidate = accidentals[nextIndex]
      if (Math.abs(candidate.event.beat_start - currentBeat) > 0.001) {
        break
      }
      cluster.push(candidate)
      nextIndex += 1
    }

    cluster.sort((a, b) => a.y - b.y)
    for (let lane = 0; lane < cluster.length; lane += 1) {
      cluster[lane].accidentalX = cluster[lane].x - 14 - lane * 8
    }

    index = nextIndex
  }

  return notes
}

function applyBeamGrouping(notes: RenderedNote[], middleLineY: number, pulseLength: number): RenderedNote[] {
  const beamable = notes
    .filter((item) => item.hasStem && item.beamLevel > 0)
    .sort((a, b) => a.event.voice - b.event.voice || a.event.beat_start - b.event.beat_start || a.x - b.x)

  let groupId = 1
  let index = 0

  while (index < beamable.length) {
    const current = beamable[index]
    const group: RenderedNote[] = [current]
    let nextIndex = index + 1

    while (nextIndex < beamable.length) {
      const candidate = beamable[nextIndex]
      const previous = beamable[nextIndex - 1]
      const sameVoice = candidate.event.voice === current.event.voice
      const closeBeat = (candidate.event.beat_start - previous.event.beat_start) <= 0.6
      const sameMeasure = candidate.event.measure_number === current.event.measure_number
      const samePulse = pulseBucket(candidate.event.beat_start, pulseLength) === pulseBucket(previous.event.beat_start, pulseLength)
      if (!sameVoice || !closeBeat || !sameMeasure || !samePulse) {
        break
      }
      group.push(candidate)
      nextIndex += 1
    }

    if (group.length >= 2) {
      const avgY = group.reduce((sum, item) => sum + item.y, 0) / group.length
      const groupStemUp = avgY > middleLineY
      const ordered = [...group].sort((a, b) => a.x - b.x)
      const first = ordered[0]
      const last = ordered[ordered.length - 1]
      const xSpan = Math.max(1, last.x - first.x)
      const rawSlope = (last.y - first.y) / xSpan
      const limitedSlope = Math.max(-0.18, Math.min(0.18, rawSlope))
      const anchorY = groupStemUp
        ? Math.min(...ordered.map((item) => item.y)) - STEM_LENGTH
        : Math.max(...ordered.map((item) => item.y)) + STEM_LENGTH

      for (const item of group) {
        const beamY = anchorY + (item.x - first.x) * limitedSlope
        item.isStemUp = groupStemUp
        item.stemX = groupStemUp ? item.x + 5 : item.x - 5
        item.stemEndY = beamY
        item.beamGroupId = groupId
      }
      groupId += 1
    }

    index = nextIndex
  }

  return notes
}

export function PartituraViewerPage() {
  const params = useParams()
  const [partitura, setPartitura] = useState<PartituraDetail | null>(null)
  const [status, setStatus] = useState('Carregando partitura...')
  const [isPracticeActive, setIsPracticeActive] = useState(false)
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0)
  const [detectedPitch, setDetectedPitch] = useState<DetectedPitch | null>(null)
  const [detectedChordLabel, setDetectedChordLabel] = useState<string>('')
  const [practiceSummary, setPracticeSummary] = useState<PracticeSummary | null>(null)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [practiceBeatsPerMeasure, setPracticeBeatsPerMeasure] = useState(4)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const essentiaRef = useRef<EssentiaRealtime | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const stableTokenRef = useRef<string>('')
  const stableFramesRef = useRef(0)
  const chordStableFramesRef = useRef(0)
  const chordWindowRef = useRef<number[][]>([])
  const wrongAttemptedSetRef = useRef<Set<string>>(new Set())
  const firstTryHitsRef = useRef(0)
  const advanceLockRef = useRef(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const isPracticeActiveRef = useRef(false)
  const beatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentBeatRef = useRef(0)
  const currentPracticeIndexRef = useRef(0)
  const practiceTargetsRef = useRef<PracticeTarget[]>([])

  useEffect(() => {
    async function load() {
      const id = Number(params.id)
      if (!id) { setStatus('Partitura invalida'); return }
      try {
        const result = await getPartitura(id)
        setPartitura(result)
        setStatus('')
      } catch {
        setStatus('Falha ao carregar partitura')
      }
    }
    void load()
  }, [params.id])

  const measures = useMemo(() => {
    if (!partitura) return []
    return groupByMeasure(partitura.events)
  }, [partitura])

  const practiceTargets = useMemo(() => buildPracticeTargets(partitura?.events ?? []), [partitura])

  const currentPracticeTarget = useMemo(() => {
    if (!isPracticeActive) {
      return null
    }
    return practiceTargets[currentPracticeIndex] ?? null
  }, [isPracticeActive, practiceTargets, currentPracticeIndex])

  const currentPracticeEvent = currentPracticeTarget?.events[0] ?? null

  useEffect(() => {
    practiceTargetsRef.current = practiceTargets
  }, [practiceTargets])

  useEffect(() => {
    isPracticeActiveRef.current = isPracticeActive
  }, [isPracticeActive])

  useEffect(() => {
    currentPracticeIndexRef.current = currentPracticeIndex
  }, [currentPracticeIndex])

  const systems = useMemo(() => chunkMeasures(measures), [measures])

  const layoutBaseYs = useMemo(() => {
    if (!partitura || systems.length === 0) {
      return [TOP_PADDING]
    }

    const result: number[] = []
    let cursor = TOP_PADDING

    for (let systemIndex = 0; systemIndex < systems.length; systemIndex += 1) {
      const system = systems[systemIndex]
      result.push(cursor)

      const currentBottom = cursor + STAFF_GAP * 4
      let lowestY = currentBottom

      for (const [measureNumber, events] of system) {
        const mark = resolveMarkForMeasure(measureNumber, partitura.measure_marks ?? [], partitura.time_signature)
        for (const event of events) {
          const y = noteYForClef(event.note_name, event.octave, cursor, mark)
          if (y > lowestY) {
            lowestY = y
          }
        }
      }

      const overshootBottom = Math.max(0, lowestY - currentBottom)
      const extraBottom = Math.ceil(overshootBottom / STAFF_GAP) * 8
      cursor = currentBottom + BASE_SYSTEM_GAP + extraBottom
    }

    return result
  }, [partitura, systems])

  const svgWidth = useMemo(
    () => Math.max(900, LEFT_PADDING + MEASURES_PER_SYSTEM * MEASURE_WIDTH + 60),
    []
  )

  const svgHeight = useMemo(() => {
    const lastBaseY = layoutBaseYs[layoutBaseYs.length - 1] ?? TOP_PADDING
    return lastBaseY + STAFF_GAP * 4 + BASE_SYSTEM_GAP
  }, [layoutBaseYs])

  async function onExport() {
    if (!partitura) return
    try {
      const jsonContent = await exportPartitura(partitura.id)
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = `partitura_${partitura.id}.json`
      anchor.click()
      URL.revokeObjectURL(href)
    } catch {
      setStatus('Falha ao exportar JSON')
    }
  }

  function resetAudioEngine() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (essentiaRef.current) {
      essentiaRef.current.dispose()
      essentiaRef.current = null
    }

    analyserRef.current = null
    stableTokenRef.current = ''
    stableFramesRef.current = 0
    chordStableFramesRef.current = 0
    chordWindowRef.current = []
    advanceLockRef.current = false
    setDetectedPitch(null)
    setDetectedChordLabel('')

    if (beatIntervalRef.current) {
      clearInterval(beatIntervalRef.current)
      beatIntervalRef.current = null
    }
    currentBeatRef.current = 0
    setCurrentBeat(0)
  }

  function stopPracticeMode() {
    resetAudioEngine()
    isPracticeActiveRef.current = false
    setIsPracticeActive(false)
  }

  async function startPracticeMode() {
    if (!partitura || !practiceTargets.length || isPracticeActive || mediaStreamRef.current) {
      return
    }

    try {
      const essentia = await EssentiaRealtime.create()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0

      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)

      mediaStreamRef.current = stream
      audioContextRef.current = context
      analyserRef.current = analyser
      essentiaRef.current = essentia
      wrongAttemptedSetRef.current = new Set()
      firstTryHitsRef.current = 0
      stableTokenRef.current = ''
      stableFramesRef.current = 0
      chordStableFramesRef.current = 0
      chordWindowRef.current = []
      advanceLockRef.current = false
      setPracticeSummary(null)
      currentPracticeIndexRef.current = 0
      setCurrentPracticeIndex(0)
      isPracticeActiveRef.current = true
      setIsPracticeActive(true)
      setStatus('Prática iniciada: toque a nota ou acorde destacado em vermelho')

      // Metrônomo visual
      const timeSig = parseTimeSignature(partitura.time_signature ?? '4/4')
      const beatsPerMeasure = Number(timeSig.numerator) || 4
      const bpm = partitura.tempo_bpm ?? 80
      const beatMs = Math.round(60000 / bpm)
      setPracticeBeatsPerMeasure(beatsPerMeasure)
      currentBeatRef.current = 0
      setCurrentBeat(0)
      beatIntervalRef.current = setInterval(() => {
        currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerMeasure
        setCurrentBeat(currentBeatRef.current)
      }, beatMs)

      const data = new Float32Array(analyser.fftSize)
      const detect = () => {
        if (!analyserRef.current || !audioContextRef.current || !essentiaRef.current) {
          return
        }

        analyserRef.current.getFloatTimeDomainData(data)
        const detection = essentiaRef.current.detect(data, audioContextRef.current.sampleRate)
        setDetectedPitch(detection.pitch)
        setDetectedChordLabel(detection.chordLabel ?? '')

        chordWindowRef.current.push(detection.chordPitchClasses)
        if (chordWindowRef.current.length > CHORD_WINDOW_FRAMES) {
          chordWindowRef.current.shift()
        }

        const token = detection.pitch?.token ?? '--'
        if (token === stableTokenRef.current) {
          stableFramesRef.current += 1
        } else {
          stableTokenRef.current = token
          stableFramesRef.current = 1
        }

        if (
          isPracticeActiveRef.current
          && !advanceLockRef.current
        ) {
          const targets = practiceTargetsRef.current
          const index = currentPracticeIndexRef.current
          const target = targets[index]

          if (target) {
            const combinedPitchClasses = Array.from(
              new Set(chordWindowRef.current.flatMap((item) => item))
            ).sort((a, b) => a - b)

            const chordEvaluation = matchPracticeTarget(
              target,
              {
                pitch: detection.pitch,
                chordLabel: detection.chordLabel,
                chordPitchClasses: combinedPitchClasses,
              },
              CHORD_MATCH_THRESHOLD,
              true,
            )

            const isSingleNoteReady = Boolean(
              target.kind === 'note'
              && detection.pitch
              && Math.abs(detection.pitch.cents) <= MAX_CENTS_TOLERANCE
              && stableFramesRef.current >= REQUIRED_STABLE_FRAMES
              && chordEvaluation.isMatch,
            )

            if (target.kind === 'chord') {
              if (chordEvaluation.isMatch) {
                chordStableFramesRef.current += 1
              } else {
                chordStableFramesRef.current = 0
              }
            }

            const isChordReady = Boolean(
              target.kind === 'chord'
              && chordEvaluation.isMatch
              && chordStableFramesRef.current >= 2,
            )

            if (!isSingleNoteReady && !isChordReady) {
              wrongAttemptedSetRef.current.add(target.id)
            } else {
              advanceLockRef.current = true

              if (!wrongAttemptedSetRef.current.has(target.id)) {
                firstTryHitsRef.current += 1
              }

              const isLastTarget = index >= targets.length - 1
              if (isLastTarget) {
                window.setTimeout(() => {
                  resetAudioEngine()
                  isPracticeActiveRef.current = false
                  setIsPracticeActive(false)
                  setPracticeSummary({
                    totalNotes: targets.length,
                    firstTryHits: firstTryHitsRef.current,
                  })
                  setStatus('Prática finalizada')
                }, 0)
              } else {
                const nextIndex = index + 1
                currentPracticeIndexRef.current = nextIndex
                setCurrentPracticeIndex(nextIndex)
                setStatus(
                  target.kind === 'chord'
                    ? 'Acorde correto! Próximo alvo destacado.'
                    : 'Nota correta! Próximo alvo destacado.',
                )
                stableFramesRef.current = 0
                stableTokenRef.current = ''
                chordStableFramesRef.current = 0
                chordWindowRef.current = []
                window.setTimeout(() => {
                  advanceLockRef.current = false
                }, 220)
              }
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(detect)
      }

      detect()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido'
      setStatus(`Não foi possível iniciar a detecção com microfone/EssentiaJS: ${message}`)
      stopPracticeMode()
    }
  }

  useEffect(() => {
    return () => {
      resetAudioEngine()
    }
  }, [])

  useEffect(() => {
    if (!isPracticeActive || !currentPracticeEvent || !svgRef.current) {
      return
    }

    const noteElement = svgRef.current.querySelector<SVGGElement>(`[data-event-id="${currentPracticeEvent.id}"]`)
    if (!noteElement) {
      return
    }

    noteElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [isPracticeActive, currentPracticeEvent])

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8">
      <section className="card p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl">{partitura?.title ?? 'Partitura'}</h1>
            {partitura && (
              <p className="text-sm text-slate-600">
                {partitura.time_signature} | {partitura.tempo_bpm} BPM | {partitura.events.length} eventos
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!isPracticeActive && (
              <button className="rounded-md border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-700" onClick={startPracticeMode}>
                Comecar
              </button>
            )}
            {isPracticeActive && (
              <button className="rounded-md border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700" onClick={stopPracticeMode}>
                Parar
              </button>
            )}
            <button className="rounded-md border border-blue-300 px-3 py-2 text-sm text-blue-700" onClick={onExport}>
              Exportar JSON
            </button>
            <Link className="rounded-md border border-indigo-300 px-3 py-2 text-sm text-indigo-700" to={`/partituras/${params.id}/v2`}>
              Visualizacao v2 (AlphaTab)
            </Link>
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" to="/partituras">
              Voltar
            </Link>
          </div>
        </div>

        {status && <p className="mb-3 text-sm text-slate-700">{status}</p>}

        {isPracticeActive && currentPracticeEvent && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
            <div className="mb-2 flex items-center gap-2">
              {Array.from({ length: practiceBeatsPerMeasure }).map((_, i) => (
                <span
                  key={i}
                  className="inline-block h-4 w-4 rounded-full transition-all duration-75"
                  style={{
                    backgroundColor: i === currentBeat ? '#dc2626' : '#fca5a5',
                    transform: i === currentBeat ? 'scale(1.35)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <p>
              Alvo atual:{' '}
              <strong>
                {currentPracticeTarget?.kind === 'chord'
                  ? currentPracticeTarget.events.map((event) => `${event.note_name}${event.octave}`).join(' + ')
                  : `${currentPracticeEvent.note_name}${currentPracticeEvent.octave}`}
              </strong>
              {' '}({currentPracticeIndex + 1}/{practiceTargets.length})
            </p>
            <p>
              Detectado: <strong>{detectedPitch ? `${detectedPitch.note}${detectedPitch.octave}` : '--'}</strong>
              {detectedPitch ? ` | ${detectedPitch.frequency.toFixed(1)} Hz | ${detectedPitch.cents >= 0 ? '+' : ''}${detectedPitch.cents} cents` : ''}
            </p>
            {detectedChordLabel && (
              <p>
                Acorde detectado (EssentiaJS): <strong>{detectedChordLabel}</strong>
              </p>
            )}
          </div>
        )}

        {practiceSummary && !isPracticeActive && (
          <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Resumo da prática</p>
            <p>
              Acertos na primeira tentativa: <strong>{practiceSummary.firstTryHits}</strong> de <strong>{practiceSummary.totalNotes}</strong>
            </p>
          </div>
        )}

        {partitura && partitura.parse_status !== 'parsed' && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Status: {partitura.parse_status}</strong>
            {partitura.parse_error && <p className="mt-1">{partitura.parse_error}</p>}
          </div>
        )}

        {partitura && partitura.parse_status === 'parsed' && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#fff,rgba(255,255,255,0.92))] p-4">
            <svg ref={svgRef} className="h-auto w-full min-w-[900px]" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
              {systems.map((system, systemIndex) => {
                const baseY = layoutBaseYs[systemIndex] ?? TOP_PADDING
                const systemLineEndX = LEFT_PADDING + system.length * MEASURE_WIDTH
                const systemFirstMeasure = system[0]?.[0] ?? 1
                const systemMark = resolveMarkForMeasure(systemFirstMeasure, partitura.measure_marks ?? [], partitura.time_signature)
                const systemTime = parseTimeSignature(systemMark.time_signature || partitura.time_signature)
                const systemBeats = Number(systemTime.numerator) || 4
                const systemKeySlots = keySignatureSlots(systemMark)
                const systemKeyWidth = keySignatureWidth(systemMark.key_fifths)

                return (
                  <g key={`system-${systemIndex}`}>
                    {[0, 1, 2, 3, 4].map((line) => {
                      const y = baseY + line * STAFF_GAP
                      return (
                        <line
                          key={`staff-${systemIndex}-${line}`}
                          x1={LEFT_PADDING}
                          x2={systemLineEndX + 8}
                          y1={y}
                          y2={y}
                          stroke="#1e2330"
                          strokeWidth={STAFF_LINE_WIDTH}
                        />
                      )
                    })}

                    <text x={LEFT_PADDING + SYSTEM_CLEF_X} y={baseY + STAFF_GAP * 3.3} fontSize={CLEF_FONT_SIZE} fontFamily="serif" fill="#1e2330">
                      {clefSymbol(systemMark)}
                    </text>

                    {systemKeySlots.map((slot, slotIndex) => {
                      const x = LEFT_PADDING + SYSTEM_CLEF_X + clefAnchorWidth(systemMark) + SYSTEM_KEY_SIGNATURE_GAP + slotIndex * KEY_SIGNATURE_STEP_X
                      const y = noteYForClef(slot.note, slot.octave, baseY, systemMark)
                      return (
                        <text
                          key={`system-key-${systemIndex}-${slotIndex}`}
                          x={x}
                          y={y + 4}
                          fontFamily="serif"
                          fontSize="17"
                          fill="#1e2330"
                        >
                          {accidentalSymbol(slot.token)}
                        </text>
                      )
                    })}

                    <text
                      x={LEFT_PADDING + SYSTEM_CLEF_X + clefAnchorWidth(systemMark) + SYSTEM_KEY_SIGNATURE_GAP + systemKeyWidth + SYSTEM_TIME_SIGNATURE_GAP}
                      y={baseY - 2}
                      fontFamily="serif"
                      fontSize="17"
                      fill="#1e2330"
                    >
                      <tspan x={LEFT_PADDING + SYSTEM_CLEF_X + clefAnchorWidth(systemMark) + SYSTEM_KEY_SIGNATURE_GAP + systemKeyWidth + SYSTEM_TIME_SIGNATURE_GAP} dy="0.9em">{systemTime.numerator}</tspan>
                      <tspan x={LEFT_PADDING + SYSTEM_CLEF_X + clefAnchorWidth(systemMark) + SYSTEM_KEY_SIGNATURE_GAP + systemKeyWidth + SYSTEM_TIME_SIGNATURE_GAP} dy="1.0em">{systemTime.denominator}</tspan>
                    </text>

                    {system.map(([measureNumber, events], measureIndex) => {
                      const measureX = LEFT_PADDING + measureIndex * MEASURE_WIDTH
                      const measureEndX = measureX + MEASURE_WIDTH
                      const measureMark = resolveMarkForMeasure(measureNumber, partitura.measure_marks ?? [], partitura.time_signature)
                      const previousMark = measureIndex === 0
                        ? systemMark
                        : resolveMarkForMeasure(system[measureIndex - 1][0], partitura.measure_marks ?? [], partitura.time_signature)
                      const markChangedInsideSystem =
                        measureIndex > 0
                        && (
                          previousMark.clef_sign !== measureMark.clef_sign
                          || previousMark.clef_line !== measureMark.clef_line
                          || previousMark.time_signature !== measureMark.time_signature
                          || previousMark.key_fifths !== measureMark.key_fifths
                        )

                      const measureTime = parseTimeSignature(measureMark.time_signature || partitura.time_signature)
                      const beatsPerMeasure = Number(measureTime.numerator) || systemBeats
                      const middleLineY = baseY + STAFF_GAP * 2
                      const inlineKeyWidth = keySignatureWidth(measureMark.key_fifths)
                      const noteOffset = measureIndex === 0
                        ? FIRST_MEASURE_NOTE_OFFSET + systemKeyWidth
                        : markChangedInsideSystem
                          ? 52 + inlineKeyWidth + (previousMark.time_signature !== measureMark.time_signature ? INLINE_TIME_SIGNATURE_GAP : 0)
                          : DEFAULT_MEASURE_NOTE_OFFSET
                      const pulseLength = 4 / (Number(measureTime.denominator) || 4)
                      const measureKeySlots = keySignatureSlots(measureMark)

                      const renderedNotes = applyAccidentalSpacing(
                        applyMeasureAccidentals(
                        applyBeamGrouping(
                          events.map((event) => {
                          const localBeatX = (event.beat_start / beatsPerMeasure) * (MEASURE_WIDTH - 24)
                          const x = measureX + noteOffset + localBeatX + (event.voice - 1) * 3
                          const y = noteYForClef(event.note_name, event.octave, baseY, measureMark)
                          const accidental = renderAccidental(event.note_name)
                          const hollow = event.duration_label === 'w' || event.duration_label === 'h'
                          const hasStem = event.duration_label !== 'w'
                          const beamLevel = beamLevelFromDuration(event.duration_label)
                          const isStemUp = y > middleLineY
                          const stemX = isStemUp ? x + 5 : x - 5
                          const stemEndY = isStemUp ? y - STEM_LENGTH : y + STEM_LENGTH

                          return {
                            event,
                            x,
                            y,
                            accidental,
                            accidentalX: x - 14,
                            hollow,
                            hasStem,
                            isStemUp,
                            stemX,
                            stemEndY,
                            ledgerYs: ledgerLineYs(y, baseY),
                            beamLevel,
                            beamGroupId: null,
                          }
                          }),
                          middleLineY,
                          pulseLength,
                        )
                        ,
                        measureMark,
                        )
                      )

                      const beamGroups = new Map<number, RenderedNote[]>()
                      for (const item of renderedNotes) {
                        if (item.beamGroupId === null) {
                          continue
                        }
                        if (!beamGroups.has(item.beamGroupId)) {
                          beamGroups.set(item.beamGroupId, [])
                        }
                        beamGroups.get(item.beamGroupId)?.push(item)
                      }

                      return (
                        <g key={`measure-${systemIndex}-${measureNumber}`}>
                          <line
                            x1={measureEndX}
                            x2={measureEndX}
                            y1={baseY - 4}
                            y2={baseY + STAFF_GAP * 4 + 4}
                            stroke="#1e2330"
                            strokeWidth={BAR_LINE_WIDTH}
                          />
                          <text x={measureX + 8} y={baseY + STAFF_GAP * 6} fontSize="11" fill="#4b5563">
                            {measureNumber}
                          </text>

                          {markChangedInsideSystem && (
                            <g>
                              <text x={measureX + INLINE_CLEF_X} y={baseY + STAFF_GAP * 2.65} fontSize={INLINE_CLEF_FONT_SIZE} fontFamily="serif" fill="#1e2330">
                                {clefSymbol(measureMark)}
                              </text>

                              {previousMark.key_fifths !== measureMark.key_fifths && measureKeySlots.map((slot, slotIndex) => {
                                const x = measureX + INLINE_CLEF_X + clefAnchorWidth(measureMark, true) + INLINE_KEY_SIGNATURE_GAP + slotIndex * KEY_SIGNATURE_STEP_X
                                const y = noteYForClef(slot.note, slot.octave, baseY, measureMark)
                                return (
                                  <text
                                    key={`inline-key-${systemIndex}-${measureNumber}-${slotIndex}`}
                                    x={x}
                                    y={y + 4}
                                    fontFamily="serif"
                                    fontSize="15"
                                    fill="#1e2330"
                                  >
                                    {accidentalSymbol(slot.token)}
                                  </text>
                                )
                              })}

                              {previousMark.time_signature !== measureMark.time_signature && (
                                <text x={measureX + INLINE_CLEF_X + clefAnchorWidth(measureMark, true) + INLINE_KEY_SIGNATURE_GAP + inlineKeyWidth + INLINE_TIME_SIGNATURE_GAP} y={baseY + 2} fontSize="13" fontFamily="serif" fill="#1e2330">
                                  <tspan x={measureX + INLINE_CLEF_X + clefAnchorWidth(measureMark, true) + INLINE_KEY_SIGNATURE_GAP + inlineKeyWidth + INLINE_TIME_SIGNATURE_GAP} dy="0.9em">{measureTime.numerator}</tspan>
                                  <tspan x={measureX + INLINE_CLEF_X + clefAnchorWidth(measureMark, true) + INLINE_KEY_SIGNATURE_GAP + inlineKeyWidth + INLINE_TIME_SIGNATURE_GAP} dy="1.0em">{measureTime.denominator}</tspan>
                                </text>
                              )}
                            </g>
                          )}

                          {Array.from(beamGroups.entries()).map(([beamId, group]) => {
                            const ordered = [...group].sort((a, b) => a.x - b.x)
                            const first = ordered[0]
                            const last = ordered[ordered.length - 1]
                            const maxBeam = Math.min(2, Math.max(...ordered.map((item) => item.beamLevel)))

                            return (
                              <g key={`beam-${beamId}`}>
                                {Array.from({ length: maxBeam }, (_unused, beamIndex) => {
                                  const offset = beamIndex * BEAM_GAP * (first.isStemUp ? 1 : -1)
                                  const y1 = first.stemEndY + offset
                                  const y2 = last.stemEndY + offset
                                  return (
                                    <line
                                      key={`beam-${beamId}-${beamIndex}`}
                                      x1={first.stemX}
                                      x2={last.stemX}
                                      y1={y1}
                                      y2={y2}
                                      stroke="#1e2330"
                                      strokeWidth={BEAM_THICKNESS}
                                      strokeLinecap="round"
                                    />
                                  )
                                })}
                              </g>
                            )
                          })}

                          {renderedNotes.map((item) => {
                            const isCurrentPracticeNote = Boolean(
                              isPracticeActive
                              && currentPracticeTarget
                              && currentPracticeTarget.eventIds.includes(item.event.id),
                            )
                            const noteStroke = isCurrentPracticeNote ? '#dc2626' : '#1e2330'
                            const noteFill = isCurrentPracticeNote
                              ? (item.hollow ? '#fee2e2' : '#dc2626')
                              : (item.hollow ? '#ffffff' : '#1e2330')

                            return (
                              <g key={`event-${item.event.id}`} data-event-id={item.event.id}>
                                {item.ledgerYs.map((ledgerY, ledgerIndex) => (
                                  <line
                                    key={`ledger-${item.event.id}-${ledgerIndex}`}
                                    x1={item.x - 9}
                                    x2={item.x + 9}
                                    y1={ledgerY}
                                    y2={ledgerY}
                                    stroke={noteStroke}
                                    strokeWidth="1.1"
                                  />
                                ))}
                                {item.accidental && (
                                  <text x={item.accidentalX} y={item.y + 4} fontSize="13" fill={noteStroke}>
                                    {item.accidental}
                                  </text>
                                )}
                                <ellipse
                                  cx={item.x}
                                  cy={item.y}
                                  rx={6}
                                  ry={4.5}
                                  fill={noteFill}
                                  stroke={noteStroke}
                                  strokeWidth="1.3"
                                  transform={`rotate(${NOTE_HEAD_ROTATION} ${item.x} ${item.y})`}
                                />
                                {item.hasStem && (
                                  <line
                                    x1={item.stemX}
                                    x2={item.stemX}
                                    y1={item.y}
                                    y2={item.stemEndY}
                                    stroke={noteStroke}
                                    strokeWidth="1.2"
                                  />
                                )}

                                {item.hasStem && item.beamLevel > 0 && item.beamGroupId === null && (
                                  <g>
                                    {Array.from({ length: item.beamLevel }, (_unused, flagIndex) => (
                                      <path
                                        key={`flag-${item.event.id}-${flagIndex}`}
                                        d={flagPath(item.stemX, item.y, item.isStemUp, flagIndex)}
                                        stroke={noteStroke}
                                        strokeWidth="0.8"
                                        fill={noteStroke}
                                        strokeLinecap="round"
                                      />
                                    ))}
                                  </g>
                                )}
                              </g>
                            )
                          })}
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </section>
    </main>
  )
}