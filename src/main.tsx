import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Capacitor } from '@capacitor/core';

// Scope compact typography and native-only layout refinements to installed apps.
document.documentElement.classList.toggle('capacitor-native', Capacitor.isNativePlatform());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
