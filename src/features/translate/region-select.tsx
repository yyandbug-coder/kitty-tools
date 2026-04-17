import React from 'react'
import ReactDOM from 'react-dom/client'
import { RegionSelect } from '@translate/components/RegionSelect'
import '@translate/assets/styles/tailwind/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RegionSelect />
  </React.StrictMode>,
)
