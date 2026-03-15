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
