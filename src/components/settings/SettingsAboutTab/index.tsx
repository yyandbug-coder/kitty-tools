// 设置 — 关于：版本信息、检查更新与恢复默认入口
import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import { Download, Info, Loader2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { useAppUpdater } from '@/hooks/useAppUpdater'

export interface SettingsAboutTabProps {
  appVersion: string
  onRequestReset: () => void
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatProgressText(progress: { downloaded: number; total: number | null }): string {
  if (progress.total === null) {
    return `已下载 ${formatBytes(progress.downloaded)}`
  }
  const percent = Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
  return `已下载 ${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}（${percent}%）`
}

export default function SettingsAboutTab({ appVersion, onRequestReset }: SettingsAboutTabProps) {
  const { phase, updateInfo, progress, errorMessage, updaterEnabled, checkForUpdate, installUpdate } =
    useAppUpdater()
  const [installConfirmOpen, setInstallConfirmOpen] = useState(false)

  const handleCheckUpdate = useCallback(async () => {
    const result = await checkForUpdate()
    if (result.status === 'available') {
      toast.success(`发现新版本 v${result.info.version}`)
      return
    }
    if (result.status === 'uptodate') {
      toast.success('当前已是最新版本')
      return
    }
    if (result.status === 'error') {
      toast.error(result.message)
    }
  }, [checkForUpdate])

  const handleConfirmInstall = useCallback(async () => {
    setInstallConfirmOpen(false)
    await installUpdate()
  }, [installUpdate])

  const isBusy = phase === 'checking' || phase === 'downloading' || phase === 'installing'
  const showUpdateCard = updaterEnabled && (phase === 'available' || phase === 'downloading' || phase === 'installing')

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Info className="size-4" />
            关于
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <AppLogoIcon className="size-12" />
            <div className="flex min-w-0 flex-col gap-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Kitty Tools v{appVersion}</span>
              <span>基于 Tauri v2 与 React 构建的桌面工具集（翻译 + 剪贴板历史）</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isBusy}
              onClick={() => void handleCheckUpdate()}
            >
              {phase === 'checking' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="size-3.5" aria-hidden />
              )}
              {phase === 'checking' ? '检查中…' : '检查更新'}
            </Button>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={onRequestReset}>
              <RotateCcw className="size-3.5" />
              恢复默认设置（保留密钥）
            </Button>
          </div>

          {!updaterEnabled ? (
            <p className="text-xs text-muted-foreground">开发模式下无法使用自动更新，请使用正式安装包测试。</p>
          ) : null}

          {phase === 'error' && errorMessage ? (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}

          {phase === 'uptodate' ? (
            <p className="text-xs text-muted-foreground">当前已是最新版本。</p>
          ) : null}
        </CardContent>
      </Card>

      {showUpdateCard && updateInfo ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">发现新版本 v{updateInfo.version}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {updateInfo.date ? (
              <p className="text-xs text-muted-foreground">
                发布于 {dayjs(updateInfo.date).format('YYYY-MM-DD HH:mm')}
              </p>
            ) : null}
            {updateInfo.notes ? (
              <p className="whitespace-pre-wrap text-muted-foreground">{updateInfo.notes}</p>
            ) : (
              <p className="text-muted-foreground">此版本暂无更新说明。</p>
            )}

            {phase === 'downloading' || phase === 'installing' ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width:
                        progress.total && progress.total > 0
                          ? `${Math.min(100, Math.round((progress.downloaded / progress.total) * 100))}%`
                          : '35%',
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {phase === 'installing' ? '正在安装更新…' : formatProgressText(progress)}
                </p>
              </div>
            ) : (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setInstallConfirmOpen(true)}>
                <Download className="size-3.5" />
                下载并安装
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={installConfirmOpen} onOpenChange={setInstallConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>安装更新</AlertDialogTitle>
            <AlertDialogDescription>
              将下载并安装 Kitty Tools v{updateInfo?.version ?? ''}。安装完成后应用会自动重启，请确保当前没有未保存的工作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>稍后</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmInstall()}>立即更新</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
