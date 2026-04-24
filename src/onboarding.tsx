import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from '@/hooks/useAppConfig';
import WelcomeOnboarding from '@/components/onboarding/WelcomeOnboarding';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <WelcomeOnboarding />
    </ConfigProvider>
  </React.StrictMode>,
);