import ReactDOM from 'react-dom/client'
import { FloatingResult } from './components/FloatingResult'
import { ConfigProvider } from '@translate/hooks/useConfig'
import '@translate/assets/styles/tailwind/index.css'

/** 不用 StrictMode：开发环境下二次挂载会先卸载监听，易导致首次打开浮动窗时错过 `floating_ready` 与事件重放。 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ConfigProvider>
    <FloatingResult />
  </ConfigProvider>
)
