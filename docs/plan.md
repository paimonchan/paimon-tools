# Paimon Tools — Development Plan

> **Last updated:** 11 July 2026

## ✅ Completed

### Phase 1 — TypeScript + Restructure
- Full TypeScript migration (zero `any`)
- Engine/core split from UI
- Registry-driven tool architecture
- JSON5 lenient parsing

### Phase 2 — UI Decomposition + Zustand
- Zustand stores (theme, toast)
- Resizable split panes
- File dropzone
- Keyboard shortcuts (⌘S, ⌘⇧S, ⌘⇧C)
- Dark/light theme

### Phase 3 — Dependency Upgrade Stack
- Vite 8 (Rolldown)
- React 19
- Tailwind CSS 4
- TypeScript 7

### Phase 4 — Bundle Optimization
- Code-split: react-vendor, xlsx (487KB), papaparse, codemirror-core (129KB), codemirror-react, app core
- Lazy-load Playground (zero initial cost)
- Manual chunk config for predictable caching

### Phase 5 — SEO Enhancement
- JSON-LD structured data (WebApplication + BreadcrumbList) per tool
- Prerendered static entry pages
- Per-tool crawlable H1 content
- Sitemap.xml with dynamic `lastmod`
- OG images + social cards
- robots.txt

### Phase 6 — Deploy CI
- GitHub Actions deploy workflow
- Auto-build + publish to GitHub Pages on push to `main`

### Code Playground
- Phase 1: JavaScript + JSON execution via secure Worker sandbox
- HTML/CSS/JS preview engine (srcdoc iframe)
- CodeMirror 6 editor (lazy-loaded)
- Language tabs (JavaScript / HTML / JSON)
- Python via Pyodide WASM (lazy-loaded ~12 MB)
- Share via URL (lz-string compression into URL hash)
- Console/Preview tab toggle for HTML output
- Resizable editor/output layout

### Conversion Tools (8 total)
| Tool | Input | Output |
|------|-------|--------|
| JSON → CSV | JSON array | CSV table |
| CSV → JSON | CSV table | JSON array |
| JSON → Excel | JSON array | `.xlsx` |
| Excel → JSON | `.xlsx` | JSON array |
| CSV → Excel | CSV text | `.xlsx` |
| Excel → CSV | `.xlsx` | CSV text |
| JSON Formatter | JSON (any) | Pretty-printed |
| JSON Minifier | JSON (any) | Minified |

---

## 🛤️ Future Roadmap

### Short-term (Next Sprint)

#### 1. Productivity Polish
- **⌘Z / undo stack** for code editors
- **Fullscreen mode** for Playground (`F11`)
- **Download** playground code as `.html` / `.py` file
- **File open** in Playground (drag-drop `.html` / `.py` into editor)

#### 2. More Languages in Playground
| Language | Engine | Effort |
|----------|--------|--------|
| CSS (standalone) | Static preview | Low |
| Markdown → HTML | marked / marked-it | Low |
| TypeScript (compile) | TypeScript compiler via CDN | Medium |
| JSX/TSX (live) | @babel/standalone + esbuild WASM | High |

#### 3. Conversion Tool Enhancements
- **YAML support** — YAML ↔ JSON (js-yaml, ~30 KB)
- **XML support** — XML ↔ JSON
- **INI / TOML** — config format converters
- **Batch mode** — convert multiple files at once
- **Diff view** — side-by-side diff between input/output

### Medium-term

#### 4. Collaboration Features
- **Live Share** — WebRTC peer-to-peer code sharing (no server)
- **Export as Gist** — push to GitHub Gist via API token (client-side)
- **Theme gallery** — shareable code snippets with preview

#### 5. Tool Ecosystem
- **Base64 encoder/decoder**
- **UUID generator**
- **Hash generator** (MD5, SHA1, SHA256 via SubtleCrypto)
- **Regex tester** — live match highlighting
- **JWT decoder**
- **Color converter** (HEX ↔ RGB ↔ HSL ↔ OKLCH)

#### 6. PWA / Offline
- **Service Worker** for full offline support
- **Install prompt** (manifest.json)
- **IndexedDB-backed** persistent code history
- **Sync across devices** via BroadcastChannel / localStorage

### Long-term

#### 7. Desktop App (Tauri)
- Port the Playground to Tauri v2 + React
- Native file system access (no upload/download friction)
- Local Python runtime (optional, via sidecar)
- System tray quick-launch

#### 8. Plugin System
- WASM-based plugin architecture
- Community plugin registry
- Plugin sandbox with capability-based security

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **No backend** | Zero data leaves the browser; no servers to maintain |
| **Config-driven tools** | Adding a converter = registry entry + pure function |
| **Lazy-load Playground** | Conversion tools are ~50 KB gzip; Playground (CM6 + Pyodide) is ~140 KB + 12 MB lazy |
| **Worker sandbox** | User code runs in isolated Worker; iframe `srcdoc` for HTML preview |
| **Zustand over Context** | No re-render cascading; simpler than Redux; built-in `persist` middleware |
| **Hash routing** | GitHub Pages doesn't support SPA fallback; hash-based routing works everywhere |
| **lz-string for share** | No server needed; ~60% compression ratio; fits in URL hash (browser limit ~64 KB) |

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Lighthouse Performance | ~92 | ≥95 |
| FCP (Fast 3G) | ~1.2s | <1.0s |
| Playground code-split load | ~140 KB + 12 MB (Pyodide lazy) | N/A (on-demand) |
| Conversion tool JS | ~50 KB gzip | <50 KB |
| Time-to-interactive (tools) | ~0.8s | <0.5s |

## Version History

| Tag | Date | Highlights |
|-----|------|-----------|
| v1.0.0 | — | Initial release: 8 conversion tools |
| v1.1.0 | — | Playground Phase 1 (JS + JSON) |
| v1.2.0 | 11 Jul 2026 | HTML Preview, Share URL, Python Pyodide |
