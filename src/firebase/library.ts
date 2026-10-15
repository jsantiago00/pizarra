import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore'
import { thumbnail } from '../canvas/renderPage'
import { encodePoints } from '../model/codec'
import type { NoteModel } from '../model/note'
import type { Background, Page, Stroke } from '../model/types'
import { getDb } from './db'
import { docToStroke } from './rooms'

/**
 * «Mis pizarras»: copias de las salas en las que participaste, solo con cuenta de Google.
 * Son copias, no la sala: si después la borran o la cambian, la tuya queda como la guardaste.
 *
 * users/{uid}/boards/{code}           { code, title, savedAt, pages: [{ width, height, background }],
 *                                       chunkIds, thumb, strokes }
 *   chunks/{página-parte}             { page, strokes: [{ tool, color, size, opacity, pts: Bytes, bbox, z, … }] }
 *
 * Los trazos van en pocos documentos grandes (hasta ~700 KB cada uno) en vez de uno por trazo:
 * guardar una clase de 500 trazos son 2 o 3 escrituras.
 */

export interface SavedBoard {
  code: string
  title: string
  savedAt: number
  pageCount: number
  strokeCount: number
  thumb: string
}

const CHUNK_BYTES = 700_000

const boardsCol = (uid: string) => collection(getDb(), 'users', uid, 'boards')
const boardRef = (uid: string, code: string) => doc(boardsCol(uid), code)
const chunkRef = (uid: string, code: string, id: string) => doc(boardRef(uid, code), 'chunks', id)
const millis = (t: unknown): number => (t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : Date.now())

function strokeDoc(s: Stroke): DocumentData {
  const d: DocumentData = {
    tool: s.tool,
    color: s.color,
    size: s.size,
    opacity: s.opacity,
    pts: Bytes.fromUint8Array(encodePoints(s.pts)),
    bbox: s.bbox,
    z: s.z,
    simulated: s.simulated,
  }
  if (s.shape) d.shape = s.shape
  return d
}

/** Guarda (o reemplaza) la copia de una sala. Devuelve los pedazos escritos, para la próxima vez. */
export async function saveBoard(uid: string, code: string, title: string, pages: Page[], previous?: string[]): Promise<string[]> {
  const chunks: { id: string; page: number; strokes: DocumentData[] }[] = []
  pages.forEach((p, page) => {
    let part = 0
    let cur = { id: `${page}-0`, page, strokes: [] as DocumentData[] }
    let size = 0
    for (const s of p.strokes) {
      const d = strokeDoc(s)
      const bytes = (d.pts as Bytes).toUint8Array().length + 200
      if (size + bytes > CHUNK_BYTES && cur.strokes.length) {
        chunks.push(cur)
        cur = { id: `${page}-${++part}`, page, strokes: [] }
        size = 0
      }
      cur.strokes.push(d)
      size += bytes
    }
    chunks.push(cur)
  })
  const ids = chunks.map((c) => c.id)
  const old = previous ?? ((await getDoc(boardRef(uid, code)).catch(() => null))?.data()?.chunkIds as string[] | undefined) ?? []

  let thumb = ''
  try {
    if (pages[0]) thumb = thumbnail(pages[0])
  } catch {
    /* sin canvas */
  }
  // Cada pedazo por separado: un lote no puede pasar de 10 MB
  await Promise.all([
    ...chunks.map((c) => setDoc(chunkRef(uid, code, c.id), { page: c.page, strokes: c.strokes })),
    ...old.filter((id) => !ids.includes(id)).map((id) => deleteDoc(chunkRef(uid, code, id))),
    setDoc(boardRef(uid, code), {
      code,
      title,
      savedAt: serverTimestamp(),
      pages: pages.map((p) => ({ width: p.width, height: p.height, background: p.background })),
      chunkIds: ids,
      strokes: pages.reduce((n, p) => n + p.strokes.length, 0),
      thumb,
    }),
  ])
  return ids
}

