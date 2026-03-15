/**
 * Unit tests for the graph builder layer (parser/src/graph/).
 * Run with:  npm test --workspace=parser
 */

import { parseDBML, buildDiagramGraph } from '../src/index'
import type { DiagramGraph, DiagramNode, DiagramEdge } from '../src/index'

// ── Minimal test harness (shared style with parser.test.ts) ──────────────────

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

// ── Helper: build a graph from a DBML string in one step ────────────────────

function graphFrom(dbml: string): DiagramGraph {
  return buildDiagramGraph(parseDBML(dbml))
}

// ── 1. Table → Node transformation ──────────────────────────────────────────

console.log('\n1. Table → Node transformation')

test('single table produces one node', () => {
  const graph = graphFrom('Table users { id int }')
  assertEqual(graph.nodes.length, 1, 'node count')
})

test('node id equals table name', () => {
  const graph = graphFrom('Table users { id int }')
  assertEqual(graph.nodes[0].id, 'users', 'node id')
})

test('node tableName equals table name', () => {
  const graph = graphFrom('Table users { id int }')
  assertEqual(graph.nodes[0].tableName, 'users', 'node tableName')
})

test('node id and tableName are identical', () => {
  const graph = graphFrom('Table orders { id int }')
  const node = graph.nodes[0]
  assertEqual(node.id, node.tableName, 'id === tableName')
})

test('node carries the table columns', () => {
  const graph = graphFrom('Table users { id int  name varchar }')
  const node = graph.nodes[0]
  assertEqual(node.columns.length, 2, 'column count')
  assertEqual(node.columns[0].name, 'id',      'first column name')
  assertEqual(node.columns[0].type, 'int',     'first column type')
  assertEqual(node.columns[1].name, 'name',    'second column name')
  assertEqual(node.columns[1].type, 'varchar', 'second column type')
})

test('node columns preserve primaryKey flag', () => {
  const graph = graphFrom('Table users { id int [pk] }')
  assertEqual(graph.nodes[0].columns[0].primaryKey, true, 'primaryKey')
})

test('node columns preserve notNull flag', () => {
  const graph = graphFrom('Table users { email varchar [not null] }')
  assertEqual(graph.nodes[0].columns[0].notNull, true, 'notNull')
})

test('node columns preserve unique flag', () => {
  const graph = graphFrom('Table users { email varchar [unique] }')
  assertEqual(graph.nodes[0].columns[0].unique, true, 'unique')
})

test('empty table produces a node with no columns', () => {
  const graph = graphFrom('Table empty {}')
  assertEqual(graph.nodes[0].columns.length, 0, 'column count')
})

test('empty schema produces empty graph', () => {
  const graph = graphFrom('')
  assertEqual(graph.nodes.length, 0, 'node count')
  assertEqual(graph.edges.length, 0, 'edge count')
})

// ── 2. Multiple tables ───────────────────────────────────────────────────────

console.log('\n2. Multiple tables')

test('two tables produce two nodes', () => {
  const graph = graphFrom('Table users { id int } Table orders { id int }')
  assertEqual(graph.nodes.length, 2, 'node count')
})

test('three tables produce three nodes', () => {
  const graph = graphFrom('Table a { id int } Table b { id int } Table c { id int }')
  assertEqual(graph.nodes.length, 3, 'node count')
})

test('node order matches table declaration order', () => {
  const graph = graphFrom('Table alpha { id int } Table beta { id int } Table gamma { id int }')
  assertEqual(graph.nodes.map((n) => n.id), ['alpha', 'beta', 'gamma'], 'node order')
})

test('each node has the correct table name', () => {
  const graph = graphFrom('Table users { id int } Table orders { id int }')
  const names = graph.nodes.map((n) => n.tableName)
  assert(names.includes('users'),  'has users node')
  assert(names.includes('orders'), 'has orders node')
})

// ── 3. Relation → Edge transformation ───────────────────────────────────────

console.log('\n3. Relation → Edge transformation')

test('one relation produces one edge', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges.length, 1, 'edge count')
})

test('edge from equals fromTable', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges[0].from, 'orders', 'edge.from')
})

test('edge to equals toTable', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges[0].to, 'users', 'edge.to')
})

test('edge fromColumn is correct', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges[0].fromColumn, 'user_id', 'edge.fromColumn')
})

test('edge toColumn is correct', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges[0].toColumn, 'id', 'edge.toColumn')
})

test('edge from/to match existing node ids', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  assert(nodeIds.has(graph.edges[0].from), 'edge.from references a node')
  assert(nodeIds.has(graph.edges[0].to),   'edge.to references a node')
})

test('direction > is preserved on edge', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges[0].direction, '>', 'direction')
})

test('direction < is preserved on edge', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { id int [ref: < users.id] }
  `)
  assertEqual(graph.edges[0].direction, '<', 'direction')
})

test('direction - is preserved on edge', () => {
  const graph = graphFrom(`
    Table users    { id int [pk] }
    Table profiles { id int [ref: - users.id] }
  `)
  assertEqual(graph.edges[0].direction, '-', 'direction')
})

// ── 4. Edge ID determinism ───────────────────────────────────────────────────

console.log('\n4. Edge ID determinism')

test('edge id follows fromTable_fromColumn_toTable_toColumn pattern', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assertEqual(graph.edges[0].id, 'orders_user_id_users_id', 'edge id')
})

test('edge id is deterministic — same schema always produces the same id', () => {
  const dbml = `
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `
  const id1 = buildDiagramGraph(parseDBML(dbml)).edges[0].id
  const id2 = buildDiagramGraph(parseDBML(dbml)).edges[0].id
  assertEqual(id1, id2, 'id stability')
})

test('edge ids are unique when columns differ', () => {
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders {
      user_id    int [ref: > users.id]
      created_by int [ref: > users.id]
    }
  `)
  const ids = graph.edges.map((e) => e.id)
  assertEqual(new Set(ids).size, ids.length, 'all ids unique')
  assert(ids.includes('orders_user_id_users_id'),    'first edge id')
  assert(ids.includes('orders_created_by_users_id'), 'second edge id')
})

