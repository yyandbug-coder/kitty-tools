import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AppConfig } from '@translate/types'
import { DEFAULT_CONFIG, appConfigToRust } from '@translate/types'

interface RawBaidu {
  app_id?: string
  secret?: string
  ocr_api_key?: string
  ocr_secret_key?: string
  ocr_aip_base_url?: string
}

interface RawGoogle {
  api_key?: string
  vision_api_url?: string
  translate_api_url?: string
}

interface RawOpenai {
  api_base_url?: string
  api_key?: string
  model?: string
}

interface RawYoudao {
  app_key?: string
  app_secret?: string
}

interface RawConfig {
  source_lang: string
  target_lang: string
  translate_provider: string
  baidu?: RawBaidu
  google?: RawGoogle
  openai?: RawOpenai
  youdao?: RawYoudao
  /** 旧版扁平字段（兼容尚未迁移的 JSON） */
  baidu_app_id?: string
  baidu_secret?: string
  baidu_ocr_api_key?: string
  baidu_ocr_secret_key?: string
  baidu_ocr_api_base_url?: string
  google_vision_api_url?: string
  google_cloud_api_key?: string
  google_translate_api_url?: string
  openai_api_base_url?: string
  openai_api_key?: string
  openai_model?: string
  youdao_app_key?: string
  youdao_app_secret?: string
  hotkey_selection: string
  hotkey_screenshot: string
  launch_on_startup?: boolean
  auto_copy: boolean
  theme: string
  floating_pinned: boolean
  floating_window_x: number | null
  floating_window_y: number | null
  first_run?: boolean
  bidirectional_auto?: boolean
  bidirectional_lang_a?: string
  bidirectional_lang_b?: string
}

function rawToBaidu(raw: RawConfig): AppConfig['baidu'] {
  if (raw.baidu && typeof raw.baidu === 'object') {
    return {
      appId: raw.baidu.app_id ?? '',
      secret: raw.baidu.secret ?? '',
      ocrApiKey: raw.baidu.ocr_api_key ?? '',
      ocrSecretKey: raw.baidu.ocr_secret_key ?? '',
      ocrAipBaseUrl: raw.baidu.ocr_aip_base_url ?? '',
    }
  }
  return {
    appId: raw.baidu_app_id ?? '',
    secret: raw.baidu_secret ?? '',
    ocrApiKey: raw.baidu_ocr_api_key ?? '',
    ocrSecretKey: raw.baidu_ocr_secret_key ?? '',
    ocrAipBaseUrl: raw.baidu_ocr_api_base_url ?? '',
  }
}

function rawToGoogle(raw: RawConfig): AppConfig['google'] {
  if (raw.google && typeof raw.google === 'object') {
    return {
      apiKey: raw.google.api_key ?? '',
      visionApiUrl: raw.google.vision_api_url ?? DEFAULT_CONFIG.google.visionApiUrl,
      translateApiUrl: raw.google.translate_api_url ?? DEFAULT_CONFIG.google.translateApiUrl,
    }
  }
  return {
    apiKey: raw.google_cloud_api_key ?? '',
    visionApiUrl: raw.google_vision_api_url ?? DEFAULT_CONFIG.google.visionApiUrl,
    translateApiUrl: raw.google_translate_api_url ?? DEFAULT_CONFIG.google.translateApiUrl,
  }
}

function rawToOpenai(raw: RawConfig): AppConfig['openai'] {
  if (raw.openai && typeof raw.openai === 'object') {
    return {
      apiBaseUrl: raw.openai.api_base_url ?? DEFAULT_CONFIG.openai.apiBaseUrl,
      apiKey: raw.openai.api_key ?? '',
      model: raw.openai.model ?? DEFAULT_CONFIG.openai.model,
    }
  }
  return {
    apiBaseUrl: raw.openai_api_base_url ?? DEFAULT_CONFIG.openai.apiBaseUrl,
    apiKey: raw.openai_api_key ?? '',
    model: raw.openai_model ?? DEFAULT_CONFIG.openai.model,
  }
}

function rawToYoudao(raw: RawConfig): AppConfig['youdao'] {
  if (raw.youdao && typeof raw.youdao === 'object') {
    return {
      appKey: raw.youdao.app_key ?? '',
      appSecret: raw.youdao.app_secret ?? '',
    }
  }
  return {
    appKey: raw.youdao_app_key ?? '',
    appSecret: raw.youdao_app_secret ?? '',
  }
}

