import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from '@/hooks/useAppConfig';
import { TooltipProvider } from '@/components/ui/tooltip';
import SettingsPanel from '@/components/settings/SettingsPanel';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <TooltipProvider>
        <SettingsPanel />
      </TooltipProvider>
    </ConfigProvider>
  </React.StrictMode>,
);