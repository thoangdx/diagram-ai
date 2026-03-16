# Diagram Renderer Architecture

This document describes the diagram renderer module (`frontend/src/diagram/`). It
is written for AI sessions and developers who need to understand, maintain, or
extend the rendering layer without reading the full React codebase.

Read this document before modifying any file in `frontend/src/diagram/` or
`frontend/src/app/page.tsx`.

---

## 1. System Pipeline

The diagram renderer is the final stage in the data pipeline. It consumes a
`LayoutResult` and turns it into an interactive ER diagram displayed in the
browser.

```
DBML text  (user input)
  ↓
Tokenizer + Parser + Validator  (parser/src/)
  ↓
DatabaseSchema AST  { tables[], relations[] }
  ↓
buildDiagramGraph()  (parser/src/graph/)
  ↓
DiagramGraph  { nodes[], edges[] }
  ↓
layoutGraph()  (parser/src/layout/)
  ↓
LayoutResult  { nodes: PositionedNode[], edges: PositionedEdge[] }
  ↓
useDiagramData()  (frontend/src/diagram/hooks/)  ← transformation
  ↓
React Flow Node[] + Edge[]
  ↓
DiagramCanvas + TableNode  (frontend/src/diagram/)  ← this layer
  ↓
Interactive ER Diagram  (browser)
```

The renderer's responsibility is purely visual. It reads pixel coordinates and
topology from `LayoutResult` and delegates all rendering to React Flow. It never
re-runs the parser or layout engine, and it knows nothing about DBML grammar or
AST structure.

---

## 2. Renderer Module Structure

**Directory:** `frontend/src/diagram/`

```
frontend/src/diagram/
├── types.ts                  Frontend-specific TypeScript types
├── TableNode.tsx             Custom React Flow node — renders one table card
├── hooks/
│   └── useDiagramData.ts     Converts LayoutResult → React Flow Node[] + Edge[]
├── DiagramCanvas.tsx         React Flow canvas with Background, Controls, MiniMap
└── index.ts                  Barrel export for the module
```

### `types.ts`

Defines the TypeScript types that bridge the parser's domain model and React
Flow's generic node/edge types.

| Type | Purpose |
|------|---------|
| `TableNodeData` | The `data` payload carried by every React Flow table node. Holds `tableName: string` and `columns: ColumnNode[]`. |
| `TableFlowNode` | `Node<TableNodeData>` — a fully typed React Flow node for tables. |
| `DiagramFlowEdge` | Alias for React Flow's standard `Edge` type. No custom data payload is needed at render time. |

`TableNodeData` is the contract between `useDiagramData` (which builds the
nodes) and `TableNode` (which renders them). If new display fields are needed
(e.g. table comments, schema prefix), add them here.

### `TableNode.tsx`

A React component registered with React Flow as a custom node type. Renders one
database table as a card with a header and a list of column rows. See section 4
for the full visual specification.

### `hooks/useDiagramData.ts`

A React hook that converts a `LayoutResult` into the `{ nodes, edges }` arrays
expected by React Flow. This is the mapping layer — it translates the layout
engine's domain types into React Flow's generic schema. Memoised on `layout`
reference. See section 3.

### `DiagramCanvas.tsx`

The top-level canvas component. Takes a `LayoutResult` as its only prop, calls
`useDiagramData`, and renders `<ReactFlow>` with all plugins. See section 6.

---

## 3. LayoutResult → React Flow Transformation

**File:** `frontend/src/diagram/hooks/useDiagramData.ts`

`useDiagramData` accepts a `LayoutResult` and returns `{ nodes, edges }`.
The entire transformation is wrapped in `useMemo([layout])`, so it is
recomputed only when the `LayoutResult` reference changes.

### Node mapping

Each `PositionedNode` becomes one React Flow `Node<TableNodeData>`:

```
PositionedNode {           →   Node<TableNodeData> {
  id,                            id,          (same — table name)
  tableName,                     type: 'tableNode',
  columns,                       position: { x, y },
  x, y,                          data: { tableName, columns },
  width, height                  style: { width },
}                          }
```

