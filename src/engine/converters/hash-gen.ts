/**
 * hash-gen.ts — SHA-256 hash generator (pure function).
 *
 * Pure JS implementation of SHA-256 (FIPS 180-4) — zero dependencies.
 * Synchronous, works in all environments.
 */

import { type Result, run } from '../result'

// ── SHA-256 implementation (FIPS 180-4) ─────────────────────────────

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rrot(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

function sha256Impl(msg: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(msg)
  const bitLen = bytes.length * 8
  const ml = ((bytes.length + 9 + 63) >>> 6) << 6
  const m = new Uint8Array(ml)
  m.set(bytes)
  m[bytes.length] = 0x80
  const dv = new DataView(m.buffer)
  dv.setUint32(ml - 4, bitLen >>> 0, false)

  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const W = new Uint32Array(64)

  for (let ch = 0; ch < ml; ch += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(ch + t * 4, false)
    for (let t = 16; t < 64; t++) {
      const s0 = rrot(W[t - 15], 7) ^ rrot(W[t - 15], 18) ^ (W[t - 15] >>> 3)
      const s1 = rrot(W[t - 2], 17) ^ rrot(W[t - 2], 19) ^ (W[t - 2] >>> 10)
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = H

    for (let t = 0; t < 64; t++) {
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }

    H = H.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) >>> 0)
  }

  return H.map((v) => v.toString(16).padStart(8, '0')).join('')
}

// ── Public API ──────────────────────────────────────────────────────

/** Generate SHA-256 hash. Fully synchronous, pure JS. */
export function sha256(input: string): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input === '') throw new Error('Input must be non-empty text.')
    return sha256Impl(input)
  })
}

/** Generate hash (default SHA-256). */
export function generateHash(input: string): Result<string> {
  return sha256(input)
}
