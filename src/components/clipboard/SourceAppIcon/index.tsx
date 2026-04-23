/**
 * 来源应用图标 - 按路径 invoke 拉取 PNG data URL，会话内缓存；失败用占位图标
 */
import { AppWindow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { cn } from '@/lib/utils'

/** 会话内图标缓存上限（FIFO淘汰），避免路径种类极多时 Map 无限增长 */
const ICON_CACHE_CAP = 128
const cache = new Map<string, string | null>()
const cacheInsertOrder: string[] = []

function rememberIconCache(key: string, value: string | null) {
  if (!cache.has(key)) {
    cache.set(key, value)
    cacheInsertOrder.push(key)
    while (cacheInsertOrder.length > ICON_CACHE_CAP) {
      const oldest = cacheInsertOrder.shift()
      if (oldest) cache.delete(oldest)
    }
    return
  }
  cache.set(key, value)
}

interface Props {
  path?: string
  title?: string
  sizePx?: number
  className?: string
}

export default function SourceAppIcon({ path, title, sizePx = 14, className }: Props) {
  const key = path?.trim() ?? ''
  const [url, setUrl] = useState<string | null>(() =>
    key && cache.has(key) ? (cache.get(key) as string | null) : null,
  )

  useEffect(() => {
    if (!key) {
      setUrl(null)
      return
    }
    if (cache.has(key)) {
      setUrl(cache.get(key) ?? null)
      return
    }
    let cancelled = false
    invoke<string | null>('get_app_icon_data_url', { path: key })
      .then((dataUrl) => {
        rememberIconCache(key, dataUrl ?? null)
        if (!cancelled) setUrl(dataUrl ?? null)
      })
      .catch(() => {
        rememberIconCache(key, null)
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  const iconBoxStyle = { ['--src-icon' as string]: `${sizePx}px` }

  if (url) {
    return (
      <img
        src={url}
        alt=""
        title={title}
        className={cn(
          'h-[length:var(--src-icon)] w-[length:var(--src-icon)] shrink-0 rounded-[4px] object-contain',
          className,
        )}
        style={iconBoxStyle}
        draggable={false}
      />
    )
  }

  return (
    <span
      title={title}
      className="inline-flex h-[length:var(--src-icon)] w-[length:var(--src-icon)] shrink-0"
      style={iconBoxStyle}
    >
      <AppWindow
        className={cn('size-full text-muted-foreground opacity-80', className)}
        aria-hidden
      />
    </span>
  )
}
