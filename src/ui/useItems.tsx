import { useCallback, useState, type ReactNode, type RefObject } from 'react'
import type { Board, BoardOptions } from '../canvas/Board'
import { measureMath, PAD, rectPts } from '../items/draw'
import { handwritingEnabled, recognizeMath } from '../items/handwriting'
import { axesAt, numberLineAt } from '../items/insert'
import { loadMathJax, mathSvg, EX } from '../items/math'
import { setTool, useTools } from '../lib/toolPrefs'
import { newId, nextZ, type NoteModel } from '../model/note'
import type { Item, Stroke } from '../model/types'
import { AxesDialog, FunctionDialog, NumberLineDialog } from './FigureDialogs'
import { editTargetFor, ItemEditor, type EditTarget } from './ItemEditor'
import type { SelectionAction } from './SelectionBar'
import type { InsertKind } from './Toolbar'

type Dialog =
  | { kind: 'axes'; page: number; stroke: Stroke }
  | { kind: 'numberline'; page: number; stroke: Stroke }
  | { kind: 'function'; target: { page: number; stroke: Stroke } | null }

/**
 * Texto, fórmulas y figuras: el editor sobre la hoja, los diálogos, insertar desde la barra o con
 * atajos, y las acciones sobre la selección (editar, convertir la escritura en fórmula).
 */
