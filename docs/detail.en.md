# Screenshot — Usage Details

A WeChat-style region screenshot tool: click the scissors button below the chat composer (or press the global hotkey **Alt+A**), drag a region — or click two corners — and the capture lands in your clipboard, ready to paste anywhere with `Ctrl+V`.

## Features

- **Two selection modes**: drag with the left button, or click a start corner and then the end corner (auto-detected — two clicks closer than 4px switch to point-picking).
- **Cross-monitor capture**: the overlay spans the entire virtual desktop of all displays; pick on your second monitor, paste on the first.
- **Configurable global hotkey**: `Alt+A` by default; any modifier+key combo (Ctrl/Alt/Shift/Win with letters, digits, F1–F24) such as `Ctrl+Shift+S` or `F5`.
- **Straight to the clipboard**: no temp files; the image is written as PNG and stays compatible with virtually every app.
- **Live size label** (`W × H`) while selecting.
- **Cancel** with right-click or `Esc`.

## How to Use

1. Click the ✂️ button below the composer, or press the global hotkey (Alt+A by default).
2. Drag a region, or click two corners.
3. Release (or the second click) finishes the capture — paste it anywhere.

## Settings

**Right-click** the button to open the settings panel:

- **Hotkey**: click the input box, then press the combo you want to record.
- **Global hotkey**: when on, a system-wide hook fires the capture from any app; when off, only the DSH window responds.
- Changes apply immediately. If another program already owns the hotkey, the panel shows a daemon warning — pick a different combo.

## Install

Install from the **Discover** tab of the DSH plugin market (add this repository's index URL, then search "Screenshot").

Manual install (tell your DSH assistant):

```
Install git+https://github.com/xypshot/dsh-screenshot.git#<commit> with plugin_manager
```

## Requirements

- Windows 10/11 (the overlay runs on the built-in PowerShell 5.1 + WinForms stack — no extra dependencies).
- DSH 0.2.0 or later.
- Multi-monitor and per-monitor DPI scaling are handled.

## Privacy

Everything runs in a native process on your machine. The image only ever touches your clipboard — **nothing leaves your computer**.

## How It Works

- The client button calls the host through a same-origin route on DSH's built-in web server.
- The host spawns a PowerShell overlay process (`RegisterHotKey` daemon for the global hotkey), freezes the desktop, crops your selection, and writes it to the clipboard.
