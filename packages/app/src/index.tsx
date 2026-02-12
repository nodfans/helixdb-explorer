import { render } from "solid-js/web";
import App from "./App";
import "./index.css";

// Session Management for Cache Clearing
try {
  const isSessionActive = sessionStorage.getItem("helix_session_active");
  if (!isSessionActive) {
    // Fresh start (browser restart or app restart)
    // console.log("Starting new session - clearing local storage cache");

    // items to preserve
    const theme = localStorage.getItem("theme");

    localStorage.clear();

    if (theme) localStorage.setItem("theme", theme);

    // Mark session as active
    sessionStorage.setItem("helix_session_active", "true");
  }
} catch (e) {
  console.warn("Failed to manage session cache:", e);
}

render(() => <App />, document.getElementById("root") as HTMLElement);
