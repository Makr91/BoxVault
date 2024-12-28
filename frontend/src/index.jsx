import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import version from './version.json';

import App from "./App";
import reportWebVitals from "./reportwebVitals";
import * as serviceWorker from "./serviceWorker";

console.log(`${version.name} - Version: ${version.version}`);

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Properly cleanup service worker and message ports
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async function(registrations) {
    // First terminate any active service workers
    const activeWorkers = await navigator.serviceWorker.ready;
    if (activeWorkers.active) {
      activeWorkers.active.postMessage({ type: 'TERMINATE' });
    }
    
    // Then unregister all service workers
    await Promise.all(registrations.map(registration => registration.unregister()));
    
    // Finally clear any message channels
    if (window.MessageChannel) {
      const channel = new MessageChannel();
      channel.port1.close();
      channel.port2.close();
    }
  });
}

reportWebVitals();
