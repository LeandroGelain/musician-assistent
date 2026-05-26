import {
  frequencyToDetectedPitch,
  hpcpToPitchClasses,
  hpcpToWeightedPitchClasses,
  noteNameToPitchClass,
} from './noteUtils'
import type { RealtimeDetection } from './types'
import essentiaWasmBinaryUrl from 'essentia.js/dist/essentia-wasm.web.wasm?url'

type EssentiaLike = {
  arrayToVector: (input: Float32Array) => unknown
  vectorToArray?: (input: unknown) => unknown[]
  Windowing?: (...args: unknown[]) => { frame?: unknown } | unknown
  Spectrum?: (...args: unknown[]) => { spectrum?: unknown } | unknown
  SpectralPeaks?: (...args: unknown[]) => { frequencies?: unknown; magnitudes?: unknown } | unknown
  HPCP?: (...args: unknown[]) => { hpcp?: unknown } | unknown
  ChordsDetection?: (...args: unknown[]) => { chords?: unknown; strength?: unknown } | unknown
  PitchYin?: (...args: unknown[]) => { pitch?: number } | unknown
  PitchYinFFT?: (...args: unknown[]) => { pitch?: number } | unknown
}

const MIN_PITCH_FREQUENCY = 40
const MAX_PITCH_FREQUENCY = 1800
const SILENCE_RMS_THRESHOLD = 0.0045

function computeRms(buffer: Float32Array): number {
  let sum = 0
  for (let index = 0; index < buffer.length; index += 1) {
    const value = buffer[index]
    sum += value * value
  }
  return Math.sqrt(sum / Math.max(1, buffer.length))
}

function asArray(essentia: EssentiaLike, value: unknown): unknown[] {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value
  }
  if (essentia.vectorToArray) {
    try {
      return essentia.vectorToArray(value)
    } catch {
      return []
    }
  }
  return []
}

function asNumberArray(essentia: EssentiaLike, value: unknown): number[] {
  return asArray(essentia, value).filter((item): item is number => typeof item === 'number')
}

function asStringArray(essentia: EssentiaLike, value: unknown): string[] {
  return asArray(essentia, value).filter((item): item is string => typeof item === 'string')
}

function cleanupVector(value: unknown) {
  if (value && typeof value === 'object' && 'delete' in value && typeof (value as { delete: () => void }).delete === 'function') {
    try {
      ;(value as { delete: () => void }).delete()
    } catch {
      // ignore cleanup failure
    }
  }
}

export class EssentiaRealtime {
  private readonly essentia: EssentiaLike

  private constructor(essentia: EssentiaLike) {
    this.essentia = essentia
  }

  static async create(): Promise<EssentiaRealtime> {
    const coreModule = await import('essentia.js/dist/essentia.js-core.es.js')
    const wasmModule = await import('essentia.js/dist/essentia-wasm.web.js')

    const coreCandidate = coreModule as unknown as {
      default?: new (wasm: unknown) => EssentiaLike
      Essentia?: new (wasm: unknown) => EssentiaLike
    }
    const EssentiaCtor = coreCandidate.default ?? coreCandidate.Essentia
    if (!EssentiaCtor) {
      throw new Error('Falha ao carregar construtor Essentia (core).')
    }

    const wasmCandidate = wasmModule as unknown as {
      default?: ((options?: { locateFile?: (path: string) => string }) => Promise<unknown>) | unknown
      EssentiaWASM?: (options?: { locateFile?: (path: string) => string }) => Promise<unknown>
    }
    const createWasm = wasmCandidate.EssentiaWASM
      ?? (typeof wasmCandidate.default === 'function' ? wasmCandidate.default : undefined)

    if (!createWasm) {
      throw new Error('Falha ao carregar inicializador Essentia WASM.')
    }

    const wasmBackend = await createWasm({
      locateFile: (path: string) => (path.endsWith('.wasm') ? essentiaWasmBinaryUrl : path),
    })
    const essentia = new EssentiaCtor(wasmBackend)
    return new EssentiaRealtime(essentia)
  }

