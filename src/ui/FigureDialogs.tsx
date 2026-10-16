import { useState } from 'react'
import { compileExpr } from '../items/expr'
import { CURVE_COLORS } from '../items/draw'
import type { Item } from '../model/types'
import { Modal } from './Dialog'
import { Icon } from './Icon'

type Axes = Item & { kind: 'axes' }
type NumberLine = Item & { kind: 'numberline' }

function num(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.').replace('−', '-'))
  return Number.isFinite(n) ? n : fallback
}

/** Rango, cuadrícula y funciones de unos ejes. */
export function AxesDialog({ value, onSave, onClose }: { value: Axes; onSave: (a: Axes) => void; onClose: () => void }) {
  const [r, setR] = useState({ xmin: String(value.xmin), xmax: String(value.xmax), ymin: String(value.ymin), ymax: String(value.ymax) })
  const [grid, setGrid] = useState(value.grid)
  const [fns, setFns] = useState(value.fns.length ? value.fns : [''])
  const errors = fns.map((f) => (f.trim() ? compileExpr(f).error : null))
  const xmin = num(r.xmin, -5)
  const xmax = num(r.xmax, 5)
  const ymin = num(r.ymin, -5)
  const ymax = num(r.ymax, 5)
  const badRange = !(xmin < xmax && ymin < ymax)

  const save = () => {
    if (badRange || errors.some(Boolean)) return
    onSave({ kind: 'axes', xmin, xmax, ymin, ymax, grid, fns: fns.map((f) => f.trim()).filter(Boolean) })
    onClose()
  }

  const field = (k: keyof typeof r, label: string) => (
    <label className="field compact-field">
      <span>{label}</span>
      <input className="text-input" inputMode="decimal" value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} />
    </label>
  )

  return (
    <Modal onClose={onClose} label="Ejes cartesianos">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h2 className="dialog-title">Ejes cartesianos</h2>
        <div className="range-grid">
          {field('xmin', 'x desde')}
          {field('xmax', 'x hasta')}
          {field('ymin', 'y desde')}
          {field('ymax', 'y hasta')}
        </div>
        {badRange && <p className="error">El «desde» tiene que ser menor que el «hasta».</p>}
        <label className="check-row">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Cuadrícula
        </label>
        <h3 className="dialog-subtitle">Funciones</h3>
        {fns.map((f, i) => (
          <div key={i} className="fn-row">
            <span className="fn-dot" style={{ background: CURVE_COLORS[i % CURVE_COLORS.length] }} />
            <span className="fn-label">y =</span>
            <input
              className="text-input"
              value={f}
              autoFocus={i === fns.length - 1 && fns.length > 1}
              placeholder="x^2 - 3, 2sin(x), |x|…"
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => setFns(fns.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <button type="button" className="icon-btn icon-btn-small" onClick={() => setFns(fns.length > 1 ? fns.filter((_, j) => j !== i) : [''])} aria-label="Quitar función">
              <Icon name="x" size={18} />
            </button>
            {errors[i] && <small className="error fn-error">{errors[i]}</small>}
          </div>
        ))}
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setFns([...fns, ''])}>
          <Icon name="plus" size={18} /> Otra función
        </button>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary-solid" disabled={badRange || errors.some(Boolean)}>
            Listo
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function NumberLineDialog({ value, onSave, onClose }: { value: NumberLine; onSave: (n: NumberLine) => void; onClose: () => void }) {
  const [min, setMin] = useState(String(value.min))
  const [max, setMax] = useState(String(value.max))
  const a = num(min, -5)
  const b = num(max, 5)
  return (
    <Modal onClose={onClose} label="Recta numérica">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (a >= b) return
          onSave({ kind: 'numberline', min: a, max: b })
          onClose()
        }}
      >
        <h2 className="dialog-title">Recta numérica</h2>
        <div className="range-grid">
          <label className="field compact-field">
            <span>Desde</span>
            <input className="text-input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="field compact-field">
            <span>Hasta</span>
            <input className="text-input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        {a >= b && <p className="error">El «desde» tiene que ser menor que el «hasta».</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary-solid" disabled={a >= b}>
            Listo
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Graficar una función: se suma a los ejes seleccionados o se crean unos nuevos. */
export function FunctionDialog({ onSave, onClose, target }: { onSave: (fn: string) => void; onClose: () => void; target: 'new' | 'selected' }) {
  const [f, setF] = useState('')
  const err = f.trim() ? compileExpr(f).error : null
  return (
    <Modal onClose={onClose} label="Graficar una función">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.trim() || err) return
          onSave(f.trim())
          onClose()
        }}
      >
        <h2 className="dialog-title">Graficar una función</h2>
        <div className="fn-row">
          <span className="fn-label">y =</span>
          <input className="text-input" value={f} autoFocus placeholder="x^2 - 3" spellCheck={false} autoCapitalize="off" onChange={(e) => setF(e.target.value)} />
        </div>
        {err && <p className="error">{err}</p>}
        <p className="muted dialog-body">
          {target === 'selected' ? 'Se agrega a los ejes seleccionados.' : 'Se dibujan unos ejes nuevos con la función.'} Se escribe como en la calculadora: <code>2x + 1</code>,{' '}
          <code>x^2</code>, <code>sqrt(x)</code>, <code>sin(x)</code>, <code>|x|</code>.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary-solid" disabled={!f.trim() || !!err}>
            Graficar
          </button>
        </div>
      </form>
    </Modal>
  )
}
