import { useState, useCallback } from 'react'
import { API_BASE_URL } from '../config/api'
import type { Session, Screenshot } from '../types'

/**
 * Manages session data: listing, creating, and fetching screenshots.
 */
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedSessionScreenshots, setSelectedSessionScreenshots] = useState<Screenshot[]>([])

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`)
      if (response.ok) {
        const data = await response.json()
        setSessions(data)
      }
    } catch (err) {
      console.error('Error fetching sessions:', err)
    }
  }, [])

  const createSession = useCallback(async (startUrl: string): Promise<Session | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrl })
      })

      if (!response.ok) {
        throw new Error('Failed to create session in backend')
      }

      const session: Session = await response.json()
      return session
    } catch (err) {
      console.error('Error creating session:', err)
      return null
    }
  }, [])

  const fetchScreenshots = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/screenshots/${sessionId}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedSessionScreenshots(data)
      }
    } catch (err) {
      console.error('Error fetching screenshots:', err)
    }
  }, [])

  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId)
    fetchScreenshots(sessionId)
  }, [fetchScreenshots])

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete session')
      }

      setSessions(prev => prev.filter(s => s.id !== sessionId))
      setSelectedSessionId(prev => {
        if (prev === sessionId) {
          setSelectedSessionScreenshots([])
          return null
        }
        return prev
      })

      return true
    } catch (err) {
      console.error('Error deleting session:', err)
      return false
    }
  }, [])

  return {
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    selectedSessionScreenshots,
    fetchSessions,
    createSession,
    deleteSession,
    fetchScreenshots,
    selectSession,
  }
}
