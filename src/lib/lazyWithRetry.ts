/**
 * lazyWithRetry.ts — a React.lazy wrapper that survives GH Pages asset swaps.
 *
 * GitHub Pages serves hashed chunks that are DELETED on each deploy, and the
 * index.html has `Cache-Control: max-age=600`. So a browser holding a stale
 * index.html can reference a chunk hash that is now a permanent 404:
 *   "Failed to fetch dynamically imported module: .../VideoMuterTool-<old>.js"
 *
 * Two failure modes, two responses:
 *   1. Transient (mid-deploy ~40s swap window): the chunk exists but 404s once.
 *      -> retry the same import with backoff.
 *   2. Stale app (old index.html -> old chunk hash permanently gone): retrying
 *      the same URL never succeeds. -> reload the page so the browser fetches a
 *      fresh index.html referencing the current chunk hashes.
 *
 * To avoid an infinite reload loop (e.g. a genuinely broken build), we only
 * auto-reload once per session (sessionStorage flag), then fall back to the
 * original error so React's ErrorBoundary shows "Try again".
 */

import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

const RELOAD_FLAG = 'paimon.lazy-reload-tried'

function isModuleFetchError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /Failed to fetch dynamically imported module/i.test(err.message))
  )
}

/**
 * Wrap `importer` (a `() => import(...)` thunk) in a lazy component that retries
 * transient "Failed to fetch" errors, then hard-reloads once for a stale-app
 * (permanent 404) so the user gets the current build. Mirrors React.lazy<T>.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  attempts = 3,
  backoffMs = 800,
): LazyExoticComponent<T> {
  return lazy<T>(async () => {
    let lastErr: unknown
    for (let attempt = 1; ; attempt++) {
      try {
        return await importer()
      } catch (err) {
        lastErr = err
        if (attempt >= attempts) break
        await new Promise((r) => setTimeout(r, backoffMs * attempt))
      }
    }
    // Exhausted retries. If it looks like a module-fetch failure (stale chunk),
    // reload once to pick up the fresh index.html. Guard against a loop.
    if (isModuleFetchError(lastErr)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
          // reload() is async; throw to stop React from rendering a broken state
          throw lastErr
        }
      } catch {
        /* sessionStorage may be unavailable — fall through to error */
      }
    }
    throw lastErr
  })
}
