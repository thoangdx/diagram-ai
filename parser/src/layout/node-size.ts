import type { DiagramNode } from '../graph/types'
import type { NodeSize } from './types'

/**
 * Pixel dimensions for table node rendering.
 *
 * HEADER_HEIGHT  — table name bar at the top of the card
 * ROW_HEIGHT     — height per column row
 * PADDING        — extra vertical space added below the last row
 * NODE_WIDTH     — fixed card width (all tables share the same width)
 */
const HEADER_HEIGHT = 40
const ROW_HEIGHT = 28
const PADDING = 16
const NODE_WIDTH = 240

/**
 * Compute the pixel dimensions of a table node.
 *
 * Height is proportional to the number of columns:
 *   height = HEADER_HEIGHT + (columns.length × ROW_HEIGHT) + PADDING
 *
 * Width is fixed at NODE_WIDTH regardless of content.
 *
 * An empty table (zero columns) still has a minimum height of
 * HEADER_HEIGHT + PADDING = 56px, so the header is always visible.
 */
export function computeNodeSize(node: DiagramNode): NodeSize {
  const height = HEADER_HEIGHT + node.columns.length * ROW_HEIGHT + PADDING
  return { width: NODE_WIDTH, height }
}

export { HEADER_HEIGHT, ROW_HEIGHT, PADDING, NODE_WIDTH }
