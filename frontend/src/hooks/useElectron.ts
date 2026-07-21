import { useState, useEffect } from 'react'

/**
 * Detects if the app is running inside Electron.
 */
export function useElectron() {
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    if (window.electronAPI) {
      setIsElectron(true)
    }
  }, [])

  return { isElectron, electronAPI: window.electronAPI }
}
