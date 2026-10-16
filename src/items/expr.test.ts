import { describe, expect, it } from 'vitest'
import { compileExpr, sampleFn } from './expr'

const f = (src: string) => {
  const r = compileExpr(src)
  if (!r.fn) throw new Error(r.error)
  return r.fn
}

describe('funciones para graficar', () => {
  it('entiende lo básico y la precedencia', () => {
    expect(f('x^2 - 3')(2)).toBe(1)
    expect(f('2 + 3*x')(2)).toBe(8)
    expect(f('-x^2')(3)).toBe(-9)
    expect(f('2^3^2')(0)).toBe(512)
    expect(f('(x+1)/(x-1)')(3)).toBe(2)
  })

  it('acepta «y =» y «f(x) =» adelante', () => {
    expect(f('y = 2x + 1')(1)).toBe(3)
    expect(f('f(x) = x/2')(4)).toBe(2)
  })

  it('multiplicación implícita y funciones', () => {
    expect(f('2x')(3)).toBe(6)
    expect(f('3(x+1)')(1)).toBe(6)
    expect(f('2sin(x)')(Math.PI / 2)).toBeCloseTo(2)
    expect(f('sen x')(Math.PI / 2)).toBeCloseTo(1)
    expect(f('sqrt(x)')(9)).toBe(3)
    expect(f('√x')(16)).toBe(4)
    expect(f('2pi')(0)).toBeCloseTo(2 * Math.PI)
    expect(f('e^-x')(0)).toBe(1)
    expect(f('x²+1')(3)).toBe(10)
  })

  it('valor absoluto con barras', () => {
    expect(f('|x|')(-3)).toBe(3)
    expect(f('|x - 2| + 1')(0)).toBe(3)
    expect(f('2|x|')(-1)).toBe(2)
  })

  it('avisa los errores en castellano', () => {
    expect(compileExpr('x +').error).toMatch(/incompleta/)
    expect(compileExpr('(x+1').error).toMatch(/Falta/)
    expect(compileExpr('foo(x)').error).toMatch(/No conozco/)
    expect(compileExpr('').error).toBeTruthy()
  })

  it('corta la curva en las asíntotas', () => {
    const parts = sampleFn(f('1/x'), -5, 5, -5, 5)
    expect(parts.length).toBe(2)
    for (const p of parts) for (let i = 0; i < p.length; i += 2) expect(Math.sign(p[i])).toBe(Math.sign(p[0]))
  })

  it('no dibuja donde la función no existe', () => {
    const parts = sampleFn(f('sqrt(x)'), -5, 5, -5, 5)
    expect(parts.length).toBe(1)
    expect(parts[0][0]).toBeGreaterThanOrEqual(0)
  })
})
