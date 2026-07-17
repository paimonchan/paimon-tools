/**
 * BundlerEngine — optional preprocessor for the playground.
 *
 * Uses esbuild-wasm to:
 * - Transpile TypeScript/TSX/JSX → JavaScript
 * - Bundle bare imports (e.g. `import lodash from "lodash"`) via esm.sh CDN
 * - Tree-shake and minify output
 *
 * Lazy-loads the WASM binary (~5MB) only when the user first writes code
 * that needs bundling (TypeScript or bare imports). Pure JavaScript without
 * imports skips this entirely — zero overhead.
 */

import type { Language } from '../LangTabs'

// Dynamic import of esbuild-wasm — avoids hard-coding the full esbuild API type.
// esbuild-wasm ships its own TypeScript declarations.
type EsbuildModule = typeof import('esbuild-wasm')

export interface BundleResult {
  /** Bundled JavaScript code (empty if bundling was skipped). */
  code: string
  /** Error message if bundling failed. */
  error: string | null
  /** True when bundling was skipped (pure JS without imports). */
  skipped: boolean
}

/**
 * Check if code needs esbuild bundling.
 * Fast-path detection — no WASM initialization needed.
 */
export function needsBundling(code: string, language: Language): boolean {
  // TypeScript always needs transpilation
  if (language === 'typescript') return true

  // HTML/JSON/Python are handled by their own engines
  if (language !== 'javascript') return false

  // Check for bare imports: `import x from "y"` or `import("y")` where y is not relative
  if (
    /import\s+(?:\*\s+as\s+)?[a-z$_{[\s}][a-z0-9$_{[\s}]*\s+from\s+["'](?!\.\/|\.\.\/)(?!https?:\/\/)/i.test(code)
  ) return true

  // Dynamic imports of bare modules
  if (/\bimport\s*\(\s*["'](?!\.\/|\.\.\/)(?!https?:\/\/)/.test(code)) return true

  // JSX/TSX syntax (angle bracket in return position or tag-like)
  if (/return\s*</.test(code) || /<\w+\s/.test(code) || /<\/\w+>/.test(code)) return true

  return false
}

export class BundlerEngine {
  private initialized = false
  private initializing: Promise<void> | null = null
  private esbuildModule: EsbuildModule | null = null
  private abortController: AbortController | null = null

  // Inline cache: skip re-bundle when code hasn't changed
  private lastCode = ''
  private lastLanguage: Language | null = null
  private lastResult: BundleResult | null = null

  /** True while WASM is being fetched or bundling is in progress. */
  private _busy = false
  get busy(): boolean {
    return this._busy
  }

  /**
   * Initialize esbuild-wasm.
   * Called automatically on first `bundle()` — can be called early to preload.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializing) return this.initializing

    this._busy = true
    this.initializing = this._doInitialize()
    try {
      await this.initializing
    } finally {
      this._busy = false
      this.initializing = null
    }
  }

  private async _doInitialize(): Promise<void> {
    this.esbuildModule = await import('esbuild-wasm')
    await this.esbuildModule.initialize({
      worker: true,
      wasmURL: 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.28.1/esbuild.wasm',
    })
    this.initialized = true
  }

  /**
   * Bundle user code. Returns immediately on the fast path (no bundling needed).
   */
  async bundle(code: string, language: Language): Promise<BundleResult> {
    // Fast path: no bundling needed
    if (!needsBundling(code, language)) {
      return { code, error: null, skipped: true }
    }

    // Cache hit: same code, same language
    if (code === this.lastCode && language === this.lastLanguage && this.lastResult) {
      return this.lastResult
    }

    // Ensure esbuild is initialized
    if (!this.initialized) {
      await this.initialize()
    }

    this._busy = true
    this.abortController = new AbortController()

    try {
      const result = await this._doBundle(code, language)
      this.lastCode = code
      this.lastLanguage = language
      this.lastResult = result
      return result
    } finally {
      this._busy = false
      this.abortController = null
    }
  }

  private async _doBundle(code: string, language: Language): Promise<BundleResult> {
    if (!this.esbuildModule) {
      return { code: '', error: 'esbuild not initialized', skipped: false }
    }

    const loader = language === 'typescript' ? 'tsx' : 'jsx'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const esbuildOptions: any = {
      stdin: { contents: code, loader, resolveDir: '/' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      sourcemap: false,
      minify: false,
      write: false,
      plugins: [
        {
          name: 'cdn',
          setup: (build: { onResolve: (args: { filter: RegExp }, fn: (args: { path: string; importer: string; kind: string }) => { path: string; external?: boolean; namespace?: string } | null) => void; onLoad: (args: { filter: RegExp; namespace?: string }, fn: (args: { path: string }) => { contents: string; loader: string }) => void }) => {
            // Bare imports (not relative, not absolute URL) → esm.sh
            build.onResolve({ filter: /^[^./]/ }, (args) => {
              // Check if it's already a URL
              if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
                return { path: args.path, external: true }
              }
              // Skip node builtins
              if (args.path === 'buffer' || args.path === 'path' || args.path === 'fs' || args.path === 'os') {
                return null
              }
              return {
                path: `https://esm.sh/${args.path}`,
                external: true,
              }
            })

            // Relative imports — we can't resolve multi-file in a single-file playground,
            // so we treat them as external (will fail at runtime, but that's expected)
            build.onResolve({ filter: /^\.\.?\// }, () => {
              return null
            })
          },
        },
      ],
    }

    try {
      const result = await this.esbuildModule.build(esbuildOptions)

      if (result.errors && result.errors.length > 0) {
        const firstError = result.errors[0]
        const location = firstError.location
        const locStr = location
          ? `:${location.line}:${location.column}`
          : ''
        return {
          code: '',
          error: `Build failed${locStr} — ${firstError.text}`,
          skipped: false,
        }
      }

      const bundledCode = result.outputFiles?.[0]?.text ?? ''
      if (!bundledCode) {
        return { code: '', error: 'Bundler produced empty output', skipped: false }
      }

      return { code: bundledCode, error: null, skipped: false }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Check if it was an abort
      if (message.includes('abort') || message.includes('Abort')) {
        return { code: '', error: 'Bundling cancelled', skipped: false }
      }
      return { code: '', error: `Bundling error: ${message}`, skipped: false }
    }
  }

  /** Cancel an in-progress bundle. */
  abort(): void {
    this.abortController?.abort()
    this.abortController = null
    this._busy = false
  }

  /** Reset cache (e.g. when component unmounts). */
  dispose(): void {
    this.abort()
    this.lastCode = ''
    this.lastLanguage = null
    this.lastResult = null
  }
}
