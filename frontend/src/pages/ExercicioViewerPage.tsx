import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as alphaTab from '@coderline/alphatab'
import {
  getExercicio,
  getExercicioSourceFile,
  type ExercicioSummary,
} from '../app/exercicioController'
import type { PartituraEvent } from '../features/partitura/partituraController'
import { EssentiaRealtime } from '../features/partitura/practice/essentiaRealtime'
import { matchPracticeTarget } from '../features/partitura/practice/matching'
import { noteNameToPitchClass } from '../features/partitura/practice/noteUtils'
import { buildPracticeTargets } from '../features/partitura/practice/targets'
import type { DetectedPitch, PracticeTarget } from '../features/partitura/practice/types'

const CHORD_WINDOW_FRAMES = 8
const CHROMA_UI_UPDATE_INTERVAL_MS = 80

const PITCH_CLASS_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

type PracticeSummary = {
  totalNotes: number
  firstTryHits: number
}

type AlphaNoteLike = {
  tone: number
  isVisible: boolean
}

type AlphaBeatLike = {
  id: number
  isRest: boolean
  notes: AlphaNoteLike[]
}

type AlphaVoiceLike = {
  index: number
  beats: AlphaBeatLike[]
}

type AlphaBarLike = {
  index: number
  voices: AlphaVoiceLike[]
}

type AlphaStaffLike = {
  bars: AlphaBarLike[]
}

type AlphaTrackLike = {
  staves: AlphaStaffLike[]
}

type AlphaScoreLike = {
  tracks: AlphaTrackLike[]
}

type ScoreBeatDescriptor = {
  groupId: string
  measureNumber: number
  voice: number
  pitchClasses: number[]
}

type WeightedPitchClass = {
  pitchClass: number
  weight: number
}

type DetectionProfileId = 'conservative' | 'default' | 'tolerant'

type DetectionCalibration = {
  label: string
  description: string
  maxCentsTolerance: number
  requiredStableFrames: number
  chordMatchThreshold: number
  chordStableFrames: number
}

const DETECTION_CALIBRATIONS: Record<DetectionProfileId, DetectionCalibration> = {
  conservative: {
    label: 'Conservador',
    description: 'Mais rigido, evita falso positivo',
    maxCentsTolerance: 18,
    requiredStableFrames: 5,
    chordMatchThreshold: 0.72,
    chordStableFrames: 3,
  },
  default: {
    label: 'Padrao',
    description: 'Equilibrio entre precisao e fluidez',
    maxCentsTolerance: 30,
    requiredStableFrames: 3,
    chordMatchThreshold: 0.55,
    chordStableFrames: 2,
  },
  tolerant: {
    label: 'Tolerante',
    description: 'Mais permissivo para ambiente ruidoso',
    maxCentsTolerance: 42,
    requiredStableFrames: 2,
    chordMatchThreshold: 0.42,
    chordStableFrames: 1,
  },
}

const DETECTION_PROFILE_OPTIONS: DetectionProfileId[] = ['conservative', 'default', 'tolerant']

function samePitchClassSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function collectScoreBeatDescriptors(score: AlphaScoreLike | null): ScoreBeatDescriptor[] {
  if (!score) return []
  const descriptors: ScoreBeatDescriptor[] = []
  for (const track of score.tracks ?? []) {
    for (const staff of track.staves ?? []) {
      for (const bar of staff.bars ?? []) {
        for (const voice of bar.voices ?? []) {
          for (const beat of voice.beats ?? []) {
            if (beat.isRest) continue
            const visibleNotes = beat.notes.filter((note) => note.isVisible)
            const sourceNotes = visibleNotes.length ? visibleNotes : beat.notes
            if (!sourceNotes.length) continue
            const pitchClasses = Array.from(
              new Set(sourceNotes.map((note) => ((note.tone % 12) + 12) % 12)),
            ).sort((a, b) => a - b)
            descriptors.push({ groupId: `b${beat.id}`, measureNumber: bar.index + 1, voice: voice.index + 1, pitchClasses })
          }
        }
      }
    }
  }
  return descriptors
}

function findMatchingBeatIndex(
  beats: ScoreBeatDescriptor[], startIndex: number, expectedPitchClasses: number[],
  measureNumber: number, voice: number, requireSameVoice: boolean,
): number {
  for (let index = startIndex; index < beats.length; index += 1) {
    const beat = beats[index]
    if (beat.measureNumber !== measureNumber) continue
    if (requireSameVoice && beat.voice !== voice) continue
    if (!samePitchClassSet(beat.pitchClasses, expectedPitchClasses)) continue
    return index
  }
  return -1
}

