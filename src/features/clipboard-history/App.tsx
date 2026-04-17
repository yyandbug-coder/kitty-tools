/**
 * 剪贴板历史浮层 - 由全局快捷键或托盘呼出；主窗口置顶由 Tauri `alwaysOnTop` 配置；设置仅通过托盘菜单等方式打开独立设置窗口
 */
import type { CSSProperties } from 'react'
import { lazy, Suspense, useRef, useEffect, useState, useCallback, useMemo } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { getName } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useClipboard } from '@clipboard/hooks/useClipboard'
import type { ClipboardItem } from '@clipboard/types'
import { useAppSettings } from '@clipboard/hooks/useAppSettings'
import { APP_DISPLAY_NAME } from '@clipboard/lib/app-meta'
import { getSearchShellStyle, getThemeRuntimeStyle } from '@clipboard/lib/theme'
import ClipboardItemCard from '@clipboard/components/ClipboardItemCard'
import ClipboardHistoryListSkeleton from '@clipboard/components/ClipboardHistoryListSkeleton'
import { useGlobalAppSettings } from '@/shared/hooks/useGlobalAppSettings'

import AppLogoIcon from '@clipboard/components/AppLogoIcon'
import { ThemeProvider } from '@clipboard/components/ThemeProvider'
const ClipboardPreview = lazy(() => import('@clipboard/components/ClipboardPreview'))
import { Button } from '@clipboard/components/ui/button'
import { ScrollArea } from '@clipboard/components/ui/scroll-area'
import { PanelRightOpen, Pin, Star } from 'lucide-react'
import { cn } from '@clipboard/lib/utils'

type ClipboardAppMode = 'panel' | 'workspace'

function shouldMoveFocusToListKeyboardRoot(): boolean {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) {
    return true
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return false
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    return false
  }
  return true
}

