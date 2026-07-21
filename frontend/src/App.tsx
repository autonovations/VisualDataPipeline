import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Viewport from './components/Viewport'
import Gallery from './components/Gallery'
import { useWebSocket } from './hooks/useWebSocket'
import { useElectron } from './hooks/useElectron'
import { useSessions } from './hooks/useSessions'
import { DESKTOP_RESOLUTIONS } from './types'
import type { Session, LiveScreenshot, CaptureStats } from './types'

function App() {
  // Input URL
  const [inputUrl, setInputUrl] = useState('https://news.ycombinator.com')

  // Active session states
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureUrl, setCaptureUrl] = useState('')
  const [capturedCount, setCapturedCount] = useState(0)
  const [liveGallery, setLiveGallery] = useState<LiveScreenshot[]>([])

  // Pipeline config (desktop-only resolutions)
  const [resolution, setResolution] = useState('1920x1080')
  const [scale, setScale] = useState(1.0)
  const [quality, setQuality] = useState(85)

  // Capture stats from Electron main process
  const [captureStats, setCaptureStats] = useState<CaptureStats | null>(null)

  // Mock simulation ref for browser preview
  const mockIntervalRef = useRef<number | null>(null)

  // Custom hooks
  const { wsStatus, wsRef, sendJson, connect: connectWs } = useWebSocket()
  const { isElectron, electronAPI } = useElectron()
  const {
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    selectedSessionScreenshots,
    fetchSessions,
    createSession,
    deleteSession,
    fetchScreenshots,
    selectSession,
  } = useSessions()

  // Initialize: load sessions
  useEffect(() => {
    fetchSessions()
    return () => {
      if (mockIntervalRef.current) clearInterval(mockIntervalRef.current)
    }
  }, [fetchSessions])

  // WS message handler — update capturedCount from backend ACK
  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return

    const handler = (event: MessageEvent) => {
      try {
        const response = JSON.parse(event.data)
        if (response.status === 'ok') {
          setCapturedCount(response.count)
        } else if (response.status === 'error') {
          console.error('[WS] Backend error:', response.message)
        }
      } catch (err) {
        console.error('[WS] Error parsing message:', err)
      }
    }

    ws.addEventListener('message', handler)
    return () => {
      ws.removeEventListener('message', handler)
    }
  }, [wsRef.current])

  // Webview navigation listener (Electron only)
  useEffect(() => {
    if (!isElectron || !electronAPI) return

    const unsubscribe = electronAPI.onWebviewNavigate((_event: unknown, url: string) => {
      setCaptureUrl(url)
    })

    return () => { unsubscribe() }
  }, [isElectron, electronAPI])

  // Capture stats listener (Electron only)
  useEffect(() => {
    if (!isElectron || !electronAPI) return

    const unsubscribe = electronAPI.onCaptureStats((_event: unknown, stats: CaptureStats) => {
      setCaptureStats(stats)
    })

    return () => { unsubscribe() }
  }, [isElectron, electronAPI])

  // Screenshot stream listener (Electron only)
  useEffect(() => {
    if (!isElectron || !electronAPI || !isCapturing || !activeSession) return

    const unsubscribe = electronAPI.onScreenshot((_event: unknown, data) => {
      // Convert binary buffer to base64 for display + WS transmission
      let base64Image: string

      if (data.imageBuffer) {
        // New binary mode: convert ArrayBuffer/Buffer to base64
        const bytes = new Uint8Array(data.imageBuffer as ArrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        base64Image = btoa(binary)
      } else if (data.image) {
        // Legacy base64 mode
        base64Image = data.image
      } else {
        return
      }

      // Send to backend over WebSocket (base64 for now, binary upgrade later)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendJson({
          sessionId: activeSession.id,
          timestamp: data.timestamp,
          url: data.url,
          image: base64Image,
          sequence: data.sequence,
          capture: data.capture,
        })
      }

      // Prepend to live gallery preview
      const liveItem: LiveScreenshot = {
        id: Math.random().toString(),
        url: data.url,
        timestamp: data.timestamp,
        imagePath: `data:image/jpeg;base64,${base64Image}`,
        fileSizeBytes: data.capture?.fileSizeBytes,
      }
      setLiveGallery(prev => [liveItem, ...prev.slice(0, 11)]) // Keep last 12 in UI
    })

    return () => { unsubscribe() }
  }, [isElectron, electronAPI, isCapturing, activeSession, sendJson, wsRef])

  // ───────────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────────

  const getResolutionDimensions = () => {
    const res = DESKTOP_RESOLUTIONS.find(r => r.value === resolution)
    return res ? { width: res.width, height: res.height } : { width: 1920, height: 1080 }
  }

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
      connectWs()
    }

    // Create session in backend
    const session = await createSession(targetUrl)
    if (!session) {
      alert('Error: No se pudo crear la sesión en el backend.')
      return
    }

    // Update UI states
    setActiveSession(session)
    setIsCapturing(true)
    setCapturedCount(0)
    setLiveGallery([])
    setCaptureStats(null)
    setSelectedSessionId(session.id)

    // Start capture
    if (isElectron && electronAPI) {
      // Electron: start capture in hidden window at desktop resolution
      electronAPI.startCapture({
        sessionId: session.id,
        url: targetUrl,
        scale: scale,
        quality: quality,
        resolution: getResolutionDimensions(),
      })
    } else {
      // Fallback: web browser simulation
      startMockSimulation(session.id, targetUrl)
    }

    fetchSessions()
  }

  const stopCapture = () => {
    if (isElectron && electronAPI) {
      electronAPI.stopCapture()
    } else {
      stopMockSimulation()
    }

    setIsCapturing(false)
    setActiveSession(null)
    setCaptureStats(null)
    fetchSessions()

    if (selectedSessionId) {
      fetchScreenshots(selectedSessionId)
    }
  }

  // ───────────────────────────────────────────────────────────
  // Mock Simulation (Web Browser Fallback)
  // ───────────────────────────────────────────────────────────

  const startMockSimulation = (sessionId: string, url: string) => {
    if (mockIntervalRef.current) clearInterval(mockIntervalRef.current)

    const dims = getResolutionDimensions()
    let simulatedCount = 0

    mockIntervalRef.current = window.setInterval(() => {
      simulatedCount++
      const timestamp = new Date().toISOString()

      // Generate mock canvas screenshot
      const canvas = document.createElement('canvas')
      canvas.width = dims.width
      canvas.height = dims.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Gradient background
        const grad = ctx.createLinearGradient(0, 0, dims.width, dims.height)
        grad.addColorStop(0, '#1e293b')
        grad.addColorStop(1, '#0f172a')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, dims.width, dims.height)

        // Border decoration
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 4
        ctx.strokeRect(20, 20, dims.width - 40, dims.height - 40)

        // Text info
        ctx.fillStyle = '#f8fafc'
        ctx.font = `bold ${Math.max(16, Math.round(dims.width / 30))}px monospace`
        ctx.fillText('VISUAL DATA PIPELINE', 40, 70)

        ctx.font = `${Math.max(10, Math.round(dims.width / 50))}px monospace`
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(`Resolución: ${dims.width}×${dims.height} (Desktop)`, 40, 110)
        ctx.fillText(`Session: ${sessionId.slice(0, 8)}...`, 40, 145)
        ctx.fillText(`Frame: #${simulatedCount.toString().padStart(4, '0')}`, 40, 180)
        ctx.fillText(`URL: ${url}`, 40, 215)
        ctx.fillText(`Time: ${new Date(timestamp).toLocaleTimeString()}`, 40, 250)

        // Recording indicator
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(dims.width - 60, 70, 8 + Math.sin(simulatedCount) * 4, 0, 2 * Math.PI)
        ctx.fill()
      }

      const base64Image = canvas.toDataURL('image/jpeg', 0.8)

      // Send over WS
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendJson({
          sessionId: sessionId,
          timestamp: timestamp,
          url: url,
          image: base64Image,
          sequence: simulatedCount,
          capture: {
            resolution: dims,
            scale: scale,
            quality: quality,
            outputSize: dims,
          },
        })
      }

      // Add to live gallery
      const liveItem: LiveScreenshot = {
        id: Math.random().toString(),
        url: url,
        timestamp: timestamp,
        imagePath: base64Image,
      }
      setLiveGallery(prev => [liveItem, ...prev.slice(0, 11)])
    }, 333) // 3 FPS
  }

  const stopMockSimulation = () => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current)
      mockIntervalRef.current = null
    }
  }

  // ───────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        activeSessionId={activeSession?.id ?? null}
        isCapturing={isCapturing}
        wsStatus={wsStatus}
        isElectron={isElectron}
        onSelectSession={selectSession}
        onDeleteSession={deleteSession}
      />

      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <Header
          inputUrl={inputUrl}
          onUrlChange={setInputUrl}
          isCapturing={isCapturing}
          capturedCount={capturedCount}
          resolution={resolution}
          onResolutionChange={setResolution}
          scale={scale}
          onScaleChange={setScale}
          quality={quality}
          onQualityChange={setQuality}
          onStartCapture={startSession}
          onStopCapture={stopCapture}
          captureStats={captureStats}
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Capture Viewport */}
          {isCapturing && (
            <Viewport
              isElectron={isElectron}
              inputUrl={inputUrl}
              captureUrl={captureUrl}
              resolution={resolution}
            />
          )}

          {/* Screenshots Gallery */}
          <Gallery
            isCapturing={isCapturing}
            liveGallery={liveGallery}
            selectedSessionId={selectedSessionId}
            selectedSessionScreenshots={selectedSessionScreenshots}
          />
        </div>
      </main>
    </div>
  )
}

export default App
