import type { ColumnNode, RelationDirection } from '../ast'

/**
 * A node in the diagram graph. Represents one database table.
 *
 * `id` equals `tableName` and is used as the stable identifier throughout
 * the graph pipeline (layout engine, React Flow renderer, etc.).
 * Keeping both fields makes intent explicit at call sites.
 */
export interface DiagramNode {
  id: string
  tableName: string
  columns: ColumnNode[]
}

/**
 * An edge in the diagram graph. Represents one relationship between tables.
 *
 * `id` is deterministic and built from all four name parts:
 *   `{fromTable}_{fromColumn}_{toTable}_{toColumn}`
 * Example: `orders_user_id_users_id`
 *
 * `from` and `to` match the `id` fields of the source/target DiagramNode,
 * making it straightforward to look up endpoints by node id.
 *
 * `direction` mirrors the DBML ref direction:
 *   '>'  many-to-one   (orders.user_id > users.id)
 *   '<'  one-to-many   (users.id < orders.user_id)
 *   '-'  one-to-one
 */
export interface DiagramEdge {
  id: string
  from: string
  to: string
  fromColumn: string
  toColumn: string
  direction: RelationDirection
}

/**
 * The complete diagram graph model produced from a DatabaseSchema AST.
 * Contains no layout coordinates — those are added by the layout engine.
 */
export interface DiagramGraph {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}
