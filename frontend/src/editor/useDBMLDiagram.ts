'use client'

import { useState, useEffect } from 'react'
import { parseDBML, buildDiagramGraph, layoutGraph } from '@dbdiagram/parser'
import { MarkerType } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import type { TableNodeData } from '../diagram/types'

interface DBMLDiagramState {
  nodes: Node<TableNodeData>[]
  edges: Edge[]
  error: string | null
}

const DEBOUNCE_MS = 500

/**
 * Convert a DBML string into React Flow nodes and edges.
 *
 * Pipeline (runs after 500ms of input inactivity):
 *   dbml string → parseDBML → buildDiagramGraph → layoutGraph → useDiagramData
 *
 * Returns:
 *   nodes  — React Flow Node<TableNodeData>[] ready for <ReactFlow>
 *   edges  — React Flow Edge[] ready for <ReactFlow>
 *   error  — parse/validation error message, or null when the schema is valid
 *
 * While the DBML is invalid, nodes and edges retain the last valid values so
 * the diagram does not disappear while the user is mid-edit.
 */
export function useDBMLDiagram(dbml: string): DBMLDiagramState {
  const [state, setState] = useState<DBMLDiagramState>(() =>
    buildState(dbml),
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setState((prev) => buildState(dbml, prev))
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [dbml])

  return state
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildState(
  dbml: string,
  prev?: DBMLDiagramState,
): DBMLDiagramState {
  try {
    const schema = parseDBML(dbml)
    const graph = buildDiagramGraph(schema)
    const layout = layoutGraph(graph)
    return {
      nodes: toFlowNodes(layout),
      edges: toFlowEdges(layout),
      error: null,
    }
  } catch (err) {
    return {
      // Keep last valid diagram while schema is broken
      nodes: prev?.nodes ?? [],
      edges: prev?.edges ?? [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function toFlowNodes(layout: ReturnType<typeof layoutGraph>): Node<TableNodeData>[] {
  return layout.nodes.map((n) => ({
    id: n.id,
    type: 'tableNode',
    position: { x: n.x, y: n.y },
    data: { tableName: n.tableName, columns: n.columns },
    style: { width: n.width },
    draggable: true,
    selectable: true,
  }))
}

function toFlowEdges(layout: ReturnType<typeof layoutGraph>): Edge[] {
  return layout.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    sourceHandle: `${e.fromColumn}-source`,
    targetHandle: `${e.toColumn}-target`,
    type: 'smoothstep',
    label: cardinalityLabel(e.direction),
    labelStyle: { fontSize: 11, fill: '#64748b', fontWeight: 600 },
    labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    animated: false,
  }))
}

function cardinalityLabel(direction: '>' | '<' | '-'): string {
  if (direction === '>') return 'N:1'
  if (direction === '<') return '1:N'
  return '1:1'
}
