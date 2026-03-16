import { tokenize, TokenizeError } from './tokenizer'
import { parse, ParseError } from './parser'
import { validate } from './validator'
import type { DatabaseSchema } from './ast'

export { tokenize, parse, validate }
export { TokenizeError, ParseError }
export type { DatabaseSchema }
export type { ValidationError } from './validator'
export type { Token, TokenType } from './tokenizer'

export { buildDiagramGraph } from './graph'
export type { DiagramGraph, DiagramNode, DiagramEdge } from './graph'

export { layoutGraph, computeNodeSize, HEADER_HEIGHT, ROW_HEIGHT, PADDING, NODE_WIDTH } from './layout'
export type { LayoutResult, PositionedNode, PositionedEdge, NodeSize } from './layout'

export class DBMLError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DBMLError'
  }
}

/**
 * Parse a DBML string and return a validated DatabaseSchema AST.
 * Throws DBMLError if the input is syntactically or semantically invalid.
 */
export function parseDBML(schema: string): DatabaseSchema {
  const tokens = tokenize(schema)
  const ast = parse(tokens)

  const errors = validate(ast)
  if (errors.length > 0) {
    throw new DBMLError(errors.map((e) => e.message).join('\n'))
  }

  return ast
}
