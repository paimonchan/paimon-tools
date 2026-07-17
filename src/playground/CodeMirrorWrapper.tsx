/**
 * CodeMirrorWrapper — code editor backed by CodeMirror 6.
 *
 * Imported normally (not lazy) since PlaygroundTool itself is already
 * lazy-loaded from the route, so this doesn't bloat the initial bundle.
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
  typescript: javascript({ typescript: true }),
  json: json(),
  html: html(),
  python: python(),
}

export default function CodeMirrorWrapper({ value, onChange, language, readOnly }: CodeMirrorWrapperProps) {
  const extensions = useMemo(
    () => [langExt[language], readOnly ? EditorView.editable.of(false) : [], EditorView.lineWrapping].flat(),
    [language, readOnly]
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
