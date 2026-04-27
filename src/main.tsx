import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from '@/hooks/ConfigProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import App from '@/App';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <App />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);