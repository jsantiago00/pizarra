import { inkColor, luminance } from '../model/background'
import type { BBox } from '../model/types'
import type { Item, MathFormat, Stroke } from '../model/types'
import { compileExpr, sampleFn } from './expr'
import { EX, mathImage, mathSvg } from './math'

/**
 * Dibujo de los objetos (texto, fórmulas, ejes, recta numérica) en coordenadas de la página.
 * Lo usa la pantalla, las miniaturas, el PNG y el PDF (el contexto de jsPDF imita al del canvas).
 */

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
export const LINE_HEIGHT = 1.25

/** Colores de las curvas, en orden. */
export const CURVE_COLORS = ['#2f5bd3', '#d0342c', '#23875a', '#7b3fc4', '#d9822b']

/** Caja de un objeto, a partir de sus puntos (el rectángulo). */
export function itemBox(s: Pick<Stroke, 'pts'>): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < s.pts.length; i += 3) {
    x0 = Math.min(x0, s.pts[i])
    x1 = Math.max(x1, s.pts[i])
    y0 = Math.min(y0, s.pts[i + 1])
    y1 = Math.max(y1, s.pts[i + 1])
  }
  return [x0, y0, x1, y1]
}

/** Los puntos de un objeto: el contorno de su caja, cerrado. */
export function rectPts(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 1, x0, y0, 1]
}

let measureCtx: CanvasRenderingContext2D | null = null

/** Ancho y alto de un texto de varias líneas con ese tamaño de letra. */
export function measureText(text: string, size: number, bold = false): { w: number; h: number } {
  const lines = text.split('\n')
  measureCtx ??= typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  let w = 0
  for (const l of lines) {
    if (measureCtx) {
      measureCtx.font = fontOf(size, bold)
      w = Math.max(w, measureCtx.measureText(l).width)
    } else w = Math.max(w, l.length * size * 0.55)
  }
  return { w: Math.max(w, size * 0.5), h: lines.length * size * LINE_HEIGHT }
}

export function fontOf(size: number, bold = false, family = FONT): string {
  return `${bold ? 700 : 400} ${size}px ${family}`
}

/** Tamaño natural de una fórmula (null si MathJax todavía no cargó). */
export function measureMath(src: string, fmt: MathFormat, size: number): { w: number; h: number } | null {
  const m = mathSvg(src, fmt)
  return m && { w: m.wEx * EX * size, h: m.hEx * EX * size }
}

/** Margen interno de la caja de texto y de fórmulas, en proporción al tamaño de letra. */
export const PAD = 0.25

export interface DrawOptions {
  /**
   * Contexto de jsPDF: letra Helvetica, colores sin transparencia y las fórmulas como PNG
   * (con esta función, que las pone en la hoja del PDF).
   */
  pdf?: { image: (png: string, x: number, y: number, w: number, h: number) => void }
}

export function drawItem(ctx: CanvasRenderingContext2D, s: Stroke, paper: string, opts: DrawOptions = {}) {
  const item = s.item
  if (!item) return
  const [x0, y0, x1, y1] = itemBox(s)
  const color = inkColor(s.color, paper)
  ctx.save()
  ctx.globalAlpha = s.opacity
  switch (item.kind) {
    case 'text': {
      const pad = s.size * PAD
      ctx.fillStyle = color
      ctx.font = fontOf(s.size, item.bold, opts.pdf ? 'helvetica' : FONT)
      ctx.textBaseline = 'top'
      item.text.split('\n').forEach((line, i) => ctx.fillText(line, x0 + pad, y0 + pad + i * s.size * LINE_HEIGHT + s.size * 0.1))
      break
    }
    case 'math': {
      const img = mathImage(item.src, item.fmt, color)
      if (img) {
        if (opts.pdf) {
          const pad = s.size * PAD
          const w = x1 - x0 - 2 * pad
          const h = y1 - y0 - 2 * pad
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(w * 3))
          c.height = Math.max(1, Math.round(h * 3))
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
          opts.pdf.image(c.toDataURL('image/png'), x0 + pad, y0 + pad, w, h)
        } else {
          const pad = s.size * PAD
          ctx.drawImage(img, x0 + pad, y0 + pad, x1 - x0 - 2 * pad, y1 - y0 - 2 * pad)
        }
      } else {
        // Mientras carga: el texto tal cual, en gris
        ctx.fillStyle = '#888888'
        ctx.font = fontOf(s.size, false, opts.pdf ? 'helvetica' : FONT)
        ctx.textBaseline = 'middle'
        ctx.fillText(item.src, x0 + s.size * PAD, (y0 + y1) / 2)
      }
      break
    }
    case 'axes':
      drawAxes(ctx, item, [x0, y0, x1, y1], color, s.size, paper, !!opts.pdf)
      break
    case 'numberline':
      drawNumberLine(ctx, item, [x0, y0, x1, y1], color, s.size, !!opts.pdf)
      break
  }
  ctx.restore()
}

