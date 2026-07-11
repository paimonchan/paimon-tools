<div align="center">

<img src="public/og-image.png" alt="Paimon Tools — convert JSON, CSV & Excel in your browser" width="100%" />

# Paimon Tools

### Convert JSON · CSV · Excel — without ever uploading a file.

[**▶ Try it live →**](https://paimonchan.github.io/paimon-tools/)
&nbsp;&nbsp;·&nbsp;&nbsp;
[Features](#features)&nbsp;&nbsp;·&nbsp;&nbsp;[Tools](#tools)&nbsp;&nbsp;·&nbsp;&nbsp;[Self-host](#deploy-it-yourself)

[![Live site](https://img.shields.io/badge/live-paimonchan.github.io%2Fpaimon--tools-d9911e?style=flat-square&logo=github&logoColor=white)](https://paimonchan.github.io/paimon-tools/)
[![License: MIT](https://img.shields.io/badge/license-MIT-423d35?style=flat-square)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-eec35a?style=flat-square)](#contributing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Zustand](https://img.shields.io/badge/Zustand-5-443e38?style=flat-square)](https://github.com/pmndrs/zustand)

</div>

---

> **No backend. No uploads. No tracking.**
> Every conversion runs entirely in your browser — paste your data, get the
> result, and nothing ever touches a server. That's not a feature, it's the
> whole point.

## Why use this?

There are a hundred online converters. Almost all of them send your data to a
server you don't control. If you're converting a config file, a customer list,
or credentials hidden in a JSON blob — **that's a problem**.

Paimon Tools ships the entire engine to your browser. Your data is processed
locally and discarded when you close the tab.

- **Private by design** — zero network requests during conversion
- **Instant** — no upload/download round-trip
- **Works offline** — once loaded, it needs no connection
- **Free & open source** — audit the code yourself

## Features

- **8 conversion tools** across JSON / CSV / Excel
- **Strict & Lenient JSON parsing** — single quotes, trailing commas, comments
  all accepted in Lenient mode (powered by JSON5)
- **Command palette** (`⌘K` / `Ctrl K`) to jump between tools
- **Resizable split panes** — see input and output side by side
- **Live conversion** as you type, with timing stats
- **Keyboard shortcuts** — `⌘S` download · `⌘⇧S` swap direction · `⌘⇧C` copy
- **Persistent state** — your work survives a reload
- **Dark & light themes** — defaults to dark
- **Drag & drop** file uploads
- **Sample data** baked into every tool — try it before you trust it
- **Fully typed** — TypeScript throughout, zero `any`
- **Zustand stores** — lightweight state management, no context boilerplate

## Tools

| Category | Tool | Direction |
|:--------:|------|-----------|
| Convert | JSON → CSV | JSON array to CSV table |
| Convert | CSV → JSON | CSV table to JSON array |
| Convert | JSON → Excel | JSON to downloadable `.xlsx` |
| Convert | Excel → JSON | `.xlsx` first sheet to JSON |
| Convert | CSV → Excel | CSV to `.xlsx` |
| Convert | Excel → CSV | `.xlsx` first sheet to CSV |
| Format | JSON Formatter | Pretty-print (2/4 spaces or tab) |
| Format | JSON Minifier | Strip all whitespace |

## Project structure

```
src/
├── engine/                  # Pure conversion logic (zero React)
│   ├── converters/
│   │   ├── json-io.ts       # JSON parse/format/minify
│   │   ├── csv-io.ts        # CSV ↔ JSON converters
│   │   └── xlsx-io.ts       # Excel read/write (SheetJS)
│   ├── registry.ts          # Tool definitions (config-driven)
│   └── result.ts            # Result<T> type
├── stores/                  # Zustand state management
│   ├── theme-store.ts       # Dark/light theme (persisted)
│   └── toast-store.ts       # Ephemeral notifications
├── components/              # React UI — 17 focused files
│   ├── ConversionTool.tsx   # Main workspace orchestrator
│   ├── Panes.tsx            # Resizable split layout
│   ├── ToolHeader.tsx       # Tool icon/name/swap
│   ├── CodeArea.tsx         # Code/text editor pane
│   ├── FileDropzone.tsx     # Drag & drop file input
│   ├── ToastContainer.tsx   # Toast notification renderer
│   ├── Sidebar.tsx          # Tool navigation sidebar
│   ├── CommandPalette.tsx   # ⌘K search palette
│   └── ... (6 more)
├── hooks/
│   └── usePersistentState.ts  # Generic localStorage hook
├── lib/                     # Browser I/O utilities
│   ├── files.ts             # File read/download helpers
│   ├── router.ts            # History-based SPA routing
│   └── makeFilename.ts      # Download filename helper
├── App.tsx                  # Root shell component
└── main.tsx                 # Entry point
```

## Deploy it yourself

The build is a fully static site — host it anywhere.

```bash
git clone https://github.com/paimonchan/paimon-tools.git
cd paimon-tools
npm install
npm run build     # → ./dist
```

Then serve the `dist/` folder from any static host (GitHub Pages, Netlify,
Vercel, Cloudflare Pages, or even `python -m http.server`).

### GitHub Pages (one-push deploy)

This repo includes a [deploy workflow](.github/workflows/deploy.yml) that builds
and publishes on every push to `main`. Enable **Settings → Pages → Source:
GitHub Actions** to activate it.

## Adding a tool

The converter engine is pure functions and the UI is config-driven. To add a new
tool, you only need:

1. A **converter function** in `engine/converters/` (pure, typed)
2. A **registry entry** in `engine/registry.ts` (one config object)

The UI automatically picks it up — sidebar, command palette, URL routing, and
all keyboard shortcuts work without changes.

## Built with

- **[TypeScript](https://www.typescriptlang.org/)** — fully typed, zero `@ts-nocheck`
- **[React](https://react.dev/)** + **[Vite](https://vite.dev/)** — UI & build
- **[Zustand](https://github.com/pmndrs/zustand)** — lightweight state management
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[PapaParse](https://www.papaparse.com/)** — CSV parsing
- **[SheetJS](https://docs.sheetjs.com/)** — Excel read/write
- **[JSON5](https://json5.org/)** — lenient JSON parsing

## Contributing

PRs welcome. The codebase is structured so that most changes are local —
touching a converter doesn't involve touching the UI, and vice versa.

## License

MIT — do whatever you want.
