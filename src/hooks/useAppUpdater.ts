import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkAppUpdate,
  downloadAndInstallAppUpdate,
  isUpdaterEnabled,
  normalizeUpdateError,
  type AppUpdateInfo,
  type AppUpdatePhase,
  type AppUpdateProgress,
} from '@/lib/app-updater'
import { consumePendingStartupUpdate, peekPendingStartupUpdate } from '@/lib/app-updater-pending'

export type AppUpdateCheckResult =
  | { status: 'available'; info: AppUpdateInfo }
  | { status: 'uptodate' }
  | { status: 'error'; message: string }
  | { status: 'disabled' }

interface UseAppUpdaterResult {
  phase: AppUpdatePhase
  updateInfo: AppUpdateInfo | null
  progress: AppUpdateProgress
  errorMessage: string
  updaterEnabled: boolean
  checkForUpdate: (options?: { silent?: boolean }) => Promise<AppUpdateCheckResult>
  installUpdate: () => Promise<void>
  reset: () => void
}

const INITIAL_PROGRESS: AppUpdateProgress = { downloaded: 0, total: null }

export function useAppUpdater(): UseAppUpdaterResult {
  const [phase, setPhase] = useState<AppUpdatePhase>('idle')
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [progress, setProgress] = useState<AppUpdateProgress>(INITIAL_PROGRESS)
  const [errorMessage, setErrorMessage] = useState('')
  const checkingRef = useRef(false)

  useEffect(() => {
    const pending = consumePendingStartupUpdate()
    if (!pending) return
    setUpdateInfo(pending)
    setPhase('available')
  }, [])

  const reset = useCallback(() => {
    setPhase('idle')
    setUpdateInfo(null)
    setProgress(INITIAL_PROGRESS)
    setErrorMessage('')
  }, [])

  const checkForUpdate = useCallback(async (options?: { silent?: boolean }): Promise<AppUpdateCheckResult> => {
    if (!isUpdaterEnabled()) {
      const message = '开发模式下无法检查更新，请使用正式安装包。'
      if (!options?.silent) {
        setPhase('error')
        setErrorMessage(message)
      }
      return { status: 'disabled' }
    }

    const pending = peekPendingStartupUpdate()
    if (pending) {
      setUpdateInfo(pending)
      setPhase('available')
      return { status: 'available', info: pending }
    }

    if (checkingRef.current) {
      return { status: 'error', message: '正在检查更新，请稍候…' }
    }

    checkingRef.current = true
    setPhase('checking')
    setErrorMessage('')
    setProgress(INITIAL_PROGRESS)

    try {
      const info = await checkAppUpdate()
      if (!info) {
        setUpdateInfo(null)
        setPhase('uptodate')
        return { status: 'uptodate' }
      }

      setUpdateInfo(info)
      setPhase('available')
      return { status: 'available', info }
    } catch (error) {
      const message = normalizeUpdateError(error)
      setUpdateInfo(null)
      setPhase('error')
      setErrorMessage(message)
      return { status: 'error', message }
    } finally {
      checkingRef.current = false
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!updateInfo) {
      setPhase('error')
      setErrorMessage('没有可安装的更新，请先检查更新。')
      return
    }

    setPhase('downloading')
    setErrorMessage('')
    setProgress(INITIAL_PROGRESS)

    try {
      await downloadAndInstallAppUpdate((nextProgress, event) => {
        setProgress(nextProgress)
        if (
          event === 'Finished' ||
          (nextProgress.total !== null && nextProgress.downloaded >= nextProgress.total)
        ) {
          setPhase('installing')
        }
      })
    } catch (error) {
      setPhase('error')
      setErrorMessage(normalizeUpdateError(error))
    }
  }, [updateInfo])

  return {
    phase,
    updateInfo,
    progress,
    errorMessage,
    updaterEnabled: isUpdaterEnabled(),
    checkForUpdate,
    installUpdate,
    reset,
  }
}
