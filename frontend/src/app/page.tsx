'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useDBMLDiagram } from '../editor/useDBMLDiagram'

const DBMLEditor = dynamic(
  () => import('../editor/DBMLEditor').then((mod) => ({ default: mod.DBMLEditor })),
  { ssr: false, loading: () => <div style={loadingStyle}>Loading editor…</div> },
)

const DiagramCanvas = dynamic(
  () => import('../diagram/DiagramCanvas').then((mod) => ({ default: mod.DiagramCanvas })),
  { ssr: false, loading: () => <div style={loadingStyle}>Loading diagram…</div> },
)

const DEFAULT_DBML = `Table users {
  id         int       [pk]
  name       varchar   [not null]
  email      varchar   [not null, unique]
  created_at timestamp
}

Table products {
  id          int     [pk]
  name        varchar [not null]
  price       int     [not null]
  description varchar
}

Table orders {
  id         int       [pk]
  user_id    int       [ref: > users.id]
  status     varchar
  created_at timestamp
}

Table order_items {
  id         int [pk]
  order_id   int [ref: > orders.id]
  product_id int [ref: > products.id]
  quantity   int [not null]
}`

export default function Home() {
  const [dbml, setDbml] = useState(DEFAULT_DBML)
  const { nodes, edges, error } = useDBMLDiagram(dbml)

  return (
    <div style={rootStyle}>
      {/* Left panel — editor */}
      <div style={editorPanelStyle}>
        <div style={panelHeaderStyle}>DBML Editor</div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <DBMLEditor value={dbml} onChange={setDbml} />
        </div>
        {error && (
          <div style={errorBannerStyle}>
            <span style={errorIconStyle}>⚠</span>
            {error}
          </div>
        )}
      </div>

      <div style={dividerStyle} />

      {/* Right panel — diagram */}
      <div style={diagramPanelStyle}>
        <div style={panelHeaderStyle}>ER Diagram</div>
        <div style={{ flex: 1, position: 'relative' }}>
          <DiagramCanvas nodes={nodes} edges={edges} />
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  display: 'flex',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  background: '#0f172a',
}

const editorPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '40%',
  minWidth: 320,
  flexShrink: 0,
}

const diagramPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  background: '#f8fafc',
}

const panelHeaderStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#1e293b',
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  flexShrink: 0,
  userSelect: 'none',
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  background: '#334155',
  flexShrink: 0,
}

const errorBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 14px',
  background: '#1c0a0a',
  borderTop: '1px solid #7f1d1d',
  color: '#fca5a5',
  fontSize: 12,
  fontFamily: '"Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  flexShrink: 0,
  maxHeight: 120,
  overflowY: 'auto',
}

const errorIconStyle: React.CSSProperties = {
  flexShrink: 0,
  marginTop: 1,
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#94a3b8',
  fontSize: 13,
}
