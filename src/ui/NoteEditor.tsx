import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Board, type BoardOptions } from '../canvas/Board'
import { shapeRecognizer } from '../recognition/recognizer'
import type { PointerDebug } from '../canvas/InputController'
import { dismissPenNotice, notePenSeen, setFingerDraws, useInputPrefs } from '../lib/inputPrefs'
import { useLayoutMode } from '../lib/layoutMode'
import { setTool, useTools, type ToolId } from '../lib/toolPrefs'
import { saveLastBackground } from '../model/background'
import { newPage } from '../model/pages'
import type { NoteModel } from '../model/note'
import type { Background } from '../model/types'
import { BackgroundPanel, type Scope } from './BackgroundPanel'
import { ConfirmDialog, Modal } from './Dialog'
import { ExportDialog } from './ExportDialog'
import { Icon } from './Icon'
import { SelectionBar } from './SelectionBar'
import { Toolbar } from './Toolbar'

export interface MenuAction {
  label: string
  icon: Parameters<typeof Icon>[0]['name']
  run: (ctx: { board: Board; page: number }) => void
}

interface Props {
  note: NoteModel
  title: string
  /** Renombrar (si no se pasa, el título no se puede editar) */
  onRename?: (title: string) => void
  /** Indicador de sincronización, junto al título */
  status?: ReactNode
  /** Acciones extra del menú «⋯» (exportar, etc.) */
  actions?: MenuAction[]
  /** Se llama con el motor del lienzo (para miniaturas, exportar, etc.) */
  onBoard?: (board: Board | null) => void
  /** Solo mirar: sin herramientas, el lápiz y el dedo desplazan la hoja */
  readOnly?: boolean
  /** Puede borrar todo lo de una página (quien administra la sala) */
  canClear?: boolean
  /** Botones extra en la barra de arriba (participantes, compartir) */
  headerExtra?: ReactNode
  /** Aviso fijo sobre la hoja (por ejemplo, «Solo podés mirar») */
  banner?: ReactNode
  /** Más avisos del motor (lo en vivo de la sala); se leen al crear el lienzo */
  boardOptions?: Partial<BoardOptions>
}

const TOOL_KEYS: Record<string, ToolId> = { p: 'pen', h: 'highlighter', e: 'eraser', l: 'lasso' }

