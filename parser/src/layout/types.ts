import type { DiagramNode, DiagramEdge } from '../graph/types'

/**
 * Pixel dimensions for one table node.
 * Computed from column count by node-size.ts.
 */
export interface NodeSize {
  width: number
  height: number
}

/**
 * A DiagramNode with layout coordinates attached.
 *
 * `x` and `y` are the top-left corner of the node rectangle, in pixels.
 * `width` and `height` are the computed pixel dimensions of the node.
 *
 * These values are produced by the layout engine and consumed by the
 * React Flow renderer, which expects top-left positioning.
 */
export interface PositionedNode extends DiagramNode {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A DiagramEdge after layout.
 *
 * Edges carry no additional coordinate data at this stage — React Flow
 * derives edge paths from the source/target node positions and handles.
 * The type alias keeps the pipeline symmetric and allows future extension
 * (e.g. adding waypoints) without changing call sites.
 */
export type PositionedEdge = DiagramEdge

/**
 * The output of the layout engine.
 *
 * Contains the same nodes and edges as the input DiagramGraph, but nodes
 * now carry pixel coordinates and dimensions. Edges are preserved unchanged.
 *
 * Pass this directly to the React Flow renderer:
 *   nodes → ReactFlow nodes with position: { x, y }
 *   edges → ReactFlow edges with source/target ids
 */
export interface LayoutResult {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}
