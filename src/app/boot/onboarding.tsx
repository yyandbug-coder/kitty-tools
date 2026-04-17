import React from 'react'
import ReactDOM from 'react-dom/client'
import OnboardingApp from '@/app/OnboardingApp'
import '@/shared/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <OnboardingApp />
  </React.StrictMode>,
)
