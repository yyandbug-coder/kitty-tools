import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import 'virtual:svg-icons/register'
import App from './App'
import SettingsWindowApp from '@clipboard/components/SettingsWindowApp'
import { AppErrorBoundary } from '@clipboard/components/AppErrorBoundary'
import './index.css'

const Root = getCurrentWindow().label === 'settings' ? SettingsWindowApp : App

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </React.StrictMode>
)
