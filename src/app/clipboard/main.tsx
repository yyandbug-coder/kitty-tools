// 剪贴板模块入口：不透明窗口（与划词翻译浮窗一致），由 html/clipboard-popup.html 加载
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
