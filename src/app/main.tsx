import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import App from '@/app/App'
import '@/assets/styles/tailwind/index.css'

// 默认入口：设置主应用（html/index.html；剪贴板弹窗见 html/clipboard-popup.html）
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <App />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
