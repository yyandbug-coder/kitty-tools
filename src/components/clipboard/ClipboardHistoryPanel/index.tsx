// 剪贴板历史浮层 - Alfred 风格弹出式剪贴板管理器（不透明窗口，样式与划词翻译浮窗一致）
// 双栏布局：左侧列表（@tanstack/react-virtual 虚拟列表）+ 右侧预览面板；由 html/clipboard-popup.html 加载 app/clipboard/main.tsx
import type { CSSProperties, PointerEvent } from 'react'
import type { AppTheme } from '@/types'
import { lazy, Suspense, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import toast, { Toaster } from 'react-hot-toast'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useClipboard } from '@/app/clipboard/hooks/useClipboard'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useKittyIsDarkMode } from '@/hooks/useKittyIsDarkMode'
import type { ClipboardItem } from '@/types'
import { APP_DISPLAY_NAME } from '@/lib/app-meta'
import { getThemeRuntimeStyle } from '@/lib/theme'
import ClipboardItemCard from '@/components/clipboard/ClipboardItemCard'
import ClipboardHistoryListSkeleton from '@/components/clipboard/ClipboardHistoryListSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toastInvokeError } from '@/lib/invoke-helpers'
import { Loader2, Pin, Settings, Star } from 'lucide-react'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { cn } from '@/lib/utils'

const ClipboardPreview = lazy(() => import('@/components/clipboard/ClipboardPreview'))

