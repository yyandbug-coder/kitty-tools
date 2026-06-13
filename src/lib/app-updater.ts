import { invoke } from '@tauri-apps/api/core'
import { Channel } from '@tauri-apps/api/core'
import { isTauri } from '@tauri-apps/api/core'
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

interface RustDownloadEvent {
  event: 'Started' | 'Progress' | 'Finished'
  data: {
    contentLength?: number | null
    chunkLength?: number
  }
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

function handleDownloadProgress(
  event: RustDownloadEvent,
  state: { downloaded: number; total: number | null },
  onProgress?: (progress: AppUpdateProgress, event: RustDownloadEvent['event']) => void,
): void {
  switch (event.event) {
    case 'Started':
      state.downloaded = 0
      state.total = event.data.contentLength ?? null
      onProgress?.({ downloaded: state.downloaded, total: state.total }, event.event)
      break
    case 'Progress':
      state.downloaded += event.data.chunkLength ?? 0
      onProgress?.({ downloaded: state.downloaded, total: state.total }, event.event)
      break
    case 'Finished':
      if (state.total !== null) {
        state.downloaded = state.total
      }
      onProgress?.({ downloaded: state.downloaded, total: state.total }, event.event)
      break
    default:
      break
  }
}

/** 检查是否有可用更新；开发模式或未打包环境下返回 null。 */
export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isUpdaterEnabled()) {
    return null
  }

  const result = await invoke<AppUpdateInfo | null>('check_app_update_cmd')
  return result
}

/** 下载并安装更新，完成后重启应用。 */
export async function downloadAndInstallAppUpdate(
  onProgress?: (progress: AppUpdateProgress, event: RustDownloadEvent['event']) => void,
): Promise<void> {
  const progressState = { downloaded: 0, total: null as number | null }
  const channel = new Channel<RustDownloadEvent>()
  channel.onmessage = (event) => {
    handleDownloadProgress(event, progressState, onProgress)
  }

  await invoke('download_install_app_update_cmd', { onEvent: channel })
  await relaunch()
}

export { isUpdaterEnabled, normalizeUpdateError }
