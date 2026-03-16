import type { DiagramGraph } from '../graph/types'
import type { LayoutResult } from './types'
import { runDagreLayout } from './dagre-layout'

/**
 * Compute layout coordinates for a DiagramGraph.
 *
 * This is the single public entry point for the layout stage.
 * It accepts a coordinate-free DiagramGraph (produced by buildDiagramGraph)
 * and returns a LayoutResult where every node has pixel x/y/width/height.
 *
 * Typical call sequence:
 *
 *   const schema = parseDBML(dbmlText)          // DBML → validated AST
 *   const graph  = buildDiagramGraph(schema)    // AST  → graph model
 *   const layout = layoutGraph(graph)           // graph → positioned nodes
 *
 * The function is pure: the same DiagramGraph always produces the same
 * LayoutResult. It has no side effects and no internal state.
 *
 * Precondition: `graph` should be built from a validated schema (via
 * parseDBML). An invalid graph (edges referencing non-existent node ids)
 * will cause dagre to silently drop the offending edges.
 */
export function layoutGraph(graph: DiagramGraph): LayoutResult {
  return runDagreLayout(graph)
}
