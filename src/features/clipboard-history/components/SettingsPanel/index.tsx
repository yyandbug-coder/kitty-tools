/**
 * 设置页
 * 在独立窗口中展示；外观包含主题、显示模式与透明度（主窗口历史列表旁不再放模式按钮）
 */
import type { AppSettings } from '@clipboard/types'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_GLOBAL_SHORTCUT,
  formatShortcutForDisplay,
  shortcutFromKeyboardEvent,
} from '@clipboard/lib/shortcuts'
import {
  HISTORY_MAX_ITEM_OPTIONS,
  HISTORY_RETENTION_DAY_OPTIONS,
} from '@clipboard/lib/history-settings'
import {
  DatabaseIcon,
  FileDownIcon,
  FileUpIcon,
  KeyboardIcon,
  Loader2Icon,
  RotateCcwIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@clipboard/components/ui/button'
import { Switch } from '@clipboard/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@clipboard/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@clipboard/components/ui/alert-dialog'
import { cn } from '@clipboard/lib/utils'
import { SettingsSectionTitle } from '@/shared/components/settings/SettingsSectionTitle'
import { SettingsControlRow } from '@/shared/components/settings/SettingsControlRow'

interface Props {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onUpdateShortcut: (shortcut: string) => Promise<void>
  onReset: () => void
  onClearHistory: () => void
  onImportHistoryFile: (file: File) => Promise<void>
  historyCount: number
  onExportHistory: () => void | Promise<void>
}

export default function SettingsPanel({
  settings,
  onChange,
  onUpdateShortcut,
  onReset,
  onClearHistory,
  onImportHistoryFile,
  historyCount,
  onExportHistory,
}: Props) {
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [isSavingShortcut, setIsSavingShortcut] = useState(false)
  const [isImportingHistory, setIsImportingHistory] = useState(false)
  const [shortcutError, setShortcutError] = useState('')
  const [destructiveConfirm, setDestructiveConfirm] = useState<'clear' | 'reset' | null>(null)
  const importHistoryInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isRecordingShortcut) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setIsRecordingShortcut(false)
        setShortcutError('')
        return
      }

      const shortcut = shortcutFromKeyboardEvent(event)
      if (!shortcut) {
        setShortcutError('至少需要一个修饰键，再加一个普通按键。')
        return
      }

      setIsSavingShortcut(true)
      setShortcutError('')

      void onUpdateShortcut(shortcut)
        .then(() => {
          setIsRecordingShortcut(false)
        })
        .catch((error) => {
          setShortcutError(typeof error === 'string' ? error : '这个快捷键可能已被其他应用占用。')
        })
        .finally(() => {
          setIsSavingShortcut(false)
        })
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isRecordingShortcut, onUpdateShortcut])

  return (
    <>
      <div
        ref={panelRef}
        data-settings-panel
        className={cn(
          '[background:linear-gradient(180deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_8%,transparent),transparent_26%),color-mix(in_oklch,var(--background)_var(--panel-alpha),transparent)] backdrop-blur-[22px]',
          'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
          'flex h-full w-full min-h-0 flex-col overflow-hidden border-0',
        )}
      >
        <div className="flex h-full flex-col">
          <div
            className={cn(
              'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
              'flex items-start justify-between border-b p-5',
            )}
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Settings2Icon className="size-4" />
                设置
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                主题、显示模式与透明度保存在本机；剪贴板条数与保留策略在“数据”中配置。
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <Tabs defaultValue="interaction" className="flex min-h-0 flex-1 flex-col">
              <TabsList>
                <TabsTrigger value="interaction">
                  <KeyboardIcon className="size-4 shrink-0" />
                  交互
                </TabsTrigger>
                <TabsTrigger value="data">
                  <DatabaseIcon className="size-4 shrink-0" />
                  数据
                </TabsTrigger>
              </TabsList>

              <TabsContent value="interaction" className="mt-0 flex flex-col gap-6 outline-none">
                <section>
                  <SettingsSectionTitle
                    title="交互"
                    description="快捷键、预览、粘贴与菜单栏。"
                  />

                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                      'mt-3 overflow-hidden rounded-2xl',
                    )}
                  >
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cn('text-foreground', 'text-sm font-medium')}>全局快捷键</p>
                          <p className={cn('text-muted-foreground', 'mt-0.5 text-xs tabular-nums')}>
                            {formatShortcutForDisplay(settings.globalShortcut)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            variant={isRecordingShortcut ? 'primary' : 'default'}
                            size="sm"
                            onClick={() => {
                              setShortcutError('')
                              setIsRecordingShortcut((value) => !value)
                            }}
                            disabled={isSavingShortcut}
                          >
                            {isRecordingShortcut ? '按下组合键' : '录制'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShortcutError('')
                              setIsRecordingShortcut(false)
                              setIsSavingShortcut(true)
                              void onUpdateShortcut(DEFAULT_GLOBAL_SHORTCUT)
                                .catch((error) => {
                                  setShortcutError(typeof error === 'string' ? error : '恢复默认快捷键失败。')
                                })
                                .finally(() => {
                                  setIsSavingShortcut(false)
                                })
                            }}
                            disabled={isSavingShortcut || settings.globalShortcut === DEFAULT_GLOBAL_SHORTCUT}
                          >
                            默认
                          </Button>
                        </div>
                      </div>
                      {isRecordingShortcut ? (
                        <p className={cn('text-muted-foreground', 'mt-2 text-[11px] leading-relaxed')}>
                          按下新组合键，<kbd className="rounded border px-1">Esc</kbd> 取消。需包含修饰键。
                        </p>
                      ) : (
                        <p className={cn('text-muted-foreground', 'mt-2 text-[11px] leading-relaxed')}>
                          需同时按修饰键与字母键，例如 {formatShortcutForDisplay(DEFAULT_GLOBAL_SHORTCUT)}。
                        </p>
                      )}
                      {shortcutError ? (
                        <p className="mt-1.5 text-xs leading-5 text-destructive">{shortcutError}</p>
                      ) : null}
                    </div>

                    <SettingsControlRow
                      title="右侧预览"
                      description="列表旁显示完整内容与时间。"
                      className={cn(
                        'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
                        'rounded-none border-t px-4 py-3',
                      )}
                      contentClassName="pr-1"
                      titleClassName="leading-tight"
                      descriptionClassName="mt-0.5 text-[11px] leading-snug"
                    >
                      <Switch
                        checked={settings.showPreview}
                        onCheckedChange={(checked) => onChange({ showPreview: checked })}
                        className="shrink-0"
                      />
                    </SettingsControlRow>

                    <SettingsControlRow
                      title="回车粘贴"
                      description="选中项后回车即可粘贴到前台应用。"
                      className={cn(
                        'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
                        'rounded-none border-t px-4 py-3',
                      )}
                      contentClassName="pr-1"
                      titleClassName="leading-tight"
                      descriptionClassName="mt-0.5 text-[11px] leading-snug"
                    >
                      <Switch
                        checked={settings.pasteOnEnter}
                        onCheckedChange={(checked) => onChange({ pasteOnEnter: checked })}
                        className="shrink-0"
                      />
                    </SettingsControlRow>

                    <SettingsControlRow
                      title="禁止选中界面文字"
                      description="开启后左侧列表等处无法用鼠标拖选；右侧仅下方正文滚动区可拖选复制，预览顶部信息区不可选。顶部搜索框也可正常选中编辑。"
                      className={cn(
                        'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
                        'rounded-none border-t px-4 py-3',
                      )}
                      contentClassName="pr-1"
                      titleClassName="leading-tight"
                      descriptionClassName="mt-0.5 text-[11px] leading-snug"
                    >
                      <Switch
                        checked={settings.disableTextSelection}
                        onCheckedChange={(checked) => onChange({ disableTextSelection: checked })}
                        className="shrink-0"
                      />
                    </SettingsControlRow>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="data" className="mt-0 flex flex-col gap-6 outline-none">
                <section>
                  <SettingsSectionTitle
                    title="数据"
                    description="本地历史保留、JSON 备份与清理，集中在一处管理。"
                  />

                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                      'mt-3 overflow-hidden rounded-2xl',
                    )}
                  >
                    <input
                      ref={importHistoryInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      aria-hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (!file) return
                        setIsImportingHistory(true)
                        void onImportHistoryFile(file).finally(() => {
                          setIsImportingHistory(false)
                        })
                      }}
                    />

                    <div className="px-4 py-4">
                      <p className={cn('text-foreground', 'text-sm font-medium')}>列表条数上限</p>
                      <p className={cn('text-muted-foreground', 'mt-1 text-xs leading-5')}>
                        “不限制”时列表可无限增长；有上限时新复制会顶替最旧的一条（与保留天数无关）。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={settings.historyMaxItems === 0 ? 'primary' : 'default'}
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => onChange({ historyMaxItems: 0 })}
                        >
                          不限制
                        </Button>
                        {HISTORY_MAX_ITEM_OPTIONS.map((value) => (
                          <Button
                            key={value}
                            type="button"
                            variant={settings.historyMaxItems === value ? 'primary' : 'default'}
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs tabular-nums"
                            onClick={() => onChange({ historyMaxItems: value })}
                          >
                            {value} 条
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div
                      className={cn('border-[color-mix(in_oklch,var(--border)_26%,transparent)]', 'border-t px-4 py-4')}
                    >
                      <p className={cn('text-foreground', 'text-sm font-medium')}>历史保留</p>
                      <p className={cn('text-muted-foreground', 'mt-1 text-xs leading-5')}>
                        “永久”不会按时间清理；选天数则超期条目从本地移除，不影响已导出的 JSON。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={settings.historyRetentionDays === 0 ? 'primary' : 'default'}
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => onChange({ historyRetentionDays: 0 })}
                        >
                          永久
                        </Button>
                        {HISTORY_RETENTION_DAY_OPTIONS.map((value) => (
                          <Button
                            key={value}
                            type="button"
                            variant={settings.historyRetentionDays === value ? 'primary' : 'default'}
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() => onChange({ historyRetentionDays: value })}
                          >
                            {value} 天
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div
                      className={cn('border-[color-mix(in_oklch,var(--border)_26%,transparent)]', 'border-t px-4 py-4')}
                    >
                      <p className={cn('text-foreground', 'text-sm font-medium')}>JSON 备份</p>
                      <p className={cn('text-muted-foreground', 'mt-1 text-xs leading-5')}>
                        导入导出格式一致（含 `history`）。支持条目数组或含 `history` 的对象；按 id 合并列表，图片仅元数据。当前 {historyCount} 条。
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="default"
                          className="h-10 w-full"
                          disabled={isImportingHistory}
                          onClick={() => importHistoryInputRef.current?.click()}
                        >
                          {isImportingHistory ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <FileUpIcon className="size-4" />
                          )}
                          导入
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          className="h-10 w-full"
                          disabled={historyCount === 0}
                          onClick={onExportHistory}
                        >
                          <FileDownIcon className="size-4" />
                          导出
                        </Button>
                      </div>
                    </div>

                    <div
                      className={cn('border-[color-mix(in_oklch,var(--border)_26%,transparent)]', 'border-t px-4 py-4')}
                    >
                      <p className={cn('text-muted-foreground', 'mb-2 text-[11px] leading-relaxed')}>
                        清空仅删除本机历史。恢复默认将重置主题、显示模式、快捷键与各项开关（不自动清空历史，也不影响翻译设置）。
                      </p>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          className={cn(
                            'bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)]',
                            'flex h-auto min-h-10 w-full items-center justify-between rounded-xl px-3 py-2.5 text-left',
                          )}
                          disabled={historyCount === 0}
                          onClick={() => setDestructiveConfirm('clear')}
                        >
                          <span className="text-sm font-medium text-destructive">清空当前历史</span>
                          <Trash2Icon className="size-4 shrink-0 text-destructive/80" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="flex h-auto min-h-10 w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-accent/35"
                          onClick={() => setDestructiveConfirm('reset')}
                        >
                          <span className={cn('text-foreground', 'text-sm font-medium')}>恢复默认设置</span>
                          <RotateCcwIcon className={cn('text-muted-foreground', 'size-4 shrink-0')} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <AlertDialog
        open={destructiveConfirm !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDestructiveConfirm(null)
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {destructiveConfirm === 'clear' ? '清空当前历史？' : '恢复默认设置？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {destructiveConfirm === 'clear'
                ? historyCount === 0
                  ? '当前没有可清空的历史记录。'
                  : `将永久删除本机全部 ${historyCount} 条剪贴板历史，此操作不可撤销。`
                : '将重置主题、显示模式、调色板、透明度、快捷键与各项交互开关；不会清空剪贴板历史，也不会影响翻译模块设置。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant={destructiveConfirm === 'clear' ? 'danger' : 'primary'}
                disabled={destructiveConfirm === 'clear' && historyCount === 0}
                onClick={() => {
                  if (destructiveConfirm === 'clear') {
                    if (historyCount === 0) {
                      return
                    }
                    onClearHistory()
                  } else if (destructiveConfirm === 'reset') {
                    setShortcutError('')
                    setIsRecordingShortcut(false)
                    onReset()
                  }
                }}
              >
                {destructiveConfirm === 'clear' ? '清空' : '恢复默认'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