test('edge id encodes direction-independent identity (from/to tables and columns)', () => {
  // The id is structural — it does not encode the direction symbol.
  const graph = graphFrom(`
    Table users  { id int [pk] }
    Table orders { user_id int [ref: > users.id] }
  `)
  assert(!graph.edges[0].id.includes('>'), 'id does not contain direction symbol')
})

// ── 5. Graph integrity ───────────────────────────────────────────────────────

console.log('\n5. Graph integrity')

test('nodes.length equals schema.tables.length', () => {
  const dbml = `
    Table a { id int }
    Table b { id int }
    Table c { id int }
  `
  const schema = parseDBML(dbml)
  const graph  = buildDiagramGraph(schema)
  assertEqual(graph.nodes.length, schema.tables.length, 'node count parity')
})

test('edges.length equals schema.relations.length', () => {
  const dbml = `
    Table users    { id int [pk] }
    Table orders   { user_id    int [ref: > users.id] }
    Table products { id int [pk] }
    Table items    { product_id int [ref: > products.id] }
  `
  const schema = parseDBML(dbml)
  const graph  = buildDiagramGraph(schema)
  assertEqual(graph.edges.length, schema.relations.length, 'edge count parity')
})

test('every edge.from corresponds to an existing node id', () => {
  const graph = graphFrom(`
    Table users    { id int [pk] }
    Table orders   { user_id int [ref: > users.id] }
    Table products { id int [pk] }
    Table items    { product_id int [ref: > products.id] }
  `)
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  for (const edge of graph.edges) {
    assert(nodeIds.has(edge.from), `edge.from '${edge.from}' has a matching node`)
  }
})

test('every edge.to corresponds to an existing node id', () => {
  const graph = graphFrom(`
    Table users    { id int [pk] }
    Table orders   { user_id int [ref: > users.id] }
    Table products { id int [pk] }
    Table items    { product_id int [ref: > products.id] }
  `)
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  for (const edge of graph.edges) {
    assert(nodeIds.has(edge.to), `edge.to '${edge.to}' has a matching node`)
  }
})

test('schema with no relations produces zero edges', () => {
  const graph = graphFrom('Table a { id int } Table b { name varchar }')
  assertEqual(graph.edges.length, 0, 'edge count')
})

test('schema with no tables produces zero nodes and zero edges', () => {
  const graph = graphFrom('')
  assertEqual(graph.nodes.length, 0, 'node count')
  assertEqual(graph.edges.length, 0, 'edge count')
})

// ── 6. Multiple relations ────────────────────────────────────────────────────

console.log('\n6. Multiple relations')

test('two foreign keys in one table produce two edges', () => {
  const graph = graphFrom(`
    Table users    { id int [pk] }
    Table products { id int [pk] }
    Table orders   {
      id         int [pk]
      user_id    int [ref: > users.id]
      product_id int [ref: > products.id]
    }
  `)
  assertEqual(graph.edges.length, 2, 'edge count')
})

test('two edges point to the correct target nodes', () => {
  const graph = graphFrom(`
    Table users    { id int [pk] }
    Table products { id int [pk] }
    Table orders   {
      user_id    int [ref: > users.id]
      product_id int [ref: > products.id]
    }
  `)
  const targets = graph.edges.map((e) => e.to).sort()
  assertEqual(targets, ['products', 'users'], 'edge targets')
})

test('foreign keys across different tables are all captured', () => {
  const graph = graphFrom(`
    Table users    { id int [pk] }
    Table products { id int [pk] }
    Table orders   { user_id    int [ref: > users.id] }
    Table items    { product_id int [ref: > products.id] }
  `)
  assertEqual(graph.edges.length, 2, 'edge count')
  assert(graph.edges.some((e) => e.from === 'orders' && e.to === 'users'),    'orders→users')
  assert(graph.edges.some((e) => e.from === 'items'  && e.to === 'products'), 'items→products')
})

test('full e-commerce schema: 4 tables, 3 relations', () => {
  const graph = graphFrom(`
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

  assertEqual(graph.nodes.length, 4, 'node count')
  assertEqual(graph.edges.length, 3, 'edge count')

  // Verify all node names
  const nodeIds = graph.nodes.map((n) => n.id).sort()
  assertEqual(nodeIds, ['order_items', 'orders', 'products', 'users'], 'node ids')

  // Verify edge ids
  assert(graph.edges.some((e) => e.id === 'orders_user_id_users_id'),          'edge 1 id')
  assert(graph.edges.some((e) => e.id === 'order_items_order_id_orders_id'),   'edge 2 id')
  assert(graph.edges.some((e) => e.id === 'order_items_product_id_products_id'), 'edge 3 id')

  // Verify column metadata is present on nodes
  const ordersNode = graph.nodes.find((n) => n.id === 'orders')!
  assert(ordersNode !== undefined, 'orders node exists')
  assertEqual(ordersNode.columns.length, 2, 'orders column count')
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log(`${'─'.repeat(50)}\n`)

if (failed > 0) process.exit(1)