function mapPracticeTargetsToScoreGroups(score: AlphaScoreLike | null, targets: PracticeTarget[]): string[] {
  const beats = collectScoreBeatDescriptors(score)
  if (!beats.length || !targets.length) return []
  const groupIds: string[] = []
  let cursor = 0
  for (const target of targets) {
    const firstEvent = target.events[0]
    if (!firstEvent) { groupIds.push(''); continue }
    const expectedPitchClasses = [...target.expectedPitchClasses].sort((a, b) => a - b)
    let matchIndex = findMatchingBeatIndex(beats, cursor, expectedPitchClasses, firstEvent.measure_number, firstEvent.voice, true)
    if (matchIndex < 0) matchIndex = findMatchingBeatIndex(beats, cursor, expectedPitchClasses, firstEvent.measure_number, firstEvent.voice, false)
    if (matchIndex < 0) { groupIds.push(''); continue }
    groupIds.push(beats[matchIndex].groupId)
    cursor = matchIndex + 1
  }
  return groupIds
}

function selectTopPitchClasses(frames: WeightedPitchClass[][], size: number): number[] {
  if (!frames.length || size <= 0) return []
  const weightByPitchClass = new Map<number, number>()
  for (const frame of frames) {
    for (const item of frame) {
      const pitchClass = ((item.pitchClass % 12) + 12) % 12
      const current = weightByPitchClass.get(pitchClass) ?? 0
      weightByPitchClass.set(pitchClass, current + item.weight)
    }
  }
  return Array.from(weightByPitchClass.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, size)
    .map(([pitchClass]) => pitchClass)
    .sort((a, b) => a - b)
}

function aggregatePitchClassWeights(frames: WeightedPitchClass[][]): WeightedPitchClass[] {
  if (!frames.length) return []
  const weightByPitchClass = new Map<number, number>()
  for (const frame of frames) {
    for (const item of frame) {
      const pitchClass = ((item.pitchClass % 12) + 12) % 12
      const current = weightByPitchClass.get(pitchClass) ?? 0
      weightByPitchClass.set(pitchClass, current + item.weight)
    }
  }
  return Array.from(weightByPitchClass.entries())
    .map(([pitchClass, weight]) => ({ pitchClass, weight }))
    .sort((left, right) => right.weight - left.weight)
}

function toChromaWeightVector(weightedPitchClasses: WeightedPitchClass[]): number[] {
  const vector = new Array(12).fill(0)
  if (!weightedPitchClasses.length) return vector
  let maxWeight = 0
  for (const item of weightedPitchClasses) {
    if (item.weight > maxWeight) maxWeight = item.weight
    vector[item.pitchClass] = item.weight
  }
  if (maxWeight <= 0) return new Array(12).fill(0)
  return vector.map((value) => value / maxWeight)
}

