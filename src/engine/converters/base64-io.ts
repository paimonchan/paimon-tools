/**
 * base64-io.ts — Base64 encode/decode (pure functions).
 *
 * Uses browser-native btoa/atob with proper UTF-8 handling via TextEncoder.
 * Zero external dependencies — 100% native APIs.
 */

import { type Result, run } from '../result'

/** Encode a string to Base64 (UTF-8 safe). */
export function encodeBase64(input: string): Result<string> {
  return run(() => {
    if (typeof input !== 'string') throw new Error('Input must be text.')
    const bytes = new TextEncoder().encode(input)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  })
}

/** Decode Base64 to string (UTF-8 safe). */
export function decodeBase64(input: string): Result<string> {
  return run(() => {
    if (typeof input !== 'string') throw new Error('Input must be text.')
    const binary = atob(input)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  })
}
