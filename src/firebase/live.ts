import {
  connectDatabaseEmulator,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database'
import type { LocalLive } from '../canvas/Board'
import type { Rect } from '../model/geometry'
import { decodePoints, encodePoints } from '../model/codec'
import { getFirebaseApp } from './app'

/**
 * Lo efímero de la sala, en Realtime Database (no cobra por escritura y avisa al desconectarse):
 *
 * live/{code}/{uid}       { n: nombre, c: color, t, cur: {x, y}, v: {x, y, w, h},
 *                           s: { id, pg, tl, cl, sz, op, sm, r, k: {0: puntos, 1: …}, d? } }
 *
 * - `cur` es el puntero y `v` lo que se ve (para «seguir mi vista»), en coordenadas del mundo.
 * - `s` es el trazo en curso: los puntos van en pedazos (`k`) en base64 con el mismo códec que
 *   Firestore, así cada envío lleva solo lo nuevo. Si se convirtió en forma, se reemplaza (`r`).
 *   Al terminar se marca `d` con el id del trazo confirmado, para que los demás lo sigan viendo
 *   hasta que llegue por Firestore, y después se borra.
 * - Al cerrar la pestaña o perder la conexión, el servidor borra todo (`onDisconnect`).
 */

/** Cada cuánto se manda lo acumulado: suficiente para verlo fluido sin saturar. */
const FLUSH_MS = 50
/** Un trazo terminado se deja un rato, hasta que llegue por Firestore. */
const DONE_KEEP_MS = 4000

let db: Database | undefined

function getRtdb(): Database {
  if (db) return db
  db = getDatabase(getFirebaseApp())
  if (import.meta.env.VITE_USE_EMULATORS === '1') connectDatabaseEmulator(db, '127.0.0.1', 9000)
  return db
}

export interface PeerStroke extends Omit<LocalLive, 'shaped'> {
  /** Id del trazo ya confirmado (está viajando por Firestore) */
  done?: string
}

export interface Peer {
  uid: string
  name: string
  color: string
  cursor: { x: number; y: number } | null
  view: Rect | null
  stroke: PeerStroke | null
}

interface WireStroke {
  id: number
  pg: string
  tl: LocalLive['tool']
  cl: string
  sz: number
  op: number
  sm: boolean
  r: number
  k: Record<string, string> | string[]
  d?: string
}

export class LiveChannel {
  private readonly code: string
  private readonly uid: string
  private readonly onPeers: (peers: Map<string, Peer>) => void
  private readonly onError: () => void
  private off: (() => void) | null = null
  private timer = 0
  private doneTimer = 0
  private stopped = false

  // Lo que hay que mandar en el próximo envío
  private live: LocalLive | null = null
  private liveDirty = false
  private endId: string | null | undefined = undefined
  private strokeState: 'none' | 'new' | 'open' = 'none'
  private strokeSeq = 0
  private rev = 0
  private sentPts = 0
  private chunk = 0
  private cursor: { x: number; y: number } | null | undefined = undefined
  private view: Rect | null | undefined = undefined

  /** Pedazos ya decodificados de cada persona, para no rehacerlos en cada cambio */
  private cache = new Map<string, { key: string; chunks: number; pts: number[] }>()

  constructor(code: string, uid: string, onPeers: (peers: Map<string, Peer>) => void, onError: () => void) {
    this.code = code
    this.uid = uid
    this.onPeers = onPeers
    this.onError = onError
  }

  private meRef() {
    return ref(getRtdb(), `live/${this.code}/${this.uid}`)
  }

  start(name: string, color: string) {
    try {
      const me = this.meRef()
      void onDisconnect(me).remove().catch(this.onError)
      void set(me, { n: name, c: color, t: serverTimestamp() }).catch(this.onError)
      this.off = onValue(
        ref(getRtdb(), `live/${this.code}`),
        (snap) => this.onPeers(this.parse(snap.val() as Record<string, Record<string, unknown>> | null)),
        () => this.onError(),
      )
    } catch {
      this.onError()
    }
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    clearTimeout(this.doneTimer)
    this.off?.()
    void remove(this.meRef()).catch(() => {})
  }

  /** Cambió mi nombre (o mi color): lo ven los demás en el puntero. */
  setName(name: string, color: string) {
    void update(this.meRef(), { n: name, c: color }).catch(() => {})
  }

  // ---------- Lo mío → los demás ----------

  stroke(live: LocalLive | null, committedId?: string) {
    if (live) {
      if (this.strokeState === 'none' || this.endId !== undefined) {
        // Trazo nuevo (si quedaba uno terminado sin mandar, se pisa)
        clearTimeout(this.doneTimer)
        this.strokeState = 'new'
        this.endId = undefined
      }
      this.live = live
      this.liveDirty = true
    } else if (this.strokeState !== 'none') {
      this.endId = committedId ?? null
    }
    this.schedule()
  }

  setCursor(pos: { x: number; y: number } | null) {
    this.cursor = pos && { x: Math.round(pos.x), y: Math.round(pos.y) }
    this.schedule()
  }

  setView(rect: Rect | null) {
    this.view = rect && { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
    this.schedule()
  }

  private schedule() {
    if (!this.timer && !this.stopped) this.timer = window.setTimeout(this.flush, FLUSH_MS)
  }

  private flush = () => {
    this.timer = 0
    const u: Record<string, unknown> = {}
    const l = this.live

    if (l && this.strokeState === 'new') {
      this.strokeSeq++
      this.rev = 0
      const s: WireStroke = {
        id: this.strokeSeq,
        pg: l.pageId,
        tl: l.tool,
        cl: l.color,
        sz: l.size,
        op: l.opacity,
        sm: l.simulated,
        r: 0,
        k: { 0: toBase64(encodePoints(l.pts)) },
      }
      if (this.endId) s.d = this.endId
      u.s = s
      this.sentPts = l.pts.length
      this.chunk = 1
      this.strokeState = 'open'
    } else if (l && this.strokeState === 'open' && this.liveDirty) {
      if (l.shaped) {
        // La forma cambia entera mientras se ajusta: se reemplazan los puntos
        this.rev++
        u['s/r'] = this.rev
        u['s/sm'] = false
        u['s/k'] = { 0: toBase64(encodePoints(l.pts)) }
        this.chunk = 1
        this.sentPts = l.pts.length
      } else if (l.pts.length > this.sentPts) {
        u[`s/k/${this.chunk++}`] = toBase64(encodePoints(l.pts.slice(this.sentPts)))
        this.sentPts = l.pts.length
      }
    }
    if (this.endId && this.strokeState === 'open' && !('s' in u)) u['s/d'] = this.endId
    this.liveDirty = false

    if (this.endId !== undefined && this.strokeState !== 'none') {
      const id = this.endId
      if (id === null) {
        // Trazo descartado: se borra entero (sin mezclar con escrituras de sus hijos)
        for (const k of Object.keys(u)) if (k.startsWith('s/')) delete u[k]
        u.s = null
      }
      this.live = null
      this.strokeState = 'none'
      this.endId = undefined
      if (id) {
        const seq = this.strokeSeq
        this.doneTimer = window.setTimeout(() => {
          if (this.strokeSeq === seq && this.strokeState === 'none') void update(this.meRef(), { s: null }).catch(() => {})
        }, DONE_KEEP_MS)
      }
    }

    if (this.cursor !== undefined) {
      u.cur = this.cursor
      this.cursor = undefined
    }
    if (this.view !== undefined) {
      u.v = this.view
      this.view = undefined
    }
    if (Object.keys(u).length) void update(this.meRef(), u).catch(this.onError)
  }

  // ---------- Los demás → yo ----------

  private parse(val: Record<string, Record<string, unknown>> | null): Map<string, Peer> {
    const peers = new Map<string, Peer>()
    if (!val) return peers
    for (const [uid, v] of Object.entries(val)) {
      if (uid === this.uid || !v || typeof v !== 'object') continue
      peers.set(uid, {
        uid,
        name: typeof v.n === 'string' ? v.n : '',
        color: typeof v.c === 'string' ? v.c : '#888',
        cursor: isPoint(v.cur) ? v.cur : null,
        view: isRect(v.v) ? v.v : null,
        stroke: v.s ? this.decodeStroke(uid, v.s as WireStroke) : null,
      })
    }
    for (const uid of [...this.cache.keys()]) if (!peers.get(uid)?.stroke) this.cache.delete(uid)
    return peers
  }

  private decodeStroke(uid: string, s: WireStroke): PeerStroke | null {
    if (!s || typeof s.pg !== 'string' || !s.k) return null
    const parts = Array.isArray(s.k)
      ? s.k
      : Object.keys(s.k)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => (s.k as Record<string, string>)[k])
    const key = `${s.id}/${s.r}`
    let c = this.cache.get(uid)
    if (!c || c.key !== key || c.chunks > parts.length) c = { key, chunks: 0, pts: [] }
    for (let i = c.chunks; i < parts.length; i++) {
      if (typeof parts[i] === 'string') c.pts = c.pts.concat(decodePoints(fromBase64(parts[i])))
    }
    c.chunks = parts.length
    this.cache.set(uid, c)
    return {
      pageId: s.pg,
      tool: s.tl === 'highlighter' ? 'highlighter' : 'pen',
      color: String(s.cl),
      size: Number(s.sz) || 4,
      opacity: Number(s.op) || 1,
      simulated: s.sm === true,
      pts: c.pts,
      ...(s.d ? { done: s.d } : {}),
    }
  }
}

function isPoint(v: unknown): v is { x: number; y: number } {
  return !!v && typeof (v as { x: unknown }).x === 'number' && typeof (v as { y: unknown }).y === 'number'
}

function isRect(v: unknown): v is Rect {
  return isPoint(v) && typeof (v as Rect).w === 'number' && typeof (v as Rect).h === 'number'
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
