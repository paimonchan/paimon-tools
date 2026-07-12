/**
 * CodeMirrorWrapper — editor kode pake CodeMirror 6.
 *
 * Komponen ini di-import secara normal (gak lazy) karena PlaygroundTool
 * aja udah lazy-loaded dari route. Jadi gak nambah bundle awal.
 */

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'
import { EditorView } from '@codemirror/view'
import type { Language } from './LangTabs'

interface CodeMirrorWrapperProps {
  value: string
  onChange: (value: string) => void
  language: Language
  readOnly?: boolean
}

const langExt: Record<Language, ReturnType<typeof javascript>> = {
  javascript: javascript(),
  json: json(),
  html: html(),
  python: python(),
}

export default function CodeMirrorWrapper({ value, onChange, language, readOnly }: CodeMirrorWrapperProps) {
  const extensions = useMemo(
    () => [
      langExt[language],
      readOnly ? EditorView.editable.of(false) : [],
      EditorView.lineWrapping,
    ].flat(),
    [language, readOnly],
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
