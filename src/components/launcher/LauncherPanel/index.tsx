/**
 * 启动器面板：不透明窗口 + 与划词翻译浮窗一致的实心背景与分区样式；
 * 输入关键词筛选内置动作、系统快捷项、已安装应用（Windows 开始菜单 / macOS 应用程序）、URL、路径、书签等；find/open 前缀按 Alfred 习惯搜文件（揭示目录 / 打开文件）；
 * 标题栏可固定（失焦不自动隐藏）与打开应用设置。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { Loader2, Pin, Settings } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import { isMacOs } from '@/lib/platform'
import { useAppConfig } from '@/hooks/useAppConfig'
import { toastInvokeError } from '@/lib/invoke-helpers'
import { isFindOrOpenFileCommandQuery } from '@/lib/launcherFilePrefix'
import type { LauncherItem } from '@/types'
import LauncherResultItem from '@/components/launcher/LauncherResultItem'

const PAGE_STEP = 10
const FIND_OPEN_DEBOUNCE_MS = 160
/** 普通关键词：略防抖，减少连续按键时的后端查询次数（与 find/open 分开，可更短）。 */
const GENERAL_SEARCH_DEBOUNCE_MS = 72

function LauncherPanel() {
  const { config, loaded, updateConfig } = useAppConfig()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)
  /** 有请求尚未返回（含防抖等待、快搜与全量搜）时用于列表区与角标旁反馈 */
  const [listLoading, setListLoading] = useState(false)
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

  /** 空串 / find·open：防抖后查询（含慢速文件 walk）；其它关键词：短防抖后 launcher_query。 */
  useEffect(() => {
    if (!loaded) {
      return
    }
    const q = query
    const gen = ++searchGenRef.current
    setListLoading(true)
    let pending = 0
    const doneOne = () => {
      if (searchGenRef.current !== gen) {
        return
      }
      pending -= 1
      if (pending <= 0) {
        setListLoading(false)
      }
    }
    const track = (p: Promise<unknown>) => {
      pending += 1
      void p.finally(doneOne)
    }

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
        track(
          invoke<LauncherItem[]>('launcher_query', { query: queryStr })
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
            .catch((e) => {
              handleError(e, queryStr)
            }),
        )
      }
      if (q.length === 0) {
        doFull(q)
        return () => {
          setListLoading(false)
        }
      }
      const t = window.setTimeout(() => {
        doFull(q)
      }, FIND_OPEN_DEBOUNCE_MS)
      return () => {
        window.clearTimeout(t)
        setListLoading(false)
      }
    }

    const t = window.setTimeout(() => {
      track(
        invoke<LauncherItem[]>('launcher_query', { query: q })
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
          .catch((e) => {
            handleError(e, q)
          }),
      )
    }, GENERAL_SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(t)
      setListLoading(false)
    }
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
    <div
      className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background"
      onKeyDown={onKeyDown}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
        <p className="text-sm font-semibold tracking-tight">启动器</p>
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
      <div className="flex shrink-0 border-b border-border/70 bg-muted/35 px-4 py-3">
        <div
          className={cn(
            'flex w-full min-w-0 items-center rounded-lg border border-input bg-background px-2.5 py-1.5 shadow-sm',
            'ring-offset-background focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-0',
          )}
        >
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索功能、URL 或本地路径…"
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            autoFocus
            aria-label="启动器搜索"
            spellCheck={false}
          />
          <span
            className="text-muted-foreground flex min-w-0 max-w-[45%] shrink-0 items-center justify-end gap-1.5 border-l border-border/60 pl-2.5 text-xs tabular-nums"
            aria-live="polite"
            aria-busy={listLoading}
          >
            {listLoading ? (
              <Loader2
                className="size-3.5 shrink-0 motion-reduce:animate-none motion-reduce:opacity-70 motion-reduce:grayscale animate-spin"
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 truncate">
              {items.length} 项{listLoading ? ' · 更新中' : ''}
            </span>
          </span>
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
          <div
            ref={scrollParentRef}
            className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain"
            role="presentation"
          >
            <div
              className="box-border w-full min-w-0 max-w-full flex-col p-1.5"
              role="listbox"
              aria-label="结果"
              aria-busy={listLoading}
            >
              {items.length === 0 ? (
                <div
                  role="status"
                  className="text-muted-foreground px-3 py-8 text-center text-sm leading-relaxed"
                >
                  {listLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-2">
                      <Loader2
                        className="size-7 shrink-0 motion-reduce:animate-none motion-reduce:opacity-70 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                      <p className="text-sm font-medium text-foreground/85">正在搜索…</p>
                      <p className="text-xs text-muted-foreground">若需搜本地文件，可尝试 find 或 open 前缀</p>
                    </div>
                  ) : query.trim() === '' ? (
                    <>
                      <p className="font-medium text-foreground/80">暂无条目</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        输入应用名、URL、路径或关键词即可搜索（含本机已安装应用）；使用 find / open 前缀可搜配置目录及开始菜单/应用程序内的文件。
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-foreground/80">无匹配项</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        可换关键词，或输入 <span className="whitespace-nowrap font-mono text-[11px]">find</span> /{' '}
                        <span className="whitespace-nowrap font-mono text-[11px]">open</span> 后加空格再搜文件名。
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div
                  className={cn('relative w-full min-w-0', listLoading && 'opacity-[0.92] transition-opacity')}
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
            <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1 align-middle [&_[data-slot=kbd]]:h-4 [&_[data-slot=kbd]]:min-h-4 [&_[data-slot=kbd]]:px-1 [&_[data-slot=kbd]]:text-[10px] sm:[&_[data-slot=kbd]]:text-xs">
              <KbdGroup>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </KbdGroup>
              <span>选择</span>
              <span aria-hidden>·</span>
              <Kbd>PageUp</Kbd>
              <span>/</span>
              <Kbd>PageDown</Kbd>
              <span>翻页</span>
              <span aria-hidden>·</span>
              <Kbd>Home</Kbd>
              <span>/</span>
              <Kbd>End</Kbd>
              <span>至首/尾</span>
              <span aria-hidden>·</span>
              {isMacOs() ? <Kbd>⌘</Kbd> : <Kbd>Ctrl</Kbd>}
              <span>+</span>
              <Kbd>1</Kbd>
              <span>～</span>
              <Kbd>9</Kbd>
              <span>打开对应项</span>
              <span aria-hidden>·</span>
              <Kbd>Enter</Kbd>
              <span>打开</span>
              <span aria-hidden>·</span>
              <Kbd>Esc</Kbd>
              <span>关闭。</span>
            </span>
            <span className="block sm:inline sm:before:content-['·_'] [&_[data-slot=kbd]]:h-4 [&_[data-slot=kbd]]:min-h-4 [&_[data-slot=kbd]]:px-1 [&_[data-slot=kbd]]:text-[10px] sm:[&_[data-slot=kbd]]:text-xs">
              输入 <Kbd>find</Kbd> + 关键词：在资源管理器/访达中揭示命中项所在文件夹（类似 Alfred Reveal）；
              <Kbd>open</Kbd> + 关键词：打开匹配文件。
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LauncherPanel
