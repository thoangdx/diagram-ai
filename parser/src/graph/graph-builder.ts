import type { DatabaseSchema } from '../ast'
import type { DiagramGraph, DiagramNode, DiagramEdge } from './types'

/**
 * Build a DiagramGraph from a validated DatabaseSchema AST.
 *
 * Transformation rules:
 *   - Each TableNode  → one DiagramNode  (id = tableName)
 *   - Each RelationNode → one DiagramEdge (id = fromTable_fromColumn_toTable_toColumn)
 *
 * The returned graph carries no layout coordinates. Pass it to the layout
 * engine (layoutGraph) to obtain positioned nodes and edges.
 *
 * Precondition: `schema` must be a validated DatabaseSchema (i.e. produced by
 * `parseDBML`, not raw `parse`). Passing an unvalidated schema may result in
 * edges whose `from`/`to` reference non-existent node ids.
 */
export function buildDiagramGraph(schema: DatabaseSchema): DiagramGraph {
  const nodes: DiagramNode[] = schema.tables.map((table) => ({
    id: table.name,
    tableName: table.name,
    columns: table.columns,
  }))

  const edges: DiagramEdge[] = schema.relations.map((rel) => ({
    id: `${rel.fromTable}_${rel.fromColumn}_${rel.toTable}_${rel.toColumn}`,
    from: rel.fromTable,
    to: rel.toTable,
    fromColumn: rel.fromColumn,
    toColumn: rel.toColumn,
    direction: rel.direction,
  }))

  return { nodes, edges }
}
