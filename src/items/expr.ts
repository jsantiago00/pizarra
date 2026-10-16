/**
 * Funciones de una variable para graficar: «x^2 - 3», «2sin(x)», «y = sqrt(x)/2», «|x|», «e^(-x^2)».
 * Un parser chico y seguro (no usa eval): números, x, + − · / ^, paréntesis, valor absoluto con
 * barras, constantes (pi, π, e) y funciones comunes. La multiplicación puede ir implícita: 2x, 3(x+1), x sin(x).
 */
export type Fn = (x: number) => number

type Node =
  | { k: 'num'; v: number }
  | { k: 'x' }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; f: string; a: Node }

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  tg: Math.tan,
  sen: Math.sin,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  raiz: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
}

const CONSTS: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/\s+/g, '')
    .replace(/[·×]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
    .replace(/,/g, '.')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      const v = Number(s.slice(i, j))
      if (Number.isNaN(v)) throw new Error(`Número mal escrito: ${s.slice(i, j)}`)
      out.push({ t: 'num', v })
      i = j
    } else if (/[a-zA-Zπ]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Zπ]/.test(s[j])) j++
      // «xsin» o «2pix»: se separa en nombres conocidos
      out.push(...splitWord(s.slice(i, j).toLowerCase()))
      i = j
    } else if ('+-*/^()|'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
    } else {
      throw new Error(`No entiendo «${c}»`)
    }
  }
  return out
}

function splitWord(w: string): Tok[] {
  const names = [...Object.keys(FUNCS), ...Object.keys(CONSTS), 'x'].sort((a, b) => b.length - a.length)
  const out: Tok[] = []
  let i = 0
  while (i < w.length) {
    const n = names.find((name) => w.startsWith(name, i))
    if (!n) throw new Error(`No conozco «${w.slice(i)}»`)
    out.push({ t: 'id', v: n })
    i += n.length
  }
  return out
}

/** Arma el árbol; tira un Error con un mensaje en castellano si no se entiende. */
export function parseExpr(src: string): Node {
  // «y = …» o «f(x) = …»: se ignora lo de la izquierda
  const body = src.includes('=') ? src.slice(src.lastIndexOf('=') + 1) : src
  const toks = tokenize(body)
  if (!toks.length) throw new Error('Escribí una función de x')
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Falta «${v}»`)
    p++
  }
  // Puede empezar un factor (para la multiplicación implícita)
  const startsFactor = () => {
    const t = peek()
    return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && (t.v === '(' || t.v === '|')))
  }

  function sum(): Node {
    let a = product()
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: '+' | '-' }).v
      a = { k: 'bin', op, a, b: product() }
    }
    return a
  }
  function product(): Node {
    let a = unary()
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (toks[p++] as { v: '*' | '/' }).v
        a = { k: 'bin', op, a, b: unary() }
      } else if (startsFactor() && !(isOp('|') && inAbs > 0)) {
        a = { k: 'bin', op: '*', a, b: power() }
      } else return a
    }
  }
  function unary(): Node {
    if (isOp('-')) {
      p++
      return { k: 'neg', a: unary() }
    }
    if (isOp('+')) {
      p++
      return unary()
    }
    return power()
  }
  function power(): Node {
    const base = atom()
    if (isOp('^')) {
      p++
      // a^b^c = a^(b^c), y el exponente puede ser negativo: e^-x
      return { k: 'bin', op: '^', a: base, b: unary() }
    }
    return base
  }
  let inAbs = 0
  function atom(): Node {
    const t = peek()
    if (!t) throw new Error('La expresión quedó incompleta')
    if (t.t === 'num') {
      p++
      return { k: 'num', v: t.v }
    }
    if (t.t === 'id') {
      p++
      if (t.v === 'x') return { k: 'x' }
      if (t.v in CONSTS) return { k: 'num', v: CONSTS[t.v] }
      // Función: con paréntesis, o sin ellos para un factor simple (sin x, sqrt2)
      if (isOp('(')) {
        p++
        const a = sum()
        expect(')')
        return { k: 'call', f: t.v, a }
      }
      return { k: 'call', f: t.v, a: power() }
    }
    if (t.v === '(') {
      p++
      const a = sum()
      expect(')')
      return a
    }
    if (t.v === '|') {
      p++
      inAbs++
      const a = sum()
      inAbs--
      expect('|')
      return { k: 'call', f: 'abs', a }
    }
    throw new Error(`Sobra «${t.v}»`)
  }

  const tree = sum()
  if (p < toks.length) throw new Error(`Sobra «${(toks[p] as { v: string | number }).v}»`)
  return tree
}

function compile(n: Node): Fn {
  switch (n.k) {
    case 'num':
      return () => n.v
    case 'x':
      return (x) => x
    case 'neg': {
      const a = compile(n.a)
      return (x) => -a(x)
    }
    case 'call': {
      const f = FUNCS[n.f]
      const a = compile(n.a)
      return (x) => f(a(x))
    }
    case 'bin': {
      const a = compile(n.a)
      const b = compile(n.b)
      switch (n.op) {
        case '+':
          return (x) => a(x) + b(x)
        case '-':
          return (x) => a(x) - b(x)
        case '*':
          return (x) => a(x) * b(x)
        case '/':
          return (x) => a(x) / b(x)
        case '^':
          return (x) => Math.pow(a(x), b(x))
      }
    }
  }
}

/** La función lista para evaluar, o el error para mostrar. */
export function compileExpr(src: string): { fn: Fn; error: null } | { fn: null; error: string } {
  try {
    return { fn: compile(parseExpr(src)), error: null }
  } catch (e) {
    return { fn: null, error: (e as Error).message }
  }
}

/**
 * Puntos de la curva dentro de [xmin, xmax], cortada en tramos donde se va de rango o no
 * existe (1/x, tan x, sqrt de negativos): cada tramo es una polilínea [x0, y0, x1, y1, …].
 */
export function sampleFn(fn: Fn, xmin: number, xmax: number, ymin: number, ymax: number, steps = 600): number[][] {
  const out: number[][] = []
  let cur: number[] = []
  const span = ymax - ymin
  const lo = ymin - span * 2
  const hi = ymax + span * 2
  let prevY: number | null = null
  for (let i = 0; i <= steps; i++) {
    const x = xmin + ((xmax - xmin) * i) / steps
    const y = fn(x)
    const ok = Number.isFinite(y) && y >= lo && y <= hi
    // Un salto enorme entre dos muestras es una asíntota: se corta
    const jump = prevY !== null && ok && Math.abs(y - prevY) > span * 1.5
    if (!ok || jump) {
      if (cur.length >= 4) out.push(cur)
      cur = []
    }
    if (ok) cur.push(x, y)
    prevY = ok ? y : null
  }
  if (cur.length >= 4) out.push(cur)
  return out
}
