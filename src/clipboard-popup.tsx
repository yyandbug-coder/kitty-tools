// 剪贴板弹窗窗口入口 - 与主应用（设置）分离，仅由 clipboard-popup 窗口加载
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import ClipboardHistoryPanel from '@/components/clipboard/ClipboardHistoryPanel'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <ClipboardHistoryPanel />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
