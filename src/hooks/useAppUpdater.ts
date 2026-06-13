import { useCallback, useEffect, useRef, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'
import {
  checkAppUpdate,
  downloadAndInstallAppUpdate,
  isUpdaterEnabled,
  normalizeUpdateError,
  toUpdateInfo,
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
  const pendingUpdateRef = useRef<Update | null>(null)
  const checkingRef = useRef(false)

  useEffect(() => {
    const pending = consumePendingStartupUpdate()
    if (!pending) return
    pendingUpdateRef.current = pending.update
    setUpdateInfo(pending.info)
    setPhase('available')
  }, [])

  const reset = useCallback(() => {
    pendingUpdateRef.current = null
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
      pendingUpdateRef.current = pending.update
      setUpdateInfo(pending.info)
      setPhase('available')
      return { status: 'available', info: pending.info }
    }

    if (checkingRef.current) {
      return { status: 'error', message: '正在检查更新，请稍候…' }
    }

    checkingRef.current = true
    setPhase('checking')
    setErrorMessage('')
    setProgress(INITIAL_PROGRESS)

    try {
      const update = await checkAppUpdate()
      if (!update) {
        pendingUpdateRef.current = null
        setUpdateInfo(null)
        setPhase('uptodate')
        return { status: 'uptodate' }
      }

      const info = toUpdateInfo(update)
      pendingUpdateRef.current = update
      setUpdateInfo(info)
      setPhase('available')
      return { status: 'available', info }
    } catch (error) {
      const message = normalizeUpdateError(error)
      pendingUpdateRef.current = null
      setUpdateInfo(null)
      setPhase('error')
      setErrorMessage(message)
      return { status: 'error', message }
    } finally {
      checkingRef.current = false
    }
  }, [])

  const installUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current
    if (!update) {
      setPhase('error')
      setErrorMessage('没有可安装的更新，请先检查更新。')
      return
    }

    setPhase('downloading')
    setErrorMessage('')
    setProgress(INITIAL_PROGRESS)

    try {
      await downloadAndInstallAppUpdate(update, (nextProgress, event) => {
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
  }, [])

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
