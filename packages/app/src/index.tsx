import { render } from "solid-js/web";
import App from "./App";
import "./index.css";

try {
  const isSessionActive = sessionStorage.getItem("helix_session_active");
  if (!isSessionActive) {
    const theme = localStorage.getItem("theme");

    localStorage.clear();

    if (theme) localStorage.setItem("theme", theme);

    sessionStorage.setItem("helix_session_active", "true");
  }
} catch (e) {
  console.warn("Failed to manage session cache:", e);
}

render(() => <App />, document.getElementById("root") as HTMLElement);
