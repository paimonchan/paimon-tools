# paimon-tools — Project Conventions

## Indentation
- **4 spaces** — never tabs, never 2 spaces.
- Object properties inside arrays: indent 4 spaces relative to the opening brace.
- Closing braces: align with the opening brace.

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
    id: 'example',    // 2-space indent
  },
]
```

- JSX/TSX: **2 spaces** (React standard).
- Non-TS files (CSS, JSON, YAML): **2 spaces**.

## TypeScript
- Prefer `interface` over `type` for object shapes.
- Use discriminated unions (`type: 'converter' | 'ref'`) for variant types.
- No `any` — use `unknown` with narrowing.

## Component conventions
- One default export per file.
- Props interface defined above the component.
- Functional components with hooks, no class components.
- Lazy-load heavy components via `React.lazy()`.

## Git
- Conventional commits: `feat:`, `fix:`, `style:`, `refactor:`, `chore:`.
- Keep commits focused — one logical change per commit.