export default function App({ mode = 'panel' }: { mode?: ClipboardAppMode }) {
  const isWorkspace = mode === 'workspace'
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const keyboardRootRef = useRef<HTMLDivElement>(null)
  const { settings, updateSettings } = useAppSettings()
  const { settings: globalSettings, updateSettings: updateGlobalSettings } = useGlobalAppSettings()
  const [shortcutStartupError, setShortcutStartupError] = useState<string | null>(null)
  const [appDisplayName, setAppDisplayName] = useState(APP_DISPLAY_NAME)
  const [platform] = useState(() => {
    if (typeof navigator === 'undefined') {
      return 'unknown'
    }

    return /Windows/i.test(navigator.userAgent) ? 'windows' : 'other'
  })
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const isDarkMode =
    globalSettings.colorMode === 'dark' ||
    (globalSettings.colorMode === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(globalSettings, isDarkMode) as CSSProperties,
    [globalSettings.backgroundOpacity, globalSettings.theme, globalSettings.customHue, isDarkMode]
  )
  const searchShellStyle = useMemo(
    () => getSearchShellStyle(globalSettings.theme, globalSettings.customHue, isDarkMode) as CSSProperties,
    [globalSettings.theme, globalSettings.customHue, isDarkMode]
  )

  const {
    history,
    isHistoryLoading,
    search,
    setSearch,
    showFavoritesOnly,
    setShowFavoritesOnly,
    favoritedTotal,
    filtered,
    displayed,
    hasMore,
    loadMore,
    selectedItem,
    selectedIndex,
    setSelectedIndex,
    toggleItemFavorite,
    removeHistoryItem,
    handlePaste,
    handleKeyDown,
    flushClipboardHistoryToDisk
  } = useClipboard(settings)

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen('app-exit-requested', async () => {
      try {
        await flushClipboardHistoryToDisk()
      } catch (error) {
        console.error('退出前落盘失败:', error)
      }
      try {
        await invoke('clipboard_exit_after_flush')
      } catch (error) {
        console.error('exit_after_flush 调用失败:', error)
      }
    }).then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unlisten = fn
      }
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [flushClipboardHistoryToDisk])

  const headerHistoryBadge = useMemo(() => {
    const q = search.trim().length > 0
    const cap = settings.historyMaxItems
    if (showFavoritesOnly) {
      if (q) {
        return {
          text: `${filtered.length}/${favoritedTotal}`,
          title: `在已收藏条目中匹配到 ${filtered.length} 条；收藏共 ${favoritedTotal} 条`,
          isAtCap: false
        }
      }
      return {
        text: favoritedTotal === 0 ? '—' : `${favoritedTotal}`,
        title: favoritedTotal === 0 ? '在列表中右键或使用星标可将条目加入收藏' : `当前共 ${favoritedTotal} 条收藏`,
        isAtCap: false
      }
    }
    if (q) {
      return {
        text: `${filtered.length}/${history.length}`,
        title: `在全部 ${history.length} 条本地历史中搜索`,
        isAtCap: false
      }
    }
    const n = history.length
    const unlimited = cap <= 0
    const full = !unlimited && n >= cap
    return {
      text: unlimited ? `${n}条` : `${n}/${cap}`,
      title: unlimited
        ? `未限制列表条数，当前 ${n} 条（仍受设备与性能影响，可改回上限以免列表过大）`
        : full
          ? `已达本地上限 ${cap} 条，新复制会顶替最旧记录（可在设置中调整）`
          : `本地最多保留 ${cap} 条，当前 ${n} 条；新内容会排在最前`,
      isAtCap: full
    }
  }, [search, showFavoritesOnly, filtered.length, favoritedTotal, history.length, settings.historyMaxItems])

  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  useEffect(() => {
    const root = scrollAreaRef.current
    if (!root) return

    const viewport = root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
    if (!viewport) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMoreRef.current) {
        loadMoreRef.current()
      }
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })

    let raf = 0
    const tryFillWhenNoScrollbar = () => {
      raf = window.requestAnimationFrame(() => {
        if (!hasMoreRef.current) return
        const { scrollHeight, clientHeight } = viewport
        if (scrollHeight <= clientHeight + 2) {
          loadMoreRef.current()
        }
      })
    }
    tryFillWhenNoScrollbar()

    return () => {
      window.cancelAnimationFrame(raf)
      viewport.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, displayed.length, filtered.length, history.length, search, showFavoritesOnly])

  const hideWhenUnfocusedRef = useRef(settings.hideWhenUnfocused)
  hideWhenUnfocusedRef.current = settings.hideWhenUnfocused

  useEffect(() => {
    const unlisten = listen<string>('global-shortcut-register-failed', (event) => {
      setShortcutStartupError(event.payload)
    })

    return () => {
      void unlisten
        .then((fn) => fn())
        .catch(() => {
          /* 卸载时 listen 可能尚未就绪 */
        })
    }
  }, [])

  useEffect(() => {
    void getName()
      .then((name) => {
        const trimmed = name.trim()
        if (trimmed) {
          setAppDisplayName(trimmed)
        }
      })
      .catch(() => {
        /* 非 Tauri 或受限环境：沿用 APP_DISPLAY_NAME */
      })
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeMode = (event: MediaQueryList | MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }

    updateThemeMode(mediaQuery)
    mediaQuery.addEventListener('change', updateThemeMode)

    return () => {
      mediaQuery.removeEventListener('change', updateThemeMode)
    }
  }, [])

  const focusListKeyboardRoot = useCallback(() => {
    if (!shouldMoveFocusToListKeyboardRoot()) {
      return
    }
    keyboardRootRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (isWorkspace) {
      return
    }
    let blurHideTimer = 0
    const clearBlurHideTimer = () => {
      window.clearTimeout(blurHideTimer)
      blurHideTimer = 0
    }

    // 失焦隐藏：DOM 的 window blur 在「窗口可见但 WebView 从未拿到焦点」（常见于 Windows 呼出浮窗）时可能不触发；
    // Tauri 会在原生窗口 Focused 变化时派发 tauri://blur | tauri://focus，与 onFocusChanged 互补。
    const isMacOS = typeof navigator !== 'undefined' && /Macintosh/i.test(navigator.userAgent)

    const scheduleUnfocusedHide = () => {
      if (!hideWhenUnfocusedRef.current) {
        return
      }
      clearBlurHideTimer()
      blurHideTimer = window.setTimeout(() => {
        blurHideTimer = 0
        if (!hideWhenUnfocusedRef.current) {
          return
        }
        if (isMacOS) {
          void invoke('window_hide_clipboard_panel')
          return
        }
        void getCurrentWindow()
          .isFocused()
          .then((stillFocused) => {
            if (!stillFocused) {
              void invoke('window_hide_clipboard_panel')
            }
          })
          .catch(() => {
            /* 窗口已销毁等 */
          })
      }, 360)
    }

    const onWindowBlur = () => {
      scheduleUnfocusedHide()
    }

    const onWindowFocus = () => {
      clearBlurHideTimer()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        scheduleUnfocusedHide()
      } else {
        clearBlurHideTimer()
        if (document.visibilityState === 'visible') {
          requestAnimationFrame(() => focusListKeyboardRoot())
        }
      }
    }

    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    const focusChangedPromise = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        clearBlurHideTimer()
        requestAnimationFrame(() => focusListKeyboardRoot())
        setTimeout(() => focusListKeyboardRoot(), 100)
        return
      }
      scheduleUnfocusedHide()
    })

    const tauriBlurPromise = getCurrentWindow().listen('tauri://blur', () => {
      scheduleUnfocusedHide()
    })
    const tauriFocusPromise = getCurrentWindow().listen('tauri://focus', () => {
      clearBlurHideTimer()
      requestAnimationFrame(() => focusListKeyboardRoot())
      setTimeout(() => focusListKeyboardRoot(), 100)
    })

    return () => {
      clearBlurHideTimer()
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void focusChangedPromise
        .then((unlisten) => unlisten())
        .catch(() => {
          /* 卸载时 hook 可能尚未就绪 */
        })
      void tauriBlurPromise
        .then((unlisten) => unlisten())
        .catch(() => {
          /* 同上 */
        })
      void tauriFocusPromise
        .then((unlisten) => unlisten())
        .catch(() => {
          /* 同上 */
        })
    }
  }, [focusListKeyboardRoot, isWorkspace])

  const handleItemSelect = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  const handleItemAction = useCallback(
    (item: ClipboardItem) => {
      void handlePaste(item)
    },
    [handlePaste]
  )

  const handleRemoveHistoryItem = useCallback(
    (id: string) => {
      if (!removeHistoryItem(id)) {
        return
      }
      toast.success('已删除该条记录。')
    },
    [removeHistoryItem]
  )

  return (
    <ThemeProvider
      colorMode={globalSettings.colorMode}
      onColorModeChange={(mode) => updateGlobalSettings({ colorMode: mode })}
      systemPrefersDark={systemPrefersDark}
    >
      <>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3200,
            className: 'text-sm'
          }}
        />
        <div
          ref={keyboardRootRef}
          className={cn(
            'h-full w-full min-h-0 text-foreground outline-none',
            isDarkMode && 'dark',
            settings.disableTextSelection && 'select-none'
          )}
          data-kitty-theme-scope
          data-theme={globalSettings.theme}
          data-platform={platform}
          style={appStyle}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <div
            className={cn(
              '[background:linear-gradient(165deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_18%,transparent),transparent_52%),color-mix(in_oklch,var(--background)_var(--window-alpha),transparent)] border border-[color-mix(in_oklch,var(--border)_44%,transparent)] shadow-[0_20px_72px_color-mix(in_oklch,var(--background)_32%,transparent),inset_0_1px_0_color-mix(in_oklch,white_20%,transparent)] backdrop-blur-[20px]',
              'relative flex h-full w-full min-h-0 overflow-hidden rounded-xl'
            )}
          >
            <div className="flex min-w-0 flex-1">
              <div
                className={cn(
                  'flex min-w-0 flex-col',
                  settings.showPreview
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
                    <div
                      className={cn(
                        'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
                        'flex flex-wrap items-center gap-2 border-b px-2.5 py-2 sm:gap-2.5 sm:px-3'
                      )}
                    >
                      <div className="flex min-w-0 shrink-0 items-center gap-2">
                        <AppLogoIcon className="h-10 w-10 shrink-0 object-contain " alt="" aria-hidden />
                        <span
                          className="max-w-[10rem] truncate text-sm font-semibold tracking-tight text-foreground sm:max-w-[14rem]"
                          title={appDisplayName}
                        >
                          {appDisplayName}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'border border-[var(--search-shell-border)] bg-[var(--search-shell-bg)] backdrop-blur-[16px] backdrop-saturate-[140%] transition-[border-color,background-color,box-shadow] duration-[160ms] ease-out focus-within:border-[color-mix(in_oklch,var(--theme-accent,var(--ring))_42%,var(--border)_58%)] focus-within:shadow-[0_0_0_1px_var(--search-shell-focus-ring)]',
                          'flex min-w-0 flex-1 items-center gap-2 rounded-[16px] px-2.5 sm:gap-2.5 sm:px-3'
                        )}
                        style={searchShellStyle}
                      >
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="搜索文本、文件名或路径..."
                          className={cn(
                            'appearance-none bg-transparent text-foreground shadow-none outline-none [-webkit-appearance:none] placeholder:text-muted-foreground focus:border-0 focus:bg-transparent focus:shadow-none focus:outline-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none',
                            'h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:ring-0',
                            settings.disableTextSelection && 'select-text'
                          )}
                        />
                        <div
                          className={cn(
                            'bg-[color-mix(in_oklch,var(--secondary)_52%,transparent)] border border-[color-mix(in_oklch,var(--border)_36%,transparent)] text-[color-mix(in_oklch,var(--muted-foreground)_88%,transparent)]',
                            'max-w-[min(28vw,5.5rem)] shrink-0 truncate whitespace-nowrap rounded-md px-1.5 py-px text-[10px] leading-none tabular-nums sm:max-w-26',
                            headerHistoryBadge.isAtCap &&
                              'border-[color-mix(in_oklch,var(--primary)_48%,var(--border)_52%)] bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[color-mix(in_oklch,var(--foreground)_92%,var(--primary)_8%)]'
                          )}
                          title={headerHistoryBadge.title}
                        >
                          {headerHistoryBadge.text}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <div
                          className={cn(
                            'bg-[color-mix(in_oklch,var(--secondary)_52%,transparent)] border border-[color-mix(in_oklch,var(--border)_36%,transparent)] text-[color-mix(in_oklch,var(--muted-foreground)_88%,transparent)]',
                            'hidden rounded-full px-2.5 py-1 text-[11px] lg:flex'
                          )}
                        >
                          Enter 粘贴
                        </div>
                        <Button
                          variant={showFavoritesOnly ? 'primary' : 'ghost'}
                          size="icon"
                          onClick={() => setShowFavoritesOnly((v) => !v)}
                          aria-label={showFavoritesOnly ? '显示全部历史' : '仅显示收藏'}
                          title={showFavoritesOnly ? '显示全部历史' : '仅显示收藏'}
                        >
                          <Star className={cn('size-4', showFavoritesOnly && 'fill-current')} />
                        </Button>
                        <Button
                          variant={settings.hideWhenUnfocused ? 'ghost' : 'primary'}
                          size="icon"
                          onClick={() => updateSettings({ hideWhenUnfocused: !settings.hideWhenUnfocused })}
                          aria-label={
                            settings.hideWhenUnfocused
                              ? '固定面板：点击其他应用时不收起'
                              : '取消固定：失焦时自动收起'
                          }
                          title={
                            settings.hideWhenUnfocused
                              ? '固定面板：打开后点击外部应用不会收起（与设置中「失焦时隐藏」联动）'
                              : '取消固定：点击其他应用后自动收起'
                          }
                        >
                          <Pin className={cn('size-4', !settings.hideWhenUnfocused && 'fill-current')} />
                        </Button>
                      </div>
                    </div>

                    {shortcutStartupError && (
                      <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-[14px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                        <span className="min-w-0 flex-1 leading-relaxed">{shortcutStartupError}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 text-amber-950 hover:bg-amber-500/20 dark:text-amber-100"
                          onClick={() => setShortcutStartupError(null)}
                        >
                          知道了
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-7 shrink-0"
                          onClick={() => {
                            setShortcutStartupError(null)
                            void invoke('app_open_workspace', { module: 'settings' }).catch((err) => {
                              console.error('打开设置窗口失败', err)
                              toast.error('无法打开设置窗口，请重试。')
                            })
                          }}
                        >
                          去设置
                        </Button>
                      </div>
                    )}

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
                            <div
                              className={cn(
                                '[background:linear-gradient(145deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_24%,transparent),color-mix(in_oklch,var(--theme-accent,var(--ring))_10%,transparent)),color-mix(in_oklch,var(--card)_46%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)] shadow-[inset_0_1px_0_color-mix(in_oklch,white_28%,transparent),0_10px_30px_color-mix(in_oklch,var(--theme-accent,var(--ring))_14%,transparent)]',
                                'flex h-12 w-12 items-center justify-center rounded-[18px]'
                              )}
                            >
                              <AppLogoIcon className="h-8 w-8 rounded-[16px]" alt={appDisplayName} />
                            </div>
                            <p className="mt-4 text-base font-semibold text-foreground">
                              {showFavoritesOnly
                                ? favoritedTotal === 0
                                  ? '暂无收藏条目'
                                  : '没有匹配的收藏'
                                : '暂时还没有可用的剪贴板记录'}
                            </p>
                            <p className="mt-2 max-w-[480px] text-sm leading-6 text-muted-foreground">
                              {showFavoritesOnly
                                ? favoritedTotal === 0
                                  ? '在列表中点击条目右侧星标，即可收藏常用内容。'
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

              {settings.showPreview && (
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

            {!settings.showPreview && selectedItem && (
              <div
                className={cn(
                  'bg-[color-mix(in_oklch,var(--secondary)_52%,transparent)] border border-[color-mix(in_oklch,var(--border)_36%,transparent)] text-[color-mix(in_oklch,var(--muted-foreground)_88%,transparent)]',
                  'absolute bottom-4 right-4 hidden items-center gap-2 rounded-full px-3 py-2 text-xs lg:flex'
                )}
              >
                <PanelRightOpen className="size-3.5" />
                可在设置窗口中重新开启右侧预览
              </div>
            )}
          </div>
        </div>
      </>
    </ThemeProvider>
  )
}
