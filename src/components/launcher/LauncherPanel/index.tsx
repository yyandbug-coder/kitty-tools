/**
 * 启动器面板：不透明窗口 + 与划词翻译浮窗一致的实心背景与分区样式；
 * 输入关键词筛选内置动作、系统快捷项、已安装应用（Windows 开始菜单 / macOS 应用程序）、URL、路径、书签等；find/open 前缀按 Alfred 习惯搜文件（揭示目录 / 打开文件）；
 * 标题行与搜索条外圈通过 start_launcher_drag 原生拖动（与剪贴板/翻译浮层一致）；工具栏、搜索框等为 data-no-drag。
 */
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { CircleHelp, Loader2, Pin, Settings } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isMacOs } from '@/lib/platform'
import { useAppConfig } from '@/hooks/useAppConfig'
import { toastInvokeError } from '@/lib/invoke-helpers'
import { isFindOrOpenFileCommandQuery } from '@/lib/launcherFilePrefix'
import type { LauncherItem } from '@/types'
import LauncherResultItem from '@/components/launcher/LauncherResultItem'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { prefetchIcons } from '@/lib/sourceAppIconCache'

const PAGE_STEP = 10
const FIND_OPEN_DEBOUNCE_MS = 160
/** 普通关键词：防抖略长，避免与后端 `spawn_blocking` 查询重叠排队导致输入卡顿（尤其书签较多时）。 */
const GENERAL_SEARCH_DEBOUNCE_MS = 130

/** 后端返回与当前列表语义一致时保留原 Array 引用，避免虚拟列表 / `LauncherResultItem`
 *  memo 被无谓击穿。仅比较稳定可见字段，不深比 payload 内部结构。 */
