import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import version from "./version.json";

console.log(`${version.name} - Version: ${version.version}`);

const container = document.getElementById("root");
const root = createRoot(container);

// Render the app
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Make content visible after a small delay to ensure styles are loaded
window.addEventListener("load", () => {
  requestAnimationFrame(() => {
    document.documentElement.style.visibility = "visible";
  });
});
