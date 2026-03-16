'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { TableNodeData } from './types'

/**
 * Pixel constants — must match parser/src/layout/node-size.ts so that
 * handle positions align with the coordinates the layout engine computed.
 */
const HEADER_HEIGHT = 40
const ROW_HEIGHT = 28

/** Vertical center of the column row at `index`, relative to node top. */
function rowCenter(index: number): number {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#ffffff',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  overflow: 'hidden',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 13,
  minWidth: 240,
}

const headerStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f8fafc',
  padding: '0 12px',
  height: HEADER_HEIGHT,
  display: 'flex',
  alignItems: 'center',
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: '0.01em',
}

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#94a3b8',
  border: '1px solid #64748b',
  borderRadius: '50%',
}

// ── Column row ────────────────────────────────────────────────────────────────

interface ColumnRowProps {
  name: string
  type: string
  primaryKey?: boolean
  unique?: boolean
  notNull?: boolean
  index: number
}

function ColumnRow({ name, type, primaryKey, unique, notNull, index }: ColumnRowProps) {
  const rowStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    height: ROW_HEIGHT,
    background: index % 2 === 0 ? '#f8fafc' : '#ffffff',
    borderTop: '1px solid #f1f5f9',
  }

  const top = rowCenter(index)

  return (
    <div style={rowStyle}>
      {/* Target handle — incoming foreign key arrow lands here */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${name}-target`}
        style={{ ...handleStyle, top }}
      />

      {/* Column name */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1e293b' }}>
        {primaryKey && (
          <span
            title="Primary key"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#b45309',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: 3,
              padding: '0 4px',
              lineHeight: '16px',
            }}
          >
            PK
          </span>
        )}
        {name}
      </span>

      {/* Column type + constraints */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#64748b', fontSize: 12 }}>{type}</span>
        {notNull && (
          <span
            title="Not null"
            style={{ color: '#dc2626', fontSize: 11, fontWeight: 700 }}
          >
            *
          </span>
        )}
        {unique && !primaryKey && (
          <span
            title="Unique"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#1d4ed8',
              background: '#dbeafe',
              border: '1px solid #93c5fd',
              borderRadius: 3,
              padding: '0 3px',
              lineHeight: '16px',
            }}
          >
            U
          </span>
        )}
      </span>

      {/* Source handle — outgoing foreign key arrow originates here */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${name}-source`}
        style={{ ...handleStyle, top }}
      />
    </div>
  )
}

// ── TableNode ─────────────────────────────────────────────────────────────────

/**
 * React Flow custom node that renders a database table as a card.
 *
 * Each column row has a target handle on the left and a source handle on the
 * right, both positioned at the vertical center of that row. This lets edges
 * connect precisely to the column involved in the foreign key relationship.
 *
 * Handle ids follow the convention:
 *   `{columnName}-source`  (outgoing)
 *   `{columnName}-target`  (incoming)
 *
 * These ids must match the `sourceHandle` and `targetHandle` values set in
 * useDiagramData.ts.
 */
function TableNodeComponent({ data }: NodeProps<TableNodeData>) {
  const { tableName, columns } = data

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>{tableName}</div>

      {columns.map((col, index) => (
        <ColumnRow
          key={col.name}
          name={col.name}
          type={col.type}
          primaryKey={col.primaryKey}
          unique={col.unique}
          notNull={col.notNull}
          index={index}
        />
      ))}

      {columns.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            color: '#94a3b8',
            fontSize: 12,
            fontStyle: 'italic',
          }}
        >
          (no columns)
        </div>
      )}
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
