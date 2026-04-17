import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@translate/hooks/useConfig'
import { FloatingResult } from '@translate/components/FloatingResult'
import '@/shared/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ConfigProvider>
    <FloatingResult />
  </ConfigProvider>,
)
