import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import App from './App';
import { analytics } from './lib/analytics';
import { installClickTracker } from './lib/click-tracker';

analytics.init();
installClickTracker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
