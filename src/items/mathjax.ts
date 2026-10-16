/**
 * MathJax (pesado: se importa recién la primera vez que aparece una fórmula). Convierte TeX o
 * AsciiMath («x^2 + 2», «sqrt(x)/3», «alpha») en un SVG autocontenido, con los caracteres como
 * trazados: se puede dibujar en el canvas y exportar sin depender de fuentes.
 */
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import AsciiMathParser from 'asciimath2tex'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js'

export type MathFormat = 'ascii' | 'tex'

export interface MathSvg {
  /** El SVG, con el tamaño en ex (0,5 em del tamaño de letra) */
  svg: string
  wEx: number
  hEx: number
  /** Hubo un error de sintaxis (MathJax lo marca, pero igual dibuja algo) */
  error: string | null
}

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const doc = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams', 'noundefined'] }), OutputJax: new SVG({ fontCache: 'none' }) })
// AsciiMath (lo que se escribe con el teclado) se pasa a TeX: la entrada AsciiMath de MathJax es
// código viejo que no corre en módulos estrictos
const ascii = new AsciiMathParser()

/** «x^2 + 2» → «x^{2} + 2». */
export function asciiToTex(src: string): string {
  return ascii.parse(src)
}

export function toSvg(src: string, fmt: MathFormat): MathSvg {
  const tex = fmt === 'ascii' ? asciiToTex(src) : src
  const node = doc.convert(tex.trim() || ' ', { display: true })
  let svg = adaptor.innerHTML(node)
  const w = /width="([\d.]+)ex"/.exec(svg)
  const h = /height="([\d.]+)ex"/.exec(svg)
  const err = /data-mjx-error="([^"]*)"/.exec(svg) ?? /<title>([^<]*)<\/title>/.exec(svg)
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return { svg, wEx: w ? Number(w[1]) : 1, hEx: h ? Number(h[1]) : 1, error: err && svg.includes('merror') ? err[1] : null }
}
