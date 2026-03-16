# Layout Engine Architecture

This document describes the layout engine module (`parser/src/layout/`). It is
written for AI sessions and developers who need to understand, maintain, or
extend the layout stage without reading the full codebase.

Read this document before modifying any file in `parser/src/layout/`.

---

## 1. System Pipeline

The layout engine is the third major stage in the data pipeline that transforms
raw DBML text into a rendered diagram:

```
DBML text  (Monaco Editor)
  ↓
Tokenizer + Parser + Validator  (parser/src/)
  ↓
DatabaseSchema AST  { tables[], relations[] }
  ↓
buildDiagramGraph()  (parser/src/graph/)
  ↓
DiagramGraph  { nodes[], edges[] }          ← layout engine input
  ↓
layoutGraph()  (parser/src/layout/)         ← this layer
  ↓
LayoutResult  { nodes: PositionedNode[], edges: PositionedEdge[] }
  ↓
React Flow renderer  (frontend/src/diagram/)
```

The layout engine's sole responsibility is **computing pixel coordinates and
dimensions for every table node**. It takes a topology-only graph (no positions)
and returns that same graph with `x`, `y`, `width`, and `height` attached to
each node.

It does not parse DBML, does not validate schemas, and does not render anything.
It is the narrow bridge between the graph model and the visual renderer.

---

## 2. Layout Input Model

The layout engine accepts a `DiagramGraph`, defined in `parser/src/graph/types.ts`
and documented in `docs/graph-model.md`.

```ts
interface DiagramGraph {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}
```

### What the layout engine uses from each type

**`DiagramNode`**

```ts
interface DiagramNode {
  id: string
  tableName: string
  columns: ColumnNode[]
}
```

| Field | Used for |
|-------|----------|
| `id` | Identifies the node in the dagre graph. Must be unique — dagre uses it as the vertex key. |
| `columns` | Length determines node height (more columns → taller card). Content is not inspected. |
| `tableName` | Carried through to output unchanged. Not used by the layout algorithm itself. |

**`DiagramEdge`**

```ts
interface DiagramEdge {
  id: string
  from: string   // source node id
  to: string     // target node id
  ...
}
```

| Field | Used for |
|-------|----------|
| `from` | Registered as the edge source in dagre. Affects which rank column the source node is placed in. |
| `to` | Registered as the edge target in dagre. Affects which rank column the target node is placed in. |
| Everything else | Ignored by the layout algorithm. Carried through to output unchanged. |

The layout engine never needs column names, types, constraint flags, or relation
directions. It only needs `id`, `columns.length`, `from`, and `to`.

---

## 3. Layout Output Model

Defined in `parser/src/layout/types.ts`.

### `PositionedNode`

```ts
interface PositionedNode extends DiagramNode {
  x: number
  y: number
  width: number
  height: number
}
```

A `DiagramNode` with four additional fields:

| Field | Meaning |
|-------|---------|
| `x` | Left edge of the node rectangle, in pixels. Top-left origin. |
| `y` | Top edge of the node rectangle, in pixels. Top-left origin. |
| `width` | Horizontal size of the node card in pixels. Fixed at 240px. |
| `height` | Vertical size of the node card in pixels. Proportional to column count. |

All original `DiagramNode` fields (`id`, `tableName`, `columns`) are preserved
unchanged.

### `PositionedEdge`

```ts
type PositionedEdge = DiagramEdge
```

`PositionedEdge` is a type alias for `DiagramEdge` — edges pass through the
layout engine without modification. React Flow derives edge paths from the source
and target node handles, so no waypoint data is needed at this stage.

The alias exists to keep the pipeline symmetric: callers always work with
`LayoutResult`, never with mixed `DiagramNode`/`DiagramEdge` types, and the
type can be extended to carry waypoints in a future version without changing call
sites.

### `LayoutResult`

```ts
interface LayoutResult {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}
```

The complete output of the layout engine. Contains the same nodes and edges as
the input `DiagramGraph` — none are added or removed — but every node now has
pixel coordinates and dimensions attached.

This is the type the React Flow renderer consumes directly:

