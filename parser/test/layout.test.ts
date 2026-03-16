/**
 * Integration tests for the layout engine (parser/src/layout/).
 * Run with:  npm test --workspace=parser
 */

import { parseDBML, buildDiagramGraph, layoutGraph, computeNodeSize } from '../src/index'
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  PADDING,
  NODE_WIDTH,
} from '../src/index'
import type { DiagramGraph, LayoutResult, PositionedNode } from '../src/index'

// ── Minimal test harness (shared style with graph-builder.test.ts) ────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function layoutFrom(dbml: string): LayoutResult {
  return layoutGraph(buildDiagramGraph(parseDBML(dbml)))
}

function graphFrom(dbml: string): DiagramGraph {
  return buildDiagramGraph(parseDBML(dbml))
}

// ── 1. Node size computation ──────────────────────────────────────────────────

console.log('\n1. Node size computation')

test('width is always NODE_WIDTH', () => {
  const node = graphFrom('Table users { id int  name varchar }').nodes[0]
  assertEqual(computeNodeSize(node).width, NODE_WIDTH, 'width')
})

test('empty table height = HEADER_HEIGHT + PADDING', () => {
  const node = graphFrom('Table empty {}').nodes[0]
  assertEqual(computeNodeSize(node).height, HEADER_HEIGHT + PADDING, 'height')
})

test('one-column table height = HEADER + 1 row + PADDING', () => {
  const node = graphFrom('Table t { id int }').nodes[0]
  assertEqual(computeNodeSize(node).height, HEADER_HEIGHT + ROW_HEIGHT + PADDING, 'height')
})

test('five-column table height = HEADER + 5 rows + PADDING', () => {
  const node = graphFrom('Table t { a int  b int  c int  d int  e int }').nodes[0]
  const expected = HEADER_HEIGHT + 5 * ROW_HEIGHT + PADDING
  assertEqual(computeNodeSize(node).height, expected, 'height')
})

test('height grows linearly with column count', () => {
  const g1 = graphFrom('Table t { a int }')
  const g2 = graphFrom('Table t { a int  b int }')
  const h1 = computeNodeSize(g1.nodes[0]).height
  const h2 = computeNodeSize(g2.nodes[0]).height
  assertEqual(h2 - h1, ROW_HEIGHT, 'height delta per column')
})

// ── 2. Nodes receive x/y coordinates ─────────────────────────────────────────

console.log('\n2. Nodes receive x/y coordinates')

test('single node gets numeric x coordinate', () => {
  const layout = layoutFrom('Table users { id int }')
  assert(typeof layout.nodes[0].x === 'number', 'x is a number')
})

test('single node gets numeric y coordinate', () => {
  const layout = layoutFrom('Table users { id int }')
  assert(typeof layout.nodes[0].y === 'number', 'y is a number')
})

test('node x/y are finite numbers (not NaN or Infinity)', () => {
  const layout = layoutFrom('Table users { id int  name varchar }')
  const node = layout.nodes[0]
  assert(Number.isFinite(node.x), `x is finite (got ${node.x})`)
  assert(Number.isFinite(node.y), `y is finite (got ${node.y})`)
})

test('node carries width after layout', () => {
  const layout = layoutFrom('Table t { id int }')
  assertEqual(layout.nodes[0].width, NODE_WIDTH, 'width')
})

test('node carries correct height after layout', () => {
  const layout = layoutFrom('Table t { id int  name varchar }')
  const expected = HEADER_HEIGHT + 2 * ROW_HEIGHT + PADDING
  assertEqual(layout.nodes[0].height, expected, 'height')
})

test('empty graph produces empty nodes and edges', () => {
  const layout = layoutFrom('')
  assertEqual(layout.nodes.length, 0, 'node count')
  assertEqual(layout.edges.length, 0, 'edge count')
})

// ── 3. Node count and identity preservation ───────────────────────────────────

console.log('\n3. Node count and identity preservation')

test('node count matches input graph', () => {
  const layout = layoutFrom('Table a { id int } Table b { id int } Table c { id int }')
  assertEqual(layout.nodes.length, 3, 'node count')
})

test('node ids are preserved after layout', () => {
  const layout = layoutFrom('Table users { id int } Table orders { id int }')
  const ids = layout.nodes.map((n) => n.id).sort()
  assertEqual(ids, ['orders', 'users'], 'ids')
})

test('node tableName is preserved after layout', () => {
  const layout = layoutFrom('Table users { id int }')
  assertEqual(layout.nodes[0].tableName, 'users', 'tableName')
})

test('node columns are preserved after layout', () => {
  const layout = layoutFrom('Table users { id int [pk]  email varchar [not null] }')
  const cols = layout.nodes[0].columns
  assertEqual(cols.length, 2, 'column count')
  assertEqual(cols[0].name, 'id',    'col 0 name')
  assertEqual(cols[1].name, 'email', 'col 1 name')
})

test('node primaryKey flag is preserved after layout', () => {
  const layout = layoutFrom('Table t { id int [pk] }')
  assertEqual(layout.nodes[0].columns[0].primaryKey, true, 'primaryKey')
})

// ── 4. Edge preservation ──────────────────────────────────────────────────────

