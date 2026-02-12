// Import polyfills first - MUST be before any other imports
import './polyfills.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExtensionApp } from './ExtensionApp';
import './styles.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ExtensionApp />
  </React.StrictMode>
);
