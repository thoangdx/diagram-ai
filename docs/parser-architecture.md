# DBML Parser Architecture

This document describes the internal architecture of the DBML parser module
(`parser/`). It is written for AI sessions and developers who need to maintain,
extend, or debug the parser without breaking the grammar or the AST contract.

Read this document before modifying any file in `parser/src/`.

---

## 1. Overview

The parser converts a raw DBML text string into a structured `DatabaseSchema`
AST that the rest of the system can consume.

### Role in the system pipeline

```
DBML text  (Monaco Editor)
  ↓
tokenizer  (parser/src/tokenizer.ts)
  ↓
token stream  [ {type, value, line, col}, ... ]
  ↓
recursive descent parser  (parser/src/parser.ts)
  ↓
unvalidated AST  { tables, relations }
  ↓
validator  (parser/src/validator.ts)
  ↓
validated DatabaseSchema AST
  ↓
layout engine  (dagre graph builder)
  ↓
React Flow renderer
```

The parser module is self-contained. It has one dependency: `@dbdiagram/shared`,
which owns the TypeScript types for the AST. The parser never imports from
`frontend/` or `backend/`.

### Public API

```ts
// parser/src/index.ts
parseDBML(schema: string): DatabaseSchema
```

This is the **only function callers should use**. It runs all three stages
(tokenize → parse → validate) and either returns a clean AST or throws a
`DBMLError` whose message lists every validation failure joined by newlines.

The lower-level functions `tokenize`, `parse`, and `validate` are also exported
for use in tests and tooling, but should not be called individually in
production code.

---

## 2. Parser Pipeline

The three stages are intentionally separated. Each has a single, narrow
responsibility.

### Stage 1 — Tokenizer (`tokenizer.ts`)

**Input:** raw string
**Output:** `Token[]`

Converts characters into a flat list of typed tokens. It knows nothing about
grammar — it does not know that `pk` appears inside brackets, or that `ref` is
followed by a colon. Its only job is to produce a stream of tokens with correct
type labels and source locations.

### Stage 2 — Parser (`parser.ts`)

**Input:** `Token[]`
**Output:** `DatabaseSchema` (unvalidated)

