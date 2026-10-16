import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Board } from '../canvas/Board'
import { measureMath, measureText, PAD, rectPts, FONT, LINE_HEIGHT, itemBox } from '../items/draw'
import { loadMathJax, mathSvg } from '../items/math'
import { PEN_COLORS, setText, TEXT_SIZE_RANGE, TEXT_SIZES, useTools } from '../lib/toolPrefs'
import { inkColor } from '../model/background'
import { newId, nextZ } from '../model/note'
import type { Stroke } from '../model/types'
import { Icon } from './Icon'

/** Lo que se está escribiendo: un texto o una fórmula nueva, o uno que ya existía. */
export interface EditTarget {
  kind: 'text' | 'math'
  page: number
  /** Esquina de arriba a la izquierda, en coordenadas de la página */
  x: number
  y: number
  stroke: Stroke | null
}

interface Props {
  board: Board
  target: EditTarget
  paper: string
  onClose: () => void
}

/** Botones para escribir fórmulas sin saber la sintaxis: insertan AsciiMath. */
const SYMBOLS: { label: string; insert: string; title: string }[] = [
  { label: 'x²', insert: '^2', title: 'Al cuadrado (^2)' },
  { label: 'xⁿ', insert: '^()', title: 'Potencia (^)' },
  { label: '√', insert: 'sqrt()', title: 'Raíz cuadrada: sqrt(x)' },
  { label: 'ⁿ√', insert: 'root(3)()', title: 'Raíz n-ésima: root(3)(x)' },
  { label: 'a⁄b', insert: '()/()', title: 'Fracción: (a)/(b)' },
  { label: 'xᵢ', insert: '_()', title: 'Subíndice (_)' },
  { label: 'π', insert: 'pi', title: 'Pi' },
  { label: '±', insert: '+-', title: 'Más/menos (+-)' },
  { label: '·', insert: '*', title: 'Por (*)' },
  { label: '≤', insert: '<=', title: 'Menor o igual (<=)' },
  { label: '≥', insert: '>=', title: 'Mayor o igual (>=)' },
  { label: '≠', insert: '!=', title: 'Distinto (!=)' },
  { label: '∞', insert: 'oo', title: 'Infinito (oo)' },
  { label: 'α', insert: 'alpha', title: 'alpha, beta, theta…' },
  { label: 'θ', insert: 'theta', title: 'theta' },
  { label: '∫', insert: 'int_()^()', title: 'Integral: int_a^b' },
  { label: 'Σ', insert: 'sum_()^()', title: 'Sumatoria: sum_(i=1)^n' },
  { label: 'lím', insert: 'lim_(x->)', title: 'Límite: lim_(x->0)' },
]

const clampSize = (v: number) => Math.round(Math.min(TEXT_SIZE_RANGE.max, Math.max(TEXT_SIZE_RANGE.min, v)))

/**
 * Editor sobre la hoja: un cuadro de texto donde tocaste, del tamaño real de la letra (con el
 * zoom), y arriba una barra para el tamaño, la negrita y el color. Para las fórmulas, una vista
 * previa armada y botones con los símbolos. Al terminar queda como objeto en la hoja.
 */
