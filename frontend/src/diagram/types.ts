import type { ColumnNode } from '@dbdiagram/parser'
import type { Node, Edge } from 'reactflow'

/**
 * Data payload carried by a TableNode in the React Flow graph.
 *
 * This is the `data` field of the React Flow Node — it holds everything
 * the TableNode component needs to render the table card.
 */
export interface TableNodeData {
  tableName: string
  columns: ColumnNode[]
}

/**
 * A React Flow node typed to hold TableNodeData.
 * Used for `nodes` arrays passed to ReactFlow.
 */
export type TableFlowNode = Node<TableNodeData>

/**
 * A React Flow edge for diagram relationships.
 * Standard React Flow Edge — no custom data needed at render time.
 */
export type DiagramFlowEdge = Edge