```ts
// Renderer mapping (pseudocode)
const flowNodes = layout.nodes.map(node => ({
  id:       node.id,
  type:     'tableNode',
  position: { x: node.x, y: node.y },
  data:     { tableName: node.tableName, columns: node.columns },
}))

const flowEdges = layout.edges.map(edge => ({
  id:     edge.id,
  source: edge.from,
  target: edge.to,
}))
```

---

## 4. Node Size Model

**File:** `parser/src/layout/node-size.ts`

Before registering nodes with dagre, the layout engine must know the pixel
dimensions of each node. Dagre needs dimensions to reserve space and prevent
overlap — without them, nodes would be treated as zero-size points and placed on
top of each other.

### Size formula

```
height = HEADER_HEIGHT + (columns.length × ROW_HEIGHT) + PADDING
width  = NODE_WIDTH  (constant — all tables share the same width)
```

### Constants

| Constant | Value | Visual meaning |
|----------|-------|----------------|
| `HEADER_HEIGHT` | 40px | The table name bar at the top of the card |
| `ROW_HEIGHT` | 28px | Height of one column row in the card body |
| `PADDING` | 16px | Extra vertical space below the last row |
| `NODE_WIDTH` | 240px | Fixed card width regardless of content |

### Examples

| Table | Columns | Height calculation | Height |
|-------|---------|-------------------|--------|
| Empty table | 0 | 40 + 0×28 + 16 | 56px |
| `users` (3 cols) | 3 | 40 + 3×28 + 16 | 140px |
| `order_items` (5 cols) | 5 | 40 + 5×28 + 16 | 196px |

### Why fixed width

All tables use the same width (240px) so the layout algorithm can treat them
uniformly. Variable-width nodes would require measuring rendered text, which
is not possible in a pure layout computation step that runs outside the browser.

---

## 5. Dagre Layout Algorithm

**File:** `parser/src/layout/dagre-layout.ts`

