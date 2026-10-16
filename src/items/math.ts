import type { MathFormat } from '../model/types'
import type { MathSvg } from './mathjax'

/**
 * Fórmulas como imágenes para el canvas. MathJax se carga la primera vez; mientras tanto (y
 * mientras el navegador decodifica el SVG) se dibuja el texto tal cual, y al estar lista se avisa
 * para redibujar.
 */

type MathJaxModule = typeof import('./mathjax')

let mod: MathJaxModule | null = null
let loading: Promise<MathJaxModule> | null = null
const listeners = new Set<() => void>()

export function loadMathJax(): Promise<MathJaxModule> {
  loading ??= import('./mathjax').then((m) => {
    mod = m
    notify()
    return m
  })
  return loading
}

function notify() {
  for (const fn of listeners) fn()
}

/** Avisa cuando una fórmula terminó de cargarse (para redibujar). */
export function onMathReady(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Proporción de la unidad «ex» de MathJax respecto del tamaño de letra. */
export const EX = 0.5

/** El SVG de una fórmula, si MathJax ya está cargado (si no, lo empieza a cargar). */
export function mathSvg(src: string, fmt: MathFormat): MathSvg | null {
  if (!mod) {
    void loadMathJax()
    return null
  }
  const key = `${fmt}:${src}`
  let r = svgs.get(key)
  if (!r) svgs.set(key, (r = mod.toSvg(src, fmt)))
  return r
}
const svgs = new Map<string, MathSvg>()

interface Entry {
  img: HTMLImageElement
  ready: boolean
}
const images = new Map<string, Entry>()

/** La fórmula como imagen, del color pedido; null mientras se prepara. */
export function mathImage(src: string, fmt: MathFormat, color: string): HTMLImageElement | null {
  const key = `${fmt}:${color}:${src}`
  const e = images.get(key)
  if (e) return e.ready ? e.img : null
  const m = mathSvg(src, fmt)
  if (!m || typeof Image === 'undefined') return null
  // Tamaño en píxeles grande: el canvas la escala como vector igual, y PDF la rasteriza bien
  const px = 24
  const svg = m.svg
    .replace(/width="[\d.]+ex"/, `width="${(m.wEx * px).toFixed(1)}px"`)
    .replace(/height="[\d.]+ex"/, `height="${(m.hEx * px).toFixed(1)}px"`)
    .replace(/currentColor/g, color)
  const img = new Image()
  const entry: Entry = { img, ready: false }
  images.set(key, entry)
  img.onload = () => {
    entry.ready = true
    notify()
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return null
}

/** Espera a que estén listas todas estas fórmulas (antes de exportar). */
export async function ensureMath(list: { src: string; fmt: MathFormat; color: string }[]): Promise<void> {
  if (!list.length) return
  await loadMathJax()
  await Promise.all(
    list.map(
      (f) =>
        new Promise<void>((resolve) => {
          if (mathImage(f.src, f.fmt, f.color)) return resolve()
          const off = onMathReady(() => {
            if (mathImage(f.src, f.fmt, f.color)) {
              off()
              resolve()
            }
          })
          setTimeout(() => {
            off()
            resolve()
          }, 3000)
        }),
    ),
  )
}
