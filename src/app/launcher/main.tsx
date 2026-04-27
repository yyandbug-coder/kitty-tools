// 启动器入口：由 html/launcher.html 加载，全局快捷键呼出，用于快速打开功能与系统项。
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LauncherPanel from '@/components/launcher/LauncherPanel'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <LauncherPanel />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
