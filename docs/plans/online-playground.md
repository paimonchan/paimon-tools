# Online Code Playground — Implementation Plan

> **Status:** Draft  
> **Target:** paimon-tools (GitHub Pages, static-only)  
> **PR:** TBD

---

## 1. Overview

Add an in-browser code playground to paimon-tools where users can write and execute code directly — no backend, no uploads, 100% client-side via WASM and native browser APIs.

### Core Principles

- **Zero initial bundle impact** — languages load on demand, not on page load
- **Static-first** — works on GitHub Pages with zero server config
- **Privacy-first** — same ethos as existing tools: code never leaves the browser
- **SEO-neutral** — playgound content is not indexed; no prerender needed

---

## 2. Roadmap (Phased)

### Phase 1 — JavaScript Playground

| Item | Detail |
|------|--------|
| **Engine** | Web Worker + `new Function()` sandbox |
| **Bundle** | 0 KB added (zero dependencies for execution) |
| **Editor** | CodeMirror 6 (~150 KB, preloaded: same bundle as rest of app) |
| **Output** | Terminal-style with stdout/stderr capture |
| **Status** | 🟢 Ready to build |

**How JS execution works:**

```
User types code → clicks Run
  │
  ▼
Post message to Web Worker
  │
  ▼
Worker: new Function(code)()  ← sandboxed, no DOM access
  │
  ▼
Capture return value + console.log/error via proxy
  │
  ▼
Post result back → render in OutputPane
```

**Sandbox constraints (Web Worker):**
- No `document`, `window`, `DOM` access
- `fetch()` allowed (same as browser normal CORS)
- `setTimeout`/`setInterval` allowed but capped at 10 concurrent timers
- Execution timeout: 10 seconds hard cap
- `console.log`, `console.error`, `console.warn` captured via proxy

### Phase 2 — Python via Pyodide (Lazy)

| Item | Detail |
|------|--------|
| **Engine** | Pyodide (CPython compiled to WASM) |
| **Bundle** | ~12 MB WASM — **loaded only on first Python Run** |
| **Cache** | Browser HTTP cache + `pyodide.js` CDN cache (1x download) |
| **Lazy method** | `import('https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js')` |
| **Status** | 🟡 Next phase |

**Loading flow:**

```
User clicks Python tab         User clicks ▶ Run
  │                                │
  ▼                                ▼
┌─────────────┐              ┌──────────────┐
│ Tab badge:  │              │ Show spinner │
│ "Load on    │              │ "Loading     │
│  first run" │──────────────► Pyodide      │
└─────────────┘   (click)    │ (~12MB)..."  │
                              └──────┬───────┘
                                     ▼
                              ┌──────────────┐
                              │ Cache check  │
                              │ IndexedDB    │
                              │ (next visits │
                              │  instant)    │
                              └──────┬───────┘
                                     ▼
                              ┌──────────────┐
                              │ Execute       │
                              │ Show output   │
                              └──────────────┘
```

**Python sandbox:**
- Standard CPython via Pyodide (full Python 3.12)
- `os`, `sys`, `math`, `json`, `re`, `collections` available
- `numpy`, `pandas` — via micropip (lazy, on-demand)
- `import requests` — proxied to `fetch()` via pyodide-http
- File I/O disabled (no filesystem in browser)
- Execution timeout: 30 seconds

### Phase 3 — HTML/CSS Preview (Sandboxed iframe)

| Item | Detail |
|------|--------|
| **Engine** | `<iframe sandbox="allow-scripts">` |
| **Bundle** | 0 KB |
| **Status** | 🟢 Simple, post-Python |

- Multi-tab editor: HTML / CSS / JavaScript
- Preview updates on Run or auto-preview (debounced 500ms)
- `srcdoc` attribute — no separate file needed
- Fully sandboxed: no parent access, no navigation

### Phase 4 — Persistence & Sharing

| Item | Detail |
|------|--------|
| **Auto-save** | Code per language → localStorage |
| **Share** | Code → base64 → URL param (`?code=...`) |
| **Bundle** | 0 KB |
| **Status** | 🟢 Nice-to-have |

---

## 3. Component Architecture

