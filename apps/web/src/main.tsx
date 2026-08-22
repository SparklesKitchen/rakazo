import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { markAfterPaint, markOnce } from "./lib/performance";
import "./styles.css";

markOnce("rk:renderer:module-evaluated");

function PerformanceProbe() {
  useLayoutEffect(() => {
    markOnce("rk:renderer:first-react-commit");
    markAfterPaint("rk:renderer:first-react-painted");
  }, []);
  return null;
}

const basename = window.location.pathname.startsWith("/saas-admin/rakazo")
  ? "/saas-admin/rakazo"
  : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PerformanceProbe />
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
