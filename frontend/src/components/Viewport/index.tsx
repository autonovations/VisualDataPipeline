import { Globe } from 'lucide-react'

interface ViewportProps {
  isElectron: boolean
  inputUrl: string
  captureUrl: string
  resolution: string
}

export default function Viewport({
  isElectron,
  inputUrl,
  captureUrl,
  resolution,
}: ViewportProps) {
  return (
    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900 flex flex-col h-[400px] shadow-2xl relative">
      {/* Browser Chrome Bar */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-slate-400">
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
          <span className="font-mono truncate max-w-[400px]">{captureUrl || inputUrl}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-cyan-950/30 border border-cyan-800/30 px-2.5 py-0.5 rounded-full text-cyan-400 font-mono text-[10px]">
            <span>Captura: {resolution}</span>
          </div>
          <div className="flex items-center space-x-1 bg-red-950/30 border border-red-800/30 px-2.5 py-0.5 rounded-full text-red-400 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
            <span>REC</span>
          </div>
        </div>
      </div>

      {/* Viewport Content */}
      <div className="flex-1 bg-slate-950 relative overflow-hidden">
        {isElectron ? (
          // Electron: show a preview webview (this is just for preview, capture happens in hidden window)
          <webview
            id="embedded-browser"
            src={inputUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          ></webview>
        ) : (
          // Standard browser: simulated viewport
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-6 select-none">
            <div className="w-16 h-16 rounded-full bg-cyan-500/5 flex items-center justify-center border border-cyan-500/10 mb-4 animate-bounce">
              <Globe className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Navegador Simulado Activo</h3>
            <p className="text-sm text-slate-400 max-w-md mb-4">
              Simulando navegación y capturas a 3 FPS para la URL <code className="text-cyan-400">{captureUrl}</code>.
            </p>
            <div className="inline-flex items-center px-4 py-1.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-400">
              Resolución de captura: {resolution} (ventana oculta)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