Walks the token stream according to the DBML grammar using recursive descent.
Produces the AST. Does not perform semantic checks (e.g. it does not check
whether a referenced table exists — that is the validator's job).

Separation reason: keeping grammar rules in the parser and semantic rules in the
validator makes each independently testable and easier to extend without
accidentally mixing concerns.

### Stage 3 — Validator (`validator.ts`)

**Input:** `DatabaseSchema`
**Output:** `ValidationError[]`

Applies semantic rules that cannot be expressed in the context-free grammar
(e.g. "every referenced table must exist"). Returns an array — all errors are
collected before returning, so callers see every problem at once rather than
one at a time.

Separation reason: a schema can be syntactically valid but semantically broken.
Separating validation lets consumers (e.g. an editor) display structural parse
errors and semantic errors independently.

---

## 3. Tokenizer Design

**File:** `parser/src/tokenizer.ts`

### Scanning model

The tokenizer is a single-pass, character-by-character scanner. It maintains
three mutable variables:

| Variable | Purpose |
|----------|---------|
| `pos` | Index of the next character to read in the input string |
| `line` | Current 1-based line number |
| `col` | Current 1-based column number of the **next** character |

Two internal helpers:

- `peek()` — returns `input[pos]` without advancing. Returns `''` at EOF.
- `advance()` — consumes `input[pos]`, increments `pos`, and updates `line`/`col`.
  If the consumed character is `\n`, increments `line` and resets `col` to `1`.
  Otherwise increments `col`.

Token locations are captured **before** calling `advance()` for the first
character of each token, so `token.line` and `token.col` always point to the
token's first character.

### Whitespace and comments

Whitespace (`\s` — spaces, tabs, `\r`, `\n`) is skipped unconditionally before
each token. The grammar is whitespace-insensitive: newlines between columns are
insignificant.

Single-line comments start with `//` and extend to (but not including) the next
`\n`. The entire comment is consumed and discarded. Block comments (`/* */`) are
**not** supported.

### Keyword resolution

All keywords are matched **case-sensitively**. The keyword table is:

| Lexeme  | Token type       | Notes |
|---------|------------------|-------|
| `Table` | `KEYWORD_TABLE`  | Capital T — intentional |
| `ref`   | `KEYWORD_REF`    | |
| `pk`    | `KEYWORD_PK`     | |
| `unique`| `KEYWORD_UNIQUE` | |
| `not`   | `KEYWORD_NOT`    | Separate from `null` |
| `null`  | `KEYWORD_NULL`   | Separate from `not` |

`not` and `null` are emitted as separate tokens so the parser can require them
to appear in sequence (`not` immediately followed by `null`) and produce a
precise error if one is missing.

Any word that is not in the keyword table becomes `IDENTIFIER`.

### Complete token type list

| Token type     | Character(s) | Used for |
|----------------|--------------|---------|
| `KEYWORD_TABLE`| `Table`      | Table statement opener |
| `KEYWORD_REF`  | `ref`        | Reference option |
| `KEYWORD_PK`   | `pk`         | Primary key option |
| `KEYWORD_UNIQUE`| `unique`    | Unique constraint option |
| `KEYWORD_NOT`  | `not`        | First token of `not null` |
| `KEYWORD_NULL` | `null`       | Second token of `not null` |
| `IDENTIFIER`   | any word     | Table names, column names, types |
| `LBRACE`       | `{`          | Table body open |
| `RBRACE`       | `}`          | Table body close |
| `LBRACKET`     | `[`          | Column option block open |
| `RBRACKET`     | `]`          | Column option block close |
| `COLON`        | `:`          | Separator in `ref:` |
| `COMMA`        | `,`          | Option list separator |
| `DOT`          | `.`          | Separator in `table.column` |
| `REL_GT`       | `>`          | Many-to-one direction |
| `REL_LT`       | `<`          | One-to-many direction |
| `REL_DASH`     | `-`          | One-to-one direction |
| `EOF`          | (end)        | Sentinel — always last in stream |

Any character not matching the above throws `TokenizeError`.

---

## 4. Parser Design

**File:** `parser/src/parser.ts`

### Architecture

The parser is a **recursive descent parser** implemented as a private `Parser`
class. Each grammar rule maps to exactly one private method. The public surface
is a single exported function:

```ts
export function parse(tokens: Token[]): DatabaseSchema {
  return new Parser(tokens).parse()
}
```

### Primitive operations

| Method | Behaviour |
|--------|-----------|
| `peek()` | Returns the current token without advancing |
| `advance()` | Returns the current token and moves `pos` forward. Never moves past `EOF`. |
| `check(...types)` | Returns `true` if the current token's type is one of the given types. Does not advance. |
| `expect(type)` | Asserts the current token matches `type`, advances, and returns it. Throws `ParseError` on mismatch. |
| `expectIdentifier()` | Like `expect` but accepts `IDENTIFIER` **or any keyword token**. See note below. |

**Important — `expectIdentifier` keyword acceptance:**
All keyword tokens (`KEYWORD_TABLE`, `KEYWORD_REF`, `KEYWORD_PK`,
`KEYWORD_UNIQUE`, `KEYWORD_NOT`, `KEYWORD_NULL`) are accepted as valid
identifiers. This allows users to name a table or column `ref`, `pk`, `null`,
or even `Table` without breaking the parser. Without this, any schema using a
keyword as a name would produce a confusing "Expected IDENTIFIER" error.

### Grammar rule mapping

```
parse()
└── parseTableDefinition()          (repeats until EOF)
    └── parseColumnDefinition()     (repeats until RBRACE)
        └── parseOption()           (once, then repeats after each COMMA)
            └── parseReferenceOption()   (when option is ref:)
```

#### `parse()`

Corresponds to `database ::= statement*`.

Loops until `EOF`. On each iteration, asserts the next token is `KEYWORD_TABLE`
(the only valid top-level statement) before delegating to
`parseTableDefinition()`. If a non-`KEYWORD_TABLE` token appears at top level, a
`ParseError` is thrown immediately with the token's location — it does **not**
attempt recovery.

Accumulates `tables` and `relations` from each table into a single
`DatabaseSchema`. Relations are promoted to the top level here because the AST
stores them flat (not nested inside tables).

#### `parseTableDefinition()`

Corresponds to `table_definition ::= "Table" identifier "{" column_definition* "}"`.

1. Consumes `KEYWORD_TABLE`
2. Calls `expectIdentifier()` for the table name
3. Consumes `LBRACE`
4. Loops calling `parseColumnDefinition()` until `RBRACE` or `EOF` is seen
5. Calls `expect('RBRACE')` — this is the missing-brace detection point. If the
   loop exited because of `EOF`, this call throws `ParseError`.

Returns a `TableNode` and a flat array of `RelationNode`s extracted from this
table's columns.

#### `parseColumnDefinition(tableName)`

Corresponds to `column_definition ::= identifier type column_option*`.

1. `expectIdentifier()` → column name
2. `expectIdentifier()` → column type (plain word — `int`, `varchar`, etc.)
3. If the next token is `LBRACKET`, consumes `[`, parses the option list, then
   expects `]`

Option list parsing: calls `parseOption()` once for the first option, then
loops consuming `COMMA` and calling `parseOption()` for each subsequent option.
Each call returns a partial flags object `{ primaryKey, unique, notNull, relation }`.
Flags are merged by OR-ing booleans; the last `relation` seen wins (at most one
`ref` per column option block is meaningful).

The final `ColumnNode` only includes optional boolean fields (`primaryKey`,
`unique`, `notNull`) when they are `true` — absent fields are omitted using
conditional spread to keep the AST clean.

#### `parseOption(tableName, columnName)`

Corresponds to `option ::= "pk" | "not null" | "unique" | reference_option`.

Dispatches on the current token:

| Token seen | Action |
|------------|--------|
| `KEYWORD_PK` | sets `primaryKey = true` |
| `KEYWORD_UNIQUE` | sets `unique = true` |
| `KEYWORD_NOT` | consumes `not`, then `expect('KEYWORD_NULL')` — two-token sequence |
| `KEYWORD_REF` | delegates to `parseReferenceOption()` |
| anything else | throws `ParseError` naming the unexpected token and listing valid options |

`tableName` and `columnName` are passed through to `parseReferenceOption()` so
the resulting `RelationNode` knows its source.

#### `parseReferenceOption(fromTable, fromColumn)`

Corresponds to `reference_option ::= "ref:" relation_direction identifier "." identifier`.

Token sequence consumed:

```
KEYWORD_REF  COLON  (REL_GT | REL_LT | REL_DASH)  IDENTIFIER  DOT  IDENTIFIER
```

The direction token maps directly to `RelationDirection`: `'>'`, `'<'`, or `'-'`.

Returns a complete `RelationNode` with `fromTable`, `fromColumn`, `toTable`,
`toColumn`, and `direction` all populated.

### How relations reach the top-level AST

Relations are embedded syntactically inside column option blocks but belong
semantically at the schema level (alongside tables, not inside them). The
traversal handles this by:

1. `parseColumnDefinition` returns `{ column, relation }` — relation may be `null`
2. `parseTableDefinition` collects non-null relations into `tableRelations[]`
3. `parse()` spreads each table's `tableRelations` into the schema-level
   `relations[]`

This means the returned `DatabaseSchema.relations` is always a flat array
regardless of how many tables or columns contain `ref:` options.

---

## 5. AST Structure

All types are defined in `@dbdiagram/shared` (`shared/src/types/schema.ts`) and
re-exported through `parser/src/ast.ts`.

### Type definitions

```ts
interface DatabaseSchema {
  tables:    TableNode[]
  relations: RelationNode[]
}

interface TableNode {
  name:    string
  columns: ColumnNode[]
}

interface ColumnNode {
  name:       string
  type:       string
  primaryKey?: boolean   // present and true, or absent
  unique?:     boolean
  notNull?:    boolean
}

type RelationDirection = '>' | '<' | '-'

interface RelationNode {
  fromTable:  string
  fromColumn: string
  toTable:    string
  toColumn:   string
  direction:  RelationDirection
}
```

### Optional fields convention

`ColumnNode` boolean flags (`primaryKey`, `unique`, `notNull`) are omitted when
`false`. Consumers must treat `undefined` and `false` as equivalent. Do not
check `col.primaryKey === true` — use `!!col.primaryKey` or `col.primaryKey ?? false`.

### Example

Input DBML:

```dbml
Table users {
  id    int     [pk]
  email varchar [not null, unique]
}

Table orders {
  id      int [pk]
  user_id int [ref: > users.id]
}
```

Resulting AST:

```json
{
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "id",    "type": "int",     "primaryKey": true },
        { "name": "email", "type": "varchar",  "notNull": true, "unique": true }
      ]
    },
    {
      "name": "orders",
      "columns": [
        { "name": "id",      "type": "int" , "primaryKey": true },
        { "name": "user_id", "type": "int" }
      ]
    }
  ],
  "relations": [
    {
      "fromTable":  "orders",
      "fromColumn": "user_id",
      "toTable":    "users",
      "toColumn":   "id",
      "direction":  ">"
    }
  ]
}
```

Key observations:
- `relations` is always at the top level — never nested inside a table.
- `user_id` in `orders` has no `primaryKey`, `unique`, or `notNull` fields —
  they are absent, not `false`.
- The `ref:` option that was syntactically part of `user_id`'s column definition
  is represented only in `relations`, not on the `ColumnNode` itself.

---

## 6. Validation Rules

**File:** `parser/src/validator.ts`

Validation runs after parsing succeeds. It accepts a `DatabaseSchema` and
returns all errors found (not just the first). An empty array means the schema
is valid.

### Rule 1 — Unique table names

Every `TableNode.name` in `schema.tables` must be unique.

```
Error: Duplicate table name 'users'
```

Detection: a `Set<string>` is built as tables are iterated. Each name is checked
before insertion.

### Rule 2 — Unique column names per table

Within each table, every `ColumnNode.name` must be unique. Columns in different
tables may share names.

```
Error: Duplicate column name 'id' in table 'users'
```

Detection: a fresh `Set<string>` is created per table.

### Rule 3 — Referenced table must exist

For every `RelationNode`, `rel.toTable` must match the `name` of an existing
`TableNode`.

```
Error: Relation references unknown table 'ghost'
```

Detection: `schema.tables.find(t => t.name === rel.toTable)`. If not found, the
relation is skipped (rule 4 cannot be checked for it).

### Rule 4 — Referenced column must exist

If rule 3 passes, `rel.toColumn` must match a `ColumnNode.name` in the target
table.

```
Error: Relation references unknown column 'nope' in table 'users'
```

Detection: `toTable.columns.some(c => c.name === rel.toColumn)`.

### Error accumulation

All four rules run to completion. A schema with two duplicate tables and one
invalid reference produces three errors in a single `validate()` call. This
allows editors to show all problems simultaneously.

---

## 7. Error Handling

### Error classes

| Class | Thrown by | Carries |
|-------|-----------|---------|
| `TokenizeError` | `tokenizer.ts` | `line`, `col` |
| `ParseError` | `parser.ts` | `line`, `col` |
| `DBMLError` | `index.ts` (`parseDBML`) | plain message string |

`TokenizeError` and `ParseError` extend `Error` and expose `line` and `col` as
readonly numeric fields. This lets editor integrations highlight the exact source
location without parsing the message string.

### Message format

All `TokenizeError` and `ParseError` messages follow the format:

```
Line <N>, Column <M>: <description>
```

Examples:

```
Line 3, Column 5: Expected RBRACE but got EOF
Line 7, Column 12: Expected relation direction ('>', '<', or '-') but got IDENTIFIER ('users')
Line 2, Column 8: Unknown column option: got IDENTIFIER ('default'). Expected pk, unique, not null, or ref
Line 1, Column 1: Unexpected character '@'
```

The `N:M:` prefix is machine-parseable and consistent. Do not change this format
without updating editor integration code and tests.

### `DBMLError`

`parseDBML()` runs validation after parsing. If `validate()` returns one or more
errors, `parseDBML()` throws a single `DBMLError` whose message is all
`ValidationError.message` strings joined by `\n`. `DBMLError` does not carry
`line`/`col` because validation errors are semantic (they refer to names, not
source positions).

### Error propagation contract

- `TokenizeError` — thrown synchronously from `tokenize()`. Stops tokenization
  immediately. Only one tokenization error is ever thrown per call.
- `ParseError` — thrown synchronously from `parse()`. The parser does **not**
  recover — it stops at the first syntax error.
- `DBMLError` — thrown from `parseDBML()` after collecting all validation errors.
  Multiple semantic errors may appear in one throw.

---

## 8. Grammar Coverage

The following constructs from `docs/dbml-grammar.md` are fully implemented:

| Construct | Example | Status |
|-----------|---------|--------|
| Table definition | `Table users { ... }` | ✓ |
| Empty table | `Table empty {}` | ✓ |
| Column with type | `id int` | ✓ |
| Primary key | `[pk]` | ✓ |
| Unique constraint | `[unique]` | ✓ |
| Not null | `[not null]` | ✓ |
| Multiple options | `[pk, not null, unique]` | ✓ |
| Relation many-to-one | `[ref: > table.col]` | ✓ |
| Relation one-to-many | `[ref: < table.col]` | ✓ |
| Relation one-to-one | `[ref: - table.col]` | ✓ |
| Relation with other options | `[not null, ref: > t.col]` | ✓ |
| Single-line comments | `// ...` | ✓ |
| Whitespace insensitive | columns on same/different lines | ✓ |
| Keywords as names | `Table ref { pk int }` | ✓ |
| Empty input | `""` | ✓ (returns empty schema) |
| Trailing newlines | `Table t {}\n\n` | ✓ |

---

## 9. Known Limitations

These are **intentional**, matching the current grammar spec. Do not work around
them without updating the grammar, parser, and tests together.

### Complex column types not supported

Types like `varchar(255)`, `decimal(10, 2)`, `int unsigned` are not supported.
The grammar defines `type ::= identifier` — a single word. The tokenizer does
not emit `LPAREN`, `RPAREN`, or `NUMBER` tokens.

To add support: add `LPAREN`, `RPAREN`, `NUMBER` token types to the tokenizer,
then extend `parseColumnDefinition` to optionally consume `( ... )` after the
type identifier.

### Block comments not supported

Only `//` single-line comments are recognised. `/* ... */` block comments will
cause a `TokenizeError` on the `/` character followed by `*`.

### One relation per column option block

If a column has two `ref:` options in the same bracket block, only the last one
is kept (the local `relation` variable is overwritten). The grammar only intends
one relation per column definition. This is not validated — it silently discards
the first.

### No quoted identifiers

Table and column names must match `[a-zA-Z_][a-zA-Z0-9_]*`. Quoted names like
`"my table"` or names with hyphens are not supported.

### Relations reference only by column option syntax

Standalone `Ref:` blocks (a DBML feature outside this grammar spec) are not
supported. All relations must be declared inline as column options.

---

## 10. Extension Guidelines

Follow these rules when modifying the parser in any future session.

### Rule 1 — Always update the tokenizer and parser together

If you add a new token type (e.g. `LPAREN`), you must also update the parser to
consume it at the correct grammar positions. The parser's `expect()` calls are
the source of truth for where each token is valid.

### Rule 2 — Keep `expectIdentifier` in sync with the keyword list

`expectIdentifier()` explicitly lists every keyword token type. If you add a new
keyword to the tokenizer's `KEYWORDS` map, add its token type to
`expectIdentifier()` as well — otherwise schemas using that word as a name will
fail with confusing errors.

### Rule 3 — Extend grammar incrementally

Add one construct at a time. Each change should be accompanied by:
1. New token types (if needed) in `tokenizer.ts`
2. New parsing method (or extension of existing method) in `parser.ts`
3. New validation rule (if needed) in `validator.ts`
4. New test cases covering the happy path and at least one error path

### Rule 4 — Do not break the `ColumnNode` optional-field contract

`primaryKey`, `unique`, and `notNull` must be either `true` or absent — never
`false`. The conditional spread pattern in `parseColumnDefinition` enforces this:

```ts
...(primaryKey ? { primaryKey } : {}),
```

Do not change this to always include the field. Downstream consumers (layout
engine, diagram renderer) rely on `undefined` meaning "not set".

### Rule 5 — Relations stay flat at the schema level

`DatabaseSchema.relations` is a flat array. Do not nest relations inside
`TableNode` or `ColumnNode`. The promotion logic in `parse()` (collecting
`tableRelations` and spreading into the schema) must be preserved.

### Rule 6 — Maintain the error message format

All tokenizer and parser errors must use:

```
Line <N>, Column <M>: <description>
```

Editor integration and tests check for this prefix. Do not change it.

### Rule 7 — Do not add recovery logic without careful consideration

The parser currently fails fast at the first syntax error. Adding error recovery
(consuming tokens until a synchronisation point) changes the parser's contract
and could cause misleading cascading errors. If recovery is needed, add it
explicitly for specific rules and document it here.

---

## 11. Testing Strategy

Two test suites exist for the parser:

### `parser/src/__tests__/parser.test.ts` — Jest unit tests

Run with: `npm run test:unit --workspace=parser`

Covers individual units of each layer in isolation:
- **Tokenizer**: token types, keyword recognition, comment skipping, location
  tracking, `TokenizeError` on bad input
- **Parser**: individual grammar rules, all option types, all relation
  directions, multi-table schemas, `ParseError` on missing braces
- **Validator**: each of the four validation rules independently (calling
  `parse()` directly to bypass validation and inject invalid ASTs)
- **`parseDBML`**: the full pipeline with a realistic multi-table schema, and
  `DBMLError` propagation

### `parser/test/parser.test.ts` — ts-node integration tests

Run with: `npm test --workspace=parser`

A standalone script with no test framework dependency. Uses `assert`-style
checks and prints `✓`/`✗` per test. Structured in ten sections matching the
task specification:

1. Basic table
2. Primary key
3. Foreign key (all three directions)
4. Invalid references (unknown table, unknown column)
5. Duplicate columns and tables
6. Comment support (before, inline, between tables, at EOF)
7. Trailing newlines and empty input
8. Invalid syntax (missing brace, stray token, missing type, bad character)
9. Tokenizer details (location tracking, all direction tokens, underscores/digits)
10. Full integration (four-table e-commerce schema)

### Adding new tests

When extending the grammar, add tests to **both** suites:

- Jest: add a `describe` block for the new construct in `src/__tests__/parser.test.ts`
- ts-node: add a new numbered section in `test/parser.test.ts`

Test the following for every new construct:
- Valid input produces the correct AST node
- Malformed input throws the correct error class (`TokenizeError`, `ParseError`,
  or `DBMLError`)
- The error message contains the expected token information and location
