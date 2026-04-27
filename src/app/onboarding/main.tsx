// 首次运行引导：挂载 OnboardingApp（含主题与 WelcomeOnboarding），分步介绍后写入 firstRun 并关闭窗口
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import OnboardingApp from '@/components/onboarding/OnboardingApp'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <OnboardingApp />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
