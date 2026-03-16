import dagre from 'dagre'
import type { DiagramGraph } from '../graph/types'
import type { LayoutResult, PositionedNode, PositionedEdge } from './types'
import { computeNodeSize } from './node-size'

/**
 * Dagre graph configuration.
 *
 * rankdir: 'LR'  — tables are laid out left-to-right (columns → rows in dagre
 *                  terminology). This matches the natural reading direction for
 *                  ER diagrams where foreign keys point right.
 * ranksep: 80    — horizontal gap between columns of tables (pixels)
 * nodesep: 40    — vertical gap between tables in the same column (pixels)
 */
const GRAPH_CONFIG: dagre.GraphLabel = {
  rankdir: 'LR',
  ranksep: 80,
  nodesep: 40,
}

/**
 * Run the Dagre layout algorithm on a DiagramGraph and return positioned
 * nodes and edges.
 *
 * Pipeline:
 *   1. Create a new dagre.graphlib.Graph
 *   2. Register each DiagramNode with its computed pixel dimensions
 *   3. Register each DiagramEdge as a directed dagre edge
 *   4. Call dagre.layout() to compute coordinates
 *   5. Extract x/y from each node — dagre returns the center of the node,
 *      so subtract half width/height to get the top-left corner that
 *      React Flow expects
 *   6. Return PositionedNode[] and PositionedEdge[] (edges are passed through
 *      unchanged — React Flow draws edge paths from node handles)
 *
 * Isolated graphs (tables with no relations) are handled correctly: dagre
 * places disconnected nodes in separate rank columns.
 */
export function runDagreLayout(graph: DiagramGraph): LayoutResult {
  const g = new dagre.graphlib.Graph()
  g.setGraph(GRAPH_CONFIG)
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of graph.nodes) {
    const { width, height } = computeNodeSize(node)
    g.setNode(node.id, { width, height })
  }

  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to)
  }

  dagre.layout(g)

  const nodes: PositionedNode[] = graph.nodes.map((node) => {
    const dagreNode = g.node(node.id)
    const { width, height } = dagreNode
    return {
      ...node,
      // dagre centers nodes — convert to top-left origin for React Flow
      x: dagreNode.x - width / 2,
      y: dagreNode.y - height / 2,
      width,
      height,
    }
  })

  const edges: PositionedEdge[] = graph.edges.map((edge) => ({ ...edge }))

  return { nodes, edges }
}
