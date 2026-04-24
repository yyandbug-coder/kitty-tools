import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from '@/hooks/useAppConfig';
import RegionSelect from '@/components/translate/RegionSelect';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <RegionSelect />
    </ConfigProvider>
  </React.StrictMode>,
);