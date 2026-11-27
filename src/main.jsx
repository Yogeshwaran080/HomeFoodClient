import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { logClientEvent } from './utils/logger.js';

logClientEvent('INFO', 'APP_BOOT', { userAgent: navigator.userAgent });
window.addEventListener('error', (e) => {
  logClientEvent('ERROR', 'WINDOW_ERROR', { message: e.message, filename: e.filename, lineno: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  logClientEvent('ERROR', 'UNHANDLED_REJECTION', { reason: String(e.reason) });
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
