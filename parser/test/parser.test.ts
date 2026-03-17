/**
 * Standalone test suite for the DBML parser.
 * Run with:  npx ts-node test/parser.test.ts
 */

import { parseDBML, tokenize, parse, validate, DBMLError, TokenizeError, ParseError } from '../src/index'

// ── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(description: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✓  ${description}`)
    passed++
  } catch (err) {
    console.error(`  ✗  ${description}`)
    console.error(`       ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertEqual<T>(actual: T, expected: T, label = ''): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${label ? label + ': ' : ''}expected ${e}, got ${a}`)
}

function assertThrows(fn: () => unknown, expectedClass?: Function): void {
  let threw = false
  try {
    fn()
  } catch (err) {
    threw = true
    if (expectedClass && !(err instanceof expectedClass)) {
      throw new Error(
        `Expected ${expectedClass.name} to be thrown but got ${
          err instanceof Error ? err.constructor.name : typeof err
        }: ${err}`
      )
    }
  }
  if (!threw) throw new Error('Expected function to throw but it did not')
}

function assertErrorContains(fn: () => unknown, substring: string): void {
  try {
    fn()
    throw new Error(`Expected function to throw but it did not`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes(substring)) {
      throw new Error(`Error message "${message}" does not contain "${substring}"`)
    }
  }
}

// ── 1. Basic table ───────────────────────────────────────────────────────────

console.log('\n1. Basic table')

test('parses a simple table with one column', () => {
  const schema = parseDBML('Table users { id int }')
  assert(schema.tables.length === 1, 'should have 1 table')
  assertEqual(schema.tables[0].name, 'users', 'table name')
  assert(schema.tables[0].columns.length === 1, 'should have 1 column')
  assertEqual(schema.tables[0].columns[0], { name: 'id', type: 'int' }, 'column')
})

test('parses an empty table', () => {
  const schema = parseDBML('Table empty {}')
  assertEqual(schema.tables[0].columns.length, 0, 'no columns')
  assertEqual(schema.relations.length, 0, 'no relations')
})

test('parses multiple columns', () => {
  const schema = parseDBML(`Table users {
    id   int
    name varchar
    age  int
  }`)
  assertEqual(schema.tables[0].columns.length, 3, 'column count')
  assertEqual(schema.tables[0].columns[1].name, 'name', 'second column name')
  assertEqual(schema.tables[0].columns[1].type, 'varchar', 'second column type')
})

test('parses multiple tables', () => {
  const schema = parseDBML('Table a { id int } Table b { id int } Table c { id int }')
  assertEqual(schema.tables.length, 3, 'table count')
  assertEqual(schema.tables.map((t) => t.name), ['a', 'b', 'c'], 'table names')
})

// ── 2. Primary key ───────────────────────────────────────────────────────────

console.log('\n2. Primary key')

test('parses [pk] option', () => {
  const schema = parseDBML('Table users { id int [pk] }')
  assertEqual(schema.tables[0].columns[0].primaryKey, true, 'primaryKey')
})

test('pk does not set other flags', () => {
  const col = parseDBML('Table users { id int [pk] }').tables[0].columns[0]
  assert(col.unique === undefined, 'unique should be absent')
  assert(col.notNull === undefined, 'notNull should be absent')
})

test('parses [pk, not null, unique] together', () => {
  const col = parseDBML('Table users { id int [pk, not null, unique] }').tables[0].columns[0]
  assertEqual(col.primaryKey, true, 'primaryKey')
  assertEqual(col.notNull, true, 'notNull')
  assertEqual(col.unique, true, 'unique')
})

// ── 3. Foreign key ───────────────────────────────────────────────────────────

console.log('\n3. Foreign key')

test('parses ref: > (many-to-one)', () => {
  const schema = parseDBML(`
    Table users  { id int [pk] }
    Table orders { id int [pk]  user_id int [ref: > users.id] }
  `)
  assertEqual(schema.relations.length, 1, 'relation count')
  assertEqual(schema.relations[0], {
    fromTable: 'orders', fromColumn: 'user_id',
    toTable:   'users',  toColumn:   'id',
    direction: '>',
  }, 'relation')
})

test('parses ref: < (one-to-many)', () => {
  const schema = parseDBML(`
    Table users  { id int [pk] }
    Table orders { id int [ref: < users.id] }
  `)
  assertEqual(schema.relations[0].direction, '<', 'direction')
})

