import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// The preview runs in a sandboxed iframe where SW registration throws.
// Never let that crash the app — the installed iPhone PWA still gets offline caching.
function registerServiceWorker() {
  try {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    window.addEventListener("load", () => {
      try {
        navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