| React Flow field | Source | Notes |
|-----------------|--------|-------|
| `id` | `n.id` | Table name — stable identifier across re-renders |
| `type` | `'tableNode'` | Hardcoded — tells React Flow to use the `TableNode` component |
| `position.x` | `n.x` | Top-left corner, from layout engine (dagre center already converted) |
| `position.y` | `n.y` | Top-left corner, from layout engine |
| `data.tableName` | `n.tableName` | Passed through to `TableNode` for the header |
| `data.columns` | `n.columns` | Passed through to `TableNode` for the row list |
| `style.width` | `n.width` | Fixes rendered width to match the layout engine's assumption (240px) |

### Edge mapping

Each `PositionedEdge` (which is `DiagramEdge` — see `docs/graph-model.md`)
becomes one React Flow `Edge`:

```
PositionedEdge {                →   Edge {
  id,                                 id,
  from,                               source: from,
  to,                                 target: to,
  fromColumn,                         sourceHandle: `${fromColumn}-source`,
  toColumn,                           targetHandle: `${toColumn}-target`,
  direction                           label: 'N:1' | '1:N' | '1:1',
}                                     type: 'smoothstep',
                                      markerEnd: ArrowClosed,
                                    }
```

`sourceHandle` and `targetHandle` reference the column-level handles registered
by `TableNode`. This is what makes edges attach precisely to the column involved
in the foreign key, rather than to the top or center of the table card. See
section 5 for the handle naming contract.

### Direction → cardinality label

| `direction` value | Meaning | Label shown on edge |
|-------------------|---------|---------------------|
| `'>'` | Many-to-one | `N:1` |
| `'<'` | One-to-many | `1:N` |
| `'-'` | One-to-one | `1:1` |

The label is rendered mid-edge by React Flow using `label`, `labelStyle`, and
`labelBgStyle`.

---

## 4. TableNode Component

**File:** `frontend/src/diagram/TableNode.tsx`

`TableNode` is a custom React Flow node component registered under the type key
`'tableNode'`. React Flow passes it a `NodeProps<TableNodeData>` prop, from
which it extracts `data.tableName` and `data.columns`.

The component is wrapped in `React.memo` so it only re-renders when its `data`
prop changes.

### Visual structure

```
┌────────────────────────────────────────┐
│  users                                 │  ← header (dark background)
├────────────────────────────────────────┤
●  PK  id          int               ●  │  ← column row 0 (alternating bg)
●      name        varchar  *        ●  │  ← column row 1
●      email       varchar  *  U     ●  │  ← column row 2
●      created_at  timestamp         ●  │  ← column row 3
└────────────────────────────────────────┘
  ↑                                  ↑
target handles (left)         source handles (right)
```

### Header

- Background: `#1e293b` (dark slate)
- Text: `#f8fafc` (white), 600 weight, 13px
- Height: `40px` (matches `HEADER_HEIGHT` in layout engine)

### Column rows

Each `ColumnNode` in `data.columns` renders as one row:

- Height: `28px` (matches `ROW_HEIGHT` in layout engine)
- Alternating background: `#f8fafc` (even index) / `#ffffff` (odd index)
- Left side: column name, preceded by a `PK` badge if `primaryKey === true`
- Right side: column type in muted grey, followed by constraint indicators

### Constraint indicators

| Constraint | Display | When shown |
|------------|---------|------------|
| `primaryKey: true` | Yellow `PK` badge | `col.primaryKey === true` |
| `notNull: true` | Red `*` superscript | `col.notNull === true` |
| `unique: true` | Blue `U` badge | `col.unique === true && !col.primaryKey` (PK implies unique; badge is redundant) |

The `primaryKey`, `unique`, and `notNull` fields on `ColumnNode` follow the
optional-field convention from the parser: absent means false. The component
uses truthiness checks (`col.primaryKey`, `col.notNull`, `col.unique`), not
strict equality, which handles both `true` and absent correctly.

### Constants must stay in sync

`HEADER_HEIGHT = 40` and `ROW_HEIGHT = 28` are duplicated from
`parser/src/layout/node-size.ts`. They must stay identical. If either constant
changes in the layout engine, the corresponding constant in `TableNode.tsx`
must be updated to match, otherwise handles will be visually misaligned with
the column rows they belong to.

---

## 5. Column Connection Handles

Each column row in `TableNode` renders two React Flow `Handle` elements:

