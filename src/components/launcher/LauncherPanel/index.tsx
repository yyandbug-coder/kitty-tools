/**
 * 启动器面板：输入关键词筛选内置动作、系统应用、URL、路径、书签、本地文件等，回车执行当前选中项；
 * 标题栏可固定（失焦不自动隐藏）与打开应用设置。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { Pin, Settings } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppConfig } from '@/hooks/useAppConfig'
import { toastInvokeError } from '@/lib/invoke-helpers'
import { isFindOrOpenFileCommandQuery } from '@/lib/launcherFilePrefix'
import type { LauncherItem } from '@/types'
import LauncherResultItem from '@/components/launcher/LauncherResultItem'

const PAGE_STEP = 10
const FULL_QUERY_DEBOUNCE_MS = 200
const FIND_OPEN_DEBOUNCE_MS = 160

function LauncherPanel() {
  const { config, loaded, updateConfig } = useAppConfig()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const queryForResultRef = useRef(query)
  const searchGenRef = useRef(0)
  queryForResultRef.current = query

  const listVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 52,
    overscan: 10,
    getItemKey: (index) => {
      const it = items[index]
      return it ? `${it.id}-${index}` : String(index)
    },
  })

  useLayoutEffect(() => {
    if (items.length === 0) {
      return
    }
    const idx = Math.min(selected, items.length - 1)
    listVirtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [items, selected, listVirtualizer])

  /** 空串 / find·open：仅全量查询；其它混合关键词：先 instant 再防抖全量（含文件 walk）。 */
  useEffect(() => {
    if (!loaded) {
      return
    }
    const q = query
    const gen = ++searchGenRef.current

    const handleError = (e: unknown, queryStr: string) => {
      if (searchGenRef.current !== gen) {
        return
      }
      if (queryForResultRef.current !== queryStr) {
        return
      }
      console.error(e)
      toast.error('无法加载结果')
      setItems([])
      setSelected(0)
    }

    if (q.trim() === '' || isFindOrOpenFileCommandQuery(q)) {
      const doFull = (queryStr: string) => {
        void invoke<LauncherItem[]>('launcher_query', { query: queryStr })
          .then((res) => {
            if (searchGenRef.current !== gen) {
              return
            }
            if (queryForResultRef.current !== queryStr) {
              return
            }
            setItems(res)
            setSelected(0)
          })
          .catch((e) => handleError(e, queryStr))
      }
      if (q.length === 0) {
        doFull(q)
        return
      }
      const t = window.setTimeout(() => doFull(q), FIND_OPEN_DEBOUNCE_MS)
      return () => window.clearTimeout(t)
    }

    void invoke<LauncherItem[]>('launcher_query_instant', { query: q })
      .then((res) => {
        if (searchGenRef.current !== gen) {
          return
        }
        if (queryForResultRef.current !== q) {
          return
        }
        setItems(res)
        setSelected(0)
      })
      .catch((e) => handleError(e, q))

    const t = window.setTimeout(() => {
      void invoke<LauncherItem[]>('launcher_query', { query: q })
        .then((res) => {
          if (searchGenRef.current !== gen) {
            return
          }
          if (queryForResultRef.current !== q) {
            return
          }
          setItems(res)
          setSelected(0)
        })
        .catch((e) => handleError(e, q))
    }, FULL_QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query, loaded])

  const executeAt = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item) {
        return
      }
      void invoke('launcher_execute', { kind: item.kind, payload: item.payload })
        .then(() => {
          setQuery('')
        })
        .catch((e) => {
          toast.error(typeof e === 'string' ? e : '执行失败')
        })
    },
    [items],
  )

  const hidePanel = useCallback(() => {
    void getCurrentWindow().hide()
  }, [])

  const handleOpenSettings = useCallback(async () => {
    try {
      await invoke('open_settings_window')
    } catch (e) {
      toastInvokeError('无法打开设置', e)
    }
  }, [])

  useEffect(() => {
    let un: UnlistenFn | undefined
    void listen('focus-launcher-panel', () => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }).then((fn) => {
      un = fn
    })
    return () => {
      un?.()
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const idx = Number.parseInt(e.key, 10) - 1
      if (items.length > 0 && idx < items.length) {
        executeAt(idx)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (items.length === 0) {
        return
      }
      setSelected((i) => Math.min(i + 1, items.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length === 0) {
        return
      }
      setSelected((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'PageDown') {
      e.preventDefault()
      if (items.length === 0) {
        return
      }
      setSelected((i) => Math.min(i + PAGE_STEP, items.length - 1))
      return
    }
    if (e.key === 'PageUp') {
      e.preventDefault()
      if (items.length === 0) {
        return
      }
      setSelected((i) => Math.max(i - PAGE_STEP, 0))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      if (items.length === 0) {
        return
      }
      setSelected(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      if (items.length === 0) {
        return
      }
      setSelected(items.length - 1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      executeAt(selected)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hidePanel()
    }
  }

  const totalListSize = listVirtualizer.getTotalSize()

  return (
    <div className="box-border flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden p-3 sm:p-4">
      <div
        className={cn(
          'relative flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden overflow-x-clip rounded-xl',
          '[background:linear-gradient(165deg,color-mix(in_oklch,var(--theme-accent,var(--ring))_18%,transparent),transparent_52%),color-mix(in_oklch,var(--background)_var(--window-alpha),transparent)]',
          'border border-[color-mix(in_oklch,var(--border)_44%,transparent)]',
          'shadow-[0_20px_72px_color-mix(in_oklch,var(--background)_32%,transparent),inset_0_1px_0_color-mix(in_oklch,white_20%,transparent)]',
          'backdrop-blur-[20px]',
        )}
        onKeyDown={onKeyDown}
      >
        <div className="min-w-0 max-w-full shrink-0 border-b border-border/60 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px] font-medium sm:text-xs">启动器</p>
            <div className="flex shrink-0 items-center gap-1" data-no-drag="true">
              <Button
                type="button"
                variant={config.launcherHideOnUnfocus ? 'ghost' : 'default'}
                size="icon-sm"
                onClick={() => void updateConfig({ launcherHideOnUnfocus: !config.launcherHideOnUnfocus })}
                aria-label={config.launcherHideOnUnfocus ? '固定面板' : '取消固定'}
                title={config.launcherHideOnUnfocus ? '固定面板（失焦不自动关闭）' : '取消固定（失焦时自动关闭）'}
              >
                <Pin className={cn('size-4', !config.launcherHideOnUnfocus && 'fill-current')} />
              </Button>
              <Button
                type="button"
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
          <div
            className={cn(
              'flex items-center rounded-lg border border-input bg-muted/50 px-2.5 py-1.5 shadow-sm',
              'ring-offset-background',
              'focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-0',
              'dark:bg-muted/40',
            )}
          >
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索功能、URL 或本地路径…"
              className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 sm:h-8"
              autoFocus
              aria-label="启动器搜索"
              spellCheck={false}
            />
            <span
              className="text-muted-foreground shrink-0 border-l border-border/60 pl-2.5 text-[11px] tabular-nums sm:text-xs"
              aria-live="polite"
            >
              {items.length} 项
            </span>
          </div>
        </div>
        <div
          ref={scrollParentRef}
          className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain"
          role="presentation"
        >
          <div
            className="box-border w-full min-w-0 max-w-full flex-col p-1.5"
            role="listbox"
            aria-label="结果"
          >
            {items.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">无匹配项</p>
            ) : (
              <div
                className="relative w-full min-w-0"
                style={{ minHeight: totalListSize, height: totalListSize }}
              >
                {listVirtualizer.getVirtualItems().map((v) => {
                  const item = items[v.index]
                  if (!item) {
                    return null
                  }
                  return (
                    <div
                      key={v.key}
                      data-index={v.index}
                      ref={listVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full min-w-0 max-w-full"
                      style={{ transform: `translateY(${v.start}px)` }}
                    >
                      <div className="w-full min-w-0 max-w-full contain-[inline-size]">
                        <LauncherResultItem
                          id={`launcher-option-${v.index}`}
                          item={item}
                          selected={v.index === selected}
                          onMouseEnter={() => setSelected(v.index)}
                          onActivate={() => {
                            setSelected(v.index)
                            executeAt(v.index)
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <p className="text-muted-foreground min-w-0 max-w-full shrink-0 wrap-break-word border-t border-border/50 px-3 py-1.5 text-[10px] sm:text-xs leading-relaxed">
          ↑↓ 选择 · PageUp/PageDown 翻页 · Home/End 至首/尾 · Ctrl/⌘+1～9 打开对应项 · Enter 打开 · Esc 关闭。
          <span className="block sm:inline sm:before:content-['·_']">
            输入 <kbd className="rounded border px-1">find </kbd> + 关键词：搜文件并打开所在目录；
            <kbd className="rounded border px-1">open </kbd> + 关键词：搜文件并打开文件。
          </span>
        </p>
      </div>
    </div>
  )
}

export default LauncherPanel
