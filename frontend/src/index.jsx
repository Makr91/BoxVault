import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import version from './version.json';

import App from "./App";
import reportWebVitals from "./reportwebVitals";
import * as serviceWorker from "./serviceWorker";

console.log(`${version.name} - Version: ${version.version}`);

// Unregister any existing service workers first
serviceWorker.unregister();

const container = document.getElementById("root");
const root = createRoot(container);

// Initialize web vitals reporting
const webVitalsCallback = (metric) => {
  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(metric);
  }
};

root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Start web vitals with our callback
reportWebVitals(webVitalsCallback);

// Clean up web vitals on page unload
window.addEventListener('unload', () => {
  reportWebVitals(null); // This will trigger cleanup
});