export function NoteEditor({ note, title, onRename, status, actions = [], onBoard, readOnly = false, canClear = false, headerExtra, banner, boardOptions }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<Board | null>(null)
  const mode = useLayoutMode()
  const side = useTools((s) => s.side)
  const tool = useTools((s) => s.tool)
  const [zoom, setZoom] = useState(1)
  const [showDebug, setShowDebug] = useState(false)
  const [debug, setDebug] = useState<PointerDebug | null>(null)
  const debugOn = useRef(false)
  const [page, setPage] = useState({ index: 0, total: 1 })
  const [bgOpen, setBgOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmPage, setConfirmPage] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [bg, setBg] = useState<Background | null>(null)
  const [scope, setScope] = useState<Scope>('page')
  const [hist, setHist] = useState({ undo: false, redo: false })
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number; count: number } | null>(null)
  const fingerDraws = useInputPrefs((s) => s.fingerDraws)
  const justDetectedPen = useInputPrefs((s) => s.justDetectedPen)
  const [confirmClear, setConfirmClear] = useState<number | null>(null)
  const readOnlyRef = useRef(readOnly)

  useEffect(() => {
    readOnlyRef.current = readOnly
    if (readOnly) boardRef.current?.clearSelection()
    boardRef.current?.toolChanged()
  }, [readOnly])

  useEffect(() => {
    debugOn.current = showDebug
  }, [showDebug])

  useEffect(() => {
    const root = rootRef.current!
    let lastDebug = 0
    const board = new Board(root, note, {
      ...boardOptions,
      tools: () => useTools.getState(),
      recognize: shapeRecognizer,
      fingerDraws: () => useInputPrefs.getState().fingerDraws,
      canEdit: () => !readOnlyRef.current,
      onPenDetected: notePenSeen,
      onZoom: setZoom,
      onPage: (index, total) => setPage({ index, total }),
      onSelection: (box) => {
        if (!box) return setSelection(null)
        const r = root.getBoundingClientRect()
        setSelection({ ...box, x: box.x + r.left, y: box.y + r.top })
      },
      onDebug: (info) => {
        if (!debugOn.current) return
        const now = performance.now()
        if (now - lastDebug < 100) return
        lastDebug = now
        setDebug(info)
      },
    })
    boardRef.current = board
    onBoard?.(board)
    // Para las pruebas automáticas (solo en desarrollo)
    if (import.meta.env.DEV) Object.assign(window, { __pizarra: { note, board } })
    const syncHistory = () => setHist({ undo: note.history.canUndo, redo: note.history.canRedo })
    syncHistory()
    const unsub = note.subscribe((e) => e.type === 'history' && syncHistory())
    const unsubTools = useTools.subscribe((s, prev) => s.tool !== prev.tool && board.toolChanged())
    return () => {
      unsub()
      unsubTools()
      board.destroy()
      boardRef.current = null
      onBoard?.(null)
    }
    // onBoard se usa solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const b = boardRef.current
      if (!b || readOnlyRef.current) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') b[e.shiftKey ? 'redo' : 'undo']()
      else if (mod && k === 'y') b.redo()
      else if (!mod && !e.altKey && TOOL_KEYS[k]) setTool(TOOL_KEYS[k])
      else if (e.key === 'Delete' || e.key === 'Backspace') b.deleteSelection()
      else if (e.key === 'Escape') b.clearSelection()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!justDetectedPen) return
    const t = setTimeout(dismissPenNotice, 5000)
    return () => clearTimeout(t)
  }, [justDetectedPen])

  // Con el panel abierto, muestra el fondo de la página que está a la vista
  useEffect(() => {
    if (bgOpen) setBg(note.pages[page.index]?.background ?? null)
  }, [bgOpen, page.index, note])

  const changeBackground = (next: Background) => {
    setBg(next)
    note.setBackground(scope === 'all' ? 'all' : [note.pages[page.index].id], next)
    saveLastBackground(next)
  }

  const changeScope = (next: Scope) => {
    setScope(next)
    if (next === 'all' && bg) note.setBackground('all', bg)
  }

  const addPage = () => {
    note.addPage(newPage(note.pages[note.pages.length - 1].background))
    boardRef.current?.scrollToPage(note.pages.length - 1)
  }

  const closeBg = useCallback(() => setBgOpen(false), [])

  const fingerLabel = fingerDraws ? 'El dedo dibuja (tocá para que desplace)' : 'El dedo desplaza (tocá para que dibuje)'
  const toolbar = (
    <Toolbar
      mode={mode}
      canUndo={hist.undo}
      canRedo={hist.redo}
      onUndo={() => boardRef.current?.undo()}
      onRedo={() => boardRef.current?.redo()}
    />
  )

  const editMenu: MenuAction[] = readOnly
    ? []
    : [
        { label: 'Fondo de la hoja', icon: 'sheet', run: () => setBgOpen(true) },
        { label: 'Agregar página', icon: 'pagePlus', run: addPage },
        ...(canClear ? [{ label: 'Borrar todo lo de esta página', icon: 'eraser' as const, run: () => setConfirmClear(page.index) }] : []),
        ...(page.total > 1 ? [{ label: 'Borrar esta página', icon: 'trash' as const, run: () => setConfirmPage(page.index) }] : []),
      ]
  const menu: MenuAction[] = [
    ...actions,
    ...editMenu,
    { label: 'Exportar (PDF o PNG)…', icon: 'download', run: () => setExporting(true) },
    ...(mode === 'desktop' ? [{ label: 'Atajos de teclado', icon: 'info' as const, run: () => setShortcuts(true) }] : []),
    { label: showDebug ? 'Ocultar datos del lápiz' : 'Datos del lápiz', icon: 'info', run: () => setShowDebug((v) => !v) },
  ]

  return (
    <div className={`editor mode-${mode} side-${side} tool-${readOnly ? 'none' : tool}${readOnly ? ' is-readonly' : ''}`}>
      <header className="editor-bar">
        <Link to="/" className="icon-btn" aria-label="Salir de la sala" title="Salir">
          <Icon name="back" />
        </Link>
        <TitleField title={title} onRename={onRename} />
        {status}
        {mode === 'desktop' && !readOnly && toolbar}
        <div className="editor-actions">
          {headerExtra}
          {!readOnly && (
            <button
              className={`icon-btn${fingerDraws ? ' is-on' : ''}`}
              onClick={() => setFingerDraws(!fingerDraws)}
              aria-pressed={fingerDraws}
              aria-label={fingerLabel}
              title={fingerLabel}
            >
              <Icon name={fingerDraws ? 'finger' : 'hand'} />
            </button>
          )}
          <button
            className="btn btn-small btn-ghost zoom-btn"
            onClick={() => boardRef.current?.fitWidth()}
            title="Ajustar al ancho"
            aria-label={`Zoom ${Math.round(zoom * 100)} %. Tocá para ajustar al ancho`}
          >
            {Math.round(zoom * 100)} %
          </button>
          <div className="menu-anchor">
            <button
              className={`icon-btn${menuOpen ? ' is-on' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Más opciones"
              title="Más opciones"
            >
              <Icon name="more" />
            </button>
            {menuOpen && (
              <Menu onClose={() => setMenuOpen(false)}>
                {menu.map((a) => (
                  <button
                    key={a.label}
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      setMenuOpen(false)
                      if (boardRef.current) a.run({ board: boardRef.current, page: page.index })
                    }}
                  >
                    <Icon name={a.icon} size={18} /> {a.label}
                  </button>
                ))}
              </Menu>
            )}
          </div>
        </div>
      </header>
      {mode === 'phone' && !readOnly && <div className="tool-row">{toolbar}</div>}
      <div className="board-wrap">
        <div className="board" ref={rootRef} />
        {mode === 'tablet' && !readOnly && toolbar}
        {banner && <div className="board-banner">{banner}</div>}
        {page.total > 1 && (
          <div className="page-pill" aria-live="polite">
            {page.index + 1} / {page.total}
          </div>
        )}
      </div>
      {selection && (
        <SelectionBar
          box={selection}
          onDelete={() => boardRef.current?.deleteSelection()}
          onDuplicate={() => boardRef.current?.duplicateSelection()}
          onColor={(c) => boardRef.current?.recolorSelection(c)}
          onDone={() => boardRef.current?.clearSelection()}
        />
      )}
      {bgOpen && bg && (
        <BackgroundPanel
          value={bg}
          scope={scope}
          page={page.index}
          total={page.total}
          onChange={changeBackground}
          onScope={changeScope}
          onClose={closeBg}
        />
      )}
      {showDebug && (
        <div className="debug-panel" aria-live="off">
          {debug ? (
            <>
              <span>{debug.type}</span>
              <span>presión {debug.pressure.toFixed(2)}</span>
              <span>
                incl. {debug.tiltX}° / {debug.tiltY}°
              </span>
              <span>botones {debug.buttons}</span>
              <span>
                eventos ×{debug.coalesced} · pred. {debug.predicted}
              </span>
              <span>
                contacto {Math.round(debug.width)}×{Math.round(debug.height)}
              </span>
            </>
          ) : (
            <span>Tocá la hoja para ver los datos del puntero</span>
          )}
        </div>
      )}
      {exporting && <ExportDialog pages={note.pages} current={page.index} title={title} onClose={() => setExporting(false)} />}
      {shortcuts && (
        <Modal onClose={() => setShortcuts(false)} label="Atajos de teclado">
          <h2 className="dialog-title">Atajos de teclado</h2>
          <dl className="shortcuts">
            <dt>P · H · E · L</dt>
            <dd>Lapicera, resaltador, goma, lazo</dd>
            <dt>Ctrl + Z</dt>
            <dd>Deshacer</dd>
            <dt>Ctrl + Shift + Z · Ctrl + Y</dt>
            <dd>Rehacer</dd>
            <dt>Supr · Esc</dt>
            <dd>Borrar la selección · soltarla</dd>
            <dt>Espacio + arrastrar</dt>
            <dd>Desplazar la hoja</dd>
            <dt>Ctrl + rueda · Ctrl + + / − / 0</dt>
            <dd>Zoom · ajustar al ancho</dd>
          </dl>
          <p className="muted dialog-body">En la tablet: dos dedos tocando a la vez deshacen; el botón del S Pen borra.</p>
          <div className="dialog-actions">
            <button className="btn btn-primary-solid" onClick={() => setShortcuts(false)}>
              Listo
            </button>
          </div>
        </Modal>
      )}
      {confirmClear !== null && (
        <ConfirmDialog
          title={`¿Borrar todo lo de la página ${confirmClear + 1}?`}
          body="Se borra para todos los que están en la sala. Lo podés recuperar con Deshacer."
          confirm="Borrar todo"
          danger
          onConfirm={() => boardRef.current?.clearPage(confirmClear)}
          onClose={() => setConfirmClear(null)}
        />
      )}
      {confirmPage !== null && (
        <ConfirmDialog
          title={`¿Borrar la página ${confirmPage + 1}?`}
          body="Se borra con todo lo que tiene dibujado, para todos los que están en la sala. No se puede deshacer."
          confirm="Borrar página"
          danger
          onConfirm={() => note.pages[confirmPage] && note.removePage(note.pages[confirmPage].id)}
          onClose={() => setConfirmPage(null)}
        />
      )}
      {justDetectedPen && !readOnly && (
        <div className="toast" role="status">
          Detectamos un lápiz: ahora el dedo desplaza la hoja.
          <button className="btn btn-small" onClick={() => setFingerDraws(true)}>
            Que dibuje
          </button>
        </div>
      )}
    </div>
  )
}

/** Título editable: se toca, se escribe y se confirma con Enter o al salir. */
function TitleField({ title, onRename }: { title: string; onRename?: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  if (!onRename || !editing) {
    return (
      <button
        className="editor-title"
        onClick={() => {
          if (!onRename) return
          setValue(title)
          setEditing(true)
        }}
        disabled={!onRename}
        title={onRename ? 'Cambiar el título' : undefined}
      >
        {title || 'Sin título'}
      </button>
    )
  }
  const done = () => {
    setEditing(false)
    const t = value.trim()
    if (t !== title) onRename(t)
  }
  return (
    <input
      className="editor-title-input"
      value={value}
      autoFocus
      maxLength={120}
      placeholder="Sin título"
      aria-label="Nombre de la sala"
      onChange={(e) => setValue(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

/** Menú desplegable que se cierra al tocar afuera (sin dibujar en la hoja). */
export function Menu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (ref.current?.contains(t) || ref.current?.parentElement?.contains(t)) return
      onClose()
      if (t.closest?.('.board')) e.stopPropagation()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="menu" role="menu" ref={ref}>
      {children}
    </div>
  )
}
