import type { AppUpdateInfo } from '@/lib/app-updater'

/** 跨窗口共享启动时检测到的更新，避免 About 页需重复检查。 */
let pendingStartupUpdate: AppUpdateInfo | null = null

export function setPendingStartupUpdate(info: AppUpdateInfo | null): void {
  pendingStartupUpdate = info
}

export function consumePendingStartupUpdate(): AppUpdateInfo | null {
  if (!pendingStartupUpdate) return null
  const info = pendingStartupUpdate
  pendingStartupUpdate = null
  return info
}

export function peekPendingStartupUpdate(): AppUpdateInfo | null {
  return pendingStartupUpdate
}
