import React from 'react'
import ReactDOM from 'react-dom/client'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import GlobalToaster from '@/components/shared/GlobalToaster'
import RegionSelect from '@/components/translate/RegionSelect'
import '@/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RegionSelect />
      <GlobalToaster />
    </ErrorBoundary>
  </React.StrictMode>,
)
