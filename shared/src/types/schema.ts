// AST types — mirrors the DBML grammar spec

export interface DatabaseSchema {
  tables: TableNode[]
  relations: RelationNode[]
}

export interface TableNode {
  name: string
  columns: ColumnNode[]
}

export interface ColumnNode {
  name: string
  type: string
  primaryKey?: boolean
  unique?: boolean
  notNull?: boolean
  /**
   * Populated when the column carries a `ref:` option.
   * Used by the renderer to display FK badges without querying the
   * schema-level relations array.
   * The graph builder continues to use schema.relations for edges —
   * this field is purely for renderer semantics.
   */
  references?: {
    table: string
    column: string
    direction: RelationDirection
  }
  /**
   * Populated when the column carries a `note: '…'` option.
   * Used by the renderer to display tooltips.
   */
  note?: string
}

export type RelationDirection = '>' | '<' | '-'

export interface RelationNode {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  direction: RelationDirection
}

// Layout engine types

export interface GraphNode {
  id: string
  width: number
  height: number
}

export interface GraphEdge {
  from: string
  to: string
}

export interface PositionedNode extends GraphNode {
  x: number
  y: number
}

export interface PositionedEdge extends GraphEdge {
  points?: Array<{ x: number; y: number }>
}

export interface LayoutResult {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}
