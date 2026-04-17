import { useGlobalAppSettings } from '@/shared/hooks/useGlobalAppSettings'

export function useWorkspaceSettings() {
  const { settings, loaded, setLastActiveModule } = useGlobalAppSettings()

  return { settings, loaded, setLastActiveModule }
}