| Handle | Type | Position | ID format |
|--------|------|----------|-----------|
| Target | `"target"` | `Position.Left` | `{columnName}-target` |
| Source | `"source"` | `Position.Right` | `{columnName}-source` |

### Pixel positioning

React Flow handles default to `top: 50%` (centered on the node). Because handles
are inside column rows that are much shorter than the full node height, the
default would place every handle at the node's vertical center, which is
incorrect.

Each handle overrides `top` with a pixel value:

```
top = HEADER_HEIGHT + index × ROW_HEIGHT + ROW_HEIGHT / 2
    = 40 + index × 28 + 14
```

Examples:
- Column 0: `top = 40 + 0 + 14 = 54px`
- Column 1: `top = 40 + 28 + 14 = 82px`
- Column 2: `top = 40 + 56 + 14 = 110px`

This places each handle at the vertical midpoint of its row, which aligns
precisely with where the layout engine computed the node's center.

### Handle–edge wiring

`useDiagramData` creates edges with explicit `sourceHandle` and `targetHandle`
values:

```ts
sourceHandle: `${e.fromColumn}-source`   // e.g. 'user_id-source'
targetHandle: `${e.toColumn}-target`     // e.g. 'id-target'
```

React Flow uses these ids to route the edge line to the exact handle element
inside the node card. The result: an edge drawn from the `user_id` row of
`orders` to the `id` row of `users`, rather than between the table centers.

### Contract between `TableNode` and `useDiagramData`

The handle id format is a shared contract between two files:

```
TableNode.tsx        registers handles as: `${col.name}-source`, `${col.name}-target`
useDiagramData.ts    references handles as: `${e.fromColumn}-source`, `${e.toColumn}-target`
```

Both sides derive the id from the column name. Because `PositionedEdge.fromColumn`
and `PositionedEdge.toColumn` are the same names as the `ColumnNode.name` values
that `TableNode` uses, the ids always match for a valid, validated schema. If this
naming convention changes in either file, both files must be updated together.

---

## 6. React Flow Canvas

**File:** `frontend/src/diagram/DiagramCanvas.tsx`

`DiagramCanvas` is the top-level component that mounts React Flow. It accepts a
`LayoutResult` prop and converts it to React Flow data via `useDiagramData`.

### Component structure

`DiagramCanvas` is split into two components to satisfy React Flow's context
requirement:

```
DiagramCanvas (exported)
└── wraps in: <div style={{ width: '100%', height: '100%' }}>
    └── <ReactFlowProvider>
        └── DiagramCanvasInner (internal)
            ├── useDiagramData(layout)
            └── <ReactFlow ...>
                ├── <Background />
                ├── <Controls />
                └── <MiniMap />
```

`ReactFlowProvider` supplies the React Flow internal store to all descendants.
It is required when React Flow hooks (`useReactFlow`, `useNodes`, etc.) may be
used by child components — even if not currently used, the provider future-proofs
the component tree.

### Canvas configuration

| Prop | Value | Effect |
|------|-------|--------|
| `fitView` | `true` | On mount, zoom and pan to fit all nodes in the viewport |
| `fitViewOptions.padding` | `0.15` | 15% padding around the fitted diagram |
| `fitViewOptions.maxZoom` | `1.2` | Prevents fitting from zooming in excessively for small schemas |
| `minZoom` | `0.1` | Users can zoom out to 10% to see very large schemas |
| `maxZoom` | `2` | Prevents over-zooming that would make nodes unreadable |
| `defaultEdgeOptions.type` | `'smoothstep'` | Default edge style for any edges without explicit type |

### Plugins

**`Background`** — renders a dot-grid background:
- `variant: BackgroundVariant.Dots`
- `gap: 20px`, `size: 1px`, `color: #e2e8f0`

**`Controls`** — zoom-in / zoom-out / fit-view buttons (bottom-left):
- `showInteractive: false` — hides the lock/unlock interactive mode button

**`MiniMap`** — overview of the full diagram (bottom-right):
- `nodeColor: '#1e293b'` — table nodes appear as dark rectangles in the minimap

### Why `nodeTypes` is defined outside the component

```ts
// Correct — defined at module level
const nodeTypes = { tableNode: TableNode }

// Wrong — defined inside the component
function DiagramCanvasInner() {
  const nodeTypes = { tableNode: TableNode }  // new object every render
  ...
}
```

