// 根应用组件 - Vite 默认入口与设置页窗口共用；仅挂载设置主界面（非剪贴板弹窗，剪贴板见 ClipboardHistoryPanel）
import { TooltipProvider } from '@/components/ui/tooltip'
import SettingsApp from '@/components/settings/SettingsApp'

export default function App() {
  return (
    <TooltipProvider>
      <SettingsApp />
    </TooltipProvider>
  )
}
