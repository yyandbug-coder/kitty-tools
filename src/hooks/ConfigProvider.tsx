import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import type { AppConfig, SaveConfigCmdResult } from '@/types'
import { DEFAULT_CONFIG } from '@/types'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'
import { AppConfigContext } from './config-context'
import { useTheme } from '@/hooks/useTheme'

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const configRef = useRef(config)
  configRef.current = config

  /** 在 document.documentElement 上同步 light/dark（含「跟随系统」），使 Radix Portal 与系统/应用外观一致；独立窗口不能只依赖内层 div 的 .dark。 */
  useTheme(config.theme)

  useEffect(() => {
    invoke<AppConfig>('get_config')
      .then((cfg) => {
        setConfig(cfg)
        setLoaded(true)
      })
      .catch(() => {
        setConfig(DEFAULT_CONFIG)
        setLoaded(true)
        toast.error('配置加载失败，已使用默认设置', { duration: 4500 })
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen<AppConfig>('config-updated', (e) => {
      setConfig(e.payload)
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen<string>('autostart-sync-failed', (e) => {
      toast.error(`开机自启未同步：${e.payload}`, { duration: 6000 })
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    const previous = configRef.current
    const merged: AppConfig = { ...previous, ...updates }
    setConfig(merged)
    configRef.current = merged
    try {
      const result = await invoke<SaveConfigCmdResult>('save_config_cmd', { config: merged })
      setConfig(result.config)
      if (result.syncWarnings.length > 0) {
        toast.error(result.syncWarnings.join('；'), { duration: 6500 })
      }
    } catch (e) {
      setConfig(previous)
      configRef.current = previous
      console.error('保存配置失败:', e)
      toast.error(`保存配置失败，已恢复原设置：${getInvokeErrorMessage(e)}`, { duration: 7000 })
    }
  }, [])

  return <AppConfigContext.Provider value={{ config, loaded, updateConfig }}>{children}</AppConfigContext.Provider>
}
