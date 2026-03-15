# ERD Layout Engine Specification (Sugiyama Based)

This document describes the architecture and algorithms used to
automatically layout Entity Relationship Diagrams (ERD) for the database
diagram platform.

The goal is to compute readable positions for tables and relationships
so that large schemas remain understandable.

------------------------------------------------------------------------

# 1. Goal of the Layout Engine

Input:

-   Tables
-   Relationships

Output:

-   Node coordinates
-   Edge routing

Example:

Users Orders │ │ Payments OrderItems

------------------------------------------------------------------------

# 2. Graph Model

The schema is converted into a directed graph.

Node = Table\
Edge = Relationship

TypeScript model:

``` ts
interface GraphNode {
  id: string
  width: number
  height: number
}

interface GraphEdge {
  from: string
  to: string
}
```

------------------------------------------------------------------------

# 3. Layout Pipeline

Sugiyama layout algorithm consists of four main steps:

1.  Remove cycles
2.  Assign layers
3.  Minimize crossings
4.  Compute coordinates

Pipeline:

Graph ↓ Cycle Removal ↓ Layer Assignment ↓ Crossing Reduction ↓
Coordinate Assignment ↓ Layout Result

------------------------------------------------------------------------

# 4. Step 1 -- Cycle Removal

ERD graphs may contain cycles.

Example:

A → B → C → A

The Sugiyama algorithm requires a Directed Acyclic Graph (DAG).

Solution:

Reverse problematic edges.

Pseudo code:

``` ts
function removeCycles(graph) {
  performDFS()
  reverseBackEdges()
}
```

------------------------------------------------------------------------

# 5. Step 2 -- Layer Assignment

Each node is assigned to a layer.

Example:

Layer 0 : Users\
Layer 1 : Orders\
Layer 2 : Payments

Common algorithm:

Longest Path Layering

Pseudo code:

``` ts
for node in topologicalOrder:
  node.layer = max(parent.layer + 1)
```

------------------------------------------------------------------------

# 6. Step 3 -- Crossing Minimization

Goal:

Reduce edge crossings to improve readability.

Example of poor layout:

A ----\> C B ----\> D

Solution:

Barycenter method.

Pseudo code:

``` ts
for each layer:
  sort nodes by average position of neighbors
```

------------------------------------------------------------------------

# 7. Step 4 -- Coordinate Assignment

Compute node coordinates.

x = layer index\
y = order within layer

Spacing example:

horizontal spacing = 300px\
vertical spacing = 120px

Pseudo code:

``` ts
node.x = layer * horizontalSpacing
node.y = order * verticalSpacing
```

------------------------------------------------------------------------

# 8. Edge Routing

Edges should avoid overlapping tables.

Preferred edge type:

Orthogonal edges.

Example:

Users │ └── Orders

Routing strategy:

Polyline routing.

------------------------------------------------------------------------

# 9. Layout Engine Architecture

Module structure:

layout-engine ├ graph-builder.ts ├ cycle-removal.ts ├
layer-assignment.ts ├ crossing-minimization.ts ├
coordinate-assignment.ts └ layout.ts

------------------------------------------------------------------------

# 10. Layout API

Public interface:

``` ts
interface LayoutResult {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
}

function layoutGraph(graph: Graph): LayoutResult
```

------------------------------------------------------------------------

# 11. Integration With Diagram Renderer

The layout engine returns only coordinates.

Example output:

Users x = 0 y = 0

Orders x = 300 y = 0

Frontend renderer (React Flow or Canvas) uses these coordinates.

Example:

``` ts
nodes.map(node => ({
  id: node.id,
  position: { x: node.x, y: node.y }
}))
```

------------------------------------------------------------------------

# 12. Performance Strategy

Large diagrams may contain:

-   200 tables
-   1000 relationships

Optimization techniques:

Layout caching

hash(schema) → layout

Incremental layout

Only recompute local sections when schema changes.

------------------------------------------------------------------------

# 13. Recommended Libraries

Instead of implementing Sugiyama from scratch, existing libraries can be
used.

Recommended:

Dagre -- good for MVP

ELK.js -- advanced layout engine

------------------------------------------------------------------------

# 14. Example Dagre Implementation

``` ts
import dagre from "dagre"

const graph = new dagre.graphlib.Graph()

graph.setGraph({})
graph.setDefaultEdgeLabel(() => ({}))

graph.setNode("Users", { width: 200, height: 100 })
graph.setNode("Orders", { width: 200, height: 100 })

graph.setEdge("Users", "Orders")

dagre.layout(graph)
```

------------------------------------------------------------------------

# 15. Expected Output Example

Users x = 0 y = 0

Orders x = 300 y = 0

------------------------------------------------------------------------

# Summary

This layout engine design enables:

-   automatic ERD positioning
-   readable diagrams
-   scalability for large schemas

The engine can be integrated with the frontend renderer such as React
Flow.