React Flow uses `nodeTypes` object reference identity to decide whether to
re-mount node components. If `nodeTypes` is defined inside the component
function, it creates a new object on every render. React Flow detects the
new reference and unmounts/remounts all existing nodes, causing a visible
flash and losing any in-progress interaction state (e.g. a node being dragged).

Defining `nodeTypes` at module level means the reference is created once and
never changes.

---

## 7. Next.js SSR Considerations

**File:** `frontend/src/app/page.tsx`

Next.js 14 with the App Router renders both server components and client
components on the server during prerendering — even components marked with
`'use client'` are server-rendered to generate the initial HTML shell.

React Flow depends on browser-only globals that do not exist in Node.js:

| API | Why React Flow uses it |
|-----|------------------------|
| `window` | Viewport size, event listeners |
| `ResizeObserver` | Detects node dimension changes |
| `requestAnimationFrame` | Smooth pan/zoom animation |

If React Flow is evaluated during server-side prerendering, Node.js throws
because these APIs are undefined. The error manifests as:

```
Error: Element type is invalid: expected a string or class/function but got: undefined
```

### Solution: `dynamic` import with `ssr: false`

```ts
const DiagramCanvas = dynamic(
  () => import('../diagram/DiagramCanvas').then(mod => ({ default: mod.DiagramCanvas })),
  { ssr: false, loading: () => <div>Loading diagram…</div> }
)
```

With `ssr: false`:
1. The `DiagramCanvas` module is **never imported on the server**. React Flow's
   browser dependencies are never evaluated in Node.js.
2. The server renders the `loading` fallback (`"Loading diagram…"`) as the
   initial HTML.
3. In the browser, Next.js lazy-loads the `DiagramCanvas` chunk and replaces
   the fallback once the bundle arrives.

### Pipeline computation stays on the client

`page.tsx` also runs `parseDBML → buildDiagramGraph → layoutGraph` via
`useMemo`. These functions use only `dagre` and pure TypeScript — no browser
APIs — so they can technically run on the server. However, since `page.tsx`
has `'use client'`, `useMemo` runs in the browser anyway. This keeps the entire
diagram pipeline (parsing, layout, rendering) on the client, which is appropriate
for an interactive editor that will eventually support live DBML editing.

---

## 8. Example Rendering Flow

### Input DBML (simplified)

```dbml
Table users {
  id      int [pk]
  email   varchar [not null, unique]
}

Table orders {
  id      int [pk]
  user_id int [ref: > users.id]
}
```

### LayoutResult (after `layoutGraph`)

```json
{
  "nodes": [
    { "id": "users",  "tableName": "users",  "columns": [...], "x": 330, "y": 0,  "width": 240, "height": 112 },
    { "id": "orders", "tableName": "orders", "columns": [...], "x": 0,   "y": 0,  "width": 240, "height": 112 }
  ],
  "edges": [
    { "id": "orders_user_id_users_id", "from": "orders", "to": "users", "fromColumn": "user_id", "toColumn": "id", "direction": ">" }
  ]
}
```

### React Flow Node[] (after `useDiagramData`)

```json
[
  {
    "id": "users",
    "type": "tableNode",
    "position": { "x": 330, "y": 0 },
    "data": { "tableName": "users", "columns": [...] },
    "style": { "width": 240 }
  },
  {
    "id": "orders",
    "type": "tableNode",
    "position": { "x": 0, "y": 0 },
    "data": { "tableName": "orders", "columns": [...] },
    "style": { "width": 240 }
  }
]
```

### React Flow Edge[] (after `useDiagramData`)

```json
[
  {
    "id": "orders_user_id_users_id",
    "source": "orders",
    "target": "users",
    "sourceHandle": "user_id-source",
    "targetHandle": "id-target",
    "type": "smoothstep",
    "label": "N:1",
    "markerEnd": { "type": "arrowclosed" }
  }
]
```

### What the user sees

- `orders` table card on the left with 2 column rows (`id`, `user_id`)
- `users` table card on the right with 2 column rows (`id`, `email`)
- A smoothstep arrow from the `user_id` row of `orders` to the `id` row of `users`
- `N:1` label mid-edge indicating cardinality
- Dot-grid background, controls panel, and minimap overlay

---

## 9. Design Principles

### The renderer does not depend on parser internals