export function ItemEditor({ board, target, paper, onClose }: Props) {
  const prefs = useTools((s) => s.text)
  const existing = target.stroke
  const item = existing?.item
  const [value, setValue] = useState(item?.kind === 'text' ? item.text : item?.kind === 'math' ? item.src : '')
  const [size, setSize] = useState(existing?.size ?? prefs.size)
  const [bold, setBold] = useState(item?.kind === 'text' ? !!item.bold : prefs.bold)
  const [color, setColor] = useState(existing?.color ?? prefs.color)
  const [mathReady, setMathReady] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const isMath = target.kind === 'math'

  // El lienzo no dibuja lo que se está editando (lo muestra este editor)
  useEffect(() => {
    board.setEditing(existing?.id ?? null)
    return () => board.setEditing(null)
  }, [board, existing])

  useEffect(() => {
    if (isMath) void loadMathJax().then(() => setMathReady(true))
  }, [isMath])

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Sigue a la hoja si se mueve o se hace zoom
  useLayoutEffect(() => {
    let raf = 0
    const tick = () => {
      const p = board.pageToScreen(target.page, target.x, target.y)
      const el = wrap.current
      if (p && el) {
        el.style.transform = `translate(${p.x}px, ${p.y}px)`
        el.style.setProperty('--zoom', String(p.zoom))
        // Las barras no se salen de la pantalla: si no entran a la derecha, se corren a la izquierda
        const left = el.getBoundingClientRect().left
        for (const bar of el.querySelectorAll<HTMLElement>('.item-bar, .symbol-bar')) {
          const shift = Math.min(0, window.innerWidth - 12 - (left + bar.offsetWidth))
          bar.style.left = `${Math.max(shift, 12 - left)}px`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [board, target])

  const commit = () => {
    if (done.current) return
    done.current = true
    const text = isMath ? value.trim() : value.replace(/\s+$/, '')
    const before = existing ? [existing] : []
    if (!text) {
      if (existing) board.replace(target.page, before, [])
      return onClose()
    }
    const dims = isMath ? measureMath(text, item?.kind === 'math' ? item.fmt : 'ascii', size) : measureText(text, size, bold)
    // Sin MathJax todavía (muy raro: se carga al abrir el editor): un tamaño aproximado
    const { w, h } = dims ?? { w: text.length * size * 0.6, h: size * 1.4 }
    const pad = size * PAD
    const stroke: Stroke = {
      id: existing?.id ?? newId(),
      tool: 'pen',
      color,
      opacity: 1,
      z: existing?.z ?? nextZ(),
      size,
      pts: rectPts(target.x, target.y, target.x + w + 2 * pad, target.y + h + 2 * pad),
      simulated: false,
      bbox: [0, 0, 0, 0],
      item: isMath ? { kind: 'math', src: text, fmt: item?.kind === 'math' ? item.fmt : 'ascii' } : { kind: 'text', text, ...(bold ? { bold } : {}) },
    }
    const same =
      existing &&
      JSON.stringify(existing.item) === JSON.stringify(stroke.item) &&
      existing.size === size &&
      existing.color === color
    if (!same) board.replace(target.page, before, [stroke])
    onClose()
  }

  const remove = () => {
    done.current = true
    if (existing) board.replace(target.page, [existing], [])
    onClose()
  }

  const resize = (next: number) => {
    const v = clampSize(next)
    setSize(v)
    setText({ size: v })
  }

  const insert = (s: string) => {
    const el = input.current
    if (!el) return setValue((v) => v + s)
    const a = el.selectionStart
    const b = el.selectionEnd
    const next = value.slice(0, a) + s + value.slice(b)
    setValue(next)
    // El cursor queda dentro del primer paréntesis vacío, si hay
    const inside = s.indexOf('()')
    const pos = a + (inside >= 0 ? inside + 1 : s.length)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === '+' || e.key === '=')) {
      e.preventDefault()
      resize(size * 1.15)
    } else if (mod && e.key === '-') {
      e.preventDefault()
      resize(size / 1.15)
    } else if (mod && e.key.toLowerCase() === 'b' && !isMath) {
      e.preventDefault()
      setBold((v) => !v)
    } else if (e.key === 'Escape' || (e.key === 'Enter' && (isMath || mod))) {
      e.preventDefault()
      commit()
    }
    e.stopPropagation()
  }

  const preview = isMath && mathReady && value.trim() ? mathSvg(value.trim(), item?.kind === 'math' ? item.fmt : 'ascii') : null
  const shown = inkColor(color, paper)
  const lines = value.split('\n')
  const cols = Math.max(4, ...lines.map((l) => l.length + 2))

  return (
    <div
      className={`item-editor${isMath ? ' is-math' : ''}`}
      ref={wrap}
      style={{ '--size': size, '--pad': size * PAD, color: shown } as React.CSSProperties}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="item-bar" role="toolbar" aria-label={isMath ? 'Fórmula' : 'Texto'} onPointerDown={(e) => e.preventDefault()}>
        <button className="icon-btn" onClick={() => resize(size / 1.15)} aria-label="Letra más chica (Ctrl −)" title="Más chica (Ctrl −)">
          <span className="size-glyph small">A</span>
        </button>
        <select className="size-select" value={TEXT_SIZES.some((t) => t.value === size) ? size : ''} onChange={(e) => resize(Number(e.target.value))} aria-label="Tamaño de letra">
          {!TEXT_SIZES.some((t) => t.value === size) && <option value="">{size}</option>}
          {TEXT_SIZES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={() => resize(size * 1.15)} aria-label="Letra más grande (Ctrl +)" title="Más grande (Ctrl +)">
          <span className="size-glyph">A</span>
        </button>
        {!isMath && (
          <button className={`icon-btn${bold ? ' is-on' : ''}`} onClick={() => setBold((v) => !v)} aria-pressed={bold} aria-label="Negrita (Ctrl B)" title="Negrita (Ctrl B)">
            <Icon name="bold" size={20} />
          </button>
        )}
        <span className="item-bar-sep" />
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch swatch-small${c === color ? ' is-on' : ''}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => {
              setColor(c)
              setText({ color: c })
            }}
          />
        ))}
        <span className="item-bar-sep" />
        {existing && (
          <button className="icon-btn" onClick={remove} aria-label="Borrar" title="Borrar">
            <Icon name="trash" size={20} />
          </button>
        )}
        <button className="btn btn-small btn-primary-solid" onClick={commit}>
          Listo
        </button>
      </div>
      {isMath && (
        <div className="symbol-bar" onPointerDown={(e) => e.preventDefault()}>
          {SYMBOLS.map((s) => (
            <button key={s.label} className="symbol-btn" onClick={() => insert(s.insert)} title={s.title}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={input}
        className="item-input"
        value={value}
        rows={isMath ? 1 : lines.length}
        cols={cols}
        spellCheck={!isMath}
        autoCapitalize={isMath ? 'off' : 'sentences'}
        autoCorrect={isMath ? 'off' : 'on'}
        placeholder={isMath ? 'x^2 + 2, sqrt(x)/3, (a+b)/2…' : 'Escribí acá'}
        aria-label={isMath ? 'Fórmula (como en la calculadora: x^2, sqrt(x), (a)/(b))' : 'Texto'}
        style={{ fontWeight: bold && !isMath ? 700 : 400, fontFamily: FONT, lineHeight: LINE_HEIGHT }}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        onBlur={(e) => {
          // Tocar la barra no cierra; tocar afuera sí
          if (wrap.current?.contains(e.relatedTarget as Node)) return
          commit()
        }}
      />
      {isMath && (
        <div className="math-preview" aria-live="polite">
          {preview ? (
            <>
              <span
                className="math-svg"
                style={{ fontSize: `calc(${size}px * var(--zoom, 1))` }}
                dangerouslySetInnerHTML={{ __html: preview.svg }}
              />
              {preview.error && <small className="error">{preview.error}</small>}
            </>
          ) : (
            <small className="muted">{mathReady ? 'Como en la calculadora: x^2 + 2, sqrt(x)/3, (a+b)/(c), alpha' : 'Cargando…'}</small>
          )}
        </div>
      )}
    </div>
  )
}

/** Dónde abrir el editor para un objeto que ya existe. */
export function editTargetFor(page: number, stroke: Stroke): EditTarget | null {
  const k = stroke.item?.kind
  if (k !== 'text' && k !== 'math') return null
  const [x0, y0] = itemBox(stroke)
  return { kind: k, page, x: x0, y: y0, stroke }
}
