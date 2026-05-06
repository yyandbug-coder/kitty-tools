import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import toast from 'react-hot-toast'
import type { AppConfig, SaveConfigCmdResult } from '@/types'
import { DEFAULT_CONFIG } from '@/types'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'
import { AppConfigContext } from './config-context'
import { useTheme } from '@/hooks/useTheme'
import { useTauriEvent } from '@/hooks/useTauriEvent'

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const configRef = useRef(config)
  /** 连续保存配置时用作幂等序号：仅最新一次请求允许把状态刷回 / 回滚，避免旧请求晚返回覆盖新值。 */
  const latestSaveSeqRef = useRef(0)
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

  // 后端在 save_config_cmd 后广播；其它窗口订阅以同步配置（如设置变更后浮窗即时刷新主题）。
  useTauriEvent<AppConfig>('config-updated', (e) => {
    setConfig(e.payload)
  })

  // 开机自启同步失败的非致命提示由后端 emit；前端 toast 即可。
  useTauriEvent<string>('autostart-sync-failed', (e) => {
    toast.error(`开机自启未同步：${e.payload}`, { duration: 6000 })
  })

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    const previous = configRef.current
    const merged: AppConfig = { ...previous, ...updates }
    const seq = ++latestSaveSeqRef.current
    setConfig(merged)
    configRef.current = merged
    try {
      const result = await invoke<SaveConfigCmdResult>('save_config_cmd', { config: merged })
      // 仅最新一次请求允许刷新状态/弹警告，避免连击设置时旧请求覆盖新值。
      if (seq !== latestSaveSeqRef.current) return
      setConfig(result.config)
      if (result.syncWarnings.length > 0) {
        toast.error(result.syncWarnings.join('；'), { duration: 6500 })
      }
    } catch (e) {
      // 仅当未被更新的请求覆盖时才回滚；否则后续请求已成功，回滚反而把新值丢掉。
      if (seq === latestSaveSeqRef.current) {
        setConfig(previous)
        configRef.current = previous
      }
      console.error('保存配置失败:', e)
      toast.error(`保存配置失败：${getInvokeErrorMessage(e)}`, { duration: 7000 })
    }
  }, [])

  return <AppConfigContext.Provider value={{ config, loaded, updateConfig }}>{children}</AppConfigContext.Provider>
}
