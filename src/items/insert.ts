import { newId, nextZ } from '../model/note'
import type { Item, Stroke } from '../model/types'
import { rectPts } from './draw'

/** Grosor de línea de las figuras (unidades de página). */
export const FIGURE_LINE = 3

function figure(item: Item, x0: number, y0: number, x1: number, y1: number, color: string): Stroke {
  return {
    id: newId(),
    tool: 'pen',
    color,
    opacity: 1,
    z: nextZ(),
    size: FIGURE_LINE,
    pts: rectPts(x0, y0, x1, y1),
    simulated: false,
    bbox: [0, 0, 0, 0],
    item,
  }
}

/** Ejes cartesianos cuadrados, centrados en (cx, cy), de -5 a 5 con cuadrícula. */
export function axesAt(cx: number, cy: number, side: number, color: string, fns: string[] = []): Stroke {
  const h = side / 2
  return figure({ kind: 'axes', xmin: -5, xmax: 5, ymin: -5, ymax: 5, grid: true, fns }, cx - h, cy - h, cx + h, cy + h, color)
}

/** Recta numérica de -5 a 5, centrada en (cx, cy). */
export function numberLineAt(cx: number, cy: number, width: number, color: string): Stroke {
  const h = Math.max(70, width / 9)
  return figure({ kind: 'numberline', min: -5, max: 5 }, cx - width / 2, cy - h / 2, cx + width / 2, cy + h / 2, color)
}
