import { getDocs, onSnapshot, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { friendlyError } from '../lib/errors'
import type { StrokeChange } from '../model/history'
import { NoteModel } from '../model/note'
import type { Page, Stroke } from '../model/types'
import {
  BatchQueue,
  docToStroke,
  pageRef,
  pagesCol,
  roomRef,
  strokeRef,
  strokesCol,
  strokeToDoc,
  toPageDoc,
  toRoomMeta,
  type PageDoc,
  type RoomMeta,
} from './rooms'
import { trackWrite } from './syncStatus'

/**
 * Agrupa las escrituras de trazos. Corto, porque del otro lado hay alguien mirando: alcanza para
 * juntar los pedazos de una pasada de goma sin que se note la demora.
 */
const FLUSH_MS = 60

export type SyncState =
  | { status: 'loading' }
  | { status: 'missing' }
  /** denied: Firestore no lo deja leer (te sacaron de la sala, o faltan las reglas) */
  | { status: 'error'; message: string; denied: boolean }
  | { status: 'ready'; model: NoteModel; meta: RoomMeta }

/**
 * Sincroniza la sala abierta con Firestore, en los dos sentidos:
 * - lo que cambia en el modelo (trazos, páginas, fondos) se escribe en lotes, con debounce;
 * - lo que dibujan los demás se aplica al modelo de forma incremental.
 * El eco de las escrituras propias se reconoce porque el trazo ya está igual en el modelo.
 */
export class RoomSync {
  private model: NoteModel | null = null
  private meta: RoomMeta | null = null
  private pageDocs = new Map<string, PageDoc>()
  private gotPages = false
  private strokeSubs = new Map<string, Unsubscribe>()
  private loadedPages = new Set<string>()
  private subs: Unsubscribe[] = []
  /** Escrituras pendientes de trazos: «pageId/strokeId» → trazo (o null para borrar) */
  private pending = new Map<string, { pageId: string; stroke: Stroke | null }>()
  /** Lo último escrito (o leído) de cada página, para no reescribir lo mismo */
  private written = new Map<string, string>()
  private writtenOrder = ''
  private pagesDirty = false
  /** Mientras se aplican páginas que llegaron de Firestore, sus eventos no se vuelven a escribir */
  private applyingRemote = false
  private flushTimer = 0
  private unsubModel: (() => void) | null = null
  private readonly uid: string
  private readonly code: string
  private readonly onState: (s: SyncState) => void

  constructor(uid: string, code: string, onState: (s: SyncState) => void) {
    this.uid = uid
    this.code = code
    this.onState = onState
  }

  start() {
    const fail = (e: Error) =>
      this.onState({ status: 'error', message: friendlyError(e), denied: (e as { code?: string }).code === 'permission-denied' })
    this.subs.push(
      onSnapshot(
        roomRef(this.code),
        (snap) => {
          if (!snap.exists()) {
            // Puede ser que la caché todavía no la tenga: esperamos al servidor
            if (!snap.metadata.fromCache) this.onState({ status: 'missing' })
            return
          }
          this.meta = toRoomMeta(snap.id, snap.data({ serverTimestamps: 'estimate' }))
          this.reconcilePages()
          this.maybeReady()
        },
        fail,
      ),
      onSnapshot(
        pagesCol(this.code),
        (snap) => {
          this.gotPages = true
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') this.pageDocs.delete(ch.doc.id)
            else this.pageDocs.set(ch.doc.id, toPageDoc(ch.doc.id, ch.doc.data({ serverTimestamps: 'estimate' })))
          }
          this.reconcilePages()
        },
        fail,
      ),
    )
    const onHide = () => document.visibilityState === 'hidden' && this.flush()
    document.addEventListener('visibilitychange', onHide)
    this.subs.push(() => document.removeEventListener('visibilitychange', onHide))
  }

  stop() {
    this.flush()
    for (const u of this.subs) u()
    for (const u of this.strokeSubs.values()) u()
    this.subs = []
    this.strokeSubs.clear()
    this.unsubModel?.()
  }

  // ---------- Firestore → modelo ----------

  /** Arma la lista de páginas según `pageIds` de la nota y la aplica si cambió. */
  private reconcilePages() {
    const meta = this.meta
    if (!meta || !this.gotPages) return
    // Con cambios locales de páginas sin escribir, lo local manda: el próximo snapshot
    // (ya con lo nuestro) vuelve a reconciliar
    if (this.model && this.pagesDirty) return
    // Una página puede figurar en la nota antes de que llegue su documento (los snapshots de la
    // nota y de las páginas no llegan juntos): si ya la tenemos en el modelo, se conserva
    const known = (id: string) => this.pageDocs.has(id) || !!this.model?.page(id)
    const ordered = meta.pageIds.filter(known)
    // Páginas que existen pero no figuran en el orden (otro dispositivo a mitad de escribir): al final
    for (const p of [...this.pageDocs.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      if (!ordered.includes(p.id)) ordered.push(p.id)
    }
    if (!ordered.length) return

    for (const id of ordered) {
      const d = this.pageDocs.get(id)
      if (d) this.written.set(id, JSON.stringify(d.background))
    }
    // Lo que ya no está en Firestore se olvida (sin volver a borrarlo)
    for (const id of [...this.written.keys()]) if (!ordered.includes(id)) this.written.delete(id)
    this.writtenOrder = ordered.join(',')

    if (!this.model) {
      this.model = new NoteModel(ordered.map((id) => this.toPage(id)))
      this.unsubModel = this.model.subscribe((e) => {
        if (e.type === 'commit') this.queueStrokes(e.changes)
        else if (e.type === 'pages' && !this.applyingRemote) this.queuePages()
      })
    } else {
      const current = this.model.pages
      const same =
        current.length === ordered.length &&
        current.every((p, i) => {
          const d = this.pageDocs.get(p.id)
          return p.id === ordered[i] && (!d || JSON.stringify(p.background) === JSON.stringify(d.background))
        })
      if (!same) {
        this.applyingRemote = true
        try {
          this.model.replacePages(ordered.map((id) => this.toPage(id)))
        } finally {
          this.applyingRemote = false
        }
      }
    }
    this.syncStrokeSubs(ordered)
    this.maybeReady()
  }

  private toPage(id: string): Page {
    const existing = this.model?.page(id)
    const d = this.pageDocs.get(id)
    if (!d) return existing!
    return { id, width: d.width, height: d.height, background: d.background, strokes: existing?.strokes ?? [] }
  }

  private syncStrokeSubs(pageIds: string[]) {
    const keep = new Set(pageIds)
    for (const [id, u] of this.strokeSubs) {
      if (!keep.has(id)) {
        u()
        this.strokeSubs.delete(id)
        this.loadedPages.delete(id)
      }
    }
    for (const id of pageIds) {
      if (this.strokeSubs.has(id)) continue
      this.strokeSubs.set(
        id,
        onSnapshot(strokesCol(this.code, id), (snap) => {
          const model = this.model
          const page = model?.page(id)
          if (!model || !page) return
          const byId = new Map(page.strokes.map((s) => [s.id, s]))
          const before: Stroke[] = []
          const after: Stroke[] = []
          for (const ch of snap.docChanges()) {
            const old = byId.get(ch.doc.id)
            // Si hay una escritura propia pendiente para este trazo, manda lo local
            if (this.pending.has(`${id}/${ch.doc.id}`)) continue
            if (ch.type === 'removed') {
              if (old) before.push(old)
              continue
            }
            const s = docToStroke(ch.doc.id, ch.doc.data())
            if (!s) continue
            if (old && signature(old) === signature(s)) continue
            if (old) before.push(old)
            after.push(s)
          }
          if (before.length || after.length) model.applyRemote([{ pageId: id, before, after }])
          this.loadedPages.add(id)
          this.maybeReady()
        }, () => {
          // Sin permiso para leer: el listener de la sala ya lo informa
        }),
      )
    }
  }

  private readyOnce = false
  private lastMeta: RoomMeta | null = null
  /** Avisa cuando la sala está lista y, después, cada vez que cambian sus datos (título, permisos). */
  private maybeReady() {
    const model = this.model
    if (!model || !this.meta) return
    // Lista cuando llegaron los trazos de todas las páginas (desde la caché es casi inmediato)
    if (!this.readyOnce && !model.pages.every((p) => this.loadedPages.has(p.id))) return
    if (this.readyOnce && this.lastMeta === this.meta) return
    this.readyOnce = true
    this.lastMeta = this.meta
    this.onState({ status: 'ready', model, meta: this.meta })
  }

  // ---------- Modelo → Firestore ----------

  private queueStrokes(changes: StrokeChange[]) {
    for (const c of changes) {
      const afterIds = new Set(c.after.map((s) => s.id))
      for (const s of c.before) if (!afterIds.has(s.id)) this.pending.set(`${c.pageId}/${s.id}`, { pageId: c.pageId, stroke: null })
      for (const s of c.after) this.pending.set(`${c.pageId}/${s.id}`, { pageId: c.pageId, stroke: s })
    }
    this.scheduleFlush()
  }

  private queuePages() {
    this.pagesDirty = true
    this.scheduleFlush()
  }

  private scheduleFlush() {
    clearTimeout(this.flushTimer)
    this.flushTimer = window.setTimeout(() => this.flush(), FLUSH_MS)
    trackWrite('queued')
  }

  /** Escribe todo lo pendiente en lotes (también al pasar a segundo plano o al salir). */
  flush() {
    clearTimeout(this.flushTimer)
    const model = this.model
    if (!model || (!this.pending.size && !this.pagesDirty)) {
      trackWrite('idle')
      return
    }
    const q = new BatchQueue()
    const { uid, code } = this

    if (this.pagesDirty) {
      this.pagesDirty = false
      const ids = model.pages.map((p) => p.id)
      for (const p of model.pages) {
        const bg = JSON.stringify(p.background)
        const prev = this.written.get(p.id)
        if (prev === bg) continue
        if (prev === undefined) {
          q.set(pageRef(code, p.id), {
            width: p.width,
            height: p.height,
            background: p.background,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        } else {
          q.update(pageRef(code, p.id), { background: p.background, updatedAt: serverTimestamp() })
        }
        this.written.set(p.id, bg)
      }
      // Páginas borradas: sus trazos y la página
      for (const id of [...this.written.keys()]) {
        if (ids.includes(id)) continue
        this.written.delete(id)
        void purgePage(code, id)
      }
      const order = ids.join(',')
      if (order !== this.writtenOrder) {
        this.writtenOrder = order
        q.update(roomRef(code), { pageIds: ids, updatedAt: serverTimestamp() })
      }
    }

    for (const { pageId, stroke } of this.pending.values()) {
      // Si la página ya no existe, no tiene sentido escribir sus trazos
      if (!model.page(pageId)) continue
      if (stroke) q.set(strokeRef(code, pageId, stroke.id), strokeToDoc(stroke, uid))
    }
    for (const [key, { pageId, stroke }] of this.pending) {
      if (!stroke) q.delete(strokeRef(code, pageId, key.slice(pageId.length + 1)))
    }
    this.pending.clear()
    trackWrite('idle')
    if (q.size) trackWrite(q.commit())
  }
}

/** Borra una página con sus trazos (desde el cliente no hay borrado recursivo). */
async function purgePage(code: string, pageId: string) {
  const q = new BatchQueue()
  const strokes = await getDocs(strokesCol(code, pageId))
  for (const s of strokes.docs) q.delete(s.ref)
  q.delete(pageRef(code, pageId))
  await q.commit()
}

/** Lo que identifica el contenido de un trazo (para reconocer el eco de lo propio). */
function signature(s: Stroke): string {
  return `${s.z}|${s.pts.length}|${s.color}|${s.size.toFixed(2)}|${s.bbox.map((v) => Math.round(v)).join(',')}${s.item ? `|${JSON.stringify(s.item)}` : ''}`
}