test('parses ref: - (one-to-one)', () => {
  const schema = parseDBML(`
    Table users    { id int [pk] }
    Table profiles { id int [ref: - users.id] }
  `)
  assertEqual(schema.relations[0].direction, '-', 'direction')
})

test('ref combined with other options: [pk, ref: > t.id]', () => {
  const schema = parseDBML(`
    Table users  { id int [pk] }
    Table orders { user_id int [not null, ref: > users.id] }
  `)
  const col = schema.tables[1].columns[0]
  assertEqual(col.notNull, true, 'notNull')
  assertEqual(schema.relations[0].fromColumn, 'user_id', 'fromColumn')
})

test('multiple foreign keys in one table', () => {
  const schema = parseDBML(`
    Table users    { id int [pk] }
    Table products { id int [pk] }
    Table orders   {
      id         int [pk]
      user_id    int [ref: > users.id]
      product_id int [ref: > products.id]
    }
  `)
  assertEqual(schema.relations.length, 2, 'relation count')
})

// ── 4. Invalid reference ─────────────────────────────────────────────────────

console.log('\n4. Invalid reference (validation errors)')

test('rejects ref to unknown table', () => {
  assertThrows(
    () => parseDBML('Table orders { user_id int [ref: > ghost.id] }'),
    DBMLError
  )
})

test('DBMLError message names the missing table', () => {
  assertErrorContains(
    () => parseDBML('Table orders { user_id int [ref: > ghost.id] }'),
    "unknown table 'ghost'"
  )
})

test('rejects ref to unknown column', () => {
  assertThrows(
    () => parseDBML('Table users { id int } Table orders { uid int [ref: > users.nope] }'),
    DBMLError
  )
})

test('DBMLError message names the missing column', () => {
  assertErrorContains(
    () => parseDBML('Table users { id int } Table orders { uid int [ref: > users.nope] }'),
    "unknown column 'nope'"
  )
})

// ── 5. Duplicate column ──────────────────────────────────────────────────────

console.log('\n5. Duplicate column')

test('rejects duplicate column in same table', () => {
  assertThrows(
    () => parseDBML('Table users { id int  id varchar }'),
    DBMLError
  )
})

test('duplicate column error names the column', () => {
  assertErrorContains(
    () => parseDBML('Table users { id int  id varchar }'),
    "Duplicate column name 'id'"
  )
})

test('duplicate table names are rejected', () => {
  assertThrows(
    () => parseDBML('Table users { id int } Table users { name varchar }'),
    DBMLError
  )
})

test('same column name in different tables is allowed', () => {
  // Both tables have an 'id' column — this must succeed.
  const schema = parseDBML('Table a { id int } Table b { id int }')
  assertEqual(schema.tables.length, 2, 'table count')
})

// ── 6. Comment support ───────────────────────────────────────────────────────

console.log('\n6. Comment support')

test('ignores // comment before table', () => {
  const schema = parseDBML(`
    // This is the users table
    Table users { id int }
  `)
  assertEqual(schema.tables[0].name, 'users', 'table name')
})

test('ignores // comment after column', () => {
  const schema = parseDBML(`
    Table users {
      id int // primary key
      name varchar
    }
  `)
  assertEqual(schema.tables[0].columns.length, 2, 'column count')
})

test('ignores // comment between tables', () => {
  const schema = parseDBML(`
    Table a { x int }
    // separator
    Table b { y int }
  `)
  assertEqual(schema.tables.length, 2, 'table count')
})

test('ignores // comment at end of file (no trailing newline)', () => {
  const schema = parseDBML('Table users { id int } // end')
  assertEqual(schema.tables.length, 1, 'table count')
})

// ── 7. Trailing newline ──────────────────────────────────────────────────────

console.log('\n7. Trailing newline')

test('handles trailing newline after closing brace', () => {
  const schema = parseDBML('Table users { id int }\n')
  assertEqual(schema.tables.length, 1, 'table count')
})

test('handles multiple trailing newlines', () => {
  const schema = parseDBML('Table users { id int }\n\n\n')
  assertEqual(schema.tables.length, 1, 'table count')
})