export function useItems(board: RefObject<Board | null>, note: NoteModel) {
  const [edit, setEdit] = useState<EditTarget | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const say = useCallback((text: string) => {
    setMessage(text)
    setTimeout(() => setMessage((m) => (m === text ? null : m)), 4000)
  }, [])

  /** Tocar la hoja con Texto o Fórmula: crear, o editar lo que ya había. */
  const onPlace = useCallback<NonNullable<BoardOptions['onPlace']>>((p) => {
    if (p.hit) return setEdit(editTargetFor(p.page, p.hit))
    const size = useTools.getState().text.size
    // La primera línea queda a la altura del toque
    setEdit({ kind: p.tool, page: p.page, x: p.x - size * PAD, y: p.y - size * (PAD + 0.6), stroke: null })
  }, [])

  /** Inserta una figura en el medio de lo que se ve y la deja seleccionada para moverla. */
  const placeFigure = (make: (cx: number, cy: number, w: number, h: number, color: string) => Stroke) => {
    const b = board.current
    if (!b) return
    const c = b.viewCenter()
    const stroke = make(c.x, c.y, c.w, c.h, useTools.getState().pen.color)
    b.replace(c.page, [], [stroke])
    setTool('lasso')
    b.selectStroke(c.page, stroke.id)
  }

  const insert = useCallback(
    (kind: InsertKind) => {
      const b = board.current
      if (!b) return
      if (kind === 'axes') placeFigure((x, y, w, h, color) => axesAt(x, y, Math.max(300, Math.min(900, Math.min(w, h) * 0.75)), color))
      else if (kind === 'numberline') placeFigure((x, y, w, _h, color) => numberLineAt(x, y, Math.max(400, Math.min(1100, w * 0.8)), color))
      else {
        const sel = b.selectedItem()
        setDialog({ kind: 'function', target: sel?.stroke.item?.kind === 'axes' ? sel : null })
      }
    },
    // placeFigure solo usa el ref del lienzo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board],
  )

  /** Reemplaza el objeto de un trazo (mismo lugar, mismo id). */
  const updateItem = (page: number, stroke: Stroke, item: Item) => {
    board.current?.replace(page, [stroke], [{ ...stroke, item }])
    board.current?.selectStroke(page, stroke.id)
  }

  /** La escritura seleccionada pasa a ser una fórmula prolija, en el mismo lugar y del mismo alto. */
  const convertToMath = async () => {
    const b = board.current
    const sel = b?.selectedInk()
    if (!b || !sel || busy) return
    setBusy(true)
    try {
      const [latex] = await Promise.all([recognizeMath(sel.strokes), loadMathJax()])
      let x0 = Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (const s of sel.strokes) {
        x0 = Math.min(x0, s.bbox[0])
        y0 = Math.min(y0, s.bbox[1])
        y1 = Math.max(y1, s.bbox[3])
      }
      const m = mathSvg(latex, 'tex')
      const size = Math.round(Math.min(200, Math.max(20, m ? (y1 - y0) / (m.hEx * EX) : 40)))
      const dims = measureMath(latex, 'tex', size) ?? { w: latex.length * size * 0.5, h: size * 1.4 }
      const pad = size * PAD
      const color = sel.strokes[0].color
      const stroke: Stroke = {
        id: newId(),
        tool: 'pen',
        color,
        opacity: 1,
        z: nextZ(),
        size,
        pts: rectPts(x0 - pad, y0 - pad, x0 + dims.w + pad, y0 + dims.h + pad),
        simulated: false,
        bbox: [0, 0, 0, 0],
        item: { kind: 'math', src: latex, fmt: 'tex' },
      }
      b.replace(sel.page, sel.strokes, [stroke])
      b.selectStroke(sel.page, stroke.id)
      say('Listo. Si algo quedó mal, tocá «Editar» o deshacé (Ctrl Z).')
    } catch (e) {
      say((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Acciones de la barra de la selección según lo seleccionado. */
  const selectionActions = (): SelectionAction[] => {
    const b = board.current
    if (!b) return []
    const one = b.selectedItem()
    const item = one?.stroke.item
    if (one && item) {
      if (item.kind === 'text' || item.kind === 'math') {
        return [{ label: 'Editar', icon: 'edit', primary: true, run: () => (b.clearSelection(), setEdit(editTargetFor(one.page, one.stroke))) }]
      }
      if (item.kind === 'axes') {
        return [
          { label: 'Editar', icon: 'edit', primary: true, run: () => setDialog({ kind: 'axes', ...one }) },
          { label: 'Graficar una función', icon: 'fx', run: () => setDialog({ kind: 'function', target: one }) },
        ]
      }
      return [{ label: 'Editar', icon: 'edit', primary: true, run: () => setDialog({ kind: 'numberline', ...one }) }]
    }
    if (handwritingEnabled && b.selectedInk()) {
      return [{ label: busy ? 'Reconociendo…' : 'A fórmula', icon: 'sigma', primary: true, run: () => void convertToMath() }]
    }
    return []
  }

  const paperOf = (page: number) => note.pages[page]?.background.paper ?? '#ffffff'

  const overlays: ReactNode = (
    <>
      {edit && board.current && <ItemEditor key={`${edit.page}:${edit.x}:${edit.y}:${edit.stroke?.id}`} board={board.current} target={edit} paper={paperOf(edit.page)} onClose={() => setEdit(null)} />}
      {dialog?.kind === 'axes' && dialog.stroke.item?.kind === 'axes' && (
        <AxesDialog value={dialog.stroke.item} onSave={(a) => updateItem(dialog.page, dialog.stroke, a)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'numberline' && dialog.stroke.item?.kind === 'numberline' && (
        <NumberLineDialog value={dialog.stroke.item} onSave={(n) => updateItem(dialog.page, dialog.stroke, n)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'function' && (
        <FunctionDialog
          target={dialog.target ? 'selected' : 'new'}
          onClose={() => setDialog(null)}
          onSave={(fn) => {
            const t = dialog.target
            if (t?.stroke.item?.kind === 'axes') updateItem(t.page, t.stroke, { ...t.stroke.item, fns: [...t.stroke.item.fns, fn] })
            else placeFigure((x, y, w, h, color) => axesAt(x, y, Math.max(300, Math.min(900, Math.min(w, h) * 0.75)), color, [fn]))
          }}
        />
      )}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </>
  )

  return { onPlace, insert, selectionActions, overlays, editing: edit !== null }
}
