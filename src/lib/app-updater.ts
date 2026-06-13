import { isTauri } from '@tauri-apps/api/core'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'uptodate'
  | 'error'

export interface AppUpdateProgress {
  downloaded: number
  total: number | null
}

export interface AppUpdateInfo {
  version: string
  notes: string
  date: string | null
}

function isUpdaterEnabled(): boolean {
  return isTauri() && !import.meta.env.DEV
}

function normalizeUpdateError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return '检查更新失败，请稍后重试'
}

function toUpdateInfo(update: Update): AppUpdateInfo {
  return {
    version: update.version,
    notes: update.body?.trim() ?? '',
    date: update.date ?? null,
  }
}

function handleDownloadProgress(
  event: DownloadEvent,
  state: { downloaded: number; total: number | null },
  onProgress?: (progress: AppUpdateProgress) => void,
): void {
  switch (event.event) {
    case 'Started':
      state.downloaded = 0
      state.total = event.data.contentLength ?? null
      onProgress?.({ downloaded: state.downloaded, total: state.total })
      break
    case 'Progress':
      state.downloaded += event.data.chunkLength
      onProgress?.({ downloaded: state.downloaded, total: state.total })
      break
    case 'Finished':
      if (state.total !== null) {
        state.downloaded = state.total
      }
      onProgress?.({ downloaded: state.downloaded, total: state.total })
      break
    default:
      break
  }
}

/** 检查是否有可用更新；开发模式或未打包环境下返回 null。 */
export async function checkAppUpdate(): Promise<Update | null> {
  if (!isUpdaterEnabled()) {
    return null
  }

  const update = await check()
  if (!update) {
    return null
  }
  return update
}

/** 下载并安装更新，完成后重启应用。 */
export async function downloadAndInstallAppUpdate(
  update: Update,
  onProgress?: (progress: AppUpdateProgress, event: DownloadEvent['event']) => void,
): Promise<void> {
  const progressState = { downloaded: 0, total: null as number | null }

  await update.downloadAndInstall((event) => {
    handleDownloadProgress(event, progressState, (progress) => {
      onProgress?.(progress, event.event)
    })
  })

  await relaunch()
}

export { isUpdaterEnabled, normalizeUpdateError, toUpdateInfo }
