import { Globe, Play, Square, Monitor } from 'lucide-react'
import { DESKTOP_RESOLUTIONS } from '../../types'

interface HeaderProps {
  inputUrl: string
  onUrlChange: (url: string) => void
  isCapturing: boolean
  capturedCount: number
  // Pipeline config
  resolution: string
  onResolutionChange: (value: string) => void
  scale: number
  onScaleChange: (value: number) => void
  quality: number
  onQualityChange: (value: number) => void
  // Actions
  onStartCapture: () => void
  onStopCapture: () => void
  // Stats
  captureStats: {
    totalFrames: number
    duplicatesSkipped: number
    totalBytes: number
  } | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function estimateStoragePerHour(resolution: string, scale: number, quality: number): string {
  const res = DESKTOP_RESOLUTIONS.find(r => r.value === resolution)
  const width = res ? res.width * scale : 1920 * scale
  const height = res ? res.height * scale : 1080 * scale
  // Rough JPEG estimate: pixels * quality_factor * compression_ratio
  const pixelCount = width * height
  const qualityFactor = quality / 100
  const estimatedBytesPerFrame = pixelCount * qualityFactor * 0.08 // ~8% of pixel data for JPEG
  // 3 FPS × 3600 seconds, but ~40% are duplicates (skipped)
  const framesPerHour = 3 * 3600 * 0.6
  const totalBytes = estimatedBytesPerFrame * framesPerHour
  return formatBytes(totalBytes)
}

export default function Header({
  inputUrl,
  onUrlChange,
  isCapturing,
  capturedCount,
  resolution,
  onResolutionChange,
  scale,
  onScaleChange,
  quality,
  onQualityChange,
  onStartCapture,
  onStopCapture,
  captureStats,
}: HeaderProps) {
  return (
    <header className="p-4 border-b border-slate-800 bg-slate-900/30 flex flex-col gap-4">
      {/* Row 1: URL + Capture Button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Globe className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Escribe la URL a capturar (ej: https://news.ycombinator.com)..."
            value={inputUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={isCapturing}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all"
          />
        </div>

        {isCapturing ? (
          <button
            onClick={onStopCapture}
            className="flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition shadow-glow-rose hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Detener captura</span>
          </button>
        ) : (
          <button
            onClick={onStartCapture}
            className="flex items-center space-x-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold transition shadow-glow-cyan hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Iniciar sesión</span>
          </button>
        )}
      </div>

      {/* Row 2: Pipeline Config + Stats */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Resolution Selector — Desktop Only */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs select-none">
            <Monitor className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-mono">Resolución:</span>
            <select
              value={resolution}
              onChange={(e) => onResolutionChange(e.target.value)}
              disabled={isCapturing}
              className="bg-transparent text-slate-100 border-none outline-none cursor-pointer focus:ring-0 font-semibold"
            >
              {DESKTOP_RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value} className="bg-slate-950 text-slate-300">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scale Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs select-none">
            <span className="text-slate-400 font-mono">Escala:</span>
            <select
              value={scale}
              onChange={(e) => onScaleChange(Number(e.target.value))}
              disabled={isCapturing}
              className="bg-transparent text-slate-100 border-none outline-none cursor-pointer focus:ring-0 font-semibold"
            >
              <option value="0.5" className="bg-slate-950 text-slate-300">50% (Normal)</option>
              <option value="0.75" className="bg-slate-950 text-slate-300">75%</option>
              <option value="1.0" className="bg-slate-950 text-slate-300">100% (Full Res)</option>
            </select>
          </div>

          {/* Quality Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs select-none">
            <span className="text-slate-400 font-mono">Calidad:</span>
            <select
              value={quality}
              onChange={(e) => onQualityChange(Number(e.target.value))}
              disabled={isCapturing}
              className="bg-transparent text-slate-100 border-none outline-none cursor-pointer focus:ring-0 font-semibold"
            >
              <option value="65" className="bg-slate-950 text-slate-300">65%</option>
              <option value="75" className="bg-slate-950 text-slate-300">75% (Recom.)</option>
              <option value="85" className="bg-slate-950 text-slate-300">85%</option>
              <option value="95" className="bg-slate-950 text-slate-300">95% (Max)</option>
            </select>
          </div>

          {/* Storage Estimate */}
          <div className="text-[10px] text-slate-500 font-mono bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/50">
            ~{estimateStoragePerHour(resolution, scale, quality)}/hora est.
          </div>
        </div>

        {/* Live Stats */}
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-mono block">SCREENSHOTS</span>
            <span className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
              {capturedCount}
            </span>
          </div>

          {captureStats && (
            <>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-mono block">DUPLICADOS</span>
                <span className="text-lg font-bold font-mono text-slate-500 tracking-tight">
                  {captureStats.duplicatesSkipped}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-mono block">TAMAÑO</span>
                <span className="text-lg font-bold font-mono text-slate-500 tracking-tight">
                  {formatBytes(captureStats.totalBytes)}
                </span>
              </div>
            </>
          )}

          {isCapturing && (
            <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full flex items-center space-x-1.5 text-xs text-red-400 font-semibold animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
              <span>3 FPS</span>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
