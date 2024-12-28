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

// Just call unregister directly
serviceWorker.unregister();

reportWebVitals();