function launcherItemsEqual(a: LauncherItem[], b: LauncherItem[]): boolean {
  if (a === b) {
    return true
  }
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.payload !== y.payload ||
      x.title !== y.title ||
      x.subtitle !== y.subtitle ||
      x.iconPath !== y.iconPath
    ) {
      return false
    }
  }
  return true
}

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
  /** 中文等 IME：compositionend 后紧随的 Enter 用于上屏，WebKit 上 `isComposing` 可能已为 false，需短暂忽略本次打开第一项。 */
  const imeSuppressEnterRef = useRef(false)
  queryForResultRef.current = query

  /** 让 `executeAt` / 可点击回调不依赖 items state，避免每次 setItems 都产生
   *  新引用、击穿 LauncherResultItem 的 memo。 */
  const itemsRef = useRef<LauncherItem[]>(items)
  itemsRef.current = items

  const handleCompositionEnd = useCallback(() => {
    imeSuppressEnterRef.current = true
    queueMicrotask(() => {
      imeSuppressEnterRef.current = false
    })
  }, [])

  const listVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 52,
    overscan: 10,
    getItemKey: (index) => {
      const it = items[index]
      return it ? `${it.id}-${index}` : String(index)
    }
  })

  useLayoutEffect(() => {
    if (items.length === 0) {
      return
    }
    const idx = Math.min(selected, items.length - 1)
    listVirtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [items, selected, listVirtualizer])

  /** 结果集变化时一次性预取整列 iconPath，把 N 次 IPC 往返合成 1 次；
   *  命中缓存或在飞中的项会被自动跳过，等价结果集不会触发（依赖项保留原 Array 引用）。 */
  useEffect(() => {
    if (items.length === 0) return
    const paths = items.map((it) => it.iconPath ?? '')
    prefetchIcons(paths)
  }, [items])

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
              startTransition(() => {
                setItems((prev) => (launcherItemsEqual(prev, res) ? prev : res))
                setSelected(0)
              })
            })
            .catch((e) => {
              handleError(e, queryStr)
            })
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
            startTransition(() => {
              setItems((prev) => (launcherItemsEqual(prev, res) ? prev : res))
              setSelected(0)
            })
          })
          .catch((e) => {
            handleError(e, q)
          })
      )
    }, GENERAL_SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(t)
      setListLoading(false)
    }
  }, [query, loaded])

  // 读 `itemsRef` 代替闭包依赖 items 状态，使 `executeAt` 在会话内引用不变，
  // 随后可作为 `useCallback` 的稳定依赖进一步传递给后续回调。
  const executeAt = useCallback((index: number) => {
    const item = itemsRef.current[index]
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
  }, [])

  // 传给 `LauncherResultItem` 的两个稳定回调：MouseEnter 只负责 setSelected，
  // Activate 同时 setSelected + executeAt。全闭包无 items / executeAt 外的依赖。
  const handleMouseEnterIndex = useCallback((index: number) => {
    setSelected(index)
  }, [])
  const handleActivateIndex = useCallback(
    (index: number) => {
      setSelected(index)
      executeAt(index)
    },
    [executeAt]
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

  const handleDragPointerDown = useCallback(async (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-no-drag="true"]')) {
      return
    }
    if (event.button !== 0) {
      return
    }
    try {
      await invoke('start_launcher_drag')
    } catch (e) {
      toastInvokeError('无法开始拖动窗口', e)
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
    const ne = e.nativeEvent
    if (ne.isComposing || ne.keyCode === 229) {
      return
    }
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
      if (imeSuppressEnterRef.current) {
        return
      }
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
    <TooltipProvider delayDuration={280}>
      <div
        className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background"
        onKeyDown={onKeyDown}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2.5 sm:px-4 sm:py-3"
          onPointerDown={handleDragPointerDown}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <AppLogoIcon className="size-7 shrink-0 sm:size-8" alt="" aria-hidden />
            <p className="min-w-0 truncate text-sm font-semibold tracking-tight">启动器</p>
          </div>
          <div className="flex shrink-0 items-center gap-1" data-no-drag="true">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="快捷键与 find/open 说明"
                  data-no-drag="true"
                >
                  <CircleHelp className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                variant="rich"
                side="bottom"
                align="start"
                sideOffset={8}
                className="max-w-[min(calc(100vw-1.5rem),22rem)] space-y-2.5 text-[11px] leading-relaxed sm:max-w-sm sm:text-xs"
              >
                <div>
                  <p className="mb-1 font-semibold text-popover-foreground">导航与打开</p>
                  <p className="text-muted-foreground [&_[data-slot=kbd]]:text-[10px]">
                    <KbdGroup>
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd>
                    </KbdGroup>
                    选择 · <Kbd>PageUp</Kbd>/<Kbd>PageDown</Kbd> 翻页 · <Kbd>Home</Kbd>/<Kbd>End</Kbd> 至首条/末条 · 前
                    9 条右侧为 {isMacOs() ? <Kbd>⌘</Kbd> : <Kbd>Ctrl</Kbd>}
                    <Kbd>1</Kbd>～<Kbd>9</Kbd> · <Kbd>Enter</Kbd> 打开当前项 · <Kbd>Esc</Kbd> 关闭窗口。
                  </p>
                </div>
                <div className="border-t border-border/60 pt-2">
                  <p className="mb-1 font-semibold text-popover-foreground">搜本地文件（find / open）</p>
                  <p className="text-muted-foreground [&_[data-slot=kbd]]:text-[10px]">
                    输入 <Kbd>find</Kbd> + 空格 + 关键词：在资源管理器/访达中
                    <strong className="font-medium text-popover-foreground">揭示</strong>
                    命中文件所在文件夹。
                    <span className="mt-1 block">
                      输入 <Kbd>open</Kbd> + 空格 + 关键词：
                      <strong className="font-medium text-popover-foreground">打开</strong>匹配文件。
                    </span>
                  </p>
                </div>
                <p className="border-t border-border/60 pt-2 text-[10px] text-muted-foreground sm:text-[11px]">
                  更完整的说明见<strong className="font-medium text-popover-foreground">设置 → 启动器</strong>。
                </p>
              </TooltipContent>
            </Tooltip>
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
          className="flex shrink-0 border-b border-border/70 bg-muted/35 px-4 py-3"
          onPointerDown={handleDragPointerDown}
        >
          <div
            className={cn(
              'flex w-full min-w-0 items-center rounded-lg border border-input bg-background px-2.5 py-1.5 shadow-sm',
              'ring-offset-background focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-0'
            )}
            data-no-drag="true"
          >
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionEnd={handleCompositionEnd}
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
                    aria-live="polite"
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
                          输入应用名、URL、路径或关键词即可搜索（含本机已安装应用）；使用 find / open
                          前缀可搜配置目录及开始菜单/应用程序内的文件。
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
                              index={v.index}
                              selected={v.index === selected}
                              onMouseEnterIndex={handleMouseEnterIndex}
                              onActivateIndex={handleActivateIndex}
                            />
                          </div>
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
    </TooltipProvider>
  )
}

export default LauncherPanel
