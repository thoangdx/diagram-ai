import { parseDBML, DBMLError } from '../index'
import { tokenize, TokenizeError } from '../tokenizer'
import { validate } from '../validator'
import { parse } from '../parser'

// ── Tokenizer ─────────────────────────────────────────────────────────────────

describe('tokenizer', () => {
  it('tokenizes a simple table', () => {
    const tokens = tokenize('Table users { id int }')
    const types = tokens.map((t) => t.type)
    expect(types).toEqual([
      'KEYWORD_TABLE',
      'IDENTIFIER',
      'LBRACE',
      'IDENTIFIER',
      'IDENTIFIER',
      'RBRACE',
      'EOF',
    ])
  })

  it('tokenizes column options', () => {
    const tokens = tokenize('[pk, not null, unique]')
    const types = tokens.map((t) => t.type)
    expect(types).toEqual([
      'LBRACKET',
      'KEYWORD_PK',
      'COMMA',
      'KEYWORD_NOT',
      'KEYWORD_NULL',
      'COMMA',
      'KEYWORD_UNIQUE',
      'RBRACKET',
      'EOF',
    ])
  })

  it('tokenizes ref option', () => {
    const tokens = tokenize('[ref: > users.id]')
    const types = tokens.map((t) => t.type)
    expect(types).toEqual([
      'LBRACKET',
      'KEYWORD_REF',
      'COLON',
      'REL_GT',
      'IDENTIFIER',
      'DOT',
      'IDENTIFIER',
      'RBRACKET',
      'EOF',
    ])
  })

  it('skips single-line comments', () => {
    const tokens = tokenize('// this is a comment\nTable users {}')
    expect(tokens[0].type).toBe('KEYWORD_TABLE')
  })

  it('throws on unexpected character', () => {
    expect(() => tokenize('Table users { id int@ }')).toThrow(TokenizeError)
  })

  it('tracks line and column numbers', () => {
    const tokens = tokenize('Table\nusers')
    expect(tokens[0]).toMatchObject({ type: 'KEYWORD_TABLE', line: 1, col: 1 })
    expect(tokens[1]).toMatchObject({ type: 'IDENTIFIER', value: 'users', line: 2, col: 1 })
  })
})

// ── Parser ────────────────────────────────────────────────────────────────────

describe('parser', () => {
  it('parses an empty table', () => {
    const schema = parseDBML('Table users {}')
    expect(schema.tables).toHaveLength(1)
    expect(schema.tables[0].name).toBe('users')
    expect(schema.tables[0].columns).toHaveLength(0)
  })

  it('parses columns with types', () => {
    const schema = parseDBML('Table users { id int\n name varchar }')
    expect(schema.tables[0].columns).toEqual([
      { name: 'id', type: 'int' },
      { name: 'name', type: 'varchar' },
    ])
  })

  it('parses pk option', () => {
    const schema = parseDBML('Table users { id int [pk] }')
    expect(schema.tables[0].columns[0].primaryKey).toBe(true)
  })

  it('parses unique option', () => {
    const schema = parseDBML('Table users { email varchar [unique] }')
    expect(schema.tables[0].columns[0].unique).toBe(true)
  })

  it('parses not null option', () => {
    const schema = parseDBML('Table users { name varchar [not null] }')
    expect(schema.tables[0].columns[0].notNull).toBe(true)
  })

  it('parses multiple options', () => {
    const schema = parseDBML('Table users { email varchar [not null, unique] }')
    const col = schema.tables[0].columns[0]
    expect(col.notNull).toBe(true)
    expect(col.unique).toBe(true)
  })

  it('parses ref > (many-to-one)', () => {
    const schema = parseDBML(`
      Table users { id int [pk] }
      Table orders { user_id int [ref: > users.id] }
    `)
    expect(schema.relations).toHaveLength(1)
    expect(schema.relations[0]).toEqual({
      fromTable: 'orders',
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
      direction: '>',
    })
  })

  it('parses ref < (one-to-many)', () => {
    const schema = parseDBML(`
      Table users { id int [pk] }
      Table orders { id int [ref: < users.id] }
    `)
    expect(schema.relations[0].direction).toBe('<')
  })

  it('parses ref - (one-to-one)', () => {
    const schema = parseDBML(`
      Table users { id int [pk] }
      Table profiles { id int [ref: - users.id] }
    `)
    expect(schema.relations[0].direction).toBe('-')
  })

  it('parses multiple tables', () => {
    const schema = parseDBML(`
      Table users { id int [pk] }
      Table orders { id int [pk] }
      Table payments { id int [pk] }
    `)
    expect(schema.tables).toHaveLength(3)
  })

  it('throws on missing closing brace', () => {
    expect(() => parseDBML('Table users { id int')).toThrow()
  })
})

// ── Validator ─────────────────────────────────────────────────────────────────

describe('validator', () => {
  it('reports duplicate table names', () => {
    const tokens = tokenize('Table users { id int } Table users { name varchar }')
    const ast = parse(tokens)
    const errors = validate(ast)
    expect(errors.some((e) => e.message.includes("Duplicate table name 'users'"))).toBe(true)
  })

  it('reports duplicate column names within a table', () => {
    const tokens = tokenize('Table users { id int\n id varchar }')
    const ast = parse(tokens)
    const errors = validate(ast)
    expect(errors.some((e) => e.message.includes("Duplicate column name 'id'"))).toBe(true)
  })

  it('reports relation to unknown table', () => {
    const tokens = tokenize('Table orders { user_id int [ref: > ghost.id] }')
    const ast = parse(tokens)
    const errors = validate(ast)
    expect(errors.some((e) => e.message.includes("unknown table 'ghost'"))).toBe(true)
  })

  it('reports relation to unknown column', () => {
    const tokens = tokenize('Table users { id int } Table orders { user_id int [ref: > users.nope] }')
    const ast = parse(tokens)
    const errors = validate(ast)
    expect(errors.some((e) => e.message.includes("unknown column 'nope'"))).toBe(true)
  })

  it('passes a valid schema', () => {
    const tokens = tokenize(`
      Table users { id int [pk] }
      Table orders { id int [pk]\n user_id int [ref: > users.id] }
    `)
    const ast = parse(tokens)
    expect(validate(ast)).toHaveLength(0)
  })
})

// ── Public API ────────────────────────────────────────────────────────────────

describe('parseDBML', () => {
  it('returns a complete DatabaseSchema', () => {
    const schema = parseDBML(`
      Table users {
        id int [pk]
        name varchar [not null]
        email varchar [not null, unique]
      }

      Table orders {
        id int [pk]
        user_id int [ref: > users.id]
        created_at timestamp
      }
    `)

    expect(schema.tables).toHaveLength(2)
    expect(schema.relations).toHaveLength(1)

    const users = schema.tables.find((t) => t.name === 'users')!
    expect(users.columns).toHaveLength(3)
    expect(users.columns[0]).toEqual({ name: 'id', type: 'int', primaryKey: true })
    expect(users.columns[1]).toEqual({ name: 'name', type: 'varchar', notNull: true })
    expect(users.columns[2]).toEqual({ name: 'email', type: 'varchar', notNull: true, unique: true })

    expect(schema.relations[0]).toEqual({
      fromTable: 'orders',
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
      direction: '>',
    })
  })

  it('throws DBMLError on validation failure', () => {
    expect(() =>
      parseDBML('Table users { id int } Table users { name varchar }')
    ).toThrow(DBMLError)
  })
})
