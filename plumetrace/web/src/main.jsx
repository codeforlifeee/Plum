/**
 * OWNER    : Tanmay
 * DUE      : D1 12:00
 * TASK     :
 *   React root, QueryClientProvider, BrowserRouter, Toaster (sonner).
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';
import { getInitialTheme, applyTheme, useThemeStore } from './stores/themeStore';

// Apply the stored/default theme before first paint so there is no flash.
applyTheme(getInitialTheme());

function ThemedToaster() {
  const theme = useThemeStore((s) => s.theme);
  return <Toaster theme={theme} richColors closeButton />;
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
