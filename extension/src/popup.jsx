// Import polyfills first - MUST be before any other imports
import './polyfills.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExtensionApp } from './ExtensionApp';
import { initializeExtension } from './init';
import './styles.css';

const container = document.getElementById('root');
const root = createRoot(container);

// Wait for extension init (syncs network prefs from chrome.storage → localStorage)
// before mounting React so NetworkContext reads the correct persisted values.
initializeExtension().then(() => {
  root.render(
    <React.StrictMode>
      <ExtensionApp />
    </React.StrictMode>
  );
});
