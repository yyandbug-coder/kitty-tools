// 根应用组件 - Vite 默认入口与主窗口共用；挂载功能主页（剪贴板弹窗见 ClipboardHistoryPanel）
import { TooltipProvider } from '@/components/ui/tooltip'
import SettingsApp from '@/components/settings/SettingsApp'

export default function App() {
  return (
    <TooltipProvider>
      <div className="h-screen w-screen overflow-hidden">
        <SettingsApp />
      </div>
    </TooltipProvider>
  )
}
