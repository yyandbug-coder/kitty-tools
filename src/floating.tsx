import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/useAppConfig'
import FloatingResult from '@/components/translate/FloatingResult'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <FloatingResult />
    </ConfigProvider>
  </React.StrictMode>
)
