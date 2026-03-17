import type { DatabaseSchema, TableNode, ColumnNode, RelationNode, RelationDirection } from './ast'
import { type Token, type TokenType } from './tokenizer'

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly col: number
  ) {
    super(`Line ${line}, Column ${col}: ${message}`)
    this.name = 'ParseError'
  }
}

class Parser {
  private pos = 0

  constructor(private readonly tokens: Token[]) {}

  // ── Primitives ──────────────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]
    // Never move past EOF so callers can never over-read the token array.
    if (tok.type !== 'EOF') this.pos++
    return tok
  }

  private check(...types: TokenType[]): boolean {
    return types.includes(this.peek().type)
  }

  private expect(type: TokenType): Token {
    const tok = this.peek()
    if (tok.type !== type) {
      throw new ParseError(
        `Expected ${type} but got ${tok.type}${tok.value ? ` ('${tok.value}')` : ''}`,
        tok.line,
        tok.col
      )
    }
    return this.advance()
  }

  // Accepts any token that can appear in name position: plain identifiers plus
  // all keywords (so that reserved words like 'ref', 'pk', 'null', and even
  // 'Table' can legally be used as table/column names).
  private expectIdentifier(): Token {
    const tok = this.peek()
    if (
      tok.type === 'IDENTIFIER'    ||
      tok.type === 'KEYWORD_TABLE' ||
      tok.type === 'KEYWORD_REF'   ||
      tok.type === 'KEYWORD_PK'    ||
      tok.type === 'KEYWORD_UNIQUE'||
      tok.type === 'KEYWORD_NOT'   ||
      tok.type === 'KEYWORD_NULL'  ||
      tok.type === 'KEYWORD_NOTE'
    ) {
      return this.advance()
    }
    throw new ParseError(
      `Expected IDENTIFIER but got ${tok.type}${tok.value ? ` ('${tok.value}')` : ''}`,
      tok.line,
      tok.col
    )
  }

  // ── Grammar rules ───────────────────────────────────────────────────────────

  // database ::= statement*
  parse(): DatabaseSchema {
    const tables: TableNode[] = []
    const relations: RelationNode[] = []

    while (!this.check('EOF')) {
      // Only table definitions are top-level statements in this grammar.
      if (!this.check('KEYWORD_TABLE')) {
        const tok = this.peek()
        throw new ParseError(
          `Expected KEYWORD_TABLE but got ${tok.type}${tok.value ? ` ('${tok.value}')` : ''}`,
          tok.line,
          tok.col
        )
      }
      const { table, tableRelations } = this.parseTableDefinition()
      tables.push(table)
      relations.push(...tableRelations)
    }

    return { tables, relations }
  }

  // table_definition ::= "Table" identifier "{" column_definition* "}"
  private parseTableDefinition(): { table: TableNode; tableRelations: RelationNode[] } {
    this.expect('KEYWORD_TABLE')
    const nameTok = this.expectIdentifier()
    this.expect('LBRACE')

    const columns: ColumnNode[] = []
    const tableRelations: RelationNode[] = []

    while (!this.check('RBRACE', 'EOF')) {
      const { column, relation } = this.parseColumnDefinition(nameTok.value)
      columns.push(column)
      if (relation) tableRelations.push(relation)
    }

    // If we exited the loop because of EOF the closing brace is missing.
    this.expect('RBRACE')

    return { table: { name: nameTok.value, columns }, tableRelations }
  }

  // column_definition ::= identifier type column_option*
  // column_option     ::= "[" option_list "]"
  private parseColumnDefinition(
    tableName: string
  ): { column: ColumnNode; relation: RelationNode | null } {
    const nameTok = this.expectIdentifier()
    const typeTok = this.expectIdentifier()

    let primaryKey = false
    let unique = false
    let notNull = false
    let relation: RelationNode | null = null
    let note: string | null = null

    if (this.check('LBRACKET')) {
      this.advance() // consume [

      // option_list ::= option ("," option)*
      const first = this.parseOption(tableName, nameTok.value)
      if (first.primaryKey) primaryKey = true
      if (first.unique) unique = true
      if (first.notNull) notNull = true
      if (first.relation) relation = first.relation
      if (first.note !== null) note = first.note

      while (this.check('COMMA')) {
        this.advance() // consume ,
        const next = this.parseOption(tableName, nameTok.value)
        if (next.primaryKey) primaryKey = true
        if (next.unique) unique = true
        if (next.notNull) notNull = true
        if (next.relation) relation = next.relation
        if (next.note !== null) note = next.note
      }

      this.expect('RBRACKET')
    }

    // Build references from the relation if present (renderer semantics only).
    const references = relation
      ? { table: relation.toTable, column: relation.toColumn, direction: relation.direction }
      : null

    const column: ColumnNode = {
      name: nameTok.value,
      type: typeTok.value,
      ...(primaryKey  ? { primaryKey }  : {}),
      ...(unique      ? { unique }      : {}),
      ...(notNull     ? { notNull }     : {}),
      ...(references  ? { references }  : {}),
      ...(note !== null ? { note }      : {}),
    }

    return { column, relation }
  }

  // option ::= "pk" | "not null" | "unique" | reference_option | note_option
  private parseOption(
    tableName: string,
    columnName: string
  ): { primaryKey: boolean; unique: boolean; notNull: boolean; relation: RelationNode | null; note: string | null } {
    let primaryKey = false
    let unique = false
    let notNull = false
    let relation: RelationNode | null = null
    let note: string | null = null

    if (this.check('KEYWORD_PK')) {
      this.advance()
      primaryKey = true
    } else if (this.check('KEYWORD_UNIQUE')) {
      this.advance()
      unique = true
    } else if (this.check('KEYWORD_NOT')) {
      this.advance()
      this.expect('KEYWORD_NULL')
      notNull = true
    } else if (this.check('KEYWORD_REF')) {
      relation = this.parseReferenceOption(tableName, columnName)
    } else if (this.check('KEYWORD_NOTE')) {
      note = this.parseNoteOption()
    } else {
      const tok = this.peek()
      throw new ParseError(
        `Unknown column option: got ${tok.type}${tok.value ? ` ('${tok.value}')` : ''}. Expected pk, unique, not null, ref, or note`,
        tok.line,
        tok.col
      )
    }

    return { primaryKey, unique, notNull, relation, note }
  }

  // note_option ::= "note" ":" STRING
  private parseNoteOption(): string {
    this.expect('KEYWORD_NOTE')
    this.expect('COLON')
    const strTok = this.expect('STRING')
    return strTok.value
  }

  // reference_option ::= "ref:" relation_direction identifier "." identifier
  private parseReferenceOption(fromTable: string, fromColumn: string): RelationNode {
    this.expect('KEYWORD_REF')
    this.expect('COLON')

    const dirTok = this.peek()
    let direction: RelationDirection

    if (this.check('REL_GT')) {
      direction = '>'
      this.advance()
    } else if (this.check('REL_LT')) {
      direction = '<'
      this.advance()
    } else if (this.check('REL_DASH')) {
      direction = '-'
      this.advance()
    } else {
      throw new ParseError(
        `Expected relation direction ('>', '<', or '-') but got ${dirTok.type}${dirTok.value ? ` ('${dirTok.value}')` : ''}`,
        dirTok.line,
        dirTok.col
      )
    }

    const toTableTok = this.expectIdentifier()
    this.expect('DOT')
    const toColumnTok = this.expectIdentifier()

    return {
      fromTable,
      fromColumn,
      toTable:   toTableTok.value,
      toColumn:  toColumnTok.value,
      direction,
    }
  }
}

export function parse(tokens: Token[]): DatabaseSchema {
  return new Parser(tokens).parse()
}
