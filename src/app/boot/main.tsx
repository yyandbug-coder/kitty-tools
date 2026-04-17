import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@translate/hooks/useConfig'
import WorkspaceApp from '@/app/WorkspaceApp'
import '@/shared/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider>
      <WorkspaceApp />
    </ConfigProvider>
  </React.StrictMode>,
)
