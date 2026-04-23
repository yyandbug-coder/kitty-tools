import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AppConfig } from '@/types';
import { DEFAULT_CONFIG } from '@/types';

interface ConfigContextType {
  config: AppConfig;
  loaded: boolean;
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType>({
  config: DEFAULT_CONFIG,
  loaded: false,
  updateConfig: async () => {},
});

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<AppConfig>('get_config').then(cfg => {
      setConfig(cfg);
      setLoaded(true);
    }).catch(() => {
      setConfig(DEFAULT_CONFIG);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<AppConfig>('config-updated', (e) => {
      setConfig(e.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    const merged = { ...config, ...updates };
    setConfig(merged);
    try {
      const saved = await invoke<AppConfig>('save_config_cmd', { config: merged });
      setConfig(saved);
    } catch (e) {
      console.error('保存配置失败:', e);
      setConfig(config);
    }
  }, [config]);

  return (
    <ConfigContext.Provider value={{ config, loaded, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(ConfigContext);
}