`frontend/src/diagram/` imports only:
- `LayoutResult`, `ColumnNode` from `@dbdiagram/parser` (as types only)
- `Node`, `Edge`, `Handle`, `ReactFlow` from `reactflow`

It never imports `parseDBML`, `buildDiagramGraph`, `tokenizer`, `parser`, or
`validator`. A test can construct a `LayoutResult` directly from a literal object
and pass it to `DiagramCanvas` without running the parser.

### The renderer only consumes LayoutResult

`DiagramCanvas` has a single prop: `layout: LayoutResult`. The renderer does not
know how the layout was computed, whether it came from a DBML string, a SQL
import, or an AI generator. As long as the `LayoutResult` contract is satisfied,
the diagram renders correctly.

### The graph and layout engines are framework-independent

`parser/src/graph/` and `parser/src/layout/` contain no React, no browser APIs,
and no Next.js imports. They are pure TypeScript modules that can run in any
JavaScript environment: browser, Node.js, CLI, or test runner. This means the
layout logic can be tested and reused independently of the UI framework.

### React Flow is used only at the UI layer

React Flow is imported in exactly three files: `DiagramCanvas.tsx`,
`TableNode.tsx`, and `hooks/useDiagramData.ts`. No other module in the project
depends on it. To swap React Flow for a different renderer (canvas, SVG, etc.),
only these three files need to change — the rest of the pipeline is unaffected.

---

## 10. Extension Guidelines

### Column highlighting

To highlight a column (e.g. on hover or when an edge is selected):

1. Add a `highlightedColumn?: string` field to `TableNodeData`.
2. In `ColumnRow`, check whether `name === highlightedColumn` and apply a
   highlighted background style (e.g. `#fef9c3`).
3. In `DiagramCanvas`, use the React Flow `onEdgeMouseEnter`/`onEdgeMouseLeave`
   callbacks to track the hovered edge and derive which columns to highlight.
4. Update `useDiagramData` to accept the highlighted column state and pass it
   into each node's `data`.

### Editable diagrams and drag-and-drop table positioning

Nodes are already `draggable: true`. To persist drag positions:

1. Use React Flow's `onNodesChange` callback with `applyNodeChanges` from
   `reactflow` to manage node state in React (`useState`).
2. Store manually-positioned node ids and offsets in component state.
3. On a DBML change, re-run the layout engine but merge stored manual positions
   over the computed ones (see `docs/layout-engine.md`, section 10,
   "Supporting manual node positioning").

### Live DBML editing

To connect a Monaco Editor to the diagram:

1. Move the `useMemo(parseDBML → buildDiagramGraph → layoutGraph)` call into a
   parent component that owns both the editor state and the diagram state.
2. Debounce the DBML string before recomputing the layout (avoid running dagre
   on every keypress).
3. Pass the resulting `LayoutResult` as a prop to `DiagramCanvas`.
4. Parse errors from `parseDBML` can be displayed as an inline error banner
   above or below the editor. While the schema is invalid, continue showing the
   last valid `LayoutResult`.

### Collaborative editing

For real-time collaboration (multiple users editing the same schema):

1. Use Yjs (see `docs/collaboration.md`) to sync the DBML string across clients.
2. Each client independently runs the pipeline (parse → layout → render) on the
   synced DBML string. Layout is deterministic, so all clients compute identical
   positions from the same schema.
3. Manual node positions (from drag-and-drop) can be synced via a separate Yjs
   shared map keyed by node id.
4. `DiagramCanvas` itself needs no changes — it remains a pure consumer of
   `LayoutResult`.

### Custom edge rendering

To replace the `smoothstep` edges with crow's foot notation:

1. Create a custom edge component (e.g. `RelationEdge.tsx`) using React Flow's
   `EdgeProps` type and `getSmoothStepPath` or `getBezierPath` utilities.
2. Draw SVG paths for crow's foot markers based on `edge.data.direction`.
3. Register it in an `edgeTypes` object (same pattern as `nodeTypes`) and pass
   it to `<ReactFlow edgeTypes={edgeTypes}>`.
4. In `useDiagramData`, set `type: 'relationEdge'` and pass `direction` in the
   edge `data` field.
5. Define `edgeTypes` at module level in `DiagramCanvas.tsx` (same reason as
   `nodeTypes` — stable reference).
