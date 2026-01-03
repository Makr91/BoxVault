import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./i18n";
import App from "./App";
import { log } from "./utils/Logger";
import version from "./version.json";

log.app.info("BoxVault application starting", {
  name: version.name,
  version: version.version,
});

const container = document.getElementById("root");
const root = createRoot(container);

// Render the app
root.render(
  <Suspense fallback="Loading...">
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Suspense>
);

// Make content visible after a small delay to ensure styles are loaded
window.addEventListener("load", () => {
  requestAnimationFrame(() => {
    document.documentElement.style.visibility = "visible";
  });
});
