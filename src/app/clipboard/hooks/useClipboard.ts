// 剪贴板历史管理 Hook - 监听系统剪贴板变化，维护历史列表
// 提供搜索过滤（大数据量在 Worker 中匹配）、虚拟列表用全量 filtered、条目选择、粘贴和清空等
// 基于 example/kitty-clipboard-history 的增强版，适配 root 的 AppConfig
import { useState, useEffect, useCallback, useMemo, useRef, startTransition, useDeferredValue } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { toastInvokeError } from '@/lib/invoke-helpers'
import type { AppConfig, ClipboardItem } from '@/types'
import {
  clearClipboardImagePreviewCache,
  pruneClipboardImagePreviewCache
} from '@/app/clipboard/lib/clipboard-image-preview'
import {
  mergeClipboardHistoriesForSync,
  normalizeSyncMergedHistoryAsync,
  prependFingerprintDedupedClipboardHistory
} from '@/app/clipboard/lib/cloud-sync'
import {
  CLIPBOARD_FILTER_WORKER_MIN_ITEMS,
  filterClipboardHistoryByKeywordInWorker,
  toClipboardFilterRows
} from '@/app/clipboard/lib/clipboard-history-worker'
import { filterHistoryByRetention } from '@/app/clipboard/lib/clipboard-retention'
import { applyClipboardHistoryMaxSlice } from '@/app/clipboard/lib/history-settings'
import { loadClipboardHistoryItemsFromDb, replaceClipboardHistoryInDb } from '@/services/database'

