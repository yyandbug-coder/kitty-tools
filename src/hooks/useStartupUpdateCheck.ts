// 应用启动后静默检查更新，发现新版本时提示用户
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { checkAppUpdate, isUpdaterEnabled, toUpdateInfo } from '@/lib/app-updater'
import { setPendingStartupUpdate } from '@/lib/app-updater-pending'

let startupCheckDone = false

export function useStartupUpdateCheck() {
  useEffect(() => {
    if (startupCheckDone || !isUpdaterEnabled()) {
      return
    }
    startupCheckDone = true

    void (async () => {
      try {
        const update = await checkAppUpdate()
        if (!update) return

        setPendingStartupUpdate(update)
        const info = toUpdateInfo(update)
        const note = info.notes ? `\n${info.notes}` : ''
        toast.success(`发现新版本 v${info.version}${note}\n可在「设置 → 关于」中下载并安装。`, {
          duration: 8000,
        })
      } catch {
        // 启动时静默失败，避免打扰用户
      }
    })()
  }, [])
}
