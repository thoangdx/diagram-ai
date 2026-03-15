import { tokenize, TokenizeError } from './tokenizer'
import { parse, ParseError } from './parser'
import { validate } from './validator'
import type { DatabaseSchema } from './ast'

export { tokenize, parse, validate }
export { TokenizeError, ParseError }
export type { DatabaseSchema }
export type { ValidationError } from './validator'
export type { Token, TokenType } from './tokenizer'

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
