import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getAfinadorSettings,
  saveAfinadorSettings,
  type AfinadorSettings,
} from '../features/afinador/afinadorController'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MIN_FREQUENCY = 60
const MAX_FREQUENCY = 1200
const CHART_POINTS = 72
const CHART_UPDATE_INTERVAL_MS = 120

function frequencyToNote(frequency: number, referenceA: number) {
  if (!frequency || frequency < 20) {
    return { note: '--', cents: 0 }
  }

  const midi = Math.round(12 * Math.log2(frequency / referenceA) + 69)
  const noteIndex = ((midi % 12) + 12) % 12
  const targetFrequency = referenceA * 2 ** ((midi - 69) / 12)
  const cents = Math.floor(1200 * Math.log2(frequency / targetFrequency))

  return {
    note: NOTE_NAMES[noteIndex],
    cents,
  }
}

function autocorrelate(buffer: Float32Array, sampleRate: number): number {
  const size = buffer.length
  if (size < 2) {
    return 0
  }

  let mean = 0
  for (let i = 0; i < size; i += 1) {
    mean += buffer[i]
  }
  mean /= size

  const centered = new Float32Array(size)
  let rms = 0
  for (let i = 0; i < size; i += 1) {
    const value = buffer[i] - mean
    centered[i] = value
    rms += value * value
  }
  rms = Math.sqrt(rms / size)

  if (rms < 0.01) {
    return 0
  }

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY))
  const maxLag = Math.min(size - 2, Math.floor(sampleRate / MIN_FREQUENCY))
  if (maxLag <= minLag) {
    return 0
  }

  const correlations = new Array(maxLag + 1).fill(0)

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0
    for (let i = 0; i < size - lag; i += 1) {
      sum += centered[i] * centered[i + lag]
    }
    correlations[lag] = sum / (size - lag)
  }

  let start = minLag
  while (start + 1 <= maxLag && correlations[start] > correlations[start + 1]) {
    start += 1
  }

  let bestLag = -1
  let bestCorrelation = -Infinity

  for (let lag = Math.max(minLag + 1, start); lag < maxLag; lag += 1) {
    const current = correlations[lag]
    const prev = correlations[lag - 1]
    const next = correlations[lag + 1]

    if (current > prev && current >= next && current > bestCorrelation) {
      bestCorrelation = current
      bestLag = lag
    }
  }

  if (bestLag <= 0 || !Number.isFinite(bestCorrelation) || bestCorrelation < 1e-4) {
    return 0
  }

  const x1 = correlations[bestLag - 1]
  const x2 = correlations[bestLag]
  const x3 = correlations[bestLag + 1]
  const denominator = x1 - 2 * x2 + x3
  const correction = denominator === 0 ? 0 : (x1 - x3) / (2 * denominator)
  const refinedLag = bestLag + correction

  if (!Number.isFinite(refinedLag) || refinedLag <= 0) {
    return 0
  }

  return sampleRate / refinedLag
}

