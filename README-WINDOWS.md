# Flicky — Windows desktop build

This project keeps the original React interface and its CSS animations, and wraps it in a Tauri 2 Windows desktop host.

## What is preserved

- The original Orbit, floating launcher, queue, settings, onboarding, notifications, cards and component styling.
- Original CSS keyframes, transitions, hover states and reduced-motion support.
- Existing image/audio conversion code and the existing queue.
- Original WinRAR-only archive workflow and UI.

## Native Windows integration added

- Native Windows file picker and Explorer drag-and-drop.
- Native file reads and output writes.
- Converted files are saved in `%USERPROFILE%\\Downloads\\Flicky`.
- WinRAR detection, archive creation and extraction through the installed WinRAR command-line executable.
- Global keyboard shortcut registration.
- FFmpeg and LibreOffice detection and native conversion when those programs are installed and available.

FFmpeg and LibreOffice are not bundled. Install them separately if you need video/audio or office-document conversions. WinRAR is also not bundled; install a licensed copy separately.

## Requirements

- Windows 10 or 11, 64-bit
- Node.js 20.19+ or 22.12+
- Rust stable with the MSVC toolchain
- Visual Studio 2022 Build Tools / Community with **Desktop development with C++**
- WebView2 Runtime (normally included with Windows 11)

## Run in development

Open PowerShell in this folder:

```powershell
npm install
npm run tauri dev
```

## Build the Windows installer

```powershell
npm install
npm run tauri build
```

The installer output is created under:

```text
src-tauri/target/release/bundle/
```

## Notes

- The React UI remains the source of truth; do not replace the component tree with a new UI.
- The desktop shell currently opens as a normal resizable Windows application window. The original in-app launcher/taskbar UI remains unchanged.
- Archive and native engine progress is currently reported in coarse stages because the existing host contract does not expose process-level progress yet.
- The app writes converted files to `Downloads\\Flicky`; it does not modify source files.
- Before distributing a public build, review the project license and third-party notices, sign the installer, and test each conversion format with representative files.


## Background use: Ctrl + Shift + Space, right-click menu, start with Windows

Flicky now works from the tray without its main window.

- **Ctrl + Shift + Space (configurable in Settings → Shortcuts)** – select one or more files in Explorer or on the Desktop, press the shortcut, and Orbit pops up at the mouse pointer with the conversion options for those files. Archives get Unzip / View / Extract to… / Test / WinRAR. Click anywhere outside Orbit (or press Esc, or press the shortcut again) to dismiss it.
  - Orbit is drawn by a second, transparent, always-on-top window (`orbit` in `tauri.conf.json`) that covers the monitor under the cursor only while Orbit is open. It only picks the action; the main window (hidden in the tray) owns the job queue and does the work. Progress and “Done” appear next to the Orbit; if a job needs an answer (name clash, password), fails, or needs a missing engine, the main window is brought forward.
  - The selection is read from the focused Explorer window / Desktop through the Windows shell (a short hidden PowerShell call, no clipboard use). With nothing selected a hint is shown. When Flicky's own window is in front, the shortcut keeps its old behaviour (file picker).
  - With several Explorer tabs open in one window, the first tab that has a selection is used.
- **Right-click → Open with Flicky Orbit** – Settings → Startup → “Explorer context menu” (on by default). Adds a per-user verb under `HKCU\\Software\\Classes\\*\\shell\\FlickyOrbit` that runs `Flicky.exe --orbit "<file>"`. Orbit appears at the pointer for that file (several files selected at once are grouped). On Windows 11 the entry lives under **Show more options** (Shift + F10); a top-level Windows 11 entry needs a packaged shell extension, which this build does not include. Skipped in `tauri dev` builds.
- **Start with Windows** – Settings → Startup (on by default). Registers `Flicky.exe --autostart` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (no admin rights); with “Start minimized” it stays in the tray. Turning the toggle off removes the entry. Skipped in `tauri dev` builds.
- **View archive** – fixed: `Rar.exe lb -idq` printed nothing (quiet mode also mutes the file list), so every archive looked empty. The listing no longer uses `-idq`.

## Conversion engines

See [ENGINE-MANAGER.md](./ENGINE-MANAGER.md) for supported engine installation through winget, package IDs, licensing notes, and troubleshooting. Engines are installed only after an explicit user action in Settings → Conversion engines.

---
Developer: [aaryush-exe](https://github.com/aaryush-exe)
