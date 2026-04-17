import React from 'react'
import ReactDOM from 'react-dom/client'
import { RegionSelect } from '@translate/components/RegionSelect'
import '@/shared/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RegionSelect />
  </React.StrictMode>,
)