export function AfinadorPage() {
  const [settings, setSettings] = useState<AfinadorSettings>({
    reference_frequency: 440,
    instrument: 'Violao',
  })
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('Pronto para iniciar')
  const [detectedNote, setDetectedNote] = useState('--')
  const [detectedFrequency, setDetectedFrequency] = useState(0)
  const [detectedCents, setDetectedCents] = useState(0)
  const [frequencyHistory, setFrequencyHistory] = useState<number[]>(
    () => Array.from({ length: CHART_POINTS }, () => 0),
  )

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastChartUpdateRef = useRef(0)

  useEffect(() => {
    async function loadSettings() {
      try {
        const result = await getAfinadorSettings()
        setSettings(result)
      } catch {
        setStatus('Falha ao carregar configuracoes')
      }
    }

    void loadSettings()
  }, [])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close()
      }
    }
  }, [])

  async function saveSettings() {
    try {
      const result = await saveAfinadorSettings(settings)
      setSettings(result)
      setStatus('Configuracoes salvas')
    } catch {
      setStatus('Nao foi possivel salvar configuracoes')
    }
  }

  async function startListening() {
    if (isListening) {
      return
    }

    try {
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
      lastChartUpdateRef.current = 0

      const data = new Float32Array(analyser.fftSize)
      const detect = () => {
        if (!analyserRef.current || !audioContextRef.current) {
          return
        }

        analyserRef.current.getFloatTimeDomainData(data)
        const frequency = autocorrelate(data, audioContextRef.current.sampleRate)
        setDetectedFrequency(frequency)

        const now = performance.now()
        if (now - lastChartUpdateRef.current >= CHART_UPDATE_INTERVAL_MS) {
          setFrequencyHistory((previous) => {
            const next = previous.slice(1)
            next.push(frequency)
            return next
          })
          lastChartUpdateRef.current = now
        }

        const { note, cents } = frequencyToNote(frequency, settings.reference_frequency)
        setDetectedNote(note)
        setDetectedCents(cents)

        animationFrameRef.current = requestAnimationFrame(detect)
      }

      detect()
      setStatus('Ouvindo...')
      setIsListening(true)
    } catch {
      setStatus('Nao foi possivel acessar o microfone')
    }
  }

  function stopListening() {
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

    analyserRef.current = null
    lastChartUpdateRef.current = 0
    setIsListening(false)
    setStatus('Pausado')
  }

  const needleDegrees = useMemo(() => {
    const clamped = Math.max(-50, Math.min(50, detectedCents))
    return (clamped / 50) * 65
  }, [detectedCents])

  const chartPath = useMemo(() => {
    if (frequencyHistory.length < 2) {
      return ''
    }

    const denominator = Math.max(1, frequencyHistory.length - 1)
    let path = ''
    let isDrawing = false

    for (let index = 0; index < frequencyHistory.length; index += 1) {
      const value = frequencyHistory[index]
      const x = (index / denominator) * 100
      const isValidPoint = value >= MIN_FREQUENCY && value <= MAX_FREQUENCY

      if (!isValidPoint) {
        isDrawing = false
        continue
      }

      const ratio = (value - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY)
      const y = 100 - ratio * 100
      const command = isDrawing ? 'L' : 'M'
      path += `${command} ${x.toFixed(2)} ${y.toFixed(2)} `
      isDrawing = true
    }

    return path.trim()
  }, [frequencyHistory])

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8">
      <section className="card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl">Afinador</h1>
          <Link className="text-sm font-semibold text-blue-700" to="/">
            Voltar
          </Link>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm">Instrumento</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={settings.instrument}
              onChange={(event) =>
                setSettings({ ...settings, instrument: event.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Referencia A (Hz)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              type="number"
              min={400}
              max={470}
              value={settings.reference_frequency}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  reference_frequency: Number(event.target.value),
                })
              }
            />
          </label>
        </div>

        <div className="relative mx-auto mb-2 h-72 max-w-2xl overflow-hidden rounded-2xl bg-slate-900">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.35),transparent_52%)]" />

          <div className="absolute left-1/2 top-6 h-40 w-80 -translate-x-1/2">
            <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border-[14px] border-dashed border-slate-500/80" />
            <div className="absolute left-1/2 top-[16px] h-0 w-0 -translate-x-1/2 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-slate-400" />
            <div
              className="absolute left-1/2 top-[50%] h-[84px] w-[3px] origin-bottom -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]"
              style={{ transform: `translateX(-50%) rotate(${needleDegrees}deg)` }}
            />
          </div>

          <div className="absolute left-14 top-[118px] text-3xl font-semibold text-slate-300/90">b</div>
          <div className="absolute right-14 top-[118px] text-4xl font-semibold text-slate-300/90">#</div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
            <p className="text-5xl font-bold tracking-wide text-white">{detectedNote}</p>
            <p className="mt-1 text-sm text-slate-400">
              {detectedFrequency > 0
                ? `${detectedFrequency.toFixed(1)} Hz  |  ${detectedCents > 0 ? '+' : ''}${detectedCents} cents`
                : 'Sem sinal'}
            </p>
          </div>
        </div>

        <div className="mx-auto mb-6 flex max-w-2xl items-center justify-between rounded-xl bg-slate-800 px-6 py-3">
          <p className="text-sm font-medium text-slate-300">{status}</p>
          <button
            className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600 text-2xl hover:bg-slate-500"
            onClick={isListening ? stopListening : startListening}
            aria-label="alternar microfone"
          >
            🎤
          </button>
        </div>

        <div className="mx-auto mb-6 max-w-2xl rounded-xl bg-slate-900 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
            <span>Grafico de frequencia em tempo real</span>
            <span>{detectedFrequency > 0 ? `${detectedFrequency.toFixed(1)} Hz` : 'Sem sinal'}</span>
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-32 w-full rounded-lg border border-slate-700 bg-slate-950"
            role="img"
            aria-label="grafico de historico de frequencia"
          >
            <line x1="0" y1="25" x2="100" y2="25" stroke="#334155" strokeWidth="0.6" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#334155" strokeWidth="0.6" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="#334155" strokeWidth="0.6" />
            <line x1="0" y1="100" x2="100" y2="100" stroke="#334155" strokeWidth="0.8" />
            {chartPath && (
              <path
                d={chartPath}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{MIN_FREQUENCY} Hz</span>
            <span>{MAX_FREQUENCY} Hz</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="btn-primary rounded-lg px-4 py-2 font-semibold" onClick={saveSettings}>
            Salvar
          </button>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2"
            onClick={isListening ? stopListening : startListening}
          >
            {isListening ? 'Parar escuta' : 'Iniciar escuta'}
          </button>
        </div>
      </section>
    </main>
  )
}