export function ExercicioViewerPage() {
  const params = useParams()
  const [exercicio, setExercicio] = useState<ExercicioSummary | null>(null)
  const [exercicioEvents, setExercicioEvents] = useState<PartituraEvent[]>([])
  const [status, setStatus] = useState('Carregando exercicio...')
  const [isPracticeActive, setIsPracticeActive] = useState(false)
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0)
  const [detectedPitch, setDetectedPitch] = useState<DetectedPitch | null>(null)
  const [detectedChordLabel, setDetectedChordLabel] = useState<string>('')
  const [chromaWeights, setChromaWeights] = useState<number[]>(() => new Array(12).fill(0))
  const [chromaTopPitchClasses, setChromaTopPitchClasses] = useState<number[]>([])
  const [practiceSummary, setPracticeSummary] = useState<PracticeSummary | null>(null)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [practiceBeatsPerMeasure, setPracticeBeatsPerMeasure] = useState(4)
  const [detectionProfileId, setDetectionProfileId] = useState<DetectionProfileId>('default')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const essentiaRef = useRef<EssentiaRealtime | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const stableTokenRef = useRef<string>('')
  const stableFramesRef = useRef(0)
  const chordStableFramesRef = useRef(0)
  const chordWindowRef = useRef<number[][]>([])
  const chordWeightedWindowRef = useRef<WeightedPitchClass[][]>([])
  const wrongAttemptedSetRef = useRef<Set<string>>(new Set())
  const firstTryHitsRef = useRef(0)
  const advanceLockRef = useRef(false)
  const isPracticeActiveRef = useRef(false)
  const beatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentBeatRef = useRef(0)
  const currentPracticeIndexRef = useRef(0)
  const practiceTargetsRef = useRef<PracticeTarget[]>([])
  const practiceTargetGroupIdsRef = useRef<string[]>([])
  const chromaUiLastUpdateRef = useRef(0)

  const detectionCalibration = useMemo(() => DETECTION_CALIBRATIONS[detectionProfileId], [detectionProfileId])
  const detectionCalibrationRef = useRef<DetectionCalibration>(detectionCalibration)

  const practiceTargets = useMemo(() => buildPracticeTargets(exercicioEvents), [exercicioEvents])

  const currentPracticeTarget = useMemo(() => {
    if (!isPracticeActive) return null
    return practiceTargets[currentPracticeIndex] ?? null
  }, [isPracticeActive, practiceTargets, currentPracticeIndex])

  const currentPracticeEvent = currentPracticeTarget?.events[0] ?? null

  useEffect(() => { practiceTargetsRef.current = practiceTargets }, [practiceTargets])
  useEffect(() => { isPracticeActiveRef.current = isPracticeActive }, [isPracticeActive])
  useEffect(() => { currentPracticeIndexRef.current = currentPracticeIndex }, [currentPracticeIndex])
  useEffect(() => { detectionCalibrationRef.current = detectionCalibration }, [detectionCalibration])

  const clearPracticeHighlight = useCallback(() => {
    if (!containerRef.current) return
    const highlighted = containerRef.current.querySelectorAll('.at-practice-target')
    highlighted.forEach((element) => element.classList.remove('at-practice-target'))
  }, [])

  const syncPracticeHighlight = useCallback((targetIndex: number) => {
    if (!containerRef.current) return
    clearPracticeHighlight()
    const groupId = practiceTargetGroupIdsRef.current[targetIndex]
    if (!groupId) return
    const elements = containerRef.current.getElementsByClassName(groupId)
    for (let index = 0; index < elements.length; index += 1) {
      elements.item(index)?.classList.add('at-practice-target')
    }
  }, [clearPracticeHighlight])

  function resetAudioEngine() {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((track) => track.stop()); mediaStreamRef.current = null }
    if (audioContextRef.current) { void audioContextRef.current.close(); audioContextRef.current = null }
    if (essentiaRef.current) { essentiaRef.current.dispose(); essentiaRef.current = null }
    analyserRef.current = null
    stableTokenRef.current = ''
    stableFramesRef.current = 0
    chordStableFramesRef.current = 0
    chordWindowRef.current = []
    chordWeightedWindowRef.current = []
    advanceLockRef.current = false
    setDetectedPitch(null)
    setDetectedChordLabel('')
    setChromaWeights(new Array(12).fill(0))
    setChromaTopPitchClasses([])
    chromaUiLastUpdateRef.current = 0
    if (beatIntervalRef.current) { clearInterval(beatIntervalRef.current); beatIntervalRef.current = null }
    currentBeatRef.current = 0
    setCurrentBeat(0)
  }

  function stopPracticeMode() {
    resetAudioEngine()
    isPracticeActiveRef.current = false
    setIsPracticeActive(false)
    clearPracticeHighlight()
  }

  async function startPracticeMode() {
    if (!exercicio || isPracticeActive || mediaStreamRef.current) return
    if (!practiceTargets.length) {
      setStatus('Nao ha notas detectadas neste exercicio para iniciar a pratica.')
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
      chordWeightedWindowRef.current = []
      advanceLockRef.current = false
      setPracticeSummary(null)
      currentPracticeIndexRef.current = 0
      setCurrentPracticeIndex(0)
      isPracticeActiveRef.current = true
      setIsPracticeActive(true)
      setStatus('Pratica iniciada: toque a nota alvo')
      syncPracticeHighlight(0)

      const [num] = (exercicio.time_signature || '4/4').split('/')
      const beatsPerMeasure = Number(num) || 4
      const bpm = exercicio.tempo_bpm ?? 80
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
        if (!analyserRef.current || !audioContextRef.current || !essentiaRef.current) return
        analyserRef.current.getFloatTimeDomainData(data)
        const detection = essentiaRef.current.detect(data, audioContextRef.current.sampleRate)
        setDetectedPitch(detection.pitch)
        setDetectedChordLabel(detection.chordLabel ?? '')

        chordWindowRef.current.push(detection.chordPitchClasses)
        if (chordWindowRef.current.length > CHORD_WINDOW_FRAMES) chordWindowRef.current.shift()

        const fallbackPitchClass = detection.pitch ? noteNameToPitchClass(detection.pitch.note) : null
        const weightedFrame = detection.chordPitchClassWeights && detection.chordPitchClassWeights.length
          ? detection.chordPitchClassWeights
          : detection.chordPitchClasses.length
            ? detection.chordPitchClasses.map((pitchClass) => ({ pitchClass, weight: 1 }))
            : fallbackPitchClass === null
              ? []
              : [{ pitchClass: fallbackPitchClass, weight: 1 }]
        chordWeightedWindowRef.current.push(weightedFrame)
        if (chordWeightedWindowRef.current.length > CHORD_WINDOW_FRAMES) chordWeightedWindowRef.current.shift()

        const aggregatedPitchClasses = aggregatePitchClassWeights(chordWeightedWindowRef.current)
        const currentTarget = practiceTargetsRef.current[currentPracticeIndexRef.current]
        const topCountForUi = Math.max(1, currentTarget?.expectedPitchClasses.length ?? 1)
        const topPitchClassesForUi = selectTopPitchClasses(chordWeightedWindowRef.current, topCountForUi)
        const now = performance.now()
        if (now - chromaUiLastUpdateRef.current >= CHROMA_UI_UPDATE_INTERVAL_MS) {
          setChromaWeights(toChromaWeightVector(aggregatedPitchClasses))
          setChromaTopPitchClasses(topPitchClassesForUi)
          chromaUiLastUpdateRef.current = now
        }

        const token = detection.pitch?.token ?? '--'
        if (token === stableTokenRef.current) {
          stableFramesRef.current += 1
        } else {
          stableTokenRef.current = token
          stableFramesRef.current = 1
        }

        if (isPracticeActiveRef.current && !advanceLockRef.current) {
          const targets = practiceTargetsRef.current
          const index = currentPracticeIndexRef.current
          const target = targets[index]
          if (target) {
            const calibration = detectionCalibrationRef.current
            const expectedPitchClassCount = Math.max(1, target.expectedPitchClasses.length)
            const combinedPitchClasses = selectTopPitchClasses(chordWeightedWindowRef.current, expectedPitchClassCount)
            const chordEvaluation = matchPracticeTarget(target, { pitch: detection.pitch, chordLabel: detection.chordLabel, chordPitchClasses: combinedPitchClasses }, calibration.chordMatchThreshold, false)
            const isSingleNoteReady = Boolean(target.kind === 'note' && detection.pitch && Math.abs(detection.pitch.cents) <= calibration.maxCentsTolerance && stableFramesRef.current >= calibration.requiredStableFrames && chordEvaluation.isMatch)
            if (target.kind === 'chord') {
              if (chordEvaluation.isMatch) chordStableFramesRef.current += 1
              else chordStableFramesRef.current = 0
            }
            const isChordReady = Boolean(target.kind === 'chord' && chordEvaluation.isMatch && chordStableFramesRef.current >= calibration.chordStableFrames)
            if (!isSingleNoteReady && !isChordReady) {
              wrongAttemptedSetRef.current.add(target.id)
            } else {
              advanceLockRef.current = true
              if (!wrongAttemptedSetRef.current.has(target.id)) firstTryHitsRef.current += 1
              const isLastTarget = index >= targets.length - 1
              if (isLastTarget) {
                window.setTimeout(() => {
                  resetAudioEngine()
                  isPracticeActiveRef.current = false
                  setIsPracticeActive(false)
                  setPracticeSummary({ totalNotes: targets.length, firstTryHits: firstTryHitsRef.current })
                  setStatus('Pratica finalizada')
                }, 0)
              } else {
                const nextIndex = index + 1
                currentPracticeIndexRef.current = nextIndex
                setCurrentPracticeIndex(nextIndex)
                syncPracticeHighlight(nextIndex)
                setStatus('Nota correta! Proximo alvo.')
                stableFramesRef.current = 0
                stableTokenRef.current = ''
                chordStableFramesRef.current = 0
                chordWindowRef.current = []
                chordWeightedWindowRef.current = []
                window.setTimeout(() => { advanceLockRef.current = false }, 220)
              }
            }
          }
        }
        animationFrameRef.current = requestAnimationFrame(detect)
      }
      detect()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido'
      setStatus(`Nao foi possivel iniciar a deteccao com microfone/EssentiaJS: ${message}`)
      stopPracticeMode()
    }
  }

  useEffect(() => {
    let disposed = false
    let renderTimeout: ReturnType<typeof setTimeout> | null = null

    async function load() {
      const id = Number(params.id)
      if (!id) { setStatus('Exercicio invalido'); return }
      try {
        const detail = await getExercicio(id)
        if (disposed) return
        setExercicio(detail)

        setStatus('Carregando arquivo MXL do exercicio...')
        const sourceBlob = await getExercicioSourceFile(id)
        const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer())

        if (disposed || !containerRef.current) return
        if (apiRef.current) { apiRef.current.destroy(); apiRef.current = null }
        practiceTargetGroupIdsRef.current = []
        clearPracticeHighlight()
        containerRef.current.innerHTML = ''

        const api = new alphaTab.AlphaTabApi(containerRef.current, {
          core: { useWorkers: false, fontDirectory: '/font/' },
          player: { enablePlayer: false },
          display: { scale: 0.95, stretchForce: 0.9, layoutMode: alphaTab.LayoutMode.Page },
        })

        api.error.on((error) => {
          if (renderTimeout) { clearTimeout(renderTimeout); renderTimeout = null }
          const message = error instanceof Error ? error.message : String(error)
          setStatus(`Falha ao renderizar no AlphaTab: ${message}`)
        })

        api.renderFinished.on(() => {
          if (renderTimeout) { clearTimeout(renderTimeout); renderTimeout = null }
          if (isPracticeActiveRef.current) syncPracticeHighlight(currentPracticeIndexRef.current)
          setStatus('')
        })

        api.scoreLoaded.on((score) => {
          practiceTargetGroupIdsRef.current = mapPracticeTargetsToScoreGroups(score as unknown as AlphaScoreLike, practiceTargetsRef.current)
          if (isPracticeActiveRef.current) syncPracticeHighlight(currentPracticeIndexRef.current)
        })

        apiRef.current = api
        setStatus('Renderizando exercicio...')
        const loadStarted = api.load(sourceBytes)
        if (!loadStarted) throw new Error('AlphaTab recusou os dados do arquivo MXL.')

        renderTimeout = setTimeout(() => {
          if (!disposed) setStatus('A renderizacao demorou mais que o esperado. Tente recarregar a pagina.')
        }, 15000)

        // Build synthetic events for practice mode from MXL
        // Events are parsed at load time via scoreLoaded callback + will be set after render
      } catch (error) {
        if (renderTimeout) { clearTimeout(renderTimeout); renderTimeout = null }
        if (!disposed) {
          const message = error instanceof Error ? error.message : String(error)
          setStatus(`Falha ao carregar exercicio: ${message}`)
        }
      }
    }

    void load()
    return () => {
      disposed = true
      if (renderTimeout) { clearTimeout(renderTimeout); renderTimeout = null }
      if (apiRef.current) { apiRef.current.destroy(); apiRef.current = null }
      practiceTargetGroupIdsRef.current = []
      clearPracticeHighlight()
    }
  }, [params.id, clearPracticeHighlight, syncPracticeHighlight])

  // Build practice events from alphaTab score once loaded
  useEffect(() => {
    if (!exercicio) return
    const api = apiRef.current
    if (!api) return

    const buildEventsFromScore = (score: AlphaScoreLike) => {
      const events: PartituraEvent[] = []
      let orderIndex = 0
      for (const track of score.tracks ?? []) {
        for (const staff of track.staves ?? []) {
          for (const bar of staff.bars ?? []) {
            for (const voice of bar.voices ?? []) {
              for (const beat of voice.beats ?? []) {
                if (beat.isRest) continue
                const visibleNotes = beat.notes.filter((n) => n.isVisible)
                const sourceNotes = visibleNotes.length ? visibleNotes : beat.notes
                for (const note of sourceNotes) {
                  const tone = note.tone
                  const pitchClass = ((tone % 12) + 12) % 12
                  const octave = Math.floor(tone / 12) - 1
                  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
                  const noteName = noteNames[pitchClass] ?? 'C'
                  events.push({
                    id: orderIndex,
                    order_index: orderIndex,
                    event_type: 'note',
                    note_name: noteName,
                    octave,
                    frequency_hz: null,
                    duration_label: 'q',
                    duration_beats: 1,
                    duration_ms: Math.round(60000 / (exercicio.tempo_bpm ?? 80)),
                    measure_number: bar.index + 1,
                    beat_start: 0,
                    voice: voice.index + 1,
                    chord_group: 0,
                  })
                  orderIndex += 1
                }
              }
            }
          }
        }
      }
      setExercicioEvents(events)
    }

    api.scoreLoaded.on((score) => {
      buildEventsFromScore(score as unknown as AlphaScoreLike)
    })
  }, [exercicio])

  useEffect(() => {
    if (!isPracticeActive) { clearPracticeHighlight(); return }
    syncPracticeHighlight(currentPracticeIndex)
  }, [isPracticeActive, currentPracticeIndex, clearPracticeHighlight, syncPracticeHighlight])

  useEffect(() => {
    return () => { resetAudioEngine() }
  }, [])

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8">
      <section className="card p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl">{exercicio?.title ?? 'Exercicio'}</h1>
            {exercicio && (
              <p className="text-sm text-slate-600">
                Escala: {exercicio.scale} maior | {exercicio.time_signature} | {exercicio.tempo_bpm} BPM | {exercicio.num_measures} compassos
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!isPracticeActive && (
              <button
                className="rounded-md border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-700"
                onClick={startPracticeMode}
                type="button"
              >
                Comecar
              </button>
            )}
            {isPracticeActive && (
              <button
                className="rounded-md border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-700"
                onClick={stopPracticeMode}
                type="button"
              >
                Parar
              </button>
            )}
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" to="/exercicios">
              Voltar
            </Link>
          </div>
        </div>

        {status && <p className="mb-3 text-sm text-slate-700">{status}</p>}

        {/* Detection calibration */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Calibragem de deteccao</p>
          <p className="mt-1 text-xs text-slate-600">{detectionCalibration.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DETECTION_PROFILE_OPTIONS.map((profileId) => {
              const profile = DETECTION_CALIBRATIONS[profileId]
              const isSelected = detectionProfileId === profileId
              return (
                <button
                  key={profileId}
                  className="rounded-md border px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: isSelected ? '#0f172a' : '#cbd5e1',
                    backgroundColor: isSelected ? '#0f172a' : '#ffffff',
                    color: isSelected ? '#f8fafc' : '#334155',
                  }}
                  onClick={() => setDetectionProfileId(profileId)}
                  type="button"
                >
                  {profile.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Cents: +/-{detectionCalibration.maxCentsTolerance} | Frames nota: {detectionCalibration.requiredStableFrames} | Acorde: {(detectionCalibration.chordMatchThreshold * 100).toFixed(0)}% | Frames acorde: {detectionCalibration.chordStableFrames}
          </p>
        </div>

        {/* Practice overlay */}
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
              <p>Acorde detectado (EssentiaJS): <strong>{detectedChordLabel}</strong></p>
            )}

            <div className="mt-3 rounded-md border border-rose-200 bg-white/70 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
                Chroma em tempo real (HPCP)
              </p>
              <p className="mb-2 text-xs text-rose-800">
                Notas com maior peso:{' '}
                <strong>
                  {chromaTopPitchClasses.length
                    ? chromaTopPitchClasses.map((pitchClass) => PITCH_CLASS_LABELS[pitchClass] ?? '--').join(' + ')
                    : '--'}
                </strong>
              </p>
              <div className="grid h-24 grid-cols-12 gap-1">
                {PITCH_CLASS_LABELS.map((label, pitchClass) => {
                  const weight = chromaWeights[pitchClass] ?? 0
                  const isTopClass = chromaTopPitchClasses.includes(pitchClass)
                  const heightPercent = Math.max(4, Math.round(weight * 100))
                  return (
                    <div key={label} className="flex h-full min-w-0 flex-col items-center justify-end">
                      <div
                        className="w-full min-h-[3px] rounded-sm transition-all duration-75"
                        style={{
                          height: `${heightPercent}%`,
                          backgroundColor: isTopClass ? '#dc2626' : '#2563eb',
                          opacity: 0.25 + weight * 0.75,
                        }}
                      />
                      <span className={`mt-1 text-[10px] leading-none ${isTopClass ? 'font-semibold text-rose-800' : 'text-rose-700'}`}>
                        {label}
                      </span>
                      <span className="text-[10px] leading-none text-rose-600">
                        {weight.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {practiceSummary && !isPracticeActive && (
          <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Resumo da pratica</p>
            <p>
              Acertos na primeira tentativa: <strong>{practiceSummary.firstTryHits}</strong> de <strong>{practiceSummary.totalNotes}</strong>
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div ref={containerRef} className="min-h-[540px] overflow-x-auto" />
        </div>
      </section>
    </main>
  )
}
