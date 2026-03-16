'use client'

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'

import type { Node, Edge } from 'reactflow'
import { TableNode } from './TableNode'
import type { TableNodeData } from './types'

/**
 * Node type registry — defined at module level so the reference is stable
 * across renders. A new object on every render would cause React Flow to
 * unmount and remount all nodes.
 */
const nodeTypes = { tableNode: TableNode }

interface DiagramCanvasProps {
  nodes: Node<TableNodeData>[]
  edges: Edge[]
}

function DiagramCanvasInner({ nodes, edges }: DiagramCanvasProps) {
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

export function DiagramCanvas({ nodes, edges }: DiagramCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <DiagramCanvasInner nodes={nodes} edges={edges} />
      </ReactFlowProvider>
    </div>
  )
}
