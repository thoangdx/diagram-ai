'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { parseDBML, buildDiagramGraph, layoutGraph } from '@dbdiagram/parser'
import type { LayoutResult } from '@dbdiagram/parser'

/**
 * DiagramCanvas is loaded with ssr: false because React Flow uses browser-only
 * APIs (window, ResizeObserver, requestAnimationFrame) that are not available
 * in Node.js. Without this, Next.js prerendering throws on the server.
 */
const DiagramCanvas = dynamic(
  () => import('../diagram/DiagramCanvas').then((mod) => ({ default: mod.DiagramCanvas })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#94a3b8',
          fontSize: 14,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        Loading diagram…
      </div>
    ),
  },
)

/**
 * Demo schema: users, products, orders, order_items.
 *
 * Covers all relation directions:
 *   >  (many-to-one)  orders.user_id         > users.id
 *   >  (many-to-one)  order_items.order_id   > orders.id
 *   >  (many-to-one)  order_items.product_id > products.id
 */
const DEMO_DBML = `
Table users {
  id         int      [pk]
  name       varchar  [not null]
  email      varchar  [not null, unique]
  created_at timestamp
}

Table products {
  id          int     [pk]
  name        varchar [not null]
  price       int     [not null]
  description varchar
}

Table orders {
  id         int       [pk]
  user_id    int       [ref: > users.id]
  status     varchar
  created_at timestamp
}

Table order_items {
  id         int [pk]
  order_id   int [ref: > orders.id]
  product_id int [ref: > products.id]
  quantity   int [not null]
}
`

/**
 * Home page — renders the demo ER diagram.
 *
 * The full pipeline (parseDBML → buildDiagramGraph → layoutGraph) runs
 * in the browser via useMemo. The LayoutResult is passed as a prop to
 * DiagramCanvas, which is loaded client-side only (ssr: false) to avoid
 * React Flow's dependency on browser globals during prerendering.
 */
export default function Home() {
  const layout: LayoutResult = useMemo(() => {
    const schema = parseDBML(DEMO_DBML)
    const graph = buildDiagramGraph(schema)
    return layoutGraph(graph)
  }, [])

  return (
    <main style={{ width: '100vw', height: '100vh' }}>
      <DiagramCanvas layout={layout} />
    </main>
  )
}