test('handles empty input (only whitespace)', () => {
  const schema = parseDBML('   \n  \t  ')
  assertEqual(schema.tables.length, 0, 'no tables')
  assertEqual(schema.relations.length, 0, 'no relations')
})

// ── 8. Invalid syntax ────────────────────────────────────────────────────────

console.log('\n8. Invalid syntax')

test('throws ParseError on missing closing brace', () => {
  assertThrows(() => parseDBML('Table users { id int'), ParseError)
})

test('ParseError includes line number', () => {
  try {
    parseDBML('Table users { id int')
    throw new Error('Should have thrown')
  } catch (err) {
    assert(err instanceof ParseError, 'should be ParseError')
    assert((err as ParseError).line > 0, 'line should be set')
  }
})

test('ParseError includes column number', () => {
  try {
    parseDBML('Table users { id int')
    throw new Error('Should have thrown')
  } catch (err) {
    assert(err instanceof ParseError, 'should be ParseError')
    assert((err as ParseError).col > 0, 'col should be set')
  }
})

test('ParseError message matches "Line X, Column Y:" format', () => {
  try {
    parseDBML('Table users { id int')
    throw new Error('Should have thrown')
  } catch (err) {
    assert(err instanceof ParseError, 'should be ParseError')
    assert(/^Line \d+, Column \d+:/.test((err as ParseError).message), 'message format')
  }
})

test('throws TokenizeError on unknown character', () => {
  assertThrows(() => tokenize('Table users { id int@ }'), TokenizeError)
})

test('TokenizeError message matches "Line X, Column Y:" format', () => {
  try {
    tokenize('Table users { id int@ }')
    throw new Error('Should have thrown')
  } catch (err) {
    assert(err instanceof TokenizeError, 'should be TokenizeError')
    assert(/^Line \d+, Column \d+:/.test((err as TokenizeError).message), 'message format')
  }
})

test('throws ParseError on stray token at top level', () => {
  assertThrows(() => parseDBML('foo'), ParseError)
})

test('throws ParseError on missing column type', () => {
  // "id }": second expectIdentifier sees '}' which is not an identifier.
  assertThrows(() => parseDBML('Table users { id }'), ParseError)
})

// ── 9. Tokenizer details ─────────────────────────────────────────────────────

console.log('\n9. Tokenizer details')

test('tracks line/column for first token', () => {
  const toks = tokenize('Table')
  assertEqual(toks[0].line, 1, 'line')
  assertEqual(toks[0].col,  1, 'col')
})

test('tracks line/column across newlines', () => {
  const toks = tokenize('Table\nusers')
  assertEqual(toks[1].line, 2, 'second token line')
  assertEqual(toks[1].col,  1, 'second token col')
})

test('all relation direction tokens', () => {
  const toks = tokenize('> < -')
  assertEqual(toks[0].type, 'REL_GT',   'gt')
  assertEqual(toks[1].type, 'REL_LT',   'lt')
  assertEqual(toks[2].type, 'REL_DASH', 'dash')
})

test('identifiers with digits and underscores', () => {
  const toks = tokenize('user_id_2')
  assertEqual(toks[0].type,  'IDENTIFIER',  'type')
  assertEqual(toks[0].value, 'user_id_2',   'value')
})

// ── 10. Full integration ─────────────────────────────────────────────────────

console.log('\n10. Full integration')

test('full e-commerce schema', () => {
  const schema = parseDBML(`
    // Users
    Table users {
      id         int       [pk]
      email      varchar   [not null, unique]
      name       varchar
      created_at timestamp
    }

    // Products
    Table products {
      id    int     [pk]
      name  varchar [not null]
      price int     [not null]
    }

    // Orders
    Table orders {
      id         int       [pk]
      user_id    int       [ref: > users.id]
      created_at timestamp [not null]
    }

    // Order items
    Table order_items {
      id         int [pk]
      order_id   int [ref: > orders.id]
      product_id int [ref: > products.id]
      quantity   int [not null]
    }
  `)

  assertEqual(schema.tables.length, 4, 'table count')
  assertEqual(schema.relations.length, 3, 'relation count')

  const users = schema.tables.find((t) => t.name === 'users')!
  assert(users !== undefined, 'users table exists')
  assertEqual(users.columns.length, 4, 'users column count')

  const emailCol = users.columns.find((c) => c.name === 'email')!
  assertEqual(emailCol.notNull, true, 'email notNull')
  assertEqual(emailCol.unique, true, 'email unique')

  const rels = schema.relations
  assert(rels.some((r) => r.fromTable === 'orders'      && r.toTable === 'users'),    'orders→users rel')
  assert(rels.some((r) => r.fromTable === 'order_items' && r.toTable === 'orders'),   'items→orders rel')
  assert(rels.some((r) => r.fromTable === 'order_items' && r.toTable === 'products'), 'items→products rel')
})

