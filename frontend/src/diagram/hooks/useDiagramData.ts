'use client'

import { useMemo } from 'react'
import { MarkerType } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import type { LayoutResult } from '@dbdiagram/parser'
import type { TableNodeData } from '../types'

/**
 * Map a DBML relation direction to a short cardinality label.
 *
 *  '>'  many-to-one  →  "N:1"
 *  '<'  one-to-many  →  "1:N"
 *  '-'  one-to-one   →  "1:1"
 */
function cardinalityLabel(direction: '>' | '<' | '-'): string {
  if (direction === '>') return 'N:1'
  if (direction === '<') return '1:N'
  return '1:1'
}

/**
 * Convert a LayoutResult into React Flow node and edge arrays.
 *
 * Node mapping:
 *   PositionedNode → Node<TableNodeData>
 *   - type:     'tableNode'  (rendered by TableNode component)
 *   - position: { x, y }    (top-left, from layout engine)
 *   - data:     { tableName, columns }
 *   - style:    width fixed at node.width so the render matches the layout
 *
 * Edge mapping:
 *   PositionedEdge → Edge
 *   - source/target:       table node ids
 *   - sourceHandle:        `{fromColumn}-source`  (matches TableNode handle id)
 *   - targetHandle:        `{toColumn}-target`    (matches TableNode handle id)
 *   - type:                'smoothstep'
 *   - markerEnd:           closed arrow at the target
 *   - label:               cardinality type (N:1 / 1:N / 1:1)
 *
 * The result is memoised on `layout` reference — recomputed only when the
 * LayoutResult object changes.
 */
export function useDiagramData(layout: LayoutResult): {
  nodes: Node<TableNodeData>[]
  edges: Edge[]
} {
  return useMemo(() => {
    const nodes: Node<TableNodeData>[] = layout.nodes.map((n) => ({
      id: n.id,
      type: 'tableNode',
      position: { x: n.x, y: n.y },
      data: { tableName: n.tableName, columns: n.columns },
      style: { width: n.width },
      // Prevent React Flow from overriding dimensions computed by the layout engine
      draggable: true,
      selectable: true,
    }))

    const edges: Edge[] = layout.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: `${e.fromColumn}-source`,
      targetHandle: `${e.toColumn}-target`,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      label: cardinalityLabel(e.direction),
      labelStyle: { fontSize: 11, fill: '#64748b', fontWeight: 600 },
      labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      animated: false,
    }))

    return { nodes, edges }
  }, [layout])
}
