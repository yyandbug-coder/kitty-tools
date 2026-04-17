/**
 * 独立设置窗口根组件 - 仅承载完整设置页（非剪贴板浮层）
 */
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import SettingsPanel from '@clipboard/components/SettingsPanel'
import { ThemeProvider } from '@clipboard/components/ThemeProvider'
import { useAppSettings } from '@clipboard/hooks/useAppSettings'
import { getThemeRuntimeStyle } from '@clipboard/lib/theme'
import { parseClipboardHistoryImportJson } from '@clipboard/lib/clipboard-history-import'
import {
  clearClipboardHistoryStorage,
  getClipboardHistoryCount,
  loadClipboardHistoryItemsForExport,
  mergeImportIntoClipboardHistoryStorage,
} from '@clipboard/services/clipboard-history-mutations'
import dayjs from 'dayjs'
import { cn } from '@clipboard/lib/utils'

export default function SettingsWindowApp() {
  const { settings, updateSettings, resetSettings, isLoading: isSettingsLoading } = useAppSettings()
  const [historyCount, setHistoryCount] = useState(0)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const isDarkMode = settings.colorMode === 'dark' || (settings.colorMode === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(settings, isDarkMode) as CSSProperties,
    [settings.backgroundOpacity, settings.theme, settings.customHue, isDarkMode],
  )

  const refreshHistoryCount = useCallback(() => {
    void getClipboardHistoryCount()
      .then(setHistoryCount)
      .catch(() => {
        /* 忽略 */
      })
  }, [])

  useEffect(() => {
    refreshHistoryCount()
  }, [refreshHistoryCount])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen('clipboard-history-reload-from-db', refreshHistoryCount).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [refreshHistoryCount])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeMode = (event: MediaQueryList | MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    updateThemeMode(mediaQuery)
    mediaQuery.addEventListener('change', updateThemeMode)
    return () => mediaQuery.removeEventListener('change', updateThemeMode)
  }, [])

  const handleShortcutChange = async (shortcut: string) => {
    await invoke('clipboard_update_shortcut', { shortcut })
    updateSettings({ globalShortcut: shortcut })
  }

  const handleClearHistory = useCallback(async () => {
    try {
      await clearClipboardHistoryStorage()
      toast.success('已清空剪贴板历史。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空失败。')
    }
  }, [])

  const handleImportHistoryFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const items = parseClipboardHistoryImportJson(text)
        if (items.length === 0) {
          toast.error('文件中没有可导入的剪贴板条目。')
          return
        }
        await mergeImportIntoClipboardHistoryStorage(items, {
          historyMaxItems: settings.historyMaxItems,
          historyRetentionDays: settings.historyRetentionDays,
        })
        toast.success(`已合并导入 ${items.length} 条记录。`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '导入失败。')
      }
    },
    [settings.historyMaxItems, settings.historyRetentionDays],
  )

  const handleExportHistory = useCallback(async () => {
    try {
      const history = await loadClipboardHistoryItemsForExport()
      if (history.length === 0) {
        toast.error('没有可导出的历史记录。')
        return
      }
      const payload = {
        app: 'kitty-clipboard-history',
        exportedAt: Date.now(),
        history: history.map((item) => (item.type === 'image' ? { ...item, imageRgba: undefined } : item)),
      }
      const json = JSON.stringify(payload, null, 2)
      const defaultName = `kitty-clipboard-backup-${dayjs().format('YYYYMMDD-HHmmss')}.json`
      const path = await save({
        title: '导出剪贴板 JSON 备份',
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (path === null) {
        return
      }
      await writeTextFile(path, json)
      toast.success(`已导出 ${history.length} 条记录。`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error(error instanceof Error ? error.message : '导出失败，请重试。')
    }
  }, [])

  return (
    <ThemeProvider
      colorMode={settings.colorMode}
      onColorModeChange={(mode) => updateSettings({ colorMode: mode })}
      systemPrefersDark={systemPrefersDark}
    >
      <>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3200,
            className: 'text-sm',
          }}
        />
        {isSettingsLoading ? (
          <div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
            加载设置…
          </div>
        ) : (
          <div
            className={cn(
              'h-full w-full min-h-0 overflow-hidden text-foreground',
              isDarkMode && 'dark',
              settings.disableTextSelection && 'select-none',
            )}
            data-kitty-theme-scope
            data-theme={settings.theme}
            data-window="settings"
            style={appStyle}
          >
            <SettingsPanel
              settings={settings}
              onChange={updateSettings}
              onUpdateShortcut={handleShortcutChange}
              onReset={resetSettings}
              onClearHistory={handleClearHistory}
              onImportHistoryFile={handleImportHistoryFile}
              historyCount={historyCount}
              onExportHistory={handleExportHistory}
            />
          </div>
        )}
      </>
    </ThemeProvider>
  )
}
