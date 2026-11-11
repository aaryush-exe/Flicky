# Flicky Engine Manager (Windows)

Flicky can install optional conversion engines through Windows Package Manager (`winget`). The user starts each installation from Settings → Conversion engines. Flicky does not silently install software.

| Flicky engine ID | winget package ID | Purpose |
|---|---|---|
| `ffmpeg` | `Gyan.FFmpeg` | Audio/video conversion |
| `documents` | `TheDocumentFoundation.LibreOffice` | Office document conversion |
| `winrar` | `RARLab.WinRAR` | Archive creation/extraction |

## Requirements and limitations

- Windows 10/11 with Microsoft App Installer / `winget` available.
- Network access to the configured winget source.
- Some installers may request elevation or require acceptance of publisher agreements.
- WinRAR is proprietary commercial/shareware software. Flicky does not bundle, mirror, or redistribute WinRAR; its installation is initiated explicitly by the user through winget. Users must comply with RARLAB's terms.
- Installing an engine does not imply every possible input/output combination is supported. Conversion support remains dependent on codecs, document filters, and the selected format.
- `winget install` runs in the background with no console window; Flicky shows "Installing…" until it finishes. Windows may show a UAC prompt for system-wide installers.

## Troubleshooting

If Flicky reports that winget is missing, install or update **App Installer** from Microsoft Store, restart Flicky, then retry. If a package is not found, check `winget search <package-id>` in PowerShell and verify the configured source.
