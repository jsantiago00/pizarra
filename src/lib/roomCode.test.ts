import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, formatCode, newCode, parseCode } from './roomCode'

describe('códigos de sala', () => {
  it('genera códigos válidos', () => {
    for (let i = 0; i < 200; i++) {
      const c = newCode()
      expect(c).toHaveLength(CODE_LENGTH)
      expect(parseCode(c)).toBe(c)
    }
  })

  it('acepta minúsculas, espacios, guiones y el enlace completo', () => {
    expect(parseCode('abc-def')).toBe('ABCDEF')
    expect(parseCode(' ab cd ef ')).toBe('ABCDEF')
    expect(parseCode('https://santiagososa.com.ar/pizarra/sala/XYZ234')).toBe('XYZ234')
    expect(parseCode('https://santiagososa.com.ar/pizarra/sala/xyz-234#admin=abc')).toBe('XYZ234')
  })

  it('rechaza lo que no puede ser un código', () => {
    expect(parseCode('ABC')).toBeNull()
    expect(parseCode('ABCDEFG')).toBeNull()
    // 0, 1, O, I y L no se usan porque se confunden
    expect(parseCode('ABCDE0')).toBeNull()
    expect(parseCode('OOOOOO')).toBeNull()
  })

  it('se muestra en dos grupos', () => {
    expect(formatCode('ABCDEF')).toBe('ABC-DEF')
  })
})
