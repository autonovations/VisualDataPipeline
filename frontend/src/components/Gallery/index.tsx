import { useState } from 'react'
import { Image as ImageIcon, Loader2, X } from 'lucide-react'
import { API_BASE_URL } from '../../config/api'
import type { Screenshot, LiveScreenshot } from '../../types'

interface GalleryProps {
  isCapturing: boolean
  liveGallery: LiveScreenshot[]
  selectedSessionId: string | null
  selectedSessionScreenshots: Screenshot[]
}

function formatTime(isoStr: string) {
  try {
    return new Date(isoStr).toLocaleTimeString()
  } catch {
    return isoStr
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return ''
  const k = 1024
  if (bytes < k) return bytes + ' B'
  if (bytes < k * k) return (bytes / k).toFixed(1) + ' KB'
  return (bytes / (k * k)).toFixed(1) + ' MB'
}

function ScreenshotCard({
  imageSrc,
  url,
  timestamp,
  index,
  fileSizeBytes,
  onExpand,
}: {
  imageSrc: string
  url: string
  timestamp: string
  index: number
  fileSizeBytes?: number
  onExpand: () => void
}) {
  return (
    <div className="group relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800/80 transition duration-300 hover:border-cyan-500/50 hover:shadow-lg">
      <div className="aspect-video bg-slate-950 overflow-hidden relative cursor-pointer" onClick={onExpand}>
        <img
          src={imageSrc}
          alt={`Screenshot #${index}`}
          className="w-full h-full object-cover object-top transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute top-1.5 left-1.5 bg-black/60 px-1.5 py-0.5 rounded font-mono text-[9px] text-cyan-400">
          #{index}
        </div>
        {fileSizeBytes ? (
          <div className="absolute top-1.5 right-1.5 bg-black/60 px-1.5 py-0.5 rounded font-mono text-[9px] text-slate-400">
            {formatBytes(fileSizeBytes)}
          </div>
        ) : null}
      </div>
      <div className="p-2 border-t border-slate-800/60 bg-slate-950/80">
        <p className="text-[9px] text-slate-400 truncate" title={url}>{url}</p>
        <p className="text-[8px] text-slate-500 font-mono mt-0.5">
          {formatTime(timestamp)}
        </p>
      </div>
    </div>
  )
}

function Lightbox({ imageSrc, onClose }: { imageSrc: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 cursor-pointer"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full border border-slate-700 transition z-10"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={imageSrc}
        alt="Full resolution screenshot"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

export default function Gallery({
  isCapturing,
  liveGallery,
  selectedSessionId,
  selectedSessionScreenshots,
}: GalleryProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <div>
      {/* Lightbox */}
      {lightboxSrc && <Lightbox imageSrc={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-md font-bold tracking-tight text-white flex items-center space-x-2">
          <ImageIcon className="w-5 h-5 text-cyan-400" />
          <span>
            {isCapturing
              ? 'Capturas en Tiempo Real'
              : selectedSessionId
                ? `Galería de Sesión (${selectedSessionId.slice(0, 8)})`
                : 'Galería de Screenshots'}
          </span>
        </h2>
        <span className="text-xs text-slate-400">
          {isCapturing
            ? 'Mostrando las últimas 12 capturas'
            : `${selectedSessionScreenshots.length} capturas en total`}
        </span>
      </div>

      {/* Gallery Content */}
      {isCapturing ? (
        // Live Real-Time Gallery
        liveGallery.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Esperando primeras capturas...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {liveGallery.map((shot, idx) => (
              <ScreenshotCard
                key={shot.id}
                imageSrc={shot.imagePath}
                url={shot.url}
                timestamp={shot.timestamp}
                index={idx + 1}
                fileSizeBytes={shot.fileSizeBytes}
                onExpand={() => setLightboxSrc(shot.imagePath)}
              />
            ))}
          </div>
        )
      ) : selectedSessionId ? (
        // Historical Gallery
        selectedSessionScreenshots.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No se guardaron screenshots en esta sesión</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {selectedSessionScreenshots.map((shot, idx) => {
              const imageFullUrl = shot.imagePath.startsWith('data:')
                ? shot.imagePath
                : `${API_BASE_URL}${shot.imagePath}`
              return (
                <ScreenshotCard
                  key={shot.id}
                  imageSrc={imageFullUrl}
                  url={shot.url}
                  timestamp={shot.timestamp}
                  index={idx + 1}
                  fileSizeBytes={shot.capture?.fileSizeBytes}
                  onExpand={() => setLightboxSrc(imageFullUrl)}
                />
              )
            })}
          </div>
        )
      ) : (
        // Welcome screen
        <div className="p-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
          <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 mx-auto mb-4 text-slate-500">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-300 mb-1">Ninguna sesión seleccionada</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Selecciona una sesión histórica en la barra lateral para ver su galería de screenshots o ingresa una URL arriba para comenzar una nueva sesión de captura.
          </p>
        </div>
      )}
    </div>
  )
}
