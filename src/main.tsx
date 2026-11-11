import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { notify } from "./lib/notify";
import "./index.css";
import App from "./App";
import Overlay from "./Overlay";
import { installDesktopBridge, filesFromNativePaths } from "./lib/desktop";
import { DEFAULT_SHORTCUT, getSettings } from "./lib/settings";

async function start() {

  const isOverlay = isTauri() && getCurrentWindow().label === "orbit";
  await installDesktopBridge();

  if (isOverlay) {
    document.documentElement.classList.add("overlay");
    createRoot(document.getElementById("root")!).render(
      <StrictMode><Overlay /></StrictMode>
    );
    return;
  }

  if (isTauri()) {

    try {
      await getCurrentWebviewWindow().listen("flicky-native-shortcut", () => window.dispatchEvent(new CustomEvent("flicky-native-shortcut")));
    } catch {  }
    const reg = await window.flicky?.shortcut?.register(getSettings().shortcut || DEFAULT_SHORTCUT);
    if (reg && !reg.ok) notify({ title: "Shortcut unavailable", body: reg.reason, tone: "error", duration: 12000 });
    try {
      await getCurrentWindow().onDragDropEvent(async (event) => {
        if (event.payload.type === "drop") {
          const files = await filesFromNativePaths(event.payload.paths);
          if (files.length) window.dispatchEvent(new CustomEvent("flicky-native-files", { detail: files }));
        }
      });
    } catch (error) {
      console.warn("Native drag and drop could not be initialized", error);
    }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode><App /></StrictMode>
  );
}

void start();
