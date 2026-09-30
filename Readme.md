<div align="center">

<!-- LOGO: replace the file at src/static/logo.png on the server, or swap this URL to your new asset -->
<img src="https://webnbs.com/static/logo.png" alt="MiauNoteBlock" width="168" />

# MiauNoteBlock

**A cross-platform Minecraft Note Block (NBS) music editor that runs entirely in your browser.**

*Compose, edit, preview and export note block music — no installation required.*

[![Stars](https://img.shields.io/github/stars/COM1919/MiauNoteBlock?style=for-the-badge&logo=github&color=f2b705)](https://github.com/COM1919/MiauNoteBlock/stargazers)
[![License](https://img.shields.io/github/license/COM1919/MiauNoteBlock?style=for-the-badge&color=3da639)](./LICENSE)
[![Website](https://img.shields.io/badge/Live%20Demo-webnbs.com-4a90d9?style=for-the-badge&logo=googlechrome&logoColor=white)](https://webnbs.com)
[![Languages](https://img.shields.io/badge/i18n-10%20languages-8a63d2?style=for-the-badge&logo=googletranslate&logoColor=white)](#-supported-languages)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge&logo=git&logoColor=white)](#-contributing)
[![Made with AI](https://img.shields.io/badge/code-~70%25%20AI--generated-ff69b4?style=for-the-badge&logo=openai&logoColor=white)](#-about-ai-generated-code)

[**English**](./Readme.md) · [**简体中文**](./Readme_CN.md)

</div>

---

<div align="center">

### 🎹 [**Open the online editor → webnbs.com**](https://webnbs.com)

</div>

---

## 📖 Table of Contents

- [What is MiauNoteBlock?](#-what-is-miaunoteblock)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Try it online](#-try-it-online)
- [Supported languages](#-supported-languages)
- [Tech stack](#-tech-stack)
- [Getting started](#-getting-started)
- [Project structure](#-project-structure)
- [Contributing](#-contributing)
- [Community](#-community)
- [License](#-license)
- [About AI-generated code](#-about-ai-generated-code)

---

## 🐱 What is MiauNoteBlock?

**MiauNoteBlock** is a fully client-side, cross-platform editor for **Minecraft Note Block Studio (NBS)** projects. It aims to make note block music composition available on *every* device — desktop, laptop, tablet and phone — straight from a browser tab, with no installs, no plugins and no uploads to a server.

It reads and writes the standard `.nbs` format used by the Minecraft Note Block community, imports and exports **MIDI**, converts arbitrary music into the Minecraft note block range with an **octave-shifting algorithm** that keeps the original feel, and can render your song to **MP3 / WAV** — all locally on your machine.

> **Privacy by design:** your files are processed in the browser. Nothing is uploaded, nothing is stored permanently.

It was originally published as *NoteBlockWeb*, and is now called **MiauNoteBlock**.

---

## 🖼 Screenshots

<!-- SCREENSHOTS: reserved. Drop the files into ./assets/ with these exact names. -->
<div align="center">

<img src="./assets/screenshot-editor.png" alt="Piano roll editor" width="90%" />

*Piano-roll editing with a WinUI / Fluent-inspired interface.*

<img src="./assets/screenshot-midi.png" alt="MIDI import and timbre fitting" width="90%" />

*MIDI import with automatic timbre fitting and sustain-track detection.*

<img src="./assets/screenshot-mobile.png" alt="Mobile layout" width="42%" />

*Touch-friendly layout for phones and tablets.*

</div>

---

## ✨ Features

<table>
<tr><td width="50%" valign="top">

**🎼 Editing**
- Full-featured **piano-roll** editor on Canvas
- Standard `.nbs` import / export
- Brush, eraser, select and performance tools
- Multi-select, copy / paste, undo / redo
- Note find & replace (Ctrl+F)
- Track management, volume and instrument per track
- Note-block click-count and block-name overlays

</td><td width="50%" valign="top">

**🎧 Audio & MIDI**
- **MIDI import / export**, fully offline
- **Octave-conversion algorithm** — fits any song into the Minecraft note-block range with minimal audible loss
- **GM timbre fitting**: maps MIDI General MIDI programs onto NBS instruments, with per-instrument high/low substitutions
- **Automatic sustain-track detection** for organ / strings / pad style programs
- **SoundFont (SF3 / SF2)** support via SpessaSynth, with graceful fallback to the built-in synth
- Render your song to **MP3 / WAV** in the browser

</td></tr>
<tr><td width="50%" valign="top">

**🐈 Extras**
- **Custom instruments** — import your own samples, stored locally (metadata in `localStorage`, audio in `IndexedDB`)
- **Song compression** — perceptually-driven note reduction, from "dedupe only" to aggressive, with a live size estimate
- **QWERTY performance mode** — play the grid like an instrument
- Creative-assist tools for arranging
- Fully **offline build** (`file://`) with embedded audio

</td><td width="50%" valign="top">

**🌍 Platform**
- Runs in any modern browser — **no install**
- **Touch optimised**: brush/eraser drag-drawing, two-finger panning, landscape drawer
- **10 UI languages** (AI-translated)
- Adaptive WinUI 3 / Fluent Design inspired theme with Mica / Acrylic surfaces
- Optional native desktop / mobile clients on the roadmap

</td></tr>
</table>

---

## ⬇ Try it online

The editor is publicly deployed and free to use:

> ### 👉 **[https://webnbs.com](https://webnbs.com)**

Nothing to download, nothing to install. Your song stays on your device.

**Offline / self-hosted build** (double-click `index.html`, works over `file://`):

```bash
npm install      # one-time, for the build script
npm run build    # src/  ->  blbl-toy/  with base64-embedded audio
```

Then open `blbl-toy/index.html`.

> Native desktop and mobile clients are planned to remove browser-window limitations.

---

## 🌍 Supported languages

| Language | Locale |
| --- | --- |
| English (United States) | `en-US` |
| 简体中文 | `zh-CN` |
| Español | `es-ES` |
| Português (Brasil) | `pt-BR` |
| Русский | `ru-RU` |
| Deutsch | `de-DE` |
| Français | `fr-FR` |
| 日本語 | `ja-JP` |
| 한국어 | `ko-KR` |
| Bahasa Indonesia | `id-ID` |

Translations are AI-generated and may contain inaccuracies — issues and corrections are very welcome.

---

## 🛠 Tech stack

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Canvas](https://img.shields.io/badge/Canvas%202D-000000?style=flat-square&logo=html5&logoColor=white)
![Web Audio](https://img.shields.io/badge/Web%20Audio%20API-9b59b6?style=flat-square&logo=audiomack&logoColor=white)
![Web MIDI](https://img.shields.io/badge/Web%20MIDI%20API-1abc9c?style=flat-square&logo=midi&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)

</div>

- **Frontend:** vanilla JavaScript (no framework), layered Canvas rendering, Web Audio API playback, Web MIDI for live input.
- **Audio:** SpessaSynth (`WorkletSynthesizer`) for SoundFont playback, plus a built-in fallback synth and an offline render pipeline for MP3/WAV export.
- **Backend:** a small **FastAPI** service that only serves static files, exposes a tiny `/api/config` endpoint and injects SEO metadata. All NBS/MIDI parsing, conversion and playback happen **client-side**.

---

## 🚀 Getting started

### Run locally (dev server)

```bash
# 1. Install Python dependencies
pip install fastapi uvicorn pyyaml

# 2. Start the server (reads config.yaml, default port 8000)
python app.py
```

Then open `http://127.0.0.1:8000`.

### Build the offline bundle

```bash
npm run build          # or: node build_local.js
# Windows convenience script:
build_local.bat
```

This produces `blbl-toy/`, a self-contained copy of the app with the 20 OGG instrument samples embedded as base64 so it works when opened directly from disk.

### Configuration

`config.yaml` is created automatically on first run. It controls the listening host/port, the privacy notice, the release notes shown in-app, the SoundFont download URL and the SEO metadata.

---

## 📁 Project structure

```text
MiauNoteBlock/
├── app.py                  # FastAPI static host + SEO injection
├── config.yaml             # Server / privacy / release / soundfont / SEO config
├── build_local.js          # Offline (file://) build script
├── build_local.bat         # Windows build helper
├── src/
│   ├── index.html          # Single-page app shell
│   └── static/
│       ├── css/            # WinUI/Fluent-inspired theme
│       ├── js/             # Editor, piano roll, NBS/MIDI client, audio engine, i18n
│       ├── sounds/         # 20 OGG note-block instrument samples
│       └── sprites/        # Instrument icons
├── docs/                   # Design documents
└── test/                   # Node/Python regression tests
```

---

## 👥 Contributing

Contributions of all sizes are welcome — bug reports, translation fixes, features and design feedback.

1. **Found a bug or have an idea?** [Open an issue](../../issues/new/choose).
2. **Sending a pull request?** Please open an issue to discuss the change first, unless it is a very small fix.
3. **Translations:** the 10 locale dictionaries live in `src/static/js/i18n.js`. Adding or fixing strings is a great first contribution.

Local development requires **Node.js** (for the build/tests) and **Python 3** (for the dev server).

---

## 💬 Community

Join the QQ group to share songs, get support and meet other NBS creators:

> **QQ Group: 2156069838**

Feedback email: `3451392772@qq.com`

---

## 📜 License

Licensed under the **GNU General Public License v3.0**.

- Free for personal study and local modification.
- Any public distribution (free or commercial) of derivative works **must remain open-source, credit the original author, and comply fully with GPLv3**.
- **Closed-source commercial redistribution without separate written authorization is prohibited.**

The goal is simple: let more people edit NBS files on more devices, with plenty of useful new features along the way.

See [LICENSE](./LICENSE) for the full text.

---

## 🤖 About AI-generated code

**Roughly 70% of this project's code was written by AI.**

> It does not guarantee perfect code quality, but the results have proven that AI is genuinely impressive. Due to personal habits, some parts lack thorough comments and are sprinkled with AI-generated notes that are not always relevant. When reading the code, feel free to let an AI assist you.

---

<div align="center">

**If MiauNoteBlock helps you make Minecraft note block music, please leave a ⭐ — it really helps!**

<a href="https://github.com/COM1919/MiauNoteBlock/stargazers"><img src="https://img.shields.io/github/stars/COM1919/MiauNoteBlock?style=social" alt="Star this repo" /></a>

<sub>Made with ❤ and a lot of prompt engineering.</sub>

</div>