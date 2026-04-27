import { createContext, useContext } from 'react'
import type { AppConfig } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

export interface AppConfigContextValue {
  config: AppConfig
  loaded: boolean
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
}

const noopUpdate: AppConfigContextValue['updateConfig'] = async () => {}

export const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULT_CONFIG,
  loaded: false,
  updateConfig: noopUpdate,
})

export function useAppConfig() {
  return useContext(AppConfigContext)
}