// ── 11. Column note option ───────────────────────────────────────────────────

console.log('\n11. Column note option')

test('parses note with single quotes', () => {
  const schema = parseDBML(`Table t { email varchar [note: 'User email address'] }`)
  assertEqual(schema.tables[0].columns[0].note, 'User email address', 'note value')
})

test('parses note with double quotes', () => {
  const schema = parseDBML(`Table t { email varchar [note: "User email address"] }`)
  assertEqual(schema.tables[0].columns[0].note, 'User email address', 'note value')
})

test('note combined with other options', () => {
  const schema = parseDBML(`Table t { email varchar [not null, unique, note: 'Primary contact'] }`)
  const col = schema.tables[0].columns[0]
  assertEqual(col.notNull, true, 'notNull preserved')
  assertEqual(col.unique, true, 'unique preserved')
  assertEqual(col.note, 'Primary contact', 'note value')
})

test('note combined with pk', () => {
  const schema = parseDBML(`Table t { id int [pk, note: 'Auto increment PK'] }`)
  const col = schema.tables[0].columns[0]
  assertEqual(col.primaryKey, true, 'primaryKey preserved')
  assertEqual(col.note, 'Auto increment PK', 'note value')
})

test('note combined with ref', () => {
  const schema = parseDBML(`
    Table users { id int [pk] }
    Table orders { user_id int [ref: > users.id, note: 'Owner of the order'] }
  `)
  const col = schema.tables[1].columns[0]
  assertEqual(col.note, 'Owner of the order', 'note value')
  // relation still produced at schema level
  assertEqual(schema.relations.length, 1, 'relation count')
  assertEqual(schema.relations[0].fromColumn, 'user_id', 'relation fromColumn')
})

test('column without note has no note field', () => {
  const schema = parseDBML(`Table t { id int [pk] }`)
  assert(schema.tables[0].columns[0].note === undefined, 'note is absent')
})

test('note with empty string', () => {
  const schema = parseDBML(`Table t { id int [note: ''] }`)
  assertEqual(schema.tables[0].columns[0].note, '', 'empty note')
})

// ── 12. Column references field ───────────────────────────────────────────────

console.log('\n12. Column references field')

test('ref option populates column.references', () => {
  const schema = parseDBML(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  const col = schema.tables[1].columns[0]
  assert(col.references !== undefined, 'references is set')
  assertEqual(col.references!.table,     'users', 'references.table')
  assertEqual(col.references!.column,    'id',    'references.column')
  assertEqual(col.references!.direction, '>',     'references.direction')
})

test('references direction < is preserved', () => {
  const schema = parseDBML(`
    Table users  { id int [pk] }
    Table orders { id  int [ref: < users.id] }
  `)
  assertEqual(schema.tables[1].columns[0].references!.direction, '<', 'direction')
})

test('references direction - is preserved', () => {
  const schema = parseDBML(`
    Table users    { id int [pk] }
    Table profiles { id int [ref: - users.id] }
  `)
  assertEqual(schema.tables[1].columns[0].references!.direction, '-', 'direction')
})

test('column without ref has no references field', () => {
  const schema = parseDBML(`Table t { id int [pk] }`)
  assert(schema.tables[0].columns[0].references === undefined, 'references is absent')
})

test('schema.relations still produced alongside column.references', () => {
  const schema = parseDBML(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  // Both the column-level and schema-level representations exist
  assertEqual(schema.relations.length, 1, 'relation count')
  assertEqual(schema.relations[0].fromTable,  'orders',  'relation fromTable')
  assertEqual(schema.relations[0].fromColumn, 'user_id', 'relation fromColumn')
  assert(schema.tables[1].columns[0].references !== undefined, 'column.references set')
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log(`${'─'.repeat(50)}\n`)

if (failed > 0) process.exit(1)
