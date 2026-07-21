import { Camera, History, Clock, Wifi, WifiOff, Laptop, Globe, AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import type { Session, WsStatus } from '../../types'

interface SidebarProps {
  sessions: Session[]
  selectedSessionId: string | null
  activeSessionId: string | null
  isCapturing: boolean
  wsStatus: WsStatus
  isElectron: boolean
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
}

function formatDate(isoStr: string) {
  try {
    const date = new Date(isoStr)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoStr
  }
}

export default function Sidebar({
  sessions,
  selectedSessionId,
  activeSessionId,
  isCapturing,
  wsStatus,
  isElectron,
  onSelectSession,
  onDeleteSession,
}: SidebarProps) {
  return (
    <aside className="w-80 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl flex flex-col">
      {/* Header / Logo */}
      <div className="p-5 border-b border-slate-800 flex items-center space-x-3 bg-gradient-to-r from-cyan-950/20 to-slate-900">
        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20 shadow-glow">
          <Camera className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">Visual Data</h1>
          <p className="text-xs text-slate-400 font-mono">Pipeline MVP v0.2</p>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center space-x-2 text-slate-400 text-xs font-semibold tracking-wider uppercase mb-2">
          <History className="w-4 h-4" />
          <span>Historial de Sesiones</span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
            <p className="text-sm text-slate-500">No hay sesiones creadas</p>
          </div>
        ) : (
          sessions.map((session) => {
            const isSelected = selectedSessionId === session.id
            const isActive = activeSessionId === session.id
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                disabled={isCapturing && !isActive}
                className={`w-full text-left p-3.5 rounded-xl border transition-all duration-300 group ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-white shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                    : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50 text-slate-300 hover:text-white'
                } ${isCapturing && !isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500 truncate max-w-[120px]">
                    ID: {session.id.slice(0, 8)}...
                  </span>
                  <div className="flex items-center space-x-2">
                    {isActive && (
                      <span className="flex h-2 w-2 relative" title="Sesión activa capturando">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isActive || (isCapturing && !isActive)) return
                        if (window.confirm('¿Estás seguro de que deseas eliminar esta sesión y todas sus imágenes asociadas?')) {
                          onDeleteSession(session.id)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          if (isActive || (isCapturing && !isActive)) return
                          if (window.confirm('¿Estás seguro de que deseas eliminar esta sesión y todas sus imágenes asociadas?')) {
                            onDeleteSession(session.id)
                          }
                        }
                      }}
                      title={isActive ? 'No se puede eliminar una sesión activa' : 'Eliminar sesión e imágenes'}
                      className={`p-1 rounded-md transition-colors ${
                        isActive || (isCapturing && !isActive)
                          ? 'opacity-30 cursor-not-allowed text-slate-600'
                          : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 cursor-pointer'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 font-medium truncate text-sm">
                  {session.startUrl}
                </div>
                <div className="mt-2 flex items-center text-[11px] text-slate-500 space-x-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDate(session.createdAt)}</span>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Footer: Environment & WebSocket Status */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-2">
        {/* WebSocket Status */}
        <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-400">WebSocket:</span>
          <div className="flex items-center space-x-1.5">
            {wsStatus === 'connected' ? (
              <>
                <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-semibold">Conectado</span>
              </>
            ) : wsStatus === 'connecting' ? (
              <>
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-amber-400 font-semibold">Conectando</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-rose-500" />
                <span className="text-rose-500 font-semibold">Desconectado</span>
              </>
            )}
          </div>
        </div>

        {/* App Execution Environment */}
        <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-400">Entorno:</span>
          <div className="flex items-center space-x-1">
            {isElectron ? (
              <>
                <Laptop className="w-4 h-4 text-cyan-400" />
                <span className="text-cyan-400 font-semibold">Desktop (Electron)</span>
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 text-indigo-400" />
                <span className="text-indigo-400 font-semibold">Web (Simulado)</span>
              </>
            )}
          </div>
        </div>

        {!isElectron && (
          <div className="flex items-start space-x-1.5 text-[10px] text-amber-400/90 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Para capturar sitios reales usa la app Desktop.</span>
          </div>
        )}
      </div>
    </aside>
  )
}
