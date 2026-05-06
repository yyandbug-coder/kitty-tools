/**
 * 来源应用图标 - 按路径拉取 PNG data URL；会话级缓存 + 批量预取由
 * `src/lib/sourceAppIconCache.ts` 统一负责，本组件只负责呈现与状态。
 */
import { AppWindow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getOrFetchIcon, lookupIconCache } from '@/lib/sourceAppIconCache'

interface Props {
  path?: string
  title?: string
  sizePx?: number
  className?: string
}

export default function SourceAppIcon({ path, title, sizePx = 14, className }: Props) {
  const key = path?.trim() ?? ''
  const [url, setUrl] = useState<string | null>(() => {
    if (!key) {
      return null
    }
    const { hit, value } = lookupIconCache(key)
    return hit ? value : null
  })

  useEffect(() => {
    if (!key) {
      setUrl(null)
      return
    }
    const cached = lookupIconCache(key)
    if (cached.hit) {
      setUrl(cached.value)
      return
    }
    let cancelled = false
    void getOrFetchIcon(key).then((value) => {
      if (!cancelled) setUrl(value)
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
          className
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
      <AppWindow className={cn('size-full text-muted-foreground opacity-80', className)} aria-hidden />
    </span>
  )
}
