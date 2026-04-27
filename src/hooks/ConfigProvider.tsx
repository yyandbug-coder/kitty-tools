import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import type { AppConfig } from '@/types'
import { DEFAULT_CONFIG } from '@/types'
import { AppConfigContext } from './config-context'

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const configRef = useRef(config)
  configRef.current = config

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

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    const previous = configRef.current
    const merged: AppConfig = { ...previous, ...updates }
    setConfig(merged)
    configRef.current = merged
    try {
      const saved = await invoke<AppConfig>('save_config_cmd', { config: merged })
      setConfig(saved)
    } catch (e) {
      setConfig(previous)
      configRef.current = previous
      console.error('保存配置失败:', e)
      toast.error('保存配置失败，已恢复原设置')
    }
  }, [])

  return <AppConfigContext.Provider value={{ config, loaded, updateConfig }}>{children}</AppConfigContext.Provider>
}
