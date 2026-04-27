/**
 * 启动器面板：输入关键词筛选内置动作/URL/路径，回车执行当前选中项；
 * 标题栏可固定（失焦不自动隐藏）与打开应用设置。后续可接书签与全盘文件索引。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { Pin, Settings } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppConfig } from '@/hooks/useAppConfig'
import { toastInvokeError } from '@/lib/invoke-helpers'
import type { LauncherItem } from '@/types'

function LauncherPanel() {
  const { config, loaded, updateConfig } = useAppConfig()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const queryForResultRef = useRef(query)
  queryForResultRef.current = query

  useLayoutEffect(() => {
    if (items.length === 0) {
      return
    }
    const idx = Math.min(selected, items.length - 1)
    listItemRefs.current[idx]?.scrollIntoView({ block: 'nearest' })
  }, [items, selected])

  /** 非空时防抖，避免每键都触发 `launcher_query` 全盘/多目录 walk 导致卡顿；空串立即拉默认列表。 */
  useEffect(() => {
    const q = query
    const run = (queryStr: string) => {
      void invoke<LauncherItem[]>('launcher_query', { query: queryStr })
        .then((res) => {
          if (queryForResultRef.current === queryStr) {
            setItems(res)
            setSelected(0)
          }
        })
        .catch((e) => {
          if (queryForResultRef.current !== queryStr) {
            return
          }
          console.error(e)
          toast.error('无法加载结果')
          setItems([])
          setSelected(0)
        })
    }
    if (q.length === 0) {
      run('')
      return
    }
    const t = window.setTimeout(() => run(q), 160)
    return () => window.clearTimeout(t)
  }, [query])

  const executeAt = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item) return
      void invoke('launcher_execute', { kind: item.kind, payload: item.payload })
        .then(() => {
          setQuery('')
        })
        .catch((e) => {
          toast.error(typeof e === 'string' ? e : '执行失败')
        })
    },
    [items]
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
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (items.length === 0) return
      setSelected((i) => Math.min(i + 1, items.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length === 0) return
      setSelected((i) => Math.max(i - 1, 0))
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

  if (!loaded) {
    return (
      <div className="box-border flex h-full min-h-0 w-full min-w-0 items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    )
  }

  return (
    <div className="box-border flex h-full min-h-0 w-full min-w-0 flex-col p-3 sm:p-4">
      <div
        className="bg-background/90 dark:bg-background/80 flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 shadow-2xl backdrop-blur-md"
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-border/60 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px] font-medium sm:text-xs">启动器</p>
            <div className="flex shrink-0 items-center gap-1" data-no-drag="true">
              <Button
                type="button"
                variant={config.launcherHideOnUnfocus ? 'ghost' : 'default'}
                size="icon-sm"
                onClick={() => void updateConfig({ launcherHideOnUnfocus: !config.launcherHideOnUnfocus })}
                aria-label={config.launcherHideOnUnfocus ? '固定面板' : '取消固定'}
                title={
                  config.launcherHideOnUnfocus
                    ? '固定面板（失焦不自动关闭）'
                    : '取消固定（失焦时自动关闭）'
                }
              >
                <Pin
                  className={cn('size-4', !config.launcherHideOnUnfocus && 'fill-current')}
                />
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
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col p-1.5" role="listbox" aria-label="结果">
            {items.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">无匹配项</p>
            ) : (
              items.map((item, i) => (
                <div
                  key={`${item.id}-${i}`}
                  ref={(el) => {
                    listItemRefs.current[i] = el
                  }}
                  className="w-full min-w-0"
                >
                  <Button
                    type="button"
                    role="option"
                    variant="ghost"
                    aria-selected={i === selected}
                    className={cn(
                      'h-auto w-full min-h-9 flex-col items-stretch justify-center gap-0.5 px-2.5 py-1.5 sm:min-h-10',
                      i === selected && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => {
                      setSelected(i)
                      executeAt(i)
                    }}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="text-left text-sm font-medium leading-tight">{item.title}</span>
                    <span
                      className={cn(
                        'line-clamp-1 text-left text-[11px] leading-snug sm:text-xs',
                        i === selected ? 'text-accent-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {item.subtitle}
                    </span>
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <p className="text-muted-foreground border-t border-border/50 px-3 py-1.5 text-[10px] sm:text-xs leading-relaxed">
          ↑↓ 选择 · Enter 打开 · Esc 关闭 · 图钉固定。
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
