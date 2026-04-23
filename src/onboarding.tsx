import React from 'react';
import ReactDOM from 'react-dom/client';
import WelcomeOnboarding from '@/components/onboarding/WelcomeOnboarding';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WelcomeOnboarding />
  </React.StrictMode>,
);