/** Un paso «lindo» (1, 2, 5 × 10ⁿ) para que entren unas `target` marcas. */
export function niceStep(range: number, target = 10): number {
  const raw = range / target
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

/** «−2,5» (en el PDF, con el guion común: Helvetica no tiene el signo menos). */
function fmtNum(v: number, pdf = false): string {
  const r = Math.round(v * 1e6) / 1e6
  const s = String(r).replace('.', ',')
  return pdf ? s : s.replace('-', '−')
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, len: number) {
  const nx = -dy
  const ny = dx
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - dx * len + nx * len * 0.5, y - dy * len + ny * len * 0.5)
  ctx.lineTo(x - dx * len - nx * len * 0.5, y - dy * len - ny * len * 0.5)
  ctx.closePath()
  ctx.fill()
}

function drawAxes(ctx: CanvasRenderingContext2D, a: Item & { kind: 'axes' }, [x0, y0, x1, y1]: BBox, color: string, lw: number, paper: string, pdf: boolean) {
  const w = x1 - x0
  const h = y1 - y0
  const sx = (x: number) => x0 + ((x - a.xmin) / (a.xmax - a.xmin)) * w
  const sy = (y: number) => y1 - ((y - a.ymin) / (a.ymax - a.ymin)) * h
  const font = Math.max(10, Math.min(w, h) / 26)
  const stepX = niceStep(a.xmax - a.xmin, Math.max(4, Math.round(w / (font * 3))))
  const stepY = niceStep(a.ymax - a.ymin, Math.max(4, Math.round(h / (font * 2.2))))
  // Los ejes pasan por el 0 si está a la vista; si no, por el borde
  const ox = sx(Math.min(Math.max(0, a.xmin), a.xmax))
  const oy = sy(Math.min(Math.max(0, a.ymin), a.ymax))

  if (a.grid) {
    // Sin transparencia (el PDF no la toma): gris claro, u oscuro sobre papel oscuro
    ctx.strokeStyle = luminance(paper) < 0.1 ? '#4a4b50' : '#dcdcdc'
    ctx.lineWidth = Math.max(0.5, lw * 0.3)
    ctx.beginPath()
    for (let x = Math.ceil(a.xmin / stepX) * stepX; x <= a.xmax + 1e-9; x += stepX) {
      ctx.moveTo(sx(x), y0)
      ctx.lineTo(sx(x), y1)
    }
    for (let y = Math.ceil(a.ymin / stepY) * stepY; y <= a.ymax + 1e-9; y += stepY) {
      ctx.moveTo(x0, sy(y))
      ctx.lineTo(x1, sy(y))
    }
    ctx.stroke()
  }

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, oy)
  ctx.lineTo(x1, oy)
  ctx.moveTo(ox, y1)
  ctx.lineTo(ox, y0)
  ctx.stroke()
  arrow(ctx, x1 + lw, oy, 1, 0, font * 0.8)
  arrow(ctx, ox, y0 - lw, 0, -1, font * 0.8)

  // Marcas y números
  const family = pdf ? 'helvetica' : FONT
  ctx.font = fontOf(font, false, family)
  const tick = font * 0.35
  ctx.lineWidth = Math.max(1, lw * 0.7)
  ctx.beginPath()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = Math.ceil(a.xmin / stepX) * stepX; x <= a.xmax - stepX * 0.3; x += stepX) {
    if (Math.abs(x) < stepX * 1e-6) continue
    ctx.moveTo(sx(x), oy - tick)
    ctx.lineTo(sx(x), oy + tick)
    ctx.fillText(fmtNum(x, pdf), sx(x), oy + tick * 1.6)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = Math.ceil(a.ymin / stepY) * stepY; y <= a.ymax - stepY * 0.3; y += stepY) {
    if (Math.abs(y) < stepY * 1e-6) continue
    ctx.moveTo(ox - tick, sy(y))
    ctx.lineTo(ox + tick, sy(y))
    ctx.fillText(fmtNum(y, pdf), ox - tick * 1.8, sy(y))
  }
  ctx.stroke()
  if (a.xmin <= 0 && a.xmax >= 0 && a.ymin <= 0 && a.ymax >= 0) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText('0', ox - tick * 1.2, oy + tick * 1.2)
  }
  ctx.font = fontOf(font * 1.15, false, family)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('x', x1, oy - tick * 1.5)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('y', ox + tick * 2, y0)

  // Funciones, recortadas a la caja
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, w, h)
  ctx.clip()
  ctx.lineWidth = lw * 1.3
  ctx.lineJoin = 'round'
  a.fns.forEach((src, i) => {
    const { fn } = compileExpr(src)
    if (!fn) return
    ctx.strokeStyle = CURVE_COLORS[i % CURVE_COLORS.length]
    for (const part of sampleFn(fn, a.xmin, a.xmax, a.ymin, a.ymax, Math.max(200, Math.round(w / 2)))) {
      ctx.beginPath()
      ctx.moveTo(sx(part[0]), sy(part[1]))
      for (let j = 2; j < part.length; j += 2) ctx.lineTo(sx(part[j]), sy(part[j + 1]))
      ctx.stroke()
    }
  })
  ctx.restore()
}

