// ───────────────────────────────────────────────────────────
// Shared Types for Visual Data Pipeline
// ───────────────────────────────────────────────────────────

export interface Session {
  id: string
  createdAt: string
  startUrl: string
}

export interface CaptureMetadata {
  resolution?: { width: number; height: number }
  scale?: number
  quality?: number
  outputSize?: { width: number; height: number }
  fileSizeBytes?: number
  isDuplicate?: boolean
  perceptualHash?: string
}

export interface AnalysisStub {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  extractedData?: Record<string, unknown> | null
  analyzedAt?: string | null
}

export interface Screenshot {
  id: string
  sessionId: string
  timestamp: string
  url: string
  imagePath: string
  capture?: CaptureMetadata
  analysis?: AnalysisStub
}

export interface LiveScreenshot {
  id: string
  url: string
  timestamp: string
  imagePath: string // base64 data URL for live view
  fileSizeBytes?: number
}

export interface CaptureConfig {
  sessionId: string
  url: string
  scale: number
  quality: number
  resolution: { width: number; height: number }
}

export interface CaptureStats {
  totalFrames: number
  duplicatesSkipped: number
  totalBytes: number
  currentUrl: string
}

export type WsStatus = 'disconnected' | 'connecting' | 'connected'

export interface DesktopResolution {
  label: string
  value: string
  width: number
  height: number
}

// Only desktop resolutions — mobile/tablet removed per project goal
export const DESKTOP_RESOLUTIONS: DesktopResolution[] = [
  { label: 'Full HD (1920×1080)', value: '1920x1080', width: 1920, height: 1080 },
  { label: 'HD+ (1600×900)', value: '1600x900', width: 1600, height: 900 },
  { label: 'HD (1366×768)', value: '1366x768', width: 1366, height: 768 },
  { label: 'Standard (1280×800)', value: '1280x800', width: 1280, height: 800 },
  { label: 'WQHD (2560×1440)', value: '2560x1440', width: 2560, height: 1440 },
]

// Extend window interface for Electron IPC Bridge
declare global {
  interface Window {
    electronAPI?: {
      startCapture: (config: CaptureConfig | string) => void
      stopCapture: () => void
      setResolution: (resolution: { width: number; height: number }) => void
      captureOnce: () => Promise<string | null>
      onScreenshot: (callback: (event: unknown, data: {
        imageBuffer?: ArrayBuffer
        image?: string // legacy base64
        url: string
        timestamp: string
        sequence?: number
        capture?: CaptureMetadata
      }) => void) => () => void
      onWebviewNavigate: (callback: (event: unknown, url: string) => void) => () => void
      onCaptureStats: (callback: (event: unknown, stats: CaptureStats) => void) => () => void
    }
  }
}
