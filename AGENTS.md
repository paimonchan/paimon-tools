# paimon-tools — Project Conventions

## Indentation
- **2 spaces** — never tabs, never 4 spaces.
- Every indent level = exactly 2 spaces.
- All files formatted via **Prettier** (see `.prettierrc`).
- JSX/TSX follows the same 2-space rule.

✅ Correct:
```ts
const TOOLS = [
  {
    id: 'example',
    name: 'Example',
  },
]
```

❌ Wrong:
```ts
const TOOLS = [
    {
        id: 'example',    // 4-space indent
    },
]
```

## Architecture — Layer Rules
These are strict — don't import across layers.

| Dir | Contents | Rules |
|-----|----------|-------|
| `engine/` | Pure conversion logic | Zero React, zero browser API, no DOM, no `window`. Pure functions only. |
| `components/` | React UI components | Flat dir (no subdirs). Each file = one component, one default export. |
| `playground/` | Code Playground (lazy) | `engines/` = execution backends. `sandbox-worker.js` = Web Worker (plain JS). Zero imports from `components/`. |
| `lib/` | Browser I/O + adapters | `files.ts`, `router.ts`, `makeFilename.ts`, `icon-map.ts`, `playground-share.ts`, `seo.js`. Side-effectful, no JSX. |
| `stores/` | Zustand stores | Theme + toast only. No per-tool state — use `usePersistentState` hook instead. |
| `hooks/` | Shared React hooks | `usePersistentState` — generic localStorage hook. |

> **Golden rule:** Never import from `components/` into `engine/` or `lib/`.

## TypeScript
- Prefer `interface` over `type` for object shapes.
- Use discriminated unions (`type: 'converter' | 'ref'`) for variant tool types.
- No `any` — use `unknown` with narrowing.
- Import types with `import type { ... }` syntax.

## Adding a New Tool

### Converter Tool
1. Add converter function in `engine/converters/` (pure, typed)
2. Add entry in `engine/registry.ts` — one config object with `type: 'converter'`
3. UI auto-picks it up — sidebar, palette, routing, shortcuts all work

### Non-Converter Tool (e.g. Playground, Diff, Base64)
1. Add entry in `engine/registry.ts` with `type: 'ref'`
2. Create lazy-loaded component with `React.lazy()`
3. Route it in `App.tsx` — switch on `tool.type === 'ref'`

### ⚠️ Prerequisite: Scan existing patterns BEFORE coding
**Do NOT start coding a new tool until you've audited what already exists.** The TextDelimiterTool was built from scratch despite shared components being available — don't repeat this mistake.

**Step 1 — Check shared components** in `src/components/` before building custom UI:
| Component | What it does | Use for |
|-----------|-------------|---------|
| `Pane` + `PaneAction` | Titled container with toolbar | Input/output panels |
| `useResizableSplit` + `ResizeHandle` | Draggable split between panes | Any split-pane layout |
| `StatusBar` | Footer with status, stats, privacy indicator | Every tool |
| `EmptyState` | "Paste or type to begin" placeholder | Output pane when idle |
| `ErrorState` | Red error box with icon + message | Output pane on errors |
| `ToolHeader` | Icon + name + description + optional swap | Tool heading |

**Step 2 — Study a reference tool** before writing code:
- `ConversionTool.tsx` — best reference: uses ALL shared components, has keyboard shortcuts, input guards, proper error/empty/status handling
- `DiffTool.tsx` — simpler non-converter ref tool

**Step 3 — Mandatory checklist** for every new tool (tick all before PR):
- [ ] Uses shared `<StatusBar>` (not hand-rolled)
- [ ] Uses `<EmptyState>` when output area has no content
- [ ] Uses `<ErrorState>` or inline error display when processing fails
- [ ] Uses `useResizableSplit` + `<ResizeHandle>` for split-pane layout (if input+output panes)
- [ ] Has keyboard shortcuts (`⌘⇧C` copy, `⌘S` download, `Esc` clear, etc.)
- [ ] Has input size guard (200K char limit with toast)
- [ ] Handles `'processing'` status during debounce/async work
- [ ] Uses `usePersistentState` for per-tool settings (not raw `useState`)
- [ ] Follows ConversionTool's pattern for state/effect/action structure

## State Management
- **Global state** → Zustand stores in `stores/` (theme, toast).
- **Per-tool state** → `usePersistentState` hook (localStorage, survives reload).
- **Transient state** → local `useState` (fileValue, result, duration).

## Component Conventions
- One default export per file.
- Props interface defined above the component (not inline).
- Functional components with hooks only — no class components.
- Lazy-load heavy/rarely-used components via `React.lazy(() => import(...))`.
- Keyboard shortcuts via `useEffect` with `keydown` listener.

## Code Style
- Comments: natural casual English, no formal JSDoc lists.
- Separators: ASCII `---` not Unicode `───`.
- Import ordering: React/third-party first, then local (alphabetical by path).

## Git
- Conventional commits: `feat:`, `fix:`, `style:`, `refactor:`, `chore:`, `docs:`.
- Keep commits focused — one logical change per commit.
- Plans/docs NEVER committed here — go to `paimon-tools-plan` repo instead.