  detect(buffer: Float32Array, sampleRate: number): RealtimeDetection {
    const rms = computeRms(buffer)
    if (rms < SILENCE_RMS_THRESHOLD) {
      return {
        pitch: null,
        chordLabel: null,
        chordPitchClasses: [],
        chordPitchClassWeights: [],
      }
    }

    const vectorSignal = this.essentia.arrayToVector(buffer)

    let pitchFrequency = 0
    let chordLabel: string | null = null
    let pitchClasses: number[] = []
    let weightedPitchClasses: Array<{ pitchClass: number; weight: number }> = []

    try {
      const windowed = this.essentia.Windowing ? this.essentia.Windowing(vectorSignal) : null
      const frame = (windowed as { frame?: unknown } | null)?.frame ?? windowed ?? vectorSignal

      const spectrumOut = this.essentia.Spectrum ? this.essentia.Spectrum(frame) : null
      const spectrum = (spectrumOut as { spectrum?: unknown } | null)?.spectrum ?? spectrumOut

      if (this.essentia.PitchYin) {
        const pitchOut = this.essentia.PitchYin(
          vectorSignal,
          buffer.length,
          true,
          MAX_PITCH_FREQUENCY,
          MIN_PITCH_FREQUENCY,
          sampleRate,
          0.12,
        )
        const candidatePitch = (pitchOut as { pitch?: number }).pitch
        if (typeof candidatePitch === 'number' && Number.isFinite(candidatePitch)) {
          pitchFrequency = candidatePitch
        }
      } else if (this.essentia.PitchYinFFT && spectrum) {
        const pitchOut = this.essentia.PitchYinFFT(
          spectrum,
          buffer.length,
          true,
          MAX_PITCH_FREQUENCY,
          MIN_PITCH_FREQUENCY,
          sampleRate,
          0.12,
        )
        const candidatePitch = (pitchOut as { pitch?: number }).pitch
        if (typeof candidatePitch === 'number' && Number.isFinite(candidatePitch)) {
          pitchFrequency = candidatePitch
        }
      }

      if (this.essentia.SpectralPeaks && this.essentia.HPCP) {
        const peaks = this.essentia.SpectralPeaks(spectrum)
        const frequencies = (peaks as { frequencies?: unknown }).frequencies
        const magnitudes = (peaks as { magnitudes?: unknown }).magnitudes

        const hpcpOut = this.essentia.HPCP(frequencies, magnitudes)
        const hpcp = (hpcpOut as { hpcp?: unknown }).hpcp
        const hpcpArray = asNumberArray(this.essentia, hpcp)
        pitchClasses = hpcpToPitchClasses(hpcpArray)
        weightedPitchClasses = hpcpToWeightedPitchClasses(hpcpArray)

        if (this.essentia.ChordsDetection) {
          const chordsOut = this.essentia.ChordsDetection(hpcp)
          const chordsArray = asStringArray(this.essentia, (chordsOut as { chords?: unknown }).chords)
          if (chordsArray.length) {
            const first = chordsArray[0]
            chordLabel = first
          }
          cleanupVector((chordsOut as { chords?: unknown }).chords)
          cleanupVector((chordsOut as { strength?: unknown }).strength)
        }

        cleanupVector(frequencies)
        cleanupVector(magnitudes)
        cleanupVector(hpcp)
      }

      cleanupVector((spectrumOut as { spectrum?: unknown } | null)?.spectrum)
      cleanupVector((windowed as { frame?: unknown } | null)?.frame)
    } catch {
      // keep best-effort pitch result
    }

    const detectedPitch = frequencyToDetectedPitch(pitchFrequency)

    // Fallback: quando o HPCP falha/retorna vazio, ainda alimenta classe de pitch
    // com a nota estimada via YIN para não deixar UI e matching em branco.
    if (!weightedPitchClasses.length && detectedPitch) {
      const fallbackPitchClass = noteNameToPitchClass(detectedPitch.note)
      if (fallbackPitchClass !== null) {
        weightedPitchClasses = [{ pitchClass: fallbackPitchClass, weight: 1 }]
        pitchClasses = [fallbackPitchClass]
      }
    }

    cleanupVector(vectorSignal)

    return {
      pitch: detectedPitch,
      chordLabel,
      chordPitchClasses: pitchClasses,
      chordPitchClassWeights: weightedPitchClasses,
    }
  }

  dispose() {
    const target = this.essentia as { shutdown?: () => void; delete?: () => void }
    if (target.shutdown) {
      try {
        target.shutdown()
      } catch {
        // ignore
      }
    }
    if (target.delete) {
      try {
        target.delete()
      } catch {
        // ignore
      }
    }
  }
}
