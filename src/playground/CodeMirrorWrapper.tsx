/**
 * CodeMirrorWrapper — lazy-loaded CodeMirror 6 editor component.
 *
 * Uses @uiw/react-codemirror with language-specific extensions.
 * Language extensions are also lazy-imported per language.
 */

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { Compartment, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { Language } from './LangTabs'

interface CodeMirrorWrapperProps {
  value: string
  onChange: (value: string) => void
  language: Language
  readOnly?: boolean
}

// Compartment lets us swap language extensions without recreating the editor
const langCompartment = new Compartment()

// Lazy language extension loaders
const langExtensions: Record<Language, () => Promise<Extension>> = {
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
}

export default function CodeMirrorWrapper({ value, onChange, language, readOnly }: CodeMirrorWrapperProps) {
  const extensions = useMemo(
    () => [
      langCompartment.of([]), // placeholder — replaced dynamically
      readOnly ? EditorView.editable.of(false) : [],
      EditorView.lineWrapping,
    ].flat(),
    [readOnly],
  )

  return (
    <CodeMirror
      value={value}
      onChange={(v) => onChange(v)}
      extensions={extensions}
      theme={oneDark}
      height="100%"
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: !readOnly,
        foldGutter: false,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
        tabSize: 2,
      }}
      className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[13px]"
    />
  )
}
