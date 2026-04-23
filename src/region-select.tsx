import React from 'react';
import ReactDOM from 'react-dom/client';
import RegionSelect from '@/components/translate/RegionSelect';
import '@/assets/styles/tailwind/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RegionSelect />
  </React.StrictMode>,
);