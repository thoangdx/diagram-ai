'use client'

import { createContext, useContext } from 'react'

export interface HoveredRelation {
  /** React Flow edge id (`fromTable_fromColumn_toTable_toColumn`) */
  edgeId: string
  toTable: string
  toColumn: string
}

interface HoverContextValue {
  hoveredRelation: HoveredRelation | null
  setHoveredRelation: (rel: HoveredRelation | null) => void
}

export const HoverContext = createContext<HoverContextValue>({
  hoveredRelation: null,
  setHoveredRelation: () => {},
})

export function useHoverContext(): HoverContextValue {
  return useContext(HoverContext)
}
