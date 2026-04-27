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
