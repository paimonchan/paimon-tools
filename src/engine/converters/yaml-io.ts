/**
 * yaml-io.ts — YAML parse/stringify via js-yaml (pure functions).
 *
 * Converts between YAML and JSON. Uses js-yaml library (~30 KB gzipped).
 */

import { load, dump } from 'js-yaml'
import { type Result, run } from '../result'

/** Parse YAML string to JSON string. */
export function yamlToJson(input: string): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') throw new Error('YAML input is empty.')
    const doc = load(input)
    if (doc === undefined || doc === null) throw new Error('YAML input is empty.')
    return JSON.stringify(doc, null, 2)
  })
}

/** Convert JSON string to YAML string. */
export function jsonToYaml(input: string): Result<string> {
  return run(() => {
    if (typeof input !== 'string' || input.trim() === '') throw new Error('JSON input is empty.')
    const doc = JSON.parse(input)
    return dump(doc, { indent: 2, lineWidth: 120, noRefs: true })
  })
}