function drawNumberLine(ctx: CanvasRenderingContext2D, n: Item & { kind: 'numberline' }, [x0, y0, x1, y1]: BBox, color: string, lw: number, pdf: boolean) {
  const w = x1 - x0
  const y = (y0 + y1) / 2
  const font = Math.max(10, Math.min(w / 30, (y1 - y0) / 2.5))
  const sx = (v: number) => x0 + font + ((v - n.min) / (n.max - n.min)) * (w - font * 2.5)
  const step = niceStep(n.max - n.min, Math.max(4, Math.round(w / (font * 3))))
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x1, y)
  ctx.stroke()
  arrow(ctx, x1 + lw, y, 1, 0, font * 0.8)
  arrow(ctx, x0 - lw, y, -1, 0, font * 0.8)
  ctx.font = fontOf(font, false, pdf ? 'helvetica' : FONT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const tick = font * 0.45
  ctx.beginPath()
  for (let v = Math.ceil(n.min / step) * step; v <= n.max + 1e-9; v += step) {
    ctx.moveTo(sx(v), y - tick)
    ctx.lineTo(sx(v), y + tick)
    ctx.fillText(fmtNum(v, pdf), sx(v), y + tick * 1.5)
  }
  ctx.stroke()
}

/** ¿El punto (de la página) cae sobre el objeto? Para la goma y para editarlo con un toque. */
export function hitsItem(s: Stroke, x: number, y: number, r = 0): boolean {
  const [x0, y0, x1, y1] = itemBox(s)
  return x >= x0 - r && x <= x1 + r && y >= y0 - r && y <= y1 + r
}
