// 剪贴板历史浮层 - Alfred 风格弹出式剪贴板管理器
// 双栏布局：左侧列表（分页）+ 右侧预览面板
// 参考 example/kitty-clipboard-history 的完整 UI 和交互
import type { CSSProperties, PointerEvent } from 'react'
import type { AppTheme } from '@/types'
import { lazy, Suspense, useRef, useEffect, useState, useCallback, useMemo } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useClipboard } from '@/hooks/useClipboard'
import { useAppConfig } from '@/hooks/useAppConfig'
import type { ClipboardItem } from '@/types'
import { APP_DISPLAY_NAME } from '@/lib/app-meta'
import { getThemeRuntimeStyle, getSearchShellStyle } from '@/lib/theme'
import ClipboardItemCard from '@/components/clipboard/ClipboardItemCard'
import ClipboardHistoryListSkeleton from '@/components/clipboard/ClipboardHistoryListSkeleton'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pin, Settings, Star } from 'lucide-react'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { cn } from '@/lib/utils'

const ClipboardPreview = lazy(() => import('@/components/clipboard/ClipboardPreview'))

export default function App() {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const keyboardRootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { config, updateConfig } = useAppConfig()
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const isDarkMode = config.theme === 'dark' || (config.theme === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode, config.backgroundOpacity) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode, config.backgroundOpacity]
  )
  const searchShellStyle = useMemo(
    () => getSearchShellStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode]
  )

  const {
    history, isHistoryLoading, search, setSearch, showFavoritesOnly, setShowFavoritesOnly,
    favoritedTotal, filtered, displayed, hasMore, loadMore, selectedItem, selectedIndex,
    setSelectedIndex, toggleItemFavorite, removeHistoryItem, handlePaste, handleKeyDown,
    flushClipboardHistoryToDisk,
  } = useClipboard(config)

  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  // Exit handler
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen('app-exit-requested', async () => {
      try { await flushClipboardHistoryToDisk() } catch (error) { console.error('退出前落盘失败:', error) }
      try { await invoke('exit_after_flush') } catch (error) { console.error('exit_after_flush 调用失败:', error) }
    }).then((fn) => { if (cancelled) fn(); else unlisten = fn })
    return () => { cancelled = true; unlisten?.() }
  }, [flushClipboardHistoryToDisk])

  // System theme watcher
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Focus search input when panel is shown via hotkey/tray
  useEffect(() => {
    const focus = () => searchInputRef.current?.focus({ preventScroll: true })
    const unlisten = listen('focus-clipboard-panel', () => { focus(); setTimeout(focus, 100) })
    return () => { unlisten.then(fn => fn()) }
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

  // Scroll-triggered loadMore
  useEffect(() => {
    const root = scrollAreaRef.current
    if (!root) return
    const viewport = root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
    if (!viewport) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMoreRef.current) loadMoreRef.current()
    }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    let raf = 0
    const tryFillWhenNoScrollbar = () => {
      raf = window.requestAnimationFrame(() => {
        if (!hasMoreRef.current) return
        const { scrollHeight, clientHeight } = viewport
        if (scrollHeight <= clientHeight + 2) loadMoreRef.current()
      })
    }
    tryFillWhenNoScrollbar()
    return () => { window.cancelAnimationFrame(raf); viewport.removeEventListener('scroll', handleScroll) }
  }, [hasMore, displayed.length, filtered.length, history.length, search, showFavoritesOnly])

  const headerHistoryBadge = useMemo(() => {
    const q = search.trim().length > 0
    const cap = config.clipboardHistoryMax
    if (showFavoritesOnly) {
      if (q) return { text: `${filtered.length}/${favoritedTotal}`, title: `在已收藏条目中匹配到 ${filtered.length} 条；收藏共 ${favoritedTotal} 条`, isAtCap: false }
      return { text: favoritedTotal === 0 ? '—' : `${favoritedTotal}`, title: favoritedTotal === 0 ? '在列表中右键或使用星标可将条目加入收藏' : `当前共 ${favoritedTotal} 条收藏`, isAtCap: false }
    }
    if (q) return { text: `${filtered.length}/${history.length}`, title: `在全部 ${history.length} 条本地历史中搜索`, isAtCap: false }
    const n = history.length
    const unlimited = cap <= 0
    const full = !unlimited && n >= cap
    return {
      text: unlimited ? `${n}条` : `${n}/${cap}`,
      title: unlimited ? `未限制列表条数，当前 ${n} 条` : full ? `已达本地上限 ${cap} 条` : `本地最多保留 ${cap} 条，当前 ${n} 条`,
      isAtCap: full,
    }
  }, [search, showFavoritesOnly, filtered.length, favoritedTotal, history.length, config.clipboardHistoryMax])

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
    } catch { /* 非 Tauri 环境忽略 */ }
  }, [])

  const handleOpenSettings = useCallback(async () => {
    try {
      await invoke('open_settings_window')
    } catch { /* ignore */ }
  }, [])

  return (
    <div
      ref={keyboardRootRef}
      className={cn(
        'h-full w-full min-h-0 text-foreground outline-none',
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
      <div
        className={cn(
          '[background:linear-gradient(165deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_18%,transparent),transparent_52%),color-mix(in_oklch,var(--background)_var(--window-alpha),transparent)] border border-[color-mix(in_oklch,var(--border)_44%,transparent)] shadow-[0_20px_72px_color-mix(in_oklch,var(--background)_32%,transparent),inset_0_1px_0_color-mix(in_oklch,white_20%,transparent)] backdrop-blur-[20px]',
          'relative flex h-full w-full min-h-0 overflow-hidden rounded-xl'
        )}
      >
        <div className="flex min-w-0 flex-1">
          {/* 左栏 - 列表 */}
          <div
            className={cn(
              'flex min-w-0 flex-col',
              config.clipboardShowPreview
                ? 'grow basis-[70%] border-r border-[color-mix(in_oklch,var(--border)_26%,transparent)]'
                : 'flex-1'
            )}
          >
            <div className="min-h-0 flex-1 px-2.5 pb-2.5 pt-2.5">
              <div
                className={cn(
                  '[background:linear-gradient(180deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_10%,transparent),transparent_30%),color-mix(in_oklch,var(--background)_var(--panel-alpha),transparent)] border border-[color-mix(in_oklch,var(--border)_30%,transparent)]',
                  'flex h-full min-h-0 flex-col rounded-[22px] p-2'
                )}
              >
                {/* 搜索栏（可拖动区域） */}
                <div
                  className={cn(
                    'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
                    'flex flex-wrap items-center gap-2 border-b px-2.5 py-2 sm:gap-2.5 sm:px-3'
                  )}
                  onPointerDown={handleDragPointerDown}
                >
                  <div className="flex min-w-0 shrink-0 items-center gap-2">
                    <AppLogoIcon className="size-6" alt="" aria-hidden />
                    <span className="text-sm font-semibold tracking-tight">{APP_DISPLAY_NAME}</span>
                  </div>
                  <div
                    className={cn(
                      'border border-[var(--search-shell-border)] bg-[var(--search-shell-bg)] backdrop-blur-[16px] backdrop-saturate-[140%] transition-[border-color,background-color,box-shadow] duration-[160ms] ease-out focus-within:border-[color-mix(in_oklch,var(--theme-accent,var(--ring))_42%,var(--border)_58%)] focus-within:shadow-[0_0_0_1px_var(--search-shell-focus-ring)]',
                      'flex min-w-0 flex-1 items-center gap-2 rounded-[16px] px-2.5 sm:gap-2.5 sm:px-3'
                    )}
                    style={searchShellStyle}
                    data-no-drag="true"
                  >
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="搜索文本、文件名或路径..."
                      className={cn(
                        'appearance-none bg-transparent text-foreground shadow-none outline-none [-webkit-appearance:none] placeholder:text-muted-foreground focus:border-0 focus:bg-transparent focus:shadow-none focus:outline-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-none',
                        'h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:ring-0',
                        config.clipboardDisableTextSelection && 'select-text'
                      )}
                    />
                    <div
                      className={cn(
                        'bg-[color-mix(in_oklch,var(--secondary)_52%,transparent)] border border-[color-mix(in_oklch,var(--border)_36%,transparent)] text-[color-mix(in_oklch,var(--muted-foreground)_88%,transparent)]',
                        'max-w-[min(28vw,5.5rem)] shrink-0 truncate whitespace-nowrap rounded-md px-1.5 py-px text-[10px] leading-none tabular-nums sm:max-w-26',
                        headerHistoryBadge.isAtCap && 'border-[color-mix(in_oklch,var(--primary)_48%,var(--border)_52%)] bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[color-mix(in_oklch,var(--foreground)_92%,var(--primary)_8%)]'
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

                {/* 历史列表 */}
                <ScrollArea ref={scrollAreaRef} className="h-full overflow-x-hidden">
                  <div className="flex flex-col gap-2 px-1 pb-1 pt-2">
                    {isHistoryLoading ? (
                      <ClipboardHistoryListSkeleton />
                    ) : filtered.length === 0 ? (
                      <div
                        className={cn(
                          'bg-[color-mix(in_oklch,var(--muted)_22%,transparent)] border border-dashed border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                          'flex min-h-[220px] flex-col items-center justify-center rounded-[20px] px-8 text-center'
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
                      <>
                        {displayed.map((item, idx) => (
                          <ClipboardItemCard
                            key={item.id}
                            item={item}
                            index={idx}
                            isSelected={idx === selectedIndex}
                            onSelect={handleItemSelect}
                            onAction={handleItemAction}
                            onToggleFavorite={toggleItemFavorite}
                            onRemoveItem={handleRemoveHistoryItem}
                          />
                        ))}
                        {hasMore && (
                          <div className="flex justify-center py-2 text-xs text-muted-foreground">下滑加载更多</div>
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          {/* 右栏 - 预览面板 */}
          {config.clipboardShowPreview && (
            <div className="hidden min-h-0 min-w-75 max-w-90 shrink-0 basis-[30%] flex-col lg:flex">
              <div className="min-h-0 flex-1 px-2.5 pb-2.5 pt-2.5">
                <div
                  className={cn(
                    '[background:linear-gradient(180deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_10%,transparent),transparent_30%),color-mix(in_oklch,var(--background)_var(--panel-alpha),transparent)] border border-[color-mix(in_oklch,var(--border)_30%,transparent)]',
                    'flex h-full min-h-0 flex-col rounded-[22px] p-2'
                  )}
                >
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
    </div>
  )
}
