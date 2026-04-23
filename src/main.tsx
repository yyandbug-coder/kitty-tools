import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from '@/hooks/useAppConfig';
import App from '@/App';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);