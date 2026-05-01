import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMetronomoSettings,
  saveMetronomoSettings,
  type MetronomoSettings,
} from '../features/metronomo/metronomoController'

export function MetronomoPage() {
  const [settings, setSettings] = useState<MetronomoSettings>({
    bpm: 90,
    beatsPerBar: 4,
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    async function loadSettings() {
      try {
        const result = await getMetronomoSettings()
        setSettings(result)
      } catch {
        setStatus('Falha ao carregar configuracoes')
      }
    }

    void loadSettings()
  }, [])

  const interval = useMemo(() => (60 / settings.bpm) * 1000, [settings.bpm])

  useEffect(() => {
    if (!isPlaying) {
      return
    }

    const audioContext = new window.AudioContext()
    const timer = window.setInterval(() => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.frequency.value = 900
      gain.gain.value = 0.12
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.05)
    }, interval)

    return () => {
      window.clearInterval(timer)
      void audioContext.close()
    }
  }, [interval, isPlaying])

  async function onSave() {
    try {
      const saved = await saveMetronomoSettings(settings)
      setSettings(saved)
      setStatus('Configuracoes salvas')
    } catch {
      setStatus('Nao foi possivel salvar')
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8">
      <section className="card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl">Metronomo</h1>
          <Link className="text-sm font-semibold text-blue-700" to="/">
            Voltar
          </Link>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm">BPM</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              type="number"
              min={30}
              max={240}
              value={settings.bpm}
              onChange={(event) =>
                setSettings({ ...settings, bpm: Number(event.target.value) })
              }
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm">Batidas por compasso</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              type="number"
              min={1}
              max={12}
              value={settings.beatsPerBar}
              onChange={(event) =>
                setSettings({ ...settings, beatsPerBar: Number(event.target.value) })
              }
            />
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            className="btn-primary rounded-lg px-4 py-2 font-semibold"
            onClick={() => setIsPlaying((value) => !value)}
          >
            {isPlaying ? 'Parar' : 'Iniciar'}
          </button>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2"
            onClick={onSave}
          >
            Salvar
          </button>
        </div>

        {status && <p className="mt-4 text-sm text-slate-600">{status}</p>}
      </section>
    </main>
  )
}
