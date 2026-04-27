/**
 * 启动器面板：输入关键词筛选内置动作/URL/路径，回车执行当前选中项；后续可接书签与全盘文件索引。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { LauncherItem } from '@/types'

function LauncherPanel() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const runQuery = useCallback((q: string) => {
    void invoke<LauncherItem[]>('launcher_query', { query: q })
      .then(setItems)
      .catch((e) => {
        console.error(e)
        toast.error('无法加载结果')
        setItems([])
      })
  }, [])

  useEffect(() => {
    runQuery(query)
  }, [query, runQuery])

  useEffect(() => {
    setSelected(0)
  }, [items])

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

  return (
    <div className="box-border flex h-full min-h-0 w-full min-w-0 flex-col p-3 sm:p-4">
      <div
        className="bg-background/90 dark:bg-background/80 flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 shadow-2xl backdrop-blur-md"
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-border/60 px-3 py-2 sm:px-4 sm:py-2.5">
          <p className="text-muted-foreground mb-1.5 text-[11px] font-medium sm:text-xs">启动器</p>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索功能、URL 或本地路径…"
            className="h-9 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 sm:h-10"
            autoFocus
            aria-label="启动器搜索"
            spellCheck={false}
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col p-1.5" role="listbox" aria-label="结果">
            {items.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">无匹配项</p>
            ) : (
              items.map((item, i) => (
                <Button
                  key={`${item.id}-${i}`}
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
              ))
            )}
          </div>
        </ScrollArea>
        <p className="text-muted-foreground border-t border-border/50 px-3 py-1.5 text-[10px] sm:text-xs">
          ↑↓ 选择 · Enter 打开 · Esc 关闭
        </p>
      </div>
    </div>
  )
}

export default LauncherPanel
