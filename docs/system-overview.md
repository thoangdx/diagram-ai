# System Overview

> **AI context recovery document.** A new session should read this file first. It provides a complete picture of the system without requiring the full codebase to be read.

---

## 1. Purpose of the System

**dbdiagram-ai** is a web-based database schema design tool modelled on [dbdiagram.io](https://dbdiagram.io). Users write **DBML** (Database Markup Language) text in a Monaco editor; the system parses it in real time and renders an interactive Entity-Relationship (ER) diagram in the browser using React Flow.

Core user experience:
- Type or paste DBML on the left pane.
- The ER diagram updates automatically (500 ms debounce) on the right pane.
- Tables are rendered as draggable cards. Foreign-key edges connect the exact columns involved.
- Hovering a FK column highlights the connecting edge and the target column.

---

## 2. End-to-End Pipeline

```
DBML text  (Monaco Editor)
  │
  ▼
Tokenizer  (parser/src/tokenizer.ts)
  │  Token[]
  ▼
Parser  (parser/src/parser.ts)
  │  DatabaseSchema  (unvalidated)
  ▼
Validator  (parser/src/validator.ts)
  │  DatabaseSchema  (validated — throws on semantic errors)
  ▼
Graph Builder  (parser/src/graph/graph-builder.ts)
  │  DiagramGraph  { nodes: DiagramNode[], edges: DiagramEdge[] }
  ▼
Layout Engine  (parser/src/layout/layout-engine.ts  +  dagre)
  │  LayoutResult  { nodes: PositionedNode[], edges: PositionedEdge[] }
  ▼
useDiagramData  (frontend/src/diagram/hooks/useDiagramData.ts)
  │  Node<TableNodeData>[]  +  Edge[]  (React Flow format)
  ▼
React Flow Canvas  (frontend/src/diagram/DiagramCanvas.tsx)
  │
  ▼
Interactive ER Diagram  (TableNode cards, smoothstep edges, MiniMap, Controls)
```

The entire pipeline runs **client-side** inside a single `useDBMLDiagram` hook
(`frontend/src/editor/useDBMLDiagram.ts`). No server round-trips are needed for
rendering.

---

## 3. Core Modules

### 3.1 Parser

**Location:** `parser/src/`
**Public API:** `parseDBML(input: string): DatabaseSchema` (exported from `parser/src/index.ts`)

#### Tokenizer (`tokenizer.ts`)

Character-by-character lexer. Produces a flat `Token[]` stream.

Supported token types:

| Category | Tokens |
|---|---|
| Keywords | `KEYWORD_TABLE`, `KEYWORD_REF`, `KEYWORD_PK`, `KEYWORD_UNIQUE`, `KEYWORD_NOT`, `KEYWORD_NULL`, `KEYWORD_NOTE` |
| Names / types | `IDENTIFIER` |
| String literals | `STRING` (single or double quoted) |
| Punctuation | `LBRACE`, `RBRACE`, `LBRACKET`, `RBRACKET`, `COLON`, `COMMA`, `DOT` |
| Relation directions | `REL_GT` (`>`), `REL_LT` (`<`), `REL_DASH` (`-`) |
| End of input | `EOF` |

- Keywords are **case-sensitive** (`Table`, `ref`, `pk`, `unique`, `not`, `null`, `note`).
- Single-line comments (`// …`) are skipped.
- Whitespace is skipped.
- Unterminated strings throw `TokenizeError`.

#### Parser (`parser.ts`)

Recursive-descent parser. Grammar rules:

```
database         ::= table_definition*
table_definition ::= "Table" identifier "{" column_definition* "}"
column_definition::= identifier identifier column_option_block?
column_option_block ::= "[" option ("," option)* "]"
option           ::= "pk"
                   | "unique"
                   | "not" "null"
                   | "ref" ":" relation_direction identifier "." identifier
                   | "note" ":" STRING
relation_direction ::= ">" | "<" | "-"
```

- `expectIdentifier()` accepts all keyword token types as valid names, so reserved words (`ref`, `pk`, `null`, `Table`, `note`) may be used as table or column names.
- Each `ref:` option within a column is parsed into a `RelationNode` and also stored as a `references` field on the `ColumnNode` for renderer use.
- Parsing errors throw `ParseError` with `line` and `col`.

#### Validator (`validator.ts`)

Four semantic rules enforced after parsing:

1. **Unique table names** — duplicate table names throw.
2. **Unique column names within a table** — duplicate column names in the same table throw.
3. **Valid FK `toTable`** — `ref:` must point to a table that exists in the schema.
4. **Valid FK `toColumn`** — `ref:` must point to a column that exists on `toTable`.

Validation errors throw `ValidationError` with a descriptive message.

#### Supported DBML features

| Feature | Syntax |
|---|---|
| Table definition | `Table name { … }` |
| Column | `colName colType` |
| Primary key | `[pk]` |
| Unique constraint | `[unique]` |
| Not-null constraint | `[not null]` |
| Foreign key (many-to-one) | `[ref: > table.col]` |
| Foreign key (one-to-many) | `[ref: < table.col]` |
| Foreign key (one-to-one) | `[ref: - table.col]` |
| Column note | `[note: 'text']` |
| Line comments | `// comment` |

---

### 3.2 AST Model

**Location:** `shared/src/types/schema.ts`
Shared between `@dbdiagram/parser` and `@dbdiagram/frontend` via the `@dbdiagram/shared` workspace package.

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
  name:        string
  type:        string           // raw type string, e.g. "int", "varchar"
  primaryKey?: boolean
  unique?:     boolean
  notNull?:    boolean
  references?: {                // populated when the column carries ref: option
    table:     string
    column:    string
    direction: RelationDirection  // '>' | '<' | '-'
  }
  note?:       string           // populated when the column carries note: option
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

**Key design decision:** `ColumnNode.references` is a **denormalised copy** of the relation for renderer convenience. The authoritative list of relations is `DatabaseSchema.relations`. The graph builder uses `relations`; the renderer uses `col.references` directly to render FK badges without scanning the relations array.

---

### 3.3 Graph Model

**Location:** `parser/src/graph/`
**Transforms:** `DatabaseSchema` → `DiagramGraph`

```ts
interface DiagramGraph {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

interface DiagramNode {
  id:       string        // = tableName
  tableName: string
  columns:  ColumnNode[]
}

interface DiagramEdge {
  id:         string      // = `${fromTable}_${fromColumn}_${toTable}_${toColumn}`
  from:       string      // source node id  (fromTable)
  to:         string      // target node id  (toTable)
  fromColumn: string
  toColumn:   string
  direction:  RelationDirection
}
```

Transformation rules (`graph-builder.ts`):
- Each `TableNode` → one `DiagramNode` (id = `tableName`).
- Each `RelationNode` → one `DiagramEdge` (id = `fromTable_fromColumn_toTable_toColumn`).
- The graph is **coordinate-free** — no positions at this stage.

The graph layer is the **contract between the parser and the layout/renderer**. Neither the layout engine nor the renderer imports from `@dbdiagram/parser` directly; they work with `DiagramGraph` / `LayoutResult`.

---

### 3.4 Layout Engine

**Location:** `parser/src/layout/`
**Public API:** `layoutGraph(graph: DiagramGraph): LayoutResult`
**Dependency:** [dagre](https://github.com/dagrejs/dagre) (Sugiyama-style directed graph layout)

#### Node size calculation (`node-size.ts`)

```
width  = 240 px  (fixed)
height = HEADER_HEIGHT + columns.length × ROW_HEIGHT + PADDING
       = 40       + columns.length × 28              + 16
```

Constants are exported and **must match** the identical constants in `TableNode.tsx` so that React Flow handle positions align with layout-computed coordinates.

#### Dagre layout (`dagre-layout.ts`)

Configuration:
```
rankdir:  'LR'   (left-to-right, tables ranked by dependency depth)
ranksep:  80     (horizontal gap between ranks, px)
nodesep:  40     (vertical gap between nodes in the same rank, px)
```

Dagre returns **centre coordinates** `(x, y)`. These are converted to **top-left** for React Flow:
```
node.x = dagreNode.x - node.width  / 2
node.y = dagreNode.y - node.height / 2
```

#### Output types

```ts
interface PositionedNode extends DiagramNode {
  x: number; y: number; width: number; height: number
}
interface PositionedEdge extends DiagramEdge {}   // no extra geometry currently
interface LayoutResult {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}
```

---

### 3.5 Renderer

**Location:** `frontend/src/diagram/`

#### `DiagramCanvas.tsx`

- Wraps React Flow in `ReactFlowProvider`.
- Holds `hoveredRelation` state (see §5 hover highlighting).
- Provides `HoverContext` to all child nodes.
- Computes `styledEdges` via `useMemo`: the highlighted edge gets `stroke: '#2563eb', strokeWidth: 3`; all others keep their default style.
- `nodeTypes = { tableNode: TableNode }` is defined at **module level** (not inside the component) to keep the reference stable and prevent React Flow from remounting nodes on every render.
- Canvas decorations: dot-pattern `Background`, zoom/pan `Controls`, `MiniMap`.

#### `TableNode.tsx`

Custom React Flow node component. Renders a table as a styled card:

- **Header** (40 px) — dark background (`#1e293b`) with the table name.
- **Column rows** (28 px each) — alternating background (`#f8fafc` / `#ffffff`).
  - Highlighted in `#eff6ff` when the row is the **target** of the currently hovered FK relation.
- Each row has:
  - A `target` handle on the left (`{colName}-target`)
  - A `source` handle on the right (`{colName}-source`)
  - Both handles positioned at `top = 40 + index × 28 + 14` (row vertical centre)

Handle IDs **must match** `sourceHandle`/`targetHandle` values set in `useDiagramData`.

#### `useDiagramData.ts`

Converts `LayoutResult` → React Flow `Node<TableNodeData>[]` + `Edge[]`:

- Each `PositionedNode` → `Node<TableNodeData>` with `type: 'tableNode'`, `position: { x, y }`, fixed `style.width`.
- Each `PositionedEdge` → `Edge` with `type: 'smoothstep'`, column-level handle ids, `markerEnd: ArrowClosed`, cardinality label (`N:1` / `1:N` / `1:1`).

#### `types.ts`

```ts
interface TableNodeData {
  tableName: string
  columns:   ColumnNode[]
}
```

---

### 3.6 Editor

**Location:** `frontend/src/editor/`

#### `DBMLEditor.tsx`

- Wraps `@monaco-editor/react`.
- Language mode: `'sql'` (close enough for syntax highlighting; no custom DBML language grammar yet).
- Theme: `vs-dark`.
- Props: `value: string`, `onChange: (v: string) => void`.
- Minimap disabled. Fills 100% of its container.

#### `useDBMLDiagram.ts`

Orchestrates the full pipeline and exposes diagram state to the page:

```ts
function useDBMLDiagram(dbml: string): {
  nodes: Node<TableNodeData>[]
  edges: Edge[]
  error: string | null
}
```

Behaviour:
- Debounces input by **500 ms** using `useEffect` + `clearTimeout`.
- On each debounced update, runs:
  `parseDBML → buildDiagramGraph → layoutGraph → useDiagramData` equivalent inline.
- On **parse/validation error**: keeps the last valid `nodes`/`edges` (diagram does not flash empty), sets `error` to the error message string.
- On **success**: updates nodes/edges, clears `error`.

#### `page.tsx`

Split-pane layout:
- **Left (40%):** Monaco editor + error banner (shown only when `error` is non-null).
- **Right (60%):** `DiagramCanvas`.
- Both panels loaded via `next/dynamic` with `{ ssr: false }` — React Flow and Monaco both rely on browser globals (`window`, `ResizeObserver`) that are unavailable during Next.js server-side rendering.

---

## 4. Metadata Handling

### Foreign key (`references`)

```
DBML column option: [ref: > table.col]
         │
         ▼  (parser.ts — parseReferenceOption)
RelationNode added to schema.relations
ColumnNode.references = { table, column, direction }  ← denormalised copy
         │
         ▼  (graph-builder.ts)
DiagramEdge  (used for layout and React Flow edges)
         │
         ▼  (useDiagramData.ts)
Edge  sourceHandle=`{fromCol}-source`  targetHandle=`{toCol}-target`
         │
         ▼  (TableNode.tsx)
FK badge (teal) on the source column row
Hover on source column → edge turns blue (#2563eb, strokeWidth 3)
                       → target column row turns #eff6ff
```

### Note (`note`)

```
DBML column option: [note: 'some text']
         │
         ▼  (parser.ts — parseNoteOption)
ColumnNode.note = 'some text'
         │
         ▼  (graph-builder.ts — passed through in columns array)
DiagramNode.columns[i].note = 'some text'
         │
         ▼  (useDiagramData / TableNode)
📝 icon rendered next to the column name
Browser native title tooltip shows the note text on hover
```

---

## 5. UI Features

| Feature | Implementation |
|---|---|
| Table cards | `TableNode.tsx` — custom React Flow node |
| **PK** badge (yellow) | `col.primaryKey === true` |
| **FK** badge (teal) | `col.references !== undefined` |
| **NN** badge (red) | `col.notNull === true` |
| **U** badge (blue) | `col.unique === true && !col.primaryKey` |
| **📝** note icon | `col.note !== undefined` — tooltip shows note text |
| Relation highlighting | `HoverContext` + `styledEdges` in `DiagramCanvas` |
| Target column highlight | `#eff6ff` background when `hoveredRelation.toTable/toColumn` matches |
| Zoom / pan | React Flow built-in; `minZoom: 0.1`, `maxZoom: 2` |
| Drag nodes | React Flow built-in; `draggable: true` |
| MiniMap | React Flow `<MiniMap>` |
| Fit view on load | `fitView` prop; `padding: 0.15`, `maxZoom: 1.2` |
| Error display | Red banner below editor; diagram holds last valid state |

---

## 6. Design Principles

### Separation of concerns

The system is divided into four independent layers with one-way data flow:

```
Parser  →  Graph Model  →  Layout Engine  →  Renderer
```

Each layer has a single, well-typed input and output. No layer imports from the layer that comes after it.

### Graph as contract layer

`DiagramGraph` is the stable interface between the parser world and the rendering world. The layout engine and renderer only depend on `DiagramGraph` / `LayoutResult`, never on `DatabaseSchema` or parser internals. This means the parser can evolve independently of the renderer.

### Layout is framework-independent

`layoutGraph` takes and returns plain TypeScript objects. It has no React or Next.js dependency. It can be run in a Node.js script, a Web Worker, or a server-side function without modification.

### Renderer does not depend on parser internals

`TableNode` receives `ColumnNode[]` (from `@dbdiagram/shared`) as its data. It does not import from the parser module. The only shared dependency is the `ColumnNode` type from `@dbdiagram/shared`.

### Pixel constant parity

`HEADER_HEIGHT = 40`, `ROW_HEIGHT = 28`, `NODE_WIDTH = 240` are defined in `parser/src/layout/node-size.ts` and **duplicated** in `frontend/src/diagram/TableNode.tsx`. These must stay in sync. If they drift, handle positions will misalign with the layout engine's coordinates.

### Deterministic layout

Dagre produces the same output for the same input. Combined with the debounce, the diagram re-renders only when the DBML text stabilises, not on every keystroke.

### SSR boundary

All diagram and editor code runs client-only (`'use client'` + `dynamic(..., { ssr: false })`). This avoids server/client hydration mismatches caused by React Flow's and Monaco's use of browser-only APIs.

---

## 7. Current Capabilities (MVP Status)

| Capability | Status |
|---|---|
| DBML tokenization + parsing | ✅ Complete |
| Semantic validation | ✅ Complete (4 rules) |
| Graph model construction | ✅ Complete |
| Dagre-based auto-layout | ✅ Complete |
| React Flow diagram rendering | ✅ Complete |
| Column constraint badges (PK, FK, NN, U, 📝) | ✅ Complete |
| Live DBML editor (Monaco) | ✅ Complete |
| Debounced real-time update | ✅ Complete |
| FK relation highlighting on hover | ✅ Complete |
| Error display with diagram persistence | ✅ Complete |
| Draggable nodes | ✅ Complete (React Flow built-in) |
| Zoom / pan / MiniMap | ✅ Complete (React Flow built-in) |

---

## 8. Limitations

| Limitation | Notes |
|---|---|
| **No SQL import** | Phase 6. DDL → DBML conversion pipeline not yet built. See `docs/sql-import.md`. |
| **No persistence** | No backend database. Diagrams are lost on page refresh. |
| **No user accounts / auth** | Backend NestJS skeleton exists but no auth module. |
| **No collaboration** | Phase 8. Yjs + WebSocket real-time editing not yet built. See `docs/collaboration.md`. |
| **Limited DBML grammar** | Top-level `Ref` blocks (standalone relations outside tables) are not supported. Table-level `Note` blocks are not supported. Enum definitions are not supported. Indexes are not supported. |
| **No custom DBML language mode** | Monaco uses SQL mode for syntax highlighting; DBML-specific keywords are not highlighted correctly. |
| **Pixel constant duplication** | `HEADER_HEIGHT`, `ROW_HEIGHT`, `NODE_WIDTH` must be kept in sync manually between `node-size.ts` and `TableNode.tsx`. |
| **No layout caching** | The full pipeline (parse → layout) runs on every debounced change, even for large schemas. |

---

## 9. Future Roadmap

### Phase 6 — SQL Import
Convert SQL DDL (`CREATE TABLE` statements) to DBML. See `docs/sql-import.md`.
- Parse SQL DDL (PostgreSQL / MySQL / SQLite).
- Extract tables, columns, constraints, foreign keys.
- Emit DBML string → existing pipeline.

### Phase 7 — Reverse Engineering
Connect to a live database and auto-generate a DBML schema by introspecting `information_schema`.

### Phase 8 — Collaboration
Real-time multi-user editing. See `docs/collaboration.md`.
- Yjs CRDT document for DBML text.
- WebSocket transport via NestJS gateway.
- Presence indicators (cursors).

### Phase 9 — Persistence & Sharing
- NestJS backend with PostgreSQL (schema: `projects`, `diagrams`).
- Save / load diagrams.
- Public share links (`GET /d/{id}`).
- Auth (JWT).

### Phase 10 — AI Schema Generator
LLM-based DBML generation from a natural-language description. See `docs/ai-schema-generator.md`.

---

## 10. How to Reconstruct Context

**For a new AI session working on this codebase:**

1. **Read this file first** (`docs/system-overview.md`). It covers the complete architecture.
2. For parser detail: read `docs/parser-architecture.md`.
3. For layout detail: read `docs/layout-engine.md`.
4. For renderer detail: read `docs/renderer-architecture.md`.
5. For the next task, identify which layer it affects and read only those source files.

**Key files by layer:**

| Layer | Primary files |
|---|---|
| Tokenizer | `parser/src/tokenizer.ts` |
| Parser | `parser/src/parser.ts` |
| Validator | `parser/src/validator.ts` |
| AST types | `shared/src/types/schema.ts` |
| Graph builder | `parser/src/graph/graph-builder.ts`, `graph/types.ts` |
| Layout engine | `parser/src/layout/layout-engine.ts`, `dagre-layout.ts`, `node-size.ts` |
| Parser public API | `parser/src/index.ts` |
| Diagram types | `frontend/src/diagram/types.ts` |
| Data conversion hook | `frontend/src/diagram/hooks/useDiagramData.ts` |
| Canvas | `frontend/src/diagram/DiagramCanvas.tsx` |
| Table card | `frontend/src/diagram/TableNode.tsx` |
| Hover state | `frontend/src/diagram/HoverContext.tsx` |
| Editor | `frontend/src/editor/DBMLEditor.tsx` |
| Pipeline hook | `frontend/src/editor/useDBMLDiagram.ts` |
| Main page | `frontend/src/app/page.tsx` |

**Critical invariants to preserve:**
- `HEADER_HEIGHT`, `ROW_HEIGHT`, `NODE_WIDTH` in `node-size.ts` and `TableNode.tsx` must always match.
- Handle IDs in `TableNode.tsx` (`{colName}-source`, `{colName}-target`) must match `sourceHandle`/`targetHandle` in `useDiagramData.ts`.
- Edge IDs (`${fromTable}_${fromColumn}_${toTable}_${toColumn}`) must match between `graph-builder.ts` and `HoverContext.tsx` hover logic in `TableNode.tsx`.
- `nodeTypes` object in `DiagramCanvas.tsx` must remain at module level (not inside the component).
