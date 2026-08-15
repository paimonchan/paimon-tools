/**
 * lazyWithRetry.ts — a React.lazy wrapper that retries the dynamic import.
 *
 * GitHub Pages swaps assets during a deploy (~40s window): an old page that
 * requests a just-replaced hashed chunk can get a 404 once, which surfaces as
 * "Failed to fetch dynamically imported module". Retrying a couple of times
 * with backoff makes navigation resilient to that window.
 *
 * Layer note: this is a browser/React adapter -> lives in `lib/`. It exports a
 * single `lazyWithRetry` mirroring React.lazy's signature.
 */

import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

/**
 * Wrap `importer` (a `() => import(...)` thunk) in a lazy component that retries
 * the import on transient "Failed to fetch" errors. Mirrors React.lazy<T>.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  attempts = 2,
  backoffMs = 800,
): LazyExoticComponent<T> {
  return lazy<T>(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await importer()
      } catch (err) {
        if (attempt >= attempts) throw err
        await new Promise((r) => setTimeout(r, backoffMs * attempt))
      }
    }
  })
}