export function useClipboard(config: AppConfig) {
  const [history, setHistory] = useState<ClipboardItem[]>([])
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const isHistoryLoadingRef = useRef(true)
  const userBrowsingRef = useRef(false)
  const retentionDaysRef = useRef(config.clipboardHistoryRetentionDays)
  const historyMaxRef = useRef(config.clipboardHistoryMax)
  const clipProcessChainRef = useRef(Promise.resolve())
  const historyRef = useRef(history)
  const persistGenerationRef = useRef(0)
  const filterWorkerGenRef = useRef(0)
  /** 中文等 IME：compositionend 后紧随的 Enter 用于上屏，部分浏览器 isComposing 已为 false，需短暂忽略一次。 */
  const imeSuppressEnterRef = useRef(false)
  retentionDaysRef.current = config.clipboardHistoryRetentionDays
  historyMaxRef.current = config.clipboardHistoryMax
  historyRef.current = history

  useEffect(() => {
    setHistory((prev) => {
      const next = filterHistoryByRetention(prev, config.clipboardHistoryRetentionDays)
      if (next.length === prev.length && next.every((item, idx) => item === prev[idx])) return prev
      pruneClipboardImagePreviewCache(next.map((item) => item.id))
      return next
    })
  }, [config.clipboardHistoryRetentionDays])

  useEffect(() => {
    const cap = config.clipboardHistoryMax
    if (cap <= 0) return
    setHistory((prev) => {
      const next = applyClipboardHistoryMaxSlice(prev, cap)
      if (next.length === prev.length && next.every((item, idx) => item === prev[idx])) return prev
      pruneClipboardImagePreviewCache(next.map((item) => item.id))
      return next
    })
  }, [config.clipboardHistoryMax])

  useEffect(() => {
    if (config.clipboardHistoryRetentionDays <= 0) return
    const prune = () => {
      setHistory((prev) => {
        const next = filterHistoryByRetention(prev, retentionDaysRef.current)
        if (next.length === prev.length && next.every((item, idx) => item === prev[idx])) return prev
        pruneClipboardImagePreviewCache(next.map((item) => item.id))
        return next
      })
    }
    const intervalId = window.setInterval(prune, 10 * 60 * 1000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') prune()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [config.clipboardHistoryRetentionDays])

  useEffect(() => {
    void invoke('start_clipboard_watcher').catch((e) => toastInvokeError('剪贴板监听启动失败', e))
    let teardown = false
    const unlistenPromise = listen<ClipboardItem>('clipboard-change', (e) => {
      const incoming = e.payload
      clipProcessChainRef.current = clipProcessChainRef.current
        .then(async () => {
          if (teardown) return
          let payload = incoming
          if (payload.type === 'image') payload = { ...payload, imageRgba: undefined }
          if (teardown) return
          setHistory((prev) => {
            const nextHistory = filterHistoryByRetention(
              applyClipboardHistoryMaxSlice(
                prependFingerprintDedupedClipboardHistory(payload, prev),
                historyMaxRef.current
              ),
              retentionDaysRef.current
            )
            pruneClipboardImagePreviewCache(nextHistory.map((item) => item.id))
            return nextHistory
          })
          if (!userBrowsingRef.current) {
            setSelectedIndex(0)
          }
        })
        .catch((err) => {
          toastInvokeError('处理剪贴板更新失败', err)
        })
    })
    return () => {
      teardown = true
      clipProcessChainRef.current = Promise.resolve()
      void unlistenPromise.then((fn) => fn()).catch(() => {})
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function initHistory() {
      try {
        const fromTable = await loadClipboardHistoryItemsFromDb()
        if (cancelled) return
        const cachedHistory = filterHistoryByRetention(
          applyClipboardHistoryMaxSlice(fromTable, historyMaxRef.current),
          retentionDaysRef.current
        )
        if (cancelled || cachedHistory.length === 0) return
        setHistory((prev) => {
          if (prev.length === 0) return cachedHistory
          const merged = filterHistoryByRetention(
            applyClipboardHistoryMaxSlice(mergeClipboardHistoriesForSync(prev, cachedHistory), historyMaxRef.current),
            retentionDaysRef.current
          )
          pruneClipboardImagePreviewCache(merged.map((item) => item.id))
          return merged
        })
      } catch (error) {
        console.error('Failed to load clipboard history from database:', error)
        toast.error('从本地数据库加载剪贴板历史失败', { duration: 4500 })
      } finally {
        if (!cancelled) {
          isHistoryLoadingRef.current = false
          setIsHistoryLoading(false)
        }
      }
    }
    void initHistory()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isHistoryLoadingRef.current) return
    const generation = ++persistGenerationRef.current
    const persistDelayMs = historyRef.current.length > 2000 ? 650 : 350
    const timeout = window.setTimeout(() => {
      const snap = historyRef.current
      const imageIds = snap.filter((item) => item.type === 'image').map((item) => item.id)
      void (async () => {
        if (generation !== persistGenerationRef.current) return
        try {
          await replaceClipboardHistoryInDb(snap)
        } catch (error) {
          toastInvokeError('保存剪贴板历史失败', error)
          return
        }
        if (generation !== persistGenerationRef.current) return
        try {
          await invoke('prune_clipboard_image_store', { keepIds: imageIds })
        } catch (error) {
          toastInvokeError('清理剪贴板图片缓存失败', error)
        }
      })()
    }, persistDelayMs)
    return () => window.clearTimeout(timeout)
  }, [history])

  const favoritedTotal = useMemo(() => history.reduce((n, item) => n + (item.favorited ? 1 : 0), 0), [history])

  const baseList = useMemo(
    () => (showFavoritesOnly ? history.filter((item) => item.favorited) : history),
    [history, showFavoritesOnly]
  )

  const keywordLower = deferredSearch.toLowerCase().trim()
  const useWorkerForFilter = baseList.length >= CLIPBOARD_FILTER_WORKER_MIN_ITEMS && keywordLower.length > 0

  const [workerMatchIds, setWorkerMatchIds] = useState<string[] | null>(null)

  useEffect(() => {
    if (!useWorkerForFilter) {
      setWorkerMatchIds(null)
      return
    }
    const gen = ++filterWorkerGenRef.current
    const rows = toClipboardFilterRows(baseList)
    void filterClipboardHistoryByKeywordInWorker(rows, keywordLower).then((ids) => {
      if (gen !== filterWorkerGenRef.current) return
      setWorkerMatchIds(ids)
    })
  }, [useWorkerForFilter, baseList, keywordLower])

  const filterWorkerPending = useWorkerForFilter && workerMatchIds === null

  const filtered = useMemo(() => {
    if (!keywordLower) {
      return baseList
    }
    if (!useWorkerForFilter) {
      return baseList.filter((item) => {
        if (item.type === 'file') {
          return (
            item.content.toLowerCase().includes(keywordLower) ||
            (item.filePaths ?? []).some((path) => path.toLowerCase().includes(keywordLower))
          )
        }
        return item.content.toLowerCase().includes(keywordLower)
      })
    }
    if (workerMatchIds === null) {
      return []
    }
    const byId = new Map(baseList.map((item) => [item.id, item]))
    const out: ClipboardItem[] = []
    for (const id of workerMatchIds) {
      const item = byId.get(id)
      if (item) {
        out.push(item)
      }
    }
    return out
  }, [baseList, keywordLower, useWorkerForFilter, workerMatchIds])

  useEffect(() => {
    userBrowsingRef.current = false
  }, [search])

  useEffect(() => {
    setSelectedIndex(0)
  }, [showFavoritesOnly])

  const selectedItem = filtered[selectedIndex] ?? null
  const stateRef = useRef({ filtered, selectedIndex, pasteOnEnter: config.clipboardPasteOnEnter })
  stateRef.current = { filtered, selectedIndex, pasteOnEnter: config.clipboardPasteOnEnter }

  const handlePaste = useCallback(async (item: ClipboardItem) => {
    try {
      const payload = item.type === 'image' ? { ...item, imageRgba: undefined } : item
      await invoke('paste_item', { item: payload })
    } catch (err) {
      toastInvokeError('粘贴失败', err)
    }
  }, [])

  const handleSearchCompositionEnd = useCallback(() => {
    imeSuppressEnterRef.current = true
    queueMicrotask(() => {
      imeSuppressEnterRef.current = false
    })
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const ne = e.nativeEvent
      if (ne.isComposing || ne.keyCode === 229 || imeSuppressEnterRef.current) {
        return
      }
      const target = e.target
      if (target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return
      }
      const { filtered: currentFiltered, selectedIndex: currentIdx, pasteOnEnter } = stateRef.current
      const maxIndex = Math.max(currentFiltered.length - 1, 0)
      const mod = e.metaKey || e.ctrlKey
      if (mod) {
        const digit = e.key
        if (digit.length === 1 && digit >= '1' && digit <= '9') {
          e.preventDefault()
          const slot = Number.parseInt(digit, 10) - 1
          if (currentFiltered.length === 0 || slot > maxIndex) return
          userBrowsingRef.current = true
          setSelectedIndex(slot)
          if (pasteOnEnter) {
            userBrowsingRef.current = false
            const item = currentFiltered[slot]
            if (item) void handlePaste(item)
          }
          return
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        userBrowsingRef.current = true
        const newIdx = Math.min(currentIdx + 1, maxIndex)
        setSelectedIndex(newIdx)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        userBrowsingRef.current = true
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && pasteOnEnter && currentFiltered[currentIdx]) {
        e.preventDefault()
        userBrowsingRef.current = false
        handlePaste(currentFiltered[currentIdx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        void invoke('hide_window').catch((err) => toastInvokeError('隐藏窗口失败', err))
      }
    },
    [handlePaste]
  )

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, selectedIndex])

  const replaceHistory = useCallback(async (items: ClipboardItem[]) => {
    const nextHistory = filterHistoryByRetention(
      applyClipboardHistoryMaxSlice(await normalizeSyncMergedHistoryAsync(items), historyMaxRef.current),
      retentionDaysRef.current
    )
    pruneClipboardImagePreviewCache(nextHistory.map((item) => item.id))
    startTransition(() => {
      setHistory(nextHistory)
      setSelectedIndex(0)
    })
  }, [])

  const mergeImportedHistory = useCallback((items: ClipboardItem[]) => {
    if (items.length === 0) return
    setHistory((prev) => {
      const merged = filterHistoryByRetention(
        applyClipboardHistoryMaxSlice(mergeClipboardHistoriesForSync(prev, items), historyMaxRef.current),
        retentionDaysRef.current
      )
      pruneClipboardImagePreviewCache(merged.map((item) => item.id))
      return merged
    })
    setSelectedIndex(0)
  }, [])

  const clearHistory = useCallback(() => {
    clearClipboardImagePreviewCache()
    setHistory([])
    setSelectedIndex(0)
  }, [])

  const reloadHistoryFromDb = useCallback(async () => {
    try {
      const fromTable = await loadClipboardHistoryItemsFromDb()
      if (fromTable.length === 0) {
        clearClipboardImagePreviewCache()
        startTransition(() => {
          setHistory([])
          setSelectedIndex(0)
        })
        return
      }
      const cachedHistory = filterHistoryByRetention(
        applyClipboardHistoryMaxSlice(fromTable, historyMaxRef.current),
        retentionDaysRef.current
      )
      pruneClipboardImagePreviewCache(cachedHistory.map((item) => item.id))
      startTransition(() => {
        setHistory(cachedHistory)
        setSelectedIndex(0)
      })
    } catch (error) {
      toastInvokeError('从数据库重新加载剪贴板历史失败', error)
    }
  }, [])

  useEffect(() => {
    let unlistenReload: (() => void) | undefined
    void listen('clipboard-history-reload-from-db', () => {
      void reloadHistoryFromDb()
    }).then((fn) => {
      unlistenReload = fn
    })
    return () => {
      unlistenReload?.()
    }
  }, [reloadHistoryFromDb])

  const toggleItemFavorite = useCallback((id: string) => {
    setHistory((prev) => prev.map((item) => (item.id === id ? { ...item, favorited: !item.favorited } : item)))
  }, [])

  const removeHistoryItem = useCallback((id: string): boolean => {
    let removed = false
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id)
      if (next.length === prev.length) return prev
      removed = true
      pruneClipboardImagePreviewCache(next.map((item) => item.id))
      return next
    })
    return removed
  }, [])

  const flushClipboardHistoryToDisk = useCallback(async () => {
    persistGenerationRef.current += 1
    try {
      await clipProcessChainRef.current
    } catch {
      /* already logged */
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    const snap = historyRef.current
    const imageIds = snap.filter((item) => item.type === 'image').map((item) => item.id)
    try {
      await replaceClipboardHistoryInDb(snap)
    } catch (error) {
      console.error('退出前保存剪贴板历史失败:', error)
      throw error
    }
    try {
      await invoke('prune_clipboard_image_store', { keepIds: imageIds })
    } catch (error) {
      toast.error('退出前清理图片缓存失败，但不影响已保存的文本历史', { duration: 4000 })
      console.error(error)
    }
  }, [])

  return {
    history,
    isHistoryLoading,
    search,
    setSearch,
    showFavoritesOnly,
    setShowFavoritesOnly,
    favoritedTotal,
    filtered,
    filterWorkerPending,
    selectedItem,
    selectedIndex,
    setSelectedIndex,
    replaceHistory,
    mergeImportedHistory,
    clearHistory,
    toggleItemFavorite,
    removeHistoryItem,
    handlePaste,
    handleKeyDown,
    handleSearchCompositionEnd,
    flushClipboardHistoryToDisk
  }
}
