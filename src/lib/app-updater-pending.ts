import type { Update } from '@tauri-apps/plugin-updater'
import { toUpdateInfo, type AppUpdateInfo } from '@/lib/app-updater'

/** 跨窗口共享启动时检测到的更新，避免 About 页需重复检查。 */
let pendingStartupUpdate: Update | null = null

export function setPendingStartupUpdate(update: Update | null): void {
  pendingStartupUpdate = update
}

export function consumePendingStartupUpdate(): { update: Update; info: AppUpdateInfo } | null {
  if (!pendingStartupUpdate) return null
  const update = pendingStartupUpdate
  pendingStartupUpdate = null
  return { update, info: toUpdateInfo(update) }
}

export function peekPendingStartupUpdate(): { update: Update; info: AppUpdateInfo } | null {
  if (!pendingStartupUpdate) return null
  return { update: pendingStartupUpdate, info: toUpdateInfo(pendingStartupUpdate) }
}
