// 设置 — 关于：版本信息与恢复默认入口
import { Info, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AppLogoIcon from '@/components/shared/AppLogoIcon'

export interface SettingsAboutTabProps {
  appVersion: string
  onRequestReset: () => void
}

export default function SettingsAboutTab({ appVersion, onRequestReset }: SettingsAboutTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Info className="size-4" />
          关于
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <AppLogoIcon className="size-12" />
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            <span className="text-foreground font-medium">Kitty Tools v{appVersion}</span>
            <span>基于 Tauri v2 与 React 构建的桌面工具集（翻译 + 剪贴板历史）</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={onRequestReset}>
          <RotateCcw className="size-3.5" />
          恢复默认设置（保留密钥）
        </Button>
      </CardContent>
    </Card>
  )
}