export function toSavedBoard(code: string, d: DocumentData): SavedBoard {
  return {
    code,
    title: typeof d.title === 'string' ? d.title : '',
    savedAt: millis(d.savedAt),
    pageCount: Array.isArray(d.pages) ? d.pages.length : 0,
    strokeCount: Number(d.strokes ?? 0),
    thumb: typeof d.thumb === 'string' ? d.thumb : '',
  }
}

export function watchBoards(uid: string, cb: (boards: SavedBoard[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(boardsCol(uid), orderBy('savedAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => toSavedBoard(d.id, d.data({ serverTimestamps: 'estimate' })))),
    onError,
  )
}

/** Abre una copia guardada: sus páginas con todos los trazos. */
export async function loadBoard(uid: string, code: string): Promise<{ meta: SavedBoard; pages: Page[] } | null> {
  const snap = await getDoc(boardRef(uid, code))
  if (!snap.exists()) return null
  const d = snap.data()
  const pages: Page[] = (Array.isArray(d.pages) ? d.pages : []).map((p: { width: number; height: number; background: Background }, i: number) => ({
    id: `p${i}`,
    width: p.width,
    height: p.height,
    background: p.background,
    strokes: [],
  }))
  const chunks = await getDocs(collection(boardRef(uid, code), 'chunks'))
  for (const c of chunks.docs) {
    const v = c.data()
    const page = pages[Number(v.page)]
    if (!page || !Array.isArray(v.strokes)) continue
    v.strokes.forEach((s: DocumentData, i: number) => {
      const stroke = docToStroke(`${c.id}-${i}`, s)
      if (stroke) page.strokes.push(stroke)
    })
  }
  for (const p of pages) p.strokes.sort((a, b) => a.z - b.z)
  return { meta: toSavedBoard(code, d), pages }
}

export async function deleteBoard(uid: string, code: string) {
  const chunks = await getDocs(collection(boardRef(uid, code), 'chunks'))
  await Promise.all(chunks.docs.map((c) => deleteDoc(c.ref)))
  await deleteDoc(boardRef(uid, code))
}

/** Cada cuánto se guarda la copia mientras estás en la sala, si cambió algo. */
const AUTOSAVE_MS = 2 * 60_000

/**
 * Guarda la copia de la sala abierta: al salir, al pasar a segundo plano (cerrar la pestaña,
 * cambiar de app) y cada dos minutos si hubo cambios. La primera vez se guarda aunque nadie
 * haya dibujado: también cuenta haber estado.
 */
export class BoardSaver {
  private dirty = true
  private chunks: string[] | undefined
  private saving: Promise<void> | null = null
  private timer = 0
  private readonly off: (() => void)[] = []
  private readonly uid: string
  private readonly code: string
  private readonly model: NoteModel
  private readonly title: () => string
  private readonly onSaved: (at: number) => void

  constructor(uid: string, code: string, model: NoteModel, title: () => string, onSaved: (at: number) => void) {
    this.uid = uid
    this.code = code
    this.model = model
    this.title = title
    this.onSaved = onSaved
    this.off.push(model.subscribe((e) => (e.type === 'strokes' || e.type === 'pages') && (this.dirty = true)))
    const onHide = () => document.visibilityState === 'hidden' && void this.save()
    document.addEventListener('visibilitychange', onHide)
    this.off.push(() => document.removeEventListener('visibilitychange', onHide))
    this.timer = window.setInterval(() => void this.save(), AUTOSAVE_MS)
  }

  /** Guarda ya, si hay algo nuevo (o siempre, con `force`). */
  save(force = false): Promise<void> {
    if (this.saving) return this.saving
    if (!this.dirty && !force) return Promise.resolve()
    this.dirty = false
    const pages = this.model.pages.map((p) => ({ ...p, strokes: [...p.strokes] }))
    this.saving = saveBoard(this.uid, this.code, this.title(), pages, this.chunks)
      .then((ids) => {
        this.chunks = ids
        this.onSaved(Date.now())
      })
      .catch((e) => {
        this.dirty = true
        console.error('No se pudo guardar la copia:', e)
      })
      .finally(() => (this.saving = null))
    return this.saving
  }

  stop() {
    clearInterval(this.timer)
    for (const f of this.off) f()
    void this.save()
  }
}
