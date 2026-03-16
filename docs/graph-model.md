# Graph Model Architecture

This document describes the Graph Model layer of the dbdiagram-ai pipeline. It
is written for AI sessions and developers who need to understand, maintain, or
extend the code in `parser/src/graph/`.

Read this document before modifying any file in `parser/src/graph/`.

---

## 1. Role in the System Pipeline

The full data flow from user input to rendered diagram is:

```
DBML text  (Monaco Editor)
  ↓
Tokenizer  (parser/src/tokenizer.ts)
  ↓
Token stream
  ↓
Recursive descent parser  (parser/src/parser.ts)
  ↓
Unvalidated AST
  ↓
Validator  (parser/src/validator.ts)
  ↓
DatabaseSchema AST  { tables[], relations[] }
  ↓
buildDiagramGraph()  (parser/src/graph/graph-builder.ts)  ← this layer
  ↓
DiagramGraph  { nodes[], edges[] }
  ↓
Layout engine  (Dagre — computes x/y coordinates)
  ↓
React Flow renderer  (frontend/src/diagram/)
```

The Graph Model layer sits between the AST and the layout engine. Its sole job
is to translate the parser's domain types into a graph structure that the layout
engine and renderer can consume directly, without any knowledge of DBML grammar
or AST internals.

---

## 2. Why the Graph Model Exists

### The problem with passing the AST to the layout engine

The `DatabaseSchema` AST is shaped for the parser's concerns: it has
`TableNode[]` and `RelationNode[]`, where relations reference tables by name as
plain strings and column metadata (types, constraints) is fully embedded in each
table.

The layout engine and renderer have different concerns:

- The layout engine only needs **node identifiers**, **dimensions**, and
  **connectivity** (which nodes are connected by which edges). It does not need
  column types, constraint flags, or anything else from `ColumnNode`.
- The React Flow renderer needs a stable **node id** to track component identity
  across re-renders. It also needs **edge ids** to be stable and deterministic so
  React can reconcile edge components efficiently.

Passing `DatabaseSchema` directly to either consumer would couple them to AST
internals and make it harder to change either side independently. The Graph Model
acts as an **anti-corruption layer**: it defines a clean contract that downstream
stages depend on, shielding them from parser implementation details.

### Summary of separation of concerns

| Layer | Knows about |
|-------|-------------|
| Parser | DBML grammar, token positions, AST structure |
| Graph Model | Nodes, edges, ids — no grammar, no token positions |
| Layout engine | Graph topology, node dimensions, coordinate computation |
| Renderer | React Flow nodes/edges, pixel positions, visual styling |

---

## 3. Types

All types are defined in `parser/src/graph/types.ts`.

### `DiagramNode`

```ts
interface DiagramNode {
  id: string
  tableName: string
  columns: ColumnNode[]
}
```

Represents one database table in the graph.

| Field | Purpose |
|-------|---------|
| `id` | Stable identifier used throughout the pipeline — equals `tableName`. Used as the React Flow node id, as the Dagre node key, and as the lookup key for edge endpoints. |
| `tableName` | The human-readable table name. Redundant with `id` but included to make call-site intent explicit: code that references a display label reads `node.tableName`; code that looks up a graph vertex reads `node.id`. |
| `columns` | The full `ColumnNode[]` from the AST. Carried through so the renderer can display column names, types, and constraint badges (PK, NOT NULL, UNIQUE) without needing a separate lookup. |

A `DiagramNode` carries **no coordinates**. Positions are added by the layout
engine in a later step.

### `DiagramEdge`

```ts
interface DiagramEdge {
  id: string
  from: string
  to: string
  fromColumn: string
  toColumn: string
  direction: RelationDirection
}
```

Represents one relationship between two tables.

| Field | Purpose |
|-------|---------|
| `id` | Deterministic edge identifier. See section 4. |
| `from` | The `id` of the source `DiagramNode` (the table that declares the foreign key). |
| `to` | The `id` of the target `DiagramNode` (the table being referenced). |
| `fromColumn` | Name of the column on the source table side of the relationship. |
| `toColumn` | Name of the column on the target table side of the relationship. |
| `direction` | Cardinality marker from the DBML `ref:` option. `'>'` = many-to-one, `'<'` = one-to-many, `'-'` = one-to-one. |

`from` and `to` always match the `id` fields of existing `DiagramNode`s in the
same graph, provided the schema was validated before `buildDiagramGraph` was
called (see precondition in section 5).

### `DiagramGraph`

```ts
interface DiagramGraph {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}
```

The complete graph model produced from one `DatabaseSchema`. It contains no
layout coordinates — it is a pure topology description. Pass it to the layout
engine (`layoutGraph`) to obtain a `LayoutResult` with x/y positions attached.

---

## 4. Edge ID Strategy

Every `DiagramEdge.id` is built from all four name parts that uniquely identify
a relationship:

```
{fromTable}_{fromColumn}_{toTable}_{toColumn}
```

Example: a relation `orders.user_id > users.id` produces:

```
orders_user_id_users_id
```

**Why deterministic ids matter:**

