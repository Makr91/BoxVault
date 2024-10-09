import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import reportWebVitals from "./reportwebVitals";
import * as serviceWorker from "./serviceWorker";

console.log(`${process.env.REACT_APP_NAME} ${process.env.REACT_APP_VERSION}`);

ReactDOM.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  document.getElementById("root")
);

serviceWorker.unregister();

reportWebVitals();