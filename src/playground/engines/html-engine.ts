/**
 * html-engine.ts — preview HTML/CSS/JS straight in an iframe.
 *
 * No extra deps needed — srcdoc handles it all.
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

  abort(): void {
    // HTML execution is synchronous — nothing to abort
  }
}
