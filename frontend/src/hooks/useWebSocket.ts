import { useState, useEffect, useRef, useCallback } from 'react'
import { WS_URL } from '../config/api'
import type { WsStatus } from '../types'

/**
 * Manages WebSocket connection to the FastAPI backend.
 * Auto-reconnects on disconnect.
 */
export function useWebSocket() {
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    setWsStatus('connecting')

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        console.log('[WS] Connected')
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
        console.log('[WS] Disconnected')
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            connect()
          }
        }, 3000)
      }

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        setWsStatus('disconnected')
      }
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e)
      setWsStatus('disconnected')
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  const sendJson = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const sendBinary = useCallback((data: ArrayBuffer | Uint8Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data as any)
    }
  }, [])

  const onMessage = useCallback((handler: (data: Record<string, unknown>) => void) => {
    if (!wsRef.current) return () => {}

    const listener = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data)
        handler(parsed)
      } catch (err) {
        console.error('[WS] Error parsing message:', err)
      }
    }

    wsRef.current.addEventListener('message', listener)
    return () => {
      wsRef.current?.removeEventListener('message', listener)
    }
  }, [])

  return {
    wsStatus,
    wsRef,
    connect,
    sendJson,
    sendBinary,
    onMessage,
  }
}
