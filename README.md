 <div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=34&duration=2800&pause=900&color=FFFFFF&center=true&vCenter=true&width=650&height=65&lines=Meet+Flicky.;Files.+Converted.+Effortlessly.;One+shortcut.+Infinite+possibilities." alt="Flicky animated heading" />

### A modern Windows utility for effortless file conversion, compression & extraction.

**Your files. Your workflow. One beautiful orbit.**

<br/>

[![Windows](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-white?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

<a href="https://github.com/aaryush-exe/Flicky">
  <img src="https://img.shields.io/github/stars/aaryush-exe/Flicky?style=social" alt="GitHub stars"/>
</a>
<a href="https://github.com/aaryush-exe/Flicky/network/members">
  <img src="https://img.shields.io/github/forks/aaryush-exe/Flicky?style=social" alt="GitHub forks"/>
</a>
<a href="https://github.com/aaryush-exe/Flicky/issues">
  <img src="https://img.shields.io/github/issues/aaryush-exe/Flicky?color=white&style=flat-square" alt="GitHub issues"/>
</a>

<br/><br/>

**[Explore the Repository](https://github.com/aaryush-exe/Flicky)**
&nbsp; • &nbsp;
**[Report a Bug](https://github.com/aaryush-exe/Flicky/issues)**
&nbsp; • &nbsp;
**[Request a Feature](https://github.com/aaryush-exe/Flicky/issues)**

</div>

---

## ◈ What is Flicky?

Flicky reimagines the way you interact with files on Windows.

Instead of navigating through multiple applications, menus, and windows, Flicky gives you a sleek, animated radial interface that puts useful file operations right at your cursor.

Select a file. Press a shortcut. Choose an action. Done.

Whether you're converting documents, changing media formats, or managing archives, Flicky makes everyday file operations feel effortless.

---

## ✦ The Experience

<div align="center">

### One shortcut. A whole new workflow.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0D0D0D&height=2&section=header" width="80%"/>

**CTRL + SHIFT + SPACE**

<sub>Summon the Flicky Orbit directly from your Windows workflow.</sub>

</div>

### ◉ The Orbit Interface

A floating, cursor-positioned radial menu designed to keep file actions close at hand.

- Animated orbit-style interaction.
- Context-aware conversion options.
- Quick access to file operations.
- Separate transparent, always-on-top overlay.
- Minimal, dark visual experience.

### ⚡ Quick File Actions

No unnecessary navigation. Select your files and access the operations you need.

- Convert supported file formats.
- Create compressed archives.
- Extract existing archives.
- Process multiple selected files.
- View processing progress.

### 📦 Archive Management

Flicky integrates with WinRAR for archive operations.

- Create ZIP archives.
- Extract supported archives.
- Handle password-protected archives.
- Choose extraction destinations.
- Manage archive conflicts.

### 🔄 Conversion Engines

Flicky uses external engines for supported conversion workflows.

| Engine | Purpose | Package |
|---|---|---|
| FFmpeg | Audio & video conversion | `Gyan.FFmpeg` |
| LibreOffice | Office document conversion | `TheDocumentFoundation.LibreOffice` |
| WinRAR | Archive creation & extraction | `RARLab.WinRAR` |

Flicky includes an engine manager that can help install supported dependencies through Windows Package Manager (`winget`).

---

## ⚙️ Built for Windows

Flicky is more than a web interface. It is built as a native Windows desktop application using Tauri.

| Feature | Details |
|---|---|
| Desktop framework | Tauri 2 |
| Interface | React |
| Language | TypeScript |
| Backend | Rust |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Platform | Windows 10 / 11 |
| Installer formats | MSI & NSIS |

---

## 🚀 Getting Started

### 1. Download Flicky

Visit the repository's Releases page to find available builds.

<div align="center">

<a href="https://github.com/aaryush-exe/Flicky/releases">
  <img src="https://img.shields.io/badge/DOWNLOAD%20FLICKY-FFFFFF?style=for-the-badge&logo=windows&logoColor=black" alt="Download Flicky"/>
</a>

</div>

### 2. Install the required engines

Some operations require external dependencies:

- **WinRAR** — archive creation and extraction.
- **FFmpeg** — audio and video conversion.
- **LibreOffice** — office document conversion.

You can use Flicky's engine manager to install supported engines. These dependencies are not bundled with Flicky.

### 3. Start using Flicky

1. Select one or more files in Windows Explorer.
2. Press `Ctrl + Shift + Space`.
3. Choose an available action from the Orbit.
4. Let Flicky process your files.

**Default output location:**

```text
%USERPROFILE%\Downloads\Flicky
```

---

## 🛠️ Build From Source

Want to explore the code or build Flicky yourself?

### Requirements

- Windows 10 / 11 (64-bit)
- Node.js 20.19+ or 22.12+
- Rust stable (MSVC toolchain)
- Visual Studio 2022 Build Tools or Community with Desktop development with C++
- Microsoft Edge WebView2 Runtime

### Installation

Clone the repository:

```bash
git clone https://github.com/aaryush-exe/Flicky.git
```

Navigate into the project:

```bash
cd Flicky
```

Install dependencies:

```bash
npm install
```

Start the development environment:

```bash
npm run tauri dev
```

Build the production application:

```bash
npm run tauri build
```

Your Windows installer artifacts will be generated inside:

```text
src-tauri/target/release/bundle/
```

---

## 📁 Project Structure

```text
Flicky/
│
├── src/
│   └── Application frontend
│
├── src-tauri/
│   ├── src/
│   │   └── Native Rust backend
│   ├── icons/
│   └── tauri.conf.json
│
├── ENGINE-MANAGER.md
├── README-WINDOWS.md
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🔐 Privacy & Transparency

Flicky is designed to keep file operations local to your machine.

- No telemetry by design.
- No unnecessary cloud conversion workflow.
- Original source files are not modified by conversion operations.
- External engines are installed separately.
- Dependencies are not silently installed.

Read more about the Windows implementation in [README-WINDOWS.md](README-WINDOWS.md) and engine installation in [ENGINE-MANAGER.md](ENGINE-MANAGER.md).

---

## 🖤 The Philosophy

<div align="center">

### Less clicking. Less clutter. More doing.

A small utility should feel like a natural extension of your workflow.

**That's Flicky.**

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0D0D0D&height=3&section=footer" width="80%"/>

### Made with care by [Aaryush Raj](https://github.com/aaryush-exe)

<sub>If Flicky makes your workflow easier, consider giving the repository a ⭐</sub>

[![GitHub](https://img.shields.io/badge/GitHub-aaryush--exe-181717?style=flat-square&logo=github)](https://github.com/aaryush-exe)
[![Repository](https://img.shields.io/badge/Project-Flicky-white?style=flat-square)](https://github.com/aaryush-exe/Flicky)

</div>
