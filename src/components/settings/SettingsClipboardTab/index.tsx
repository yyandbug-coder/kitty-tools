// 设置 — 剪贴板：条数、保留天数、回车粘贴与预览等
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { HISTORY_MAX_ITEMS_OPTIONS, HISTORY_RETENTION_OPTIONS } from '@/app/clipboard/lib/history-settings'
import type { AppConfig } from '@/types'

export interface SettingsClipboardTabProps {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
}

export default function SettingsClipboardTab({ config, updateConfig }: SettingsClipboardTabProps) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-4">
        <div className="space-y-1.5">
          <div
            className="flex items-center justify-between gap-3"
            role="group"
            aria-label="剪贴板历史最大条目数"
          >
            <span className="shrink-0 text-sm font-medium">最大条目数</span>
            <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
              {HISTORY_MAX_ITEMS_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={config.clipboardHistoryMax === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => void updateConfig({ clipboardHistoryMax: opt.value })}
                  className="text-xs"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">收藏条目不受此限制影响</p>
        </div>

        <div
          className="flex items-center justify-between gap-3"
          role="group"
          aria-label="剪贴板历史保留天数"
        >
          <span className="shrink-0 text-sm font-medium">保留天数</span>
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            {HISTORY_RETENTION_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={config.clipboardHistoryRetentionDays === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => void updateConfig({ clipboardHistoryRetentionDays: opt.value })}
                className="text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">回车粘贴</label>
            <p className="text-xs text-muted-foreground">
              按 <Kbd>Enter</Kbd> 直接粘贴选中项
            </p>
          </div>
          <Switch
            checked={config.clipboardPasteOnEnter}
            onCheckedChange={(v) => void updateConfig({ clipboardPasteOnEnter: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Eye className="size-3.5" />
              显示预览
            </label>
            <p className="text-xs text-muted-foreground">在侧边栏显示内容预览</p>
          </div>
          <Switch
            checked={config.clipboardShowPreview}
            onCheckedChange={(v) => void updateConfig({ clipboardShowPreview: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">禁止文本选中</label>
            <p className="text-xs text-muted-foreground">macOS 风格，防止意外选中文字</p>
          </div>
          <Switch
            checked={config.clipboardDisableTextSelection}
            onCheckedChange={(v) => void updateConfig({ clipboardDisableTextSelection: v })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
