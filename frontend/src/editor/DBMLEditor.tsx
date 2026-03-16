'use client'

import Editor from '@monaco-editor/react'

interface DBMLEditorProps {
  value: string
  onChange: (value: string) => void
}

/**
 * DBML text editor powered by Monaco Editor.
 *
 * Uses 'sql' as the language for syntax highlighting — it is close enough
 * to DBML for a readable highlight at this stage. A custom DBML language
 * definition can be registered via the Monaco API in a future iteration.
 *
 * The editor fills 100% of its container's height. Wrap it in a container
 * with an explicit height to control sizing from the outside.
 */
export function DBMLEditor({ value, onChange }: DBMLEditorProps) {
  return (
    <Editor
      height="100%"
      language="sql"
      theme="vs-dark"
      value={value}
      onChange={(v) => {
        if (v !== undefined) onChange(v)
      }}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        fontFamily: '"Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
        padding: { top: 16, bottom: 16 },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        renderLineHighlight: 'gutter',
        smoothScrolling: true,
      }}
    />
  )
}