- React reconciles component instances by key/id. A stable, content-derived id
  means React Flow can diff edges correctly across re-renders without spurious
  unmount/remount cycles.
- Deterministic ids make edge arrays easy to diff in tests — two graphs produced
  from the same DBML will always produce identical ids, regardless of invocation
  order.
- No uuid or random seed is needed. The id is fully reproducible from the DBML
  source text.

**Uniqueness guarantee:** because the validator enforces unique table names and
unique column names within each table, and because a valid schema cannot have
two identical `(fromTable, fromColumn, toTable, toColumn)` tuples, the
concatenated id is unique within any valid `DiagramGraph`.

---

## 5. Transformation Rules

`buildDiagramGraph` in `parser/src/graph/graph-builder.ts` applies two rules:

### Rule 1 — Tables → Nodes

Each `TableNode` in `schema.tables` maps to exactly one `DiagramNode`:

```
TableNode { name, columns }
  →
DiagramNode { id: name, tableName: name, columns }
```

The `id` is set to the table name. Order is preserved: the `nodes` array
follows the same order as `schema.tables`.

### Rule 2 — Relations → Edges

Each `RelationNode` in `schema.relations` maps to exactly one `DiagramEdge`:

```
RelationNode { fromTable, fromColumn, toTable, toColumn, direction }
  →
DiagramEdge {
  id:         `${fromTable}_${fromColumn}_${toTable}_${toColumn}`,
  from:       fromTable,
  to:         toTable,
  fromColumn,
  toColumn,
  direction
}
```

Order is preserved: the `edges` array follows the same order as
`schema.relations`.

### Precondition

`buildDiagramGraph` must receive a **validated** `DatabaseSchema` — one produced
by `parseDBML()`, not by calling `parse()` directly. Passing an unvalidated
schema may produce edges whose `from` or `to` reference node ids that do not
exist in `nodes`, which will cause the layout engine or renderer to behave
incorrectly.

---

## 6. End-to-End Example

### Input DBML

```dbml
Table users {
  id   int [pk]
  name varchar
}

Table orders {
  id      int [pk]
  user_id int [ref: > users.id]
  total   int
}
```

### Intermediate AST (produced by `parseDBML`)

```json
{
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "id",   "type": "int", "primaryKey": true },
        { "name": "name", "type": "varchar" }
      ]
    },
    {
      "name": "orders",
      "columns": [
        { "name": "id",      "type": "int", "primaryKey": true },
        { "name": "user_id", "type": "int" },
        { "name": "total",   "type": "int" }
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

### DiagramGraph (produced by `buildDiagramGraph`)

```json
{
  "nodes": [
    {
      "id": "users",
      "tableName": "users",
      "columns": [
        { "name": "id",   "type": "int", "primaryKey": true },
        { "name": "name", "type": "varchar" }
      ]
    },
    {
      "id": "orders",
      "tableName": "orders",
      "columns": [
        { "name": "id",      "type": "int", "primaryKey": true },
        { "name": "user_id", "type": "int" },
        { "name": "total",   "type": "int" }
      ]
    }
  ],
  "edges": [
    {
      "id":         "orders_user_id_users_id",
      "from":       "orders",
      "to":         "users",
      "fromColumn": "user_id",
      "toColumn":   "id",
      "direction":  ">"
    }
  ]
}
```

Key observations:
- Each table becomes exactly one node with `id === tableName`.
- The single relation becomes one edge with a deterministic composite id.
- `from` / `to` on the edge match the `id` fields of the corresponding nodes.
- No coordinates appear anywhere in the graph — those are the layout engine's
  responsibility.

---

## 7. Public API

The graph module is exported through `parser/src/index.ts`:

```ts
import { buildDiagramGraph } from '@dbdiagram/parser'
import type { DiagramGraph, DiagramNode, DiagramEdge } from '@dbdiagram/parser'
```

The typical call sequence is:

```ts
const schema = parseDBML(dbmlText)          // parse + validate
const graph  = buildDiagramGraph(schema)    // AST → graph model
const layout = layoutGraph(graph)           // graph → positioned nodes
```

`buildDiagramGraph` is a pure function. Given the same `DatabaseSchema` it
always returns an identical `DiagramGraph`. It has no side effects, no internal
state, and no I/O.

---

## 8. Extension Guidelines

When extending the graph model, follow these rules.

### Do not add coordinates to graph types

`DiagramNode` and `DiagramEdge` must remain coordinate-free. If you need
positioned types, define them in the layout engine module (e.g.
`PositionedNode { x, y, width, height }`). Mixing topology and geometry in the
same type breaks the separation between the graph model and layout stages.

### Keep edge ids deterministic

If the transformation rules change (e.g. supporting standalone `Ref:` blocks),
ensure the new edge id scheme remains deterministic and unique for all valid
schemas. Do not use `Math.random()`, `Date.now()`, or counters.

### Update this document when adding fields

If a new field is added to `DiagramNode` or `DiagramEdge`, document its purpose
and the transformation rule that populates it in sections 3 and 5 above.