```
PlaygroundTool (page component)
│
├── LangTabs
│   ├── Tab: JavaScript  │ engine: worker
│   ├── Tab: Python      │ engine: pyodide (lazy)
│   └── Tab: HTML        │ engine: iframe
│
├── EditorPane
│   └── CodeMirror 6 instance
│       ├── lang-javascript
│       ├── lang-python (syntax only, no runtime)
│       └── lang-html
│
├── ActionBar
│   ├── ▶ Run         (⌘⏎)
│   ├── ↻ Format       (Prettier-style)
│   ├── ✕ Clear output
│   └── 📋 Copy code
│
├── OutputPane
│   ├── TerminalHeader (stderr/stdout labels)
│   ├── OutputLine[]   (timestamped)
│   └── ResizeHandle   (drag to resize)
│
├── StatusBar
│   ├── Lines of code
│   ├── Execution time
│   └── Engine status (idle / running / loading...)
│
└── [Lazy] EngineLayer
    ├── WorkerEngine (JS)
    ├── PyodideEngine (Python —dynamic import)
    └── IframeEngine (HTML)
```

### File Structure (new files)

```
src/
├── playground/
│   ├── PlaygroundTool.tsx          ← Main component
│   ├── PlaygroundTool.module.css   ← Scoped styles (or Tailwind)
│   ├── LangTabs.tsx
│   ├── EditorPane.tsx
│   ├── ActionBar.tsx
│   ├── OutputPane.tsx
│   ├── engines/
│   │   ├── types.ts                ← Shared engine interface
│   │   ├── worker-engine.ts        ← JS worker execution
│   │   └── pyodide-engine.ts       ← Lazy Pyodide loader
│   └── worker/
│       └── sandbox-worker.ts       ← Web Worker for JS sandbox
├── engine/
│   └── registry.ts                 ← Add playground tool entry
└── lib/
    └── seo.js                      ← Add TOOL_SEO for playground
```

### Engine Interface

```ts
interface CodeEngine {
  /** Human-readable name */
  name: string

  /** Whether engine is ready to execute */
  ready: boolean

  /** Load the engine (download WASM, etc.) — called on first Run */
  load(): Promise<void>

  /** Execute code, return output */
  run(code: string): Promise<RunResult>

  /** Cleanup resources */
  dispose(): void
}

interface RunResult {
  stdout: string
  stderr: string
  error: string | null
  durationMs: number
}
```

---

## 4. UX States

| State | What user sees | When |
|-------|---------------|------|
| **Idle** | Editor + empty output "Run some code to see results" | Page load |
| **Running** | Spinner in Run button, "Running..." in status bar | Execution in progress |
| **Loading** | Banner: "Loading Python engine (~12 MB first time)..." | Pyodide first load |
| **Result** | Output with stdout + timing + optional error highlight | After execution |
| **Error** | Red output with line number + error message | Syntax/runtime error |
| **Timeout** | "Execution timed out after 10s" | Infinite loop protection |

---

## 5. SEO & Performance

| Aspect | Strategy |
|--------|----------|
| **Prerender** | None needed — playground content is dynamic, same as other tools |
| **Meta** | Standard tool page meta: "Online code playground — run JS, Python, HTML in browser" |
| **Bundle** | Zero additional on page load. CodeMirror 6 loaded as vendor chunk. |
| **Pyodide CDN** | Loaded from `cdn.jsdelivr.net` — cached by browser, 1x download |
| **Cache strategy** | Pyodide WASM → browser HTTP cache (Cache-Control: immutable on CDN) |
| **CodeMirror** | Already a dependency candidate; ~150 KB gzipped ~45 KB |

---

## 6. Questions for Sign-off

1. **First phase:** JS-only (0 KB), or JS + Python (Pyodide lazy, ~12 MB on first run)?
2. **Editor:** Use CodeMirror 6 or keep it simpler with a `<textarea>` + basic syntax highlighting?
3. **Home placement:** Add as a card in existing grid, or dedicated page linked from nav?
4. **CodeMirror:** Install as new dep (~150 KB), or skip and use plain `<textarea>` for v1?
5. **Share feature:** Include in v1 or defer?

---

## 7. Current Status

**Phases prioritized by value/complexity ratio:**

| Phase | Est. Effort | Risk | Value | Order |
|-------|-------------|------|-------|-------|
| **1** JS Playground | 2-3 days | 🟢 Low | High | **1st** |
| **3** HTML/CSS iframe | 1 day | 🟢 Low | Medium | **2nd** |
| **4** Persist + Share | 1 day | 🟢 Low | Medium | **3rd** |
| **2** Python Pyodide | 4-5 days | 🟡 Mid | High | **4th** |
