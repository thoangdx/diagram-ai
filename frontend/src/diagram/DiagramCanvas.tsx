'use client'

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'

import type { LayoutResult } from '@dbdiagram/parser'
import { TableNode } from './TableNode'
import { useDiagramData } from './hooks/useDiagramData'

/**
 * Node type registry for React Flow.
 *
 * Defined outside the component so the object reference is stable across
 * renders. Defining it inside the component would cause React Flow to
 * unmount and remount all nodes on every render.
 */
const nodeTypes = { tableNode: TableNode }

interface DiagramCanvasProps {
  layout: LayoutResult
}

/**
 * Inner component that uses React Flow hooks.
 * Must be a child of ReactFlowProvider.
 */
function DiagramCanvasInner({ layout }: DiagramCanvasProps) {
  const { nodes, edges } = useDiagramData(layout)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ type: 'smoothstep' }}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#e2e8f0"
      />
      <Controls
        showInteractive={false}
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      />
      <MiniMap
        nodeColor="#1e293b"
        maskColor="rgba(248,250,252,0.85)"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 8,
        }}
      />
    </ReactFlow>
  )
}

/**
 * React Flow diagram canvas that renders a LayoutResult as an ER diagram.
 *
 * Accepts a LayoutResult (produced by layoutGraph) and transforms it into
 * React Flow nodes and edges via the useDiagramData hook.
 *
 * Each table node is rendered by TableNode, which shows:
 *   - Table name header
 *   - Column rows with type annotations and PK/Unique/NotNull badges
 *   - Per-column handles for precise edge connections
 *
 * The canvas supports:
 *   - fitView: diagram is auto-zoomed to fit on mount
 *   - zoom: scroll wheel or pinch to zoom
 *   - pan: click-drag to pan the canvas
 *   - minimap: overview panel (bottom-right)
 *   - controls: zoom in/out/fit buttons (bottom-left)
 *
 * Wrapped in ReactFlowProvider so internal React Flow hooks work correctly
 * even when the parent tree has no existing provider.
 */
export function DiagramCanvas({ layout }: DiagramCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <DiagramCanvasInner layout={layout} />
      </ReactFlowProvider>
    </div>
  )
}
