// 首次运行引导：挂载 WelcomeOnboarding，分步介绍功能后写入 firstRun 并关闭窗口
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import WelcomeOnboarding from '@/components/onboarding/WelcomeOnboarding'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <WelcomeOnboarding />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
