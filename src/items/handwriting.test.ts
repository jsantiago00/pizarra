import { describe, expect, it } from 'vitest'
import { buildRequest, cleanLatex } from './handwriting'

describe('escritura a mano → fórmula (MyScript)', () => {
  it('arma el pedido con los trazos corridos al origen y tiempos crecientes', () => {
    const req = JSON.parse(buildRequest([{ pts: [100, 200, 0.5, 110, 210, 0.6] }, { pts: [130, 200, 0.5, 140, 220, 0.5] }]))
    expect(req.contentType).toBe('Math')
    const [a, b] = req.strokeGroups[0].strokes
    expect(Math.min(...a.x, ...b.x)).toBe(20)
    expect(Math.min(...a.y, ...b.y)).toBe(20)
    expect(b.t[0]).toBeGreaterThan(a.t[a.t.length - 1])
    expect(req.width).toBe(80)
  })

  it('limpia los delimitadores', () => {
    expect(cleanLatex('\\[x^{2}+2\\]')).toBe('x^{2}+2')
    expect(cleanLatex('$$\\frac{1}{2}$$')).toBe('\\frac{1}{2}')
    expect(cleanLatex('\\begin{align*}y&=2x\\end{align*}')).toBe('y=2x')
  })
})
