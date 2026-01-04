import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import i18n, { i18nPromise } from "./i18n";
import { log } from "./utils/Logger";
import version from "./version.json";

log.app.info("BoxVault application starting", {
  name: version.name,
  version: version.version,
});

const container = document.getElementById("root");
const root = createRoot(container);

// Wait for i18n to initialize before rendering
i18nPromise.then(() => {
  root.render(
    <I18nextProvider i18n={i18n}>
      <Suspense fallback="Loading...">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Suspense>
    </I18nextProvider>
  );
});