export default function ClipboardHistoryPanel() {
  const listScrollParentRef = useRef<HTMLDivElement>(null)
  const keyboardRootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { config, loaded, updateConfig } = useAppConfig()
  const isDarkMode = useKittyIsDarkMode(config.theme)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode]
  )
  const {
    history, isHistoryLoading, search, setSearch, showFavoritesOnly, setShowFavoritesOnly,
    favoritedTotal, filtered, filterWorkerPending, selectedItem, selectedIndex,
    setSelectedIndex, toggleItemFavorite, removeHistoryItem, handlePaste, handleKeyDown,
    flushClipboardHistoryToDisk,
  } = useClipboard(config)

  const listVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listScrollParentRef.current,
    estimateSize: () => 76,
    overscan: 8,
    getItemKey: (index) => {
      const it = filtered[index]
      return it ? it.id : String(index)
    },
  })

  useLayoutEffect(() => {
    if (filtered.length === 0) {
      return
    }
    const idx = Math.min(selectedIndex, filtered.length - 1)
    listVirtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [filtered, selectedIndex, listVirtualizer])

  // Exit handler
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen('app-exit-requested', async () => {
      try {
        await flushClipboardHistoryToDisk()
      } catch (error) {
        console.error('退出前落盘失败:', error)
        toast.error('保存剪贴板历史失败，部分数据可能未写入。应用即将退出。', { duration: 5000 })
      }
      try {
        await invoke('exit_after_flush')
      } catch (error) {
        console.error('exit_after_flush 调用失败:', error)
        toast.error('退出指令失败，若窗口未关闭请从任务管理器结束进程。', { duration: 4500 })
      }
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [flushClipboardHistoryToDisk])

  // Focus search input when panel is shown via hotkey/tray
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    const focus = () => searchInputRef.current?.focus({ preventScroll: true })
    void listen('focus-clipboard-panel', () => {
      focus()
      setTimeout(focus, 100)
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  // 失焦自动隐藏已由 Rust 原生 WindowEvent::Focused(false) 驱动（与浮动翻译窗口一致）
  // 此处仅负责窗口获焦时的焦点管理
  useEffect(() => {
    const onFocus = () => {
      requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
    }
    const focusChanged = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) onFocus()
    })
    const tauriFocus = getCurrentWindow().listen('tauri://focus', onFocus)
    return () => {
      focusChanged.then(fn => fn()).catch(() => {})
      tauriFocus.then(fn => fn()).catch(() => {})
    }
  }, [])

  const headerHistoryBadge = useMemo(() => {
    const q = search.trim().length > 0
    const cap = config.clipboardHistoryMax
    const matchLabel = filterWorkerPending && q ? '…' : String(filtered.length)
    if (showFavoritesOnly) {
      if (q) {
        return {
          text: `${matchLabel}/${favoritedTotal}`,
          title: filterWorkerPending
            ? '正在后台过滤收藏条目…'
            : `在已收藏条目中匹配到 ${filtered.length} 条；收藏共 ${favoritedTotal} 条`,
          isAtCap: false,
        }
      }
      return { text: favoritedTotal === 0 ? '—' : `${favoritedTotal}`, title: favoritedTotal === 0 ? '在列表中右键或使用星标可将条目加入收藏' : `当前共 ${favoritedTotal} 条收藏`, isAtCap: false }
    }
    if (q) {
      return {
        text: `${matchLabel}/${history.length}`,
        title: filterWorkerPending ? '正在后台过滤本地历史…' : `在全部 ${history.length} 条本地历史中搜索`,
        isAtCap: false,
      }
    }
    const n = history.length
    const unlimited = cap <= 0
    const full = !unlimited && n >= cap
    return {
      text: unlimited ? `${n}条` : `${n}/${cap}`,
      title: unlimited ? `未限制列表条数，当前 ${n} 条` : full ? `已达本地上限 ${cap} 条` : `本地最多保留 ${cap} 条，当前 ${n} 条`,
      isAtCap: full,
    }
  }, [search, showFavoritesOnly, filtered.length, favoritedTotal, history.length, config.clipboardHistoryMax, filterWorkerPending])

  const handleItemSelect = useCallback((index: number) => { setSelectedIndex(index) }, [])
  const handleItemAction = useCallback((item: ClipboardItem) => { void handlePaste(item) }, [handlePaste])
  const handleRemoveHistoryItem = useCallback((id: string) => {
    if (!removeHistoryItem(id)) return
    toast.success('已删除该条记录。')
  }, [removeHistoryItem])

  const handleDragPointerDown = useCallback(async (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-no-drag="true"]')) return
    if (event.button !== 0) return
    try {
      await invoke('start_clipboard_drag')
    } catch (e) { toastInvokeError('无法开始拖动窗口', e) }
  }, [])

  const handleOpenSettings = useCallback(async () => {
    try {
      await invoke('open_settings_window')
    } catch (e) { toastInvokeError('无法打开设置', e) }
  }, [])

  const totalListSize = listVirtualizer.getTotalSize()

  if (!loaded) {
    return (
      <>
        <Toaster position="top-center" toastOptions={{ duration: 3200, className: 'text-sm' }} />
        <div className="flex h-full w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="relative size-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
            </div>
            <span className="text-xs text-muted-foreground">加载配置中…</span>
          </div>
        </div>
      </>
    )
  }

  return (
    <div
      ref={keyboardRootRef}
      className={cn(
        'flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground outline-none',
        isDarkMode && 'dark',
        config.clipboardDisableTextSelection && 'select-none'
      )}
      data-kitty-theme-scope
      data-theme={config.appThemePreset}
      style={appStyle}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Toaster position="top-center" toastOptions={{ duration: 3200, className: 'text-sm' }} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-row">
        {/* 左栏 - 列表（布局与划词翻译浮窗一致：实心背景 + 圆角卡片） */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-col',
            config.clipboardShowPreview ? 'grow basis-[70%] border-r border-border/70' : 'flex-1'
          )}
        >
          <div className="min-h-0 flex-1 p-3">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm p-2">
              <div
                className="flex flex-wrap items-center gap-2 border-b border-border/70 px-2.5 py-2 sm:gap-2.5 sm:px-3"
                onPointerDown={handleDragPointerDown}
              >
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <AppLogoIcon className="size-8" alt="" aria-hidden />
                  <span className="text-sm font-semibold tracking-tight">{APP_DISPLAY_NAME}</span>
                </div>
                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-2.5 shadow-sm sm:gap-2.5 sm:px-3',
                    'ring-offset-background transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/25 focus-within:ring-offset-0',
                  )}
                  data-no-drag="true"
                >
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="搜索文本、文件名或路径..."
                    className={cn(
                      'h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none ring-0 file:h-10',
                      'appearance-none text-foreground outline-none [-webkit-appearance:none] placeholder:text-muted-foreground',
                      'focus:border-0 focus:bg-transparent focus:shadow-none focus:outline-none focus:ring-0',
                      'focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:ring-0',
                      'md:text-sm',
                      config.clipboardDisableTextSelection && 'select-text'
                    )}
                  />
                  <div
                    className={cn(
                      'border border-border/80 bg-secondary/80 text-muted-foreground',
                      'max-w-[min(28vw,5.5rem)] shrink-0 truncate whitespace-nowrap rounded-md px-1.5 py-px text-[10px] leading-none tabular-nums sm:max-w-26',
                      headerHistoryBadge.isAtCap && 'border-primary/50 bg-primary/10 text-foreground'
                    )}
                    title={headerHistoryBadge.title}
                  >
                    {headerHistoryBadge.text}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5" data-no-drag="true">
                  <Button
                    variant={showFavoritesOnly ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    aria-label={showFavoritesOnly ? '显示全部历史' : '仅显示收藏'}
                    title={showFavoritesOnly ? '显示全部历史' : '仅显示收藏'}
                  >
                    <Star className={cn('size-4', showFavoritesOnly && 'fill-current')} />
                  </Button>
                  <Button
                    variant={config.clipboardHideOnUnfocus ? 'ghost' : 'default'}
                    size="icon-sm"
                    onClick={() => updateConfig({ clipboardHideOnUnfocus: !config.clipboardHideOnUnfocus })}
                    aria-label={config.clipboardHideOnUnfocus ? '固定面板' : '取消固定'}
                    title={config.clipboardHideOnUnfocus ? '固定面板（不自动隐藏）' : '取消固定（失焦自动隐藏）'}
                  >
                    <Pin className={cn('size-4', !config.clipboardHideOnUnfocus && 'fill-current')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void handleOpenSettings()}
                    aria-label="打开设置"
                    title="打开设置"
                  >
                    <Settings className="size-4" />
                  </Button>
                </div>
              </div>

                {/* 历史列表（虚拟滚动，仅挂载视口附近行） */}
                <div
                  ref={listScrollParentRef}
                  className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
                  role="presentation"
                >
                  <div className="box-border flex min-h-0 flex-col px-1 pb-1 pt-2">
                    {isHistoryLoading ? (
                      <ClipboardHistoryListSkeleton />
                    ) : filterWorkerPending && search.trim().length > 0 ? (
                      <div
                        role="status"
                        aria-live="polite"
                        className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/25 px-8 py-10 text-center"
                      >
                        <Loader2
                          className="size-8 shrink-0 motion-reduce:animate-none motion-reduce:opacity-70 animate-spin text-muted-foreground"
                          aria-hidden
                        />
                        <p className="text-sm font-medium text-foreground/90">正在过滤历史…</p>
                        <p className="max-w-[420px] text-xs leading-relaxed text-muted-foreground">
                          本地条目较多时在后台检索，不阻塞界面操作。
                        </p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div
                        className={cn(
                          'flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/25 px-8 text-center',
                        )}
                      >
                        <p className="text-base font-semibold text-foreground">
                          {showFavoritesOnly
                            ? favoritedTotal === 0 ? '暂无收藏条目' : '没有匹配的收藏'
                            : '暂时还没有剪贴板记录'}
                        </p>
                        <p className="mt-2 max-w-[480px] text-sm leading-6 text-muted-foreground">
                          {showFavoritesOnly
                            ? favoritedTotal === 0
                              ? '在列表中右键或使用星标可将条目加入收藏。'
                              : '试试调整搜索关键词，或切换回全部历史。'
                            : '复制一段文本、图片或文件后，这里会立刻出现最新历史。'}
                        </p>
                      </div>
                    ) : (
                      <div className="relative w-full min-w-0" style={{ minHeight: totalListSize, height: totalListSize }}>
                        {listVirtualizer.getVirtualItems().map((v) => {
                          const item = filtered[v.index]
                          if (!item) {
                            return null
                          }
                          return (
                            <div
                              key={v.key}
                              data-index={v.index}
                              ref={listVirtualizer.measureElement}
                              className="absolute top-0 left-0 w-full min-w-0 pb-2"
                              style={{ transform: `translateY(${v.start}px)` }}
                            >
                              <ClipboardItemCard
                                item={item}
                                index={v.index}
                                isSelected={v.index === selectedIndex}
                                onSelect={handleItemSelect}
                                onAction={handleItemAction}
                                onToggleFavorite={toggleItemFavorite}
                                onRemoveItem={handleRemoveHistoryItem}
                                enableAutoScroll={false}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右栏 - 预览面板 */}
          {config.clipboardShowPreview && (
            <div className="hidden min-h-0 min-w-75 max-w-90 shrink-0 basis-[30%] flex-col lg:flex">
              <div className="min-h-0 flex-1 p-3">
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm p-2">
                  <Suspense fallback={null}>
                    <ClipboardPreview
                      item={selectedItem}
                      total={filtered.length}
                      onPaste={selectedItem ? () => handlePaste(selectedItem) : undefined}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
