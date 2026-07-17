import { useState, useEffect, useRef } from 'react'
import { 
  Play, 
  Square, 
  Wifi, 
  WifiOff, 
  Image as ImageIcon, 
  History, 
  ExternalLink,
  Laptop,
  AlertTriangle,
  Globe,
  Loader2,
  Clock,
  Camera
} from 'lucide-react'

// Extend window interface for Electron IPC Bridge
declare global {
  interface Window {
    electronAPI?: {
      startCapture: (sessionId: string) => void;
      stopCapture: () => void;
      onScreenshot: (callback: (event: any, data: { image: string; url: string; timestamp: string }) => void) => () => void;
      onWebviewNavigate: (callback: (event: any, url: string) => void) => () => void;
    };
  }
}

interface Session {
  id: string
  createdAt: string
  startUrl: string
}

interface Screenshot {
  id: string
  sessionId: string
  timestamp: string
  url: string
  imagePath: string
}

function App() {
  // Input URL
  const [inputUrl, setInputUrl] = useState('https://news.ycombinator.com')
  
  // App states
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedSessionScreenshots, setSelectedSessionScreenshots] = useState<Screenshot[]>([])
  
  // Active session states
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureUrl, setCaptureUrl] = useState('')
  const [capturedCount, setCapturedCount] = useState(0)
  const [liveGallery, setLiveGallery] = useState<{ id: string; url: string; timestamp: string; imagePath: string }[]>([])
  
  // Connections
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const [isElectron, setIsElectron] = useState(false)
  
  // Mock simulation for browser preview
  const mockIntervalRef = useRef<number | null>(null)

  // API Config
  const API_BASE_URL = 'http://localhost:8000'
  const WS_URL = 'ws://localhost:8000/ws'

  // Detect environment
  useEffect(() => {
    if (window.electronAPI) {
      setIsElectron(true)
    }
  }, [])

  // Initialize: load sessions & connect WS
  useEffect(() => {
    fetchSessions()
    connectWebSocket()
    return () => {
      if (wsRef.current) wsRef.current.close()
      if (mockIntervalRef.current) clearInterval(mockIntervalRef.current)
    }
  }, [])

  // Connect to WebSocket
  const connectWebSocket = () => {
    setWsStatus('connecting')
    
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        console.log('WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data)
          if (response.status === 'ok') {
            // Acknowledge receipt
            setCapturedCount(response.count)
          } else {
            console.error('WS response error:', response.message)
          }
        } catch (err) {
          console.error('Error parsing WS message:', err)
        }
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
        console.log('WebSocket disconnected')
        // Auto-reconnect after 3 seconds if not capturing
        setTimeout(() => {
          if (!isCapturing && wsRef.current?.readyState === WebSocket.CLOSED) {
            connectWebSocket()
          }
        }, 3000)
      }

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        setWsStatus('disconnected')
      }
    } catch (e) {
      console.error('Failed to create WebSocket:', e)
      setWsStatus('disconnected')
    }
  }

  // Load all sessions
  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`)
      if (response.ok) {
        const data = await response.json()
        setSessions(data)
      }
    } catch (err) {
      console.error('Error fetching sessions:', err)
    }
  }

  // Load screenshots for a specific session
  const fetchScreenshots = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/screenshots/${sessionId}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedSessionScreenshots(data)
      }
    } catch (err) {
      console.error('Error fetching screenshots:', err)
    }
  }

  // Handle clicking on a historical session
  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    fetchScreenshots(sessionId)
  }

  // Webview navigation event listener (Electron only)
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return

    const unsubscribe = window.electronAPI.onWebviewNavigate((_event, url) => {
      setCaptureUrl(url)
    })

    return () => {
      unsubscribe()
    }
  }, [isElectron])

  // Capture event listener (Electron only)
  useEffect(() => {
    if (!isElectron || !window.electronAPI || !isCapturing || !activeSession) return

    const unsubscribe = window.electronAPI.onScreenshot((_event, data) => {
      // 1. Send immediately to backend over WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          sessionId: activeSession.id,
          timestamp: data.timestamp,
          url: data.url,
          image: data.image // already base64 encoded
        }))
      }

      // 2. Prepend to live gallery preview
      const liveItem = {
        id: Math.random().toString(),
        url: data.url,
        timestamp: data.timestamp,
        imagePath: `data:image/jpeg;base64,${data.image}`
      }
      setLiveGallery(prev => [liveItem, ...prev.slice(0, 11)]) // Keep last 12 in UI
    })

    return () => {
      unsubscribe()
    }
  }, [isElectron, isCapturing, activeSession])

  // Start Capturing Session
  const startSession = async () => {
    if (!inputUrl) return
    
    // Ensure URL has protocol
    let targetUrl = inputUrl
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl
    }
    setInputUrl(targetUrl)
    setCaptureUrl(targetUrl)

    // Ensure WS is connected
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      connectWebSocket()
    }

    try {
      // 1. Create session in backend
      const response = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrl: targetUrl })
      })

      if (!response.ok) {
        throw new Error('Failed to create session in backend')
      }

      const session: Session = await response.json()
      
      // Update UI states
      setActiveSession(session)
      setIsCapturing(true)
      setCapturedCount(0)
      setLiveGallery([])
      setSelectedSessionId(session.id)
      setSelectedSessionScreenshots([])

      // 2. Start Capture trigger
      if (isElectron && window.electronAPI) {
        // Trigger Electron capture loop of the webview
        window.electronAPI.startCapture(session.id)
      } else {
        // Fallback: Web browser simulation mode
        startMockSimulation(session.id, targetUrl)
      }

      // Reload sessions list
      fetchSessions()

    } catch (err) {
      alert(`Error starting session: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Stop Capture
  const stopCapture = () => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.stopCapture()
    } else {
      stopMockSimulation()
    }

    setIsCapturing(false)
    setActiveSession(null)
    fetchSessions()
    
    // Reload screenshots for final view
    if (selectedSessionId) {
      fetchScreenshots(selectedSessionId)
    }
  }

  // Web Browser Mock Capture Simulation
  const startMockSimulation = (sessionId: string, url: string) => {
    if (mockIntervalRef.current) clearInterval(mockIntervalRef.current)
    
    let simulatedCount = 0
    mockIntervalRef.current = window.setInterval(() => {
      simulatedCount++
      const timestamp = new Date().toISOString()
      
      // Generate a mock color canvas block base64 image representing a captured screenshot
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Gradient color background
        const grad = ctx.createLinearGradient(0, 0, 400, 300)
        grad.addColorStop(0, '#1e293b')
        grad.addColorStop(1, '#0f172a')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 400, 300)
        
        // Custom graphic decoration
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 4
        ctx.strokeRect(20, 20, 360, 260)
        
        ctx.fillStyle = '#f8fafc'
        ctx.font = 'bold 20px monospace'
        ctx.fillText('VISUAL DATA PIPELINE', 40, 70)
        ctx.font = '14px monospace'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(`Session: ${sessionId.slice(0, 8)}...`, 40, 110)
        ctx.fillText(`Frame: #${simulatedCount.toString().padStart(4, '0')}`, 40, 140)
        ctx.fillText(`URL: ${url}`, 40, 170)
        ctx.fillText(`Time: ${new Date(timestamp).toLocaleTimeString()}`, 40, 200)
        
        // A red scanning light
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(340, 70, 8 + Math.sin(simulatedCount) * 4, 0, 2 * Math.PI)
        ctx.fill()
      }
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.8)
      
      // Send over WS
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          sessionId: sessionId,
          timestamp: timestamp,
          url: url,
          image: base64Image
        }))
      }

      // Add to live view
      const liveItem = {
        id: Math.random().toString(),
        url: url,
        timestamp: timestamp,
        imagePath: base64Image
      }
      setLiveGallery(prev => [liveItem, ...prev.slice(0, 11)])
    }, 333) // 3 frames per second (every 333ms)
  }

  const stopMockSimulation = () => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current)
      mockIntervalRef.current = null
    }
  }

  // Format date readable
  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr)
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoStr
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      
      {/* Sidebar: Historical Sessions List */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl flex flex-col">
        <div className="p-5 border-b border-slate-800 flex items-center space-x-3 bg-gradient-to-r from-cyan-950/20 to-slate-900">
          <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20 shadow-glow">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Visual Data</h1>
            <p className="text-xs text-slate-400 font-mono">Pipeline MVP v0.1</p>
          </div>
        </div>

        {/* Sessions list */}
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
              const isActive = activeSession?.id === session.id
              return (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  disabled={isCapturing && !isActive}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-300 ${
                    isSelected 
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-white shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50 text-slate-300 hover:text-white'
                  } ${isCapturing && !isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-xs text-slate-500 truncate max-w-[120px]">
                      ID: {session.id.slice(0, 8)}...
                    </span>
                    {isActive && (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
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

        {/* Footer: Environment & WebSocket status */}
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        
        {/* Top Control Header */}
        <header className="p-4 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between space-x-4">
          <div className="flex-1 max-w-xl flex items-center space-x-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Globe className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Escribe la URL a capturar (ej: https://news.ycombinator.com)..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                disabled={isCapturing}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all"
              />
            </div>
            
            {isCapturing ? (
              <button
                onClick={stopCapture}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition shadow-glow-rose hover:scale-[1.02] active:scale-[0.98]"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Detener captura</span>
              </button>
            ) : (
              <button
                onClick={startSession}
                className="flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold transition shadow-glow-cyan hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Iniciar sesión</span>
              </button>
            )}
          </div>

          {/* Stats Bar */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-mono block">SCREENSHOTS</span>
              <span className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                {capturedCount}
              </span>
            </div>
            {isCapturing && (
              <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full flex items-center space-x-1.5 text-xs text-red-400 font-semibold animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                <span>3 FPS (333ms)</span>
              </div>
            )}
          </div>
        </header>

        {/* Dashboard Grid Workspace */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Active Browser Viewport / Webview Area */}
          {isCapturing && (
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900 flex flex-col h-[400px] shadow-2xl relative">
              <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  <span className="font-mono truncate max-w-[400px]">{captureUrl || inputUrl}</span>
                </div>
                <div className="flex items-center space-x-1 bg-cyan-950/30 border border-cyan-800/30 px-2.5 py-0.5 rounded-full text-cyan-400 font-mono">
                  <span>Capturando pantalla...</span>
                </div>
              </div>
              <div className="flex-1 bg-white relative">
                {isElectron ? (
                  // Electron Real Webview Element
                  <webview
                    id="embedded-browser"
                    src={inputUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  ></webview>
                ) : (
                  // Simulated webview in standard browser
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-6 select-none">
                    <div className="w-16 h-16 rounded-full bg-cyan-500/5 flex items-center justify-center border border-cyan-500/10 mb-4 animate-bounce">
                      <Globe className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">Navegador Simulado Activo</h3>
                    <p className="text-sm text-slate-400 max-w-md mb-4">
                      Simulando navegación y capturas a 3 FPS para la URL <code className="text-cyan-400">{captureUrl}</code>.
                    </p>
                    <div className="inline-flex items-center px-4 py-1.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-400">
                      Navegando... Generando screenshots de prueba
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 2: Screenshots Gallery */}
          <div>
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
                {isCapturing ? 'Mostrando las últimas 12 capturas' : `${selectedSessionScreenshots.length} capturas en total`}
              </span>
            </div>

            {/* Gallery Grid */}
            {isCapturing ? (
              // Live Real-Time Gallery Stream
              liveGallery.length === 0 ? (
                <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                  <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Esperando primeras capturas...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {liveGallery.map((shot, idx) => (
                    <div key={shot.id} className="group relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800/80 transition duration-300 hover:border-cyan-500/50 hover:shadow-lg">
                      <div className="aspect-[4/3] bg-slate-950 overflow-hidden relative">
                        <img 
                          src={shot.imagePath} 
                          alt="Live Screenshot" 
                          className="w-full h-full object-cover object-top transition duration-500 group-hover:scale-105" 
                        />
                        <div className="absolute top-1.5 left-1.5 bg-black/60 px-1.5 py-0.5 rounded font-mono text-[9px] text-cyan-400">
                          #{idx + 1}
                        </div>
                      </div>
                      <div className="p-2 border-t border-slate-800/60 bg-slate-950/80">
                        <p className="text-[9px] text-slate-400 truncate" title={shot.url}>{shot.url}</p>
                        <p className="text-[8px] text-slate-500 font-mono mt-0.5">
                          {new Date(shot.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Historical Gallery from database
              selectedSessionId ? (
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
                        <div key={shot.id} className="group relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800/80 transition duration-300 hover:border-cyan-500/50 hover:shadow-lg">
                          <div className="aspect-[4/3] bg-slate-950 overflow-hidden relative">
                            <img 
                              src={imageFullUrl} 
                              alt="Screenshot" 
                              className="w-full h-full object-cover object-top transition duration-500 group-hover:scale-105"
                            />
                            <div className="absolute top-1.5 left-1.5 bg-black/60 px-1.5 py-0.5 rounded font-mono text-[9px] text-cyan-400">
                              #{idx + 1}
                            </div>
                            {/* Expand preview icon button */}
                            <a
                              href={imageFullUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="absolute bottom-2 right-2 p-1.5 bg-slate-950/80 hover:bg-slate-950 text-slate-300 hover:text-white rounded-lg border border-slate-800 opacity-0 group-hover:opacity-100 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="p-2 border-t border-slate-800/60 bg-slate-950/80">
                            <p className="text-[9px] text-slate-400 truncate" title={shot.url}>{shot.url}</p>
                            <p className="text-[8px] text-slate-500 font-mono mt-0.5">
                              {new Date(shot.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                // Welcome screen if no session selected
                <div className="p-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
                  <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 mx-auto mb-4 text-slate-500">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-1">Ninguna sesión seleccionada</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Selecciona una sesión histórica en la barra lateral para ver su galería de screenshots o ingresa una URL arriba para comenzar una nueva sesión de captura.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
