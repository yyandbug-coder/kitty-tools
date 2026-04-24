// 浮动翻译窗口入口 - 不使用 StrictMode，避免 dev 双重挂载导致 floating_ready 事件丢失
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/useAppConfig'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import FloatingResult from '@/components/translate/FloatingResult'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ConfigProvider>
      <FloatingResult />
    </ConfigProvider>
  </ErrorBoundary>
)