The layout engine uses the [Dagre](https://github.com/dagrejs/dagre) library,
which implements the Sugiyama layered graph drawing algorithm. Dagre handles:

- **Cycle removal** — reverses back-edges so the graph is a DAG
- **Layer assignment** — places each node into a rank (column in LR mode)
- **Crossing minimisation** — reorders nodes within each rank to reduce edge crossings
- **Coordinate assignment** — computes final pixel positions for each node

### Graph configuration

```ts
const GRAPH_CONFIG = {
  rankdir: 'LR',   // left-to-right layout direction
  ranksep: 80,     // horizontal gap between rank columns, in pixels
  nodesep: 40,     // vertical gap between nodes in the same rank, in pixels
}
```

### Why `rankdir: 'LR'`

In an ER diagram, foreign keys point from the dependent table (e.g. `orders`)
to the referenced table (e.g. `users`). Readers naturally scan these
relationships left-to-right:

```
orders  ──────────→  users
        user_id → id
```

Using `LR` layout places the referencing table to the left of the referenced
table, which matches this reading direction and produces diagrams that feel
natural to database engineers.

An alternative `TB` (top-to-bottom) layout would produce taller diagrams that
waste horizontal space on wide monitors — less appropriate for typical database
schemas with many tables at similar depths.

### Disconnected nodes

Tables with no foreign key relationships are not connected to any other node in
the dagre graph. Dagre handles this correctly: it places disconnected nodes in
their own rank columns, so they appear to the left of the connected subgraph.
No special handling is required.

---

## 6. Coordinate Conversion

Dagre returns node coordinates as **center points** — `(x, y)` is the center of
the node bounding box, not the top-left corner.

React Flow (and most 2D canvas/SVG renderers) use **top-left origin** for node
positioning — `position: { x, y }` is the top-left corner of the node element.

The layout engine performs this conversion before returning results:

```ts
x = dagreNode.x - width / 2
y = dagreNode.y - height / 2
```

Visually:

```
dagre result           converted result
(cx, cy) = center      (x, y) = top-left
    ·                  ┌──────────┐
  (cx,cy)              │          │
    ·                  │          │
                       └──────────┘
                       (x, y)
```

**Why this matters:** if the conversion is skipped, every node will be rendered
offset by half its own dimensions. The top-left of the rendered card will appear
at what dagre intended as the center — shifting all nodes down and to the right,
and causing nodes to overlap even though dagre computed non-overlapping positions.

---

## 7. Layout Engine API

**File:** `parser/src/layout/layout-engine.ts`

### Public function

```ts
function layoutGraph(graph: DiagramGraph): LayoutResult
```

This is the **only function callers should use**. It is the single public entry
point for the layout stage. Internal functions (`runDagreLayout`,
`computeNodeSize`) are exported from the module but are considered
implementation details.

### Precondition

`graph` must be built from a validated `DatabaseSchema` — i.e. produced via
`parseDBML()`, not by calling the raw `parse()` function. If an edge in the
graph references a node id that does not exist in `graph.nodes`, dagre will
silently ignore that edge. The resulting positions will still be valid, but the
ignored relationship will not influence the layout.

### Internal pipeline

```
layoutGraph(graph: DiagramGraph)
  ↓
runDagreLayout(graph)                     dagre-layout.ts
  │
  ├── new dagre.graphlib.Graph()
  ├── g.setGraph({ rankdir: 'LR', ... })
  │
  ├── for each DiagramNode:
  │     computeNodeSize(node)             node-size.ts
  │     g.setNode(node.id, { width, height })
  │
  ├── for each DiagramEdge:
  │     g.setEdge(edge.from, edge.to)
  │
  ├── dagre.layout(g)                     ← algorithm runs here
  │
  ├── for each node:
  │     extract (x, y) from dagre
  │     convert center → top-left
  │     spread DiagramNode fields
  │     → PositionedNode
  │
  └── edges: map DiagramEdge → PositionedEdge (identity copy)
  ↓
LayoutResult { nodes: PositionedNode[], edges: PositionedEdge[] }
```

### Purity contract

`layoutGraph` is a pure function. Given the same `DiagramGraph` it always
returns an identical `LayoutResult`. It has no side effects, no internal state,
and no I/O. The same schema produces the same pixel positions every time, which
makes the renderer predictable and layout caching straightforward to implement.

### Typical call sequence

```ts
const schema = parseDBML(dbmlText)       // DBML → validated AST
const graph  = buildDiagramGraph(schema) // AST  → graph model
const layout = layoutGraph(graph)        // graph → positioned nodes
```

---

## 8. Example Transformation

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

### Intermediate DiagramGraph

```json
{
  "nodes": [
    { "id": "users",  "tableName": "users",  "columns": [/* 2 columns */] },
    { "id": "orders", "tableName": "orders", "columns": [/* 3 columns */] }
  ],
  "edges": [
    { "id": "orders_user_id_users_id", "from": "orders", "to": "users", "direction": ">" }
  ]
}
```

### Node size computation

```
users:   height = 40 + 2×28 + 16 = 112px,  width = 240px
orders:  height = 40 + 3×28 + 16 = 140px,  width = 240px
```

### LayoutResult (approximate pixel values)

```json
{
  "nodes": [
    {
      "id": "users",
      "tableName": "users",
      "columns": [/* 2 columns — preserved */],
      "x": 330,
      "y": 0,
      "width": 240,
      "height": 112
    },
    {
      "id": "orders",
      "tableName": "orders",
      "columns": [/* 3 columns — preserved */],
      "x": 0,
      "y": 0,
      "width": 240,
      "height": 140
    }
  ],
  "edges": [
    {
      "id": "orders_user_id_users_id",
      "from": "orders",
      "to": "users",
      "fromColumn": "user_id",
      "toColumn": "id",
      "direction": ">"
    }
  ]
}
```

Key observations:
- `orders` (the referencing table) is placed to the left of `users` (the
  referenced table), consistent with `rankdir: 'LR'`.
- `x` and `y` are top-left coordinates — the dagre center-to-top-left
  conversion has already been applied.
- All `DiagramNode` fields (`tableName`, `columns`) are preserved on each
  `PositionedNode`.
- The edge is identical to the input `DiagramEdge` — no waypoints or additional
  fields are added.
- Exact pixel values depend on dagre's internal algorithm; the example shows
  representative output.

---

## 9. Design Principles

### The layout engine does not depend on the parser

`parser/src/layout/` imports only from `parser/src/graph/types.ts` (for
`DiagramGraph`, `DiagramNode`, `DiagramEdge`) and the `dagre` library. It never
imports from `tokenizer.ts`, `parser.ts`, `validator.ts`, or `ast.ts`.

This means the layout engine can be tested and reasoned about independently of
the DBML grammar. A test can construct a `DiagramGraph` directly from a literal
object without parsing any DBML, and the layout will work identically.

### The layout engine does not depend on the renderer

`parser/src/layout/` has no knowledge of React, React Flow, or any browser API.
It produces plain TypeScript objects with numeric coordinates. Any renderer that
understands `{ x, y, width, height }` can consume `LayoutResult` without
modification.

This decoupling means the renderer can be replaced (e.g. switching from React
Flow to a canvas-based renderer, or a SVG export) without touching the layout
engine.

### The graph model is the contract

The `DiagramGraph` type is the interface contract between the parser layer and
the layout layer. The layout engine does not know how the graph was built — it
only requires that `node.id` values are unique and that `edge.from`/`edge.to`
reference valid node ids. As long as this contract holds, the layout engine
produces correct output regardless of the source (DBML, SQL import, AI
generation, or a hand-crafted test fixture).

### Layout is deterministic

Given the same `DiagramGraph`, `layoutGraph` always returns the same pixel
positions. This follows from dagre's determinism and the absence of any random
or time-based state in `layoutGraph`, `runDagreLayout`, or `computeNodeSize`.

Determinism enables layout caching: `hash(diagramGraph) → LayoutResult` is a
valid optimisation. If the graph has not changed, the cached layout can be
reused without re-running dagre, which is important for real-time editing where
the schema is recomputed on every keypress.

---

## 10. Extension Guidelines

### Replacing the layout algorithm

`layout-engine.ts` delegates entirely to `dagre-layout.ts`. To substitute a
different algorithm (ELK.js, custom force-directed, manual positioning):

1. Create a new file alongside `dagre-layout.ts` (e.g. `elk-layout.ts`)
   implementing the same `(graph: DiagramGraph) => LayoutResult` signature.
2. Change the single import in `layout-engine.ts` to point to the new file.
3. No other code needs to change — `layoutGraph`'s signature is unchanged, and
   all consumers receive the same `LayoutResult` type.

### Changing spacing rules

`ranksep` (horizontal gap between rank columns) and `nodesep` (vertical gap
between nodes in the same rank) are defined as part of `GRAPH_CONFIG` in
`dagre-layout.ts`. Adjust these constants to change diagram density.

To make spacing configurable per call, extend the `layoutGraph` signature to
accept an optional options object:

```ts
interface LayoutOptions {
  ranksep?: number
  nodesep?: number
}

function layoutGraph(graph: DiagramGraph, options?: LayoutOptions): LayoutResult
```

Pass the merged options to `GRAPH_CONFIG` inside `runDagreLayout`. The default
values in `GRAPH_CONFIG` act as fallbacks.

### Adding hierarchical grouping

To visually group tables by schema, domain, or prefix, use dagre's compound
graph support (`graph.setParent(nodeId, groupId)`). This requires:

1. Defining a grouping strategy (e.g. `public_*` tables form one group).
2. Registering group nodes in dagre before individual table nodes.
3. Calling `g.setParent(tableId, groupId)` for each table.
4. Extending `PositionedNode` with an optional `groupId` field so the renderer
   can draw group bounding boxes.

### Supporting manual node positioning

Some users may want to drag nodes to custom positions. To preserve manual
positions across re-renders:

1. Store a `manualPositions: Record<string, { x: number; y: number }>` map
   alongside the layout result.
2. In `runDagreLayout`, after computing dagre positions, override any node whose
   id appears in `manualPositions` with the stored coordinates.
3. The layout engine remains pure — pass `manualPositions` as a parameter rather
   than reading global state.

### Adding edge waypoints

`PositionedEdge` is currently a type alias for `DiagramEdge` (no geometry). To
add dagre-computed edge routing points:

1. Extend `PositionedEdge` with a `points?: Array<{ x: number; y: number }>`
   field.
2. In `runDagreLayout`, after `dagre.layout(g)`, extract edge points via
   `g.edge(from, to).points` and attach them to the `PositionedEdge`.
3. Update the renderer to use the waypoints when drawing edge paths instead of
   React Flow's default straight or bezier routing.

This change is backward-compatible: the `points` field is optional, and existing
renderer code that ignores `points` will continue to work.
