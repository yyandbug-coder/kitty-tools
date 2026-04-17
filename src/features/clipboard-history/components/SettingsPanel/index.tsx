/**
 * 设置页 - 在独立窗口中展示；外观含主题、下拉切换显示模式与透明度（主窗口历史列表旁不再放模式按钮）
 */
import type { AppSettings } from '@clipboard/types'
import { useEffect, useRef, useState } from 'react'
import { MAX_BACKGROUND_OPACITY, MIN_BACKGROUND_OPACITY, getCustomHuePreviewColor, getThemeOption } from '@clipboard/lib/theme'
import { DEFAULT_GLOBAL_SHORTCUT, formatShortcutForDisplay, shortcutFromKeyboardEvent } from '@clipboard/lib/shortcuts'
import { HISTORY_MAX_ITEM_OPTIONS, HISTORY_RETENTION_DAY_OPTIONS } from '@clipboard/lib/history-settings'
import {
  CheckIcon,
  DatabaseIcon,
  FileDownIcon,
  FileUpIcon,
  KeyboardIcon,
  Loader2Icon,
  PaletteIcon,
  RotateCcwIcon,
  Settings2Icon,
  Trash2Icon
} from 'lucide-react'
import { Button } from '@clipboard/components/ui/button'
import { Switch } from '@clipboard/components/ui/switch'
import { Slider } from '@clipboard/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@clipboard/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@clipboard/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@clipboard/components/ui/alert-dialog'
import CustomColorPicker from '@clipboard/components/CustomColorPicker'
import ModeToggle from '@clipboard/components/ModeToggle'
import { cn } from '@clipboard/lib/utils'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import toast from 'react-hot-toast'

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
  onExportHistory
}: Props) {
  const currentTheme = getThemeOption(settings.theme, settings.customHue)
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [isSavingShortcut, setIsSavingShortcut] = useState(false)
  const [isImportingHistory, setIsImportingHistory] = useState(false)
  const [shortcutError, setShortcutError] = useState('')
  const [destructiveConfirm, setDestructiveConfirm] = useState<'clear' | 'reset' | null>(null)
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [launchAtLoginLoading, setLaunchAtLoginLoading] = useState(false)
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

  useEffect(() => {
    setLaunchAtLoginLoading(true)
    void isEnabled()
      .then((enabled) => setLaunchAtLogin(enabled))
      .catch(() => {
        toast.error('无法读取开机自启动状态。')
      })
      .finally(() => setLaunchAtLoginLoading(false))
  }, [])

  return (
    <>
      <div
        ref={panelRef}
        data-settings-panel
        className={cn(
          '[background:linear-gradient(180deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_8%,transparent),transparent_26%),color-mix(in_oklch,var(--background)_var(--panel-alpha),transparent)] backdrop-blur-[22px]',
          'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
          'flex h-full w-full min-h-0 flex-col overflow-hidden border-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div
            className={cn(
              'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
              'flex items-start justify-between border-b p-5'
            )}
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Settings2Icon className="size-4" />
                设置
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                主题、显示模式与透明度保存在本机；剪贴板条数与保留策略在「数据」中配置。
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col">
              <TabsList>
                <TabsTrigger value="appearance">
                  <PaletteIcon className="size-4 shrink-0" />
                  外观
                </TabsTrigger>
                <TabsTrigger value="interaction">
                  <KeyboardIcon className="size-4 shrink-0" />
                  交互
                </TabsTrigger>
                <TabsTrigger value="data">
                  <DatabaseIcon className="size-4 shrink-0" />
                  数据
                </TabsTrigger>
              </TabsList>

              <TabsContent value="appearance" className="mt-0 flex flex-col gap-6 outline-none">
                <section>
                  <SectionTitle title="外观" description="主题色、显示模式（下拉）与浮窗背景透明度。" />

                  <div className="mt-3 flex items-center gap-2">
                    {COLOR_THEME_OPTIONS.map((themeOption) => (
                      <button
                        key={themeOption.value}
                        type="button"
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full border-2 bg-(--theme-swatch) transition-all',
                          settings.theme === themeOption.value
                            ? 'border-foreground scale-110'
                            : 'border-transparent hover:border-muted-foreground hover:scale-105'
                        )}
                        style={{ ['--theme-swatch' as string]: themeOption.color }}
                        onClick={() => onChange({ theme: themeOption.value })}
                        title={themeOption.label}
                      >
                        {settings.theme === themeOption.value && <CheckIcon className="size-4 text-white" />}
                      </button>
                    ))}

                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'flex size-8 items-center justify-center rounded-full border-2 transition-all',
                            settings.theme === 'custom'
                              ? 'border-foreground scale-110 bg-(--custom-swatch)'
                              : 'border-dashed border-muted-foreground/50 hover:border-muted-foreground hover:scale-105'
                          )}
                          style={
                            settings.theme === 'custom'
                              ? { ['--custom-swatch' as string]: getCustomHuePreviewColor(settings.customHue) }
                              : undefined
                          }
                          title="自定义颜色"
                        >
                          {settings.theme === 'custom' ? (
                            <CheckIcon className="size-4 text-white" />
                          ) : (
                            <PaletteIcon className="size-4 text-muted-foreground" />
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3" side="bottom" align="end">
                        <CustomColorPicker
                          value={settings.customHue}
                          onChange={(hue) => onChange({ theme: 'custom', customHue: hue })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                      'mt-4 rounded-2xl px-4 py-3'
                    )}
                    title="浅色、深色或跟随系统；与主界面历史列表分离，仅在此调整。"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className={cn('text-foreground', 'min-w-0 text-sm font-medium')}>显示模式</p>
                      <ModeToggle />
                    </div>
                  </div>

                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                      'mt-4 rounded-2xl px-4 py-4'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={cn('text-foreground', 'text-sm font-medium')}>背景透明度</p>
                        <p className={cn('text-muted-foreground', 'mt-1 text-xs leading-5')}>
                          当前主题：{currentTheme.label}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'bg-[color-mix(in_oklch,var(--secondary)_52%,transparent)] border border-[color-mix(in_oklch,var(--border)_36%,transparent)] text-[color-mix(in_oklch,var(--muted-foreground)_88%,transparent)]',
                          'rounded-full px-2.5 py-1 text-xs'
                        )}
                      >
                        {settings.backgroundOpacity}%
                      </span>
                    </div>
                    <Slider
                      min={MIN_BACKGROUND_OPACITY}
                      max={MAX_BACKGROUND_OPACITY}
                      step={1}
                      value={[settings.backgroundOpacity]}
                      onValueChange={([value]) => onChange({ backgroundOpacity: value })}
                      className="mt-4 w-full"
                    />
                    <div className={cn('text-muted-foreground', 'mt-2 flex items-center justify-between text-[11px]')}>
                      <span>更透明</span>
                      <span>更厚重</span>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="interaction" className="mt-0 flex flex-col gap-6 outline-none">
                <section>
                  <SectionTitle title="交互" description="快捷键、预览、粘贴与菜单栏。" />

                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                      'mt-3 overflow-hidden rounded-2xl'
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
                          按下新组合键；<kbd className="rounded border px-1">Esc</kbd> 取消。需含修饰键。
                        </p>
                      ) : (
                        <p className={cn('text-muted-foreground', 'mt-2 text-[11px] leading-relaxed')}>
                          需同时按修饰键与字母键，例如 {formatShortcutForDisplay(DEFAULT_GLOBAL_SHORTCUT)}。
                        </p>
                      )}
                      {shortcutError && <p className="mt-1.5 text-xs leading-5 text-destructive">{shortcutError}</p>}
                    </div>

                    <SettingToggleRow
                      title="右侧预览"
                      description="列表旁显示完整内容与时间。"
                      checked={settings.showPreview}
                      onCheckedChange={(checked) => onChange({ showPreview: checked })}
                    />
                    <SettingToggleRow
                      title="回车粘贴"
                      description="选中项后回车即粘贴到前台应用。"
                      checked={settings.pasteOnEnter}
                      onCheckedChange={(checked) => onChange({ pasteOnEnter: checked })}
                    />
                    <SettingToggleRow
                      title="失焦时隐藏窗口"
                      description="点击其他应用后约 0.36 秒自动收起；打开本页设置或系统另存为对话框时可能短暂失焦，可按快捷键再次呼出。"
                      checked={settings.hideWhenUnfocused}
                      onCheckedChange={(checked) => onChange({ hideWhenUnfocused: checked })}
                    />
                    <SettingToggleRow
                      title="禁止选中界面文字"
                      description="开启后左侧列表等处无法用鼠标拖选；右侧仅下方正文滚动区可拖选复制，预览顶部信息区不可选。顶部搜索框也可正常选中编辑。"
                      checked={settings.disableTextSelection}
                      onCheckedChange={(checked) => onChange({ disableTextSelection: checked })}
                    />
                    <SettingToggleRow
                      title="开机自启动"
                      description="登录系统后自动在后台运行本应用（仍可用快捷键呼出）。"
                      checked={launchAtLogin}
                      switchDisabled={launchAtLoginLoading}
                      onCheckedChange={(checked) => {
                        void (async () => {
                          try {
                            if (checked) {
                              await enable()
                            } else {
                              await disable()
                            }
                            setLaunchAtLogin(checked)
                          } catch {
                            toast.error('设置开机自启动失败，请稍后重试。')
                            const actual = await isEnabled().catch(() => null)
                            if (actual !== null) {
                              setLaunchAtLogin(actual)
                            }
                          }
                        })()
                      }}
                    />
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="data" className="mt-0 flex flex-col gap-6 outline-none">
                <section>
                  <SectionTitle title="数据" description="本地历史保留、JSON 备份与清理，集中在一处管理。" />

                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                      'mt-3 overflow-hidden rounded-2xl'
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
                        「不限制」时列表可无限增长；有上限时新复制会顶替最旧的一条（与保留天数无关）。
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
                        「永久」不会按时间清理；选天数则超期条目从本地移除，不影响已导出的 JSON。
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
                        导入导出格式一致（含 history）。支持条目数组或含 history 的对象；按 id
                        合并列表，图片仅元数据。当前 {historyCount} 条。
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
                        清空仅删除本机历史。恢复默认将重置主题、显示模式、快捷键与各项开关（不自动清空历史）。
                      </p>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          className={cn(
                            'bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)]',
                            'flex h-auto min-h-10 w-full items-center justify-between rounded-xl px-3 py-2.5 text-left'
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
            <AlertDialogTitle>{destructiveConfirm === 'clear' ? '清空当前历史？' : '恢复默认设置？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {destructiveConfirm === 'clear'
                ? historyCount === 0
                  ? '当前没有可清空的历史记录。'
                  : `将永久删除本机全部 ${historyCount} 条剪贴板历史，此操作不可撤销。`
                : '将重置主题、显示模式、调色板、透明度、快捷键与各项交互开关，并关闭开机自启动；不会清空剪贴板历史。'}
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
                    void disable()
                      .then(() => setLaunchAtLogin(false))
                      .catch(() => {
                        toast.error('已恢复默认设置，但关闭开机自启动失败，可在系统登录项中手动移除。')
                      })
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

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className={cn('text-foreground', 'text-sm font-medium')}>{title}</p>
      <p className={cn('text-muted-foreground', 'mt-1 text-xs leading-5')}>{description}</p>
    </div>
  )
}

const COLOR_THEME_OPTIONS = [
  { value: 'default' as const, color: '#e11d48', label: '默认玫瑰' },
  { value: 'ocean' as const, color: '#06b6d4', label: '海雾青' },
  { value: 'forest' as const, color: '#10b981', label: '林地绿' },
  { value: 'sunset' as const, color: '#f97316', label: '落日橙' }
]

/** 单卡片内分区：顶部分割线与开关行（与「数据」卡片分区样式一致） */
function SettingToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  switchDisabled = false
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  switchDisabled?: boolean
}) {
  return (
    <div
      className={cn(
        'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
        'flex items-center justify-between gap-3 border-t px-4 py-3'
      )}
    >
      <div className="min-w-0 flex-1 pr-1">
        <p className={cn('text-foreground', 'text-sm font-medium leading-tight')}>{title}</p>
        <p className={cn('text-muted-foreground', 'mt-0.5 text-[11px] leading-snug')}>{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={switchDisabled} className="shrink-0" />
    </div>
  )
}
