import React from 'react'
import ReactDOM from 'react-dom/client'
import ClipboardApp from '@clipboard/App'
import { AppErrorBoundary } from '@clipboard/components/AppErrorBoundary'
import '@/shared/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ClipboardApp />
    </AppErrorBoundary>
  </React.StrictMode>,
)