console.log('\n4. Edge preservation')

test('edge count matches input graph', () => {
  const layout = layoutFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(layout.edges.length, 1, 'edge count')
})

test('no edges when schema has no relations', () => {
  const layout = layoutFrom('Table a { id int } Table b { id int }')
  assertEqual(layout.edges.length, 0, 'edge count')
})

test('edge id is preserved after layout', () => {
  const layout = layoutFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(layout.edges[0].id, 'orders_user_id_users_id', 'edge id')
})

test('edge from/to are preserved after layout', () => {
  const layout = layoutFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(layout.edges[0].from, 'orders', 'from')
  assertEqual(layout.edges[0].to,   'users',  'to')
})

test('edge direction is preserved after layout', () => {
  const layout = layoutFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(layout.edges[0].direction, '>', 'direction')
})

test('three edges are all preserved after layout', () => {
  const layout = layoutFrom(`
    Table users    { id int [pk] }
    Table products { id int [pk] }
    Table orders   {
      id         int [pk]
      user_id    int [ref: > users.id]
    }
    Table order_items {
      id         int [pk]
      order_id   int [ref: > orders.id]
      product_id int [ref: > products.id]
    }
  `)
  assertEqual(layout.edges.length, 3, 'edge count')
  assert(layout.edges.some((e) => e.id === 'orders_user_id_users_id'),            'edge 1')
  assert(layout.edges.some((e) => e.id === 'order_items_order_id_orders_id'),     'edge 2')
  assert(layout.edges.some((e) => e.id === 'order_items_product_id_products_id'), 'edge 3')
})

// ── 5. Multiple tables layout ─────────────────────────────────────────────────

console.log('\n5. Multiple tables layout')

test('two connected tables receive distinct x coordinates (LR layout)', () => {
  const layout = layoutFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  const [n0, n1] = layout.nodes
  assert(n0.x !== n1.x, `nodes have different x (${n0.x} vs ${n1.x})`)
})

test('two unrelated tables both receive valid coordinates', () => {
  const layout = layoutFrom('Table a { id int } Table b { id int }')
  for (const node of layout.nodes) {
    assert(Number.isFinite(node.x), `${node.id}.x is finite`)
    assert(Number.isFinite(node.y), `${node.id}.y is finite`)
  }
})

test('layout is deterministic — same graph produces same coordinates', () => {
  const dbml = `
    Table users  { id int [pk]  name varchar }
    Table orders { id int [pk]  user_id int [ref: > users.id] }
  `
  const r1 = layoutFrom(dbml)
  const r2 = layoutFrom(dbml)
  for (let i = 0; i < r1.nodes.length; i++) {
    assertEqual(r1.nodes[i].x, r2.nodes[i].x, `nodes[${i}].x`)
    assertEqual(r1.nodes[i].y, r2.nodes[i].y, `nodes[${i}].y`)
  }
})

test('four-table e-commerce schema: all nodes get coordinates', () => {
  const layout = layoutFrom(`
    Table users    { id int [pk]  name varchar }
    Table products { id int [pk]  price int }
    Table orders   {
      id      int [pk]
      user_id int [ref: > users.id]
    }
    Table order_items {
      id         int [pk]
      order_id   int [ref: > orders.id]
      product_id int [ref: > products.id]
    }
  `)

  assertEqual(layout.nodes.length, 4, 'node count')
  assertEqual(layout.edges.length, 3, 'edge count')

  for (const node of layout.nodes) {
    assert(Number.isFinite(node.x),      `${node.id}.x is finite`)
    assert(Number.isFinite(node.y),      `${node.id}.y is finite`)
    assert(node.width  > 0,              `${node.id}.width > 0`)
    assert(node.height > 0,              `${node.id}.height > 0`)
  }
})

test('nodes do not overlap horizontally in a linear chain', () => {
  // Chain: a → b → c.  LR layout places them in distinct rank columns.
  // Each table has its own id column so cross-table references are valid.
  const layout = layoutFrom(`
    Table a { id int [pk] }
    Table b { id int [pk]  a_id int [ref: > a.id] }
    Table c { id int [pk]  b_id int [ref: > b.id] }
  `)
  const sorted = [...layout.nodes].sort((n1, n2) => n1.x - n2.x)
  for (let i = 0; i < sorted.length - 1; i++) {
    const left  = sorted[i]
    const right = sorted[i + 1]
    assert(
      left.x + left.width <= right.x,
      `${left.id} (x=${left.x} w=${left.width}) does not overlap ${right.id} (x=${right.x})`,
    )
  }
})

test('node x/y are non-negative after layout', () => {
  // Dagre always places nodes at positive coordinates for standard graphs.
  const layout = layoutFrom(`
    Table users    { id int [pk] }
    Table orders   { user_id int [ref: > users.id] }
    Table products { id int [pk] }
  `)
  for (const node of layout.nodes) {
    assert(node.x >= 0, `${node.id}.x >= 0 (got ${node.x})`)
    assert(node.y >= 0, `${node.id}.y >= 0 (got ${node.y})`)
  }
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log(`${'─'.repeat(50)}\n`)

if (failed > 0) process.exit(1)
