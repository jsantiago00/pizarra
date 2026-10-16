import { describe, expect, it } from 'vitest'
import { toSvg } from './mathjax'

describe('fórmulas con MathJax', () => {
  it('AsciiMath: x^2 + 2 queda con superíndice', () => {
    const r = toSvg('x^2 + 2', 'ascii')
    expect(r.svg).toContain('<svg')
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(r.wEx).toBeGreaterThan(3)
    expect(r.hEx).toBeGreaterThan(1)
    expect(r.error).toBeNull()
  })

  it('una fracción es más alta que una línea', () => {
    const line = toSvg('x + 1', 'ascii')
    const frac = toSvg('(x+1)/(x-1)', 'ascii')
    expect(frac.hEx).toBeGreaterThan(line.hEx * 1.5)
  })

  it('TeX (lo que devuelve el reconocimiento de escritura)', () => {
    const r = toSvg('\\frac{\\sqrt{x}}{3} + \\alpha^2', 'tex')
    expect(r.wEx).toBeGreaterThan(4)
    expect(r.error).toBeNull()
  })

  it('marca los errores de TeX', () => {
    expect(toSvg('\\frac{1}{', 'tex').error).toBeTruthy()
  })
})

describe('AsciiMath → TeX', async () => {
  const { asciiToTex } = await import('./mathjax')
  it('fracciones, raíces y símbolos', () => {
    expect(asciiToTex('sqrt(x)/3')).toBe('\\frac{\\sqrt{x}}{3}')
    expect(asciiToTex('x^2')).toBe('x^{2}')
    expect(asciiToTex('a <= pi')).toContain('\\le')
  })
})
