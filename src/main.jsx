import React from 'react';
import { createRoot } from 'react-dom/client';
import App, { AppErrorBoundary } from './App.jsx';
import { DesignSystem } from './components/DesignSystem.jsx';
import './style.css';
import '@radix-ui/themes/styles.css';
import './react.css';
import './design-system.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DesignSystem>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </DesignSystem>
  </React.StrictMode>,
);