function toAppConfig(raw: RawConfig): AppConfig {
  return {
    sourceLang: raw.source_lang,
    targetLang: raw.target_lang,
    translateProvider: raw.translate_provider as AppConfig['translateProvider'],
    baidu: rawToBaidu(raw),
    google: rawToGoogle(raw),
    openai: rawToOpenai(raw),
    youdao: rawToYoudao(raw),
    hotkeySelection: raw.hotkey_selection,
    hotkeyScreenshot: raw.hotkey_screenshot,
    launchOnStartup: raw.launch_on_startup ?? DEFAULT_CONFIG.launchOnStartup,
    autoCopy: raw.auto_copy,
    theme: raw.theme as AppConfig['theme'],
    floatingPinned: raw.floating_pinned,
    floatingWindowX: raw.floating_window_x,
    floatingWindowY: raw.floating_window_y,
    firstRun: raw.first_run ?? false,
    bidirectionalAuto: raw.bidirectional_auto ?? DEFAULT_CONFIG.bidirectionalAuto,
    bidirectionalLangA: raw.bidirectional_lang_a ?? DEFAULT_CONFIG.bidirectionalLangA,
    bidirectionalLangB: raw.bidirectional_lang_b ?? DEFAULT_CONFIG.bidirectionalLangB,
  }
}

function mergeAppConfig(prev: AppConfig, updates: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...prev, ...updates }
  if (updates.baidu) {
    next.baidu = { ...prev.baidu, ...updates.baidu }
  }
  if (updates.google) {
    next.google = { ...prev.google, ...updates.google }
  }
  if (updates.openai) {
    next.openai = { ...prev.openai, ...updates.openai }
  }
  if (updates.youdao) {
    next.youdao = { ...prev.youdao, ...updates.youdao }
  }
  return next
}

function toRawConfig(cfg: AppConfig): RawConfig {
  const u = appConfigToRust(cfg)
  return {
    ...u,
    google: {
      ...u.google,
      vision_api_url: DEFAULT_CONFIG.google.visionApiUrl,
      translate_api_url: DEFAULT_CONFIG.google.translateApiUrl,
    },
  } as RawConfig
}

interface ConfigContextValue {
  config: AppConfig
  loaded: boolean
  /** 保存失败时会回滚内存状态并抛出错误（便于快捷键等需提示的场景） */
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue>({
  config: DEFAULT_CONFIG,
  loaded: false,
  updateConfig: async () => {},
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const configRef = useRef<AppConfig>(DEFAULT_CONFIG)
  /** 串行化磁盘写入，避免连续修改时后返回的旧请求覆盖新配置 */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  const applyRawConfig = useCallback((raw: RawConfig) => {
    const nextConfig = toAppConfig(raw)
    configRef.current = nextConfig
    setConfig(nextConfig)
  }, [])

  useEffect(() => {
    invoke<RawConfig>('translate_get_settings')
      .then((cfg) => {
        applyRawConfig(cfg)
        setLoaded(true)
      })
      .catch(() => {
        setLoaded(true)
      })
  }, [applyRawConfig])

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    void listen('config-updated', () => {
      void invoke<RawConfig>('translate_get_settings')
        .then(applyRawConfig)
        .catch(() => {})
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [applyRawConfig])

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    const prev = configRef.current
    const newConfig = mergeAppConfig(prev, updates)
    configRef.current = newConfig
    setConfig(newConfig)

    const isHotkey =
      Object.prototype.hasOwnProperty.call(updates, 'hotkeySelection') ||
      Object.prototype.hasOwnProperty.call(updates, 'hotkeyScreenshot')

    const persist = saveChainRef.current.then(async () => {
      await invoke('translate_save_settings', { config: toRawConfig(configRef.current) })
    })
    saveChainRef.current = persist.catch(() => {})

    try {
      await persist
    } catch (e) {
      try {
        const raw = await invoke<RawConfig>('translate_get_settings')
        applyRawConfig(raw)
      } catch {
        configRef.current = prev
        setConfig(prev)
      }
      const msg = typeof e === 'string' ? e : String(e)
      console.error('保存设置失败', e)
      if (!isHotkey) {
        window.alert(`保存设置失败：${msg}`)
      }
      throw e
    }
  }, [applyRawConfig])

  return (
    <ConfigContext.Provider value={{ config, loaded, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  return useContext(ConfigContext)
}
