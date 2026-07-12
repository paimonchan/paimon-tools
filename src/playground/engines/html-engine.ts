/**
 * html-engine.ts — HTML preview engine.
 *
 * Renders HTML/CSS/JS in a sandboxed iframe using srcdoc.
 * Zero additional dependencies — browser built-in.
 */

import type { CodeEngine, RunResult } from './types'

export class HtmlEngine implements CodeEngine {
  readonly name = 'HTML'
  readonly ready = true

  async load(): Promise<void> {
    // Always ready — no loading needed
  }

  async run(code: string): Promise<RunResult> {
    const start = performance.now()
    return {
      stdout: '',
      stderr: '',
      error: null,
      result: null,
      durationMs: performance.now() - start,
      htmlPreview: code,
    }
  }

  dispose(): void {
    // Nothing to clean up
  }
}
