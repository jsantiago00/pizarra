import {
  Bytes,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from 'firebase/firestore'
import { decodePoints, encodePoints } from '../model/codec'
import { newId } from '../model/note'
import { PAGE_HEIGHT, PAGE_WIDTH, type Background, type Stroke } from '../model/types'
import { getDb } from './db'
import { CODE_LENGTH, newCode } from '../lib/roomCode'

/** Quién puede dibujar en la sala (además de quienes la administran, que siempre pueden). */
export type EditMode = 'all' | 'some'

export interface RoomMeta {
  code: string
  title: string
  /** all: todos dibujan; some: solo quienes figuran en `editors` */
  editMode: EditMode
  editors: Record<string, true>
  /** Personas expulsadas: no pueden dibujar ni volver a entrar */
  banned: Record<string, true>
  /** Todos siguen la vista de esta persona («seguir mi vista»), o null */
  follow: string | null
  pageIds: string[]
  createdAt: number
  updatedAt: number
}

export interface Member {
  uid: string
  name: string
  joinedAt: number
  lastSeen: number
  /** Es administrador de la sala (la creó o entró con el enlace de administración) */
  admin: boolean
}

export interface PageDoc {
  id: string
  width: number
  height: number
  background: Background
  createdAt: number
}

// ---------- Rutas ----------
//
// rooms/{code}                        la sala: título, permisos y orden de páginas
//   admins/{uid}                      quienes administran (con la clave de administración)
//   secret/admin                      la clave de administración (nadie la puede leer)
//   members/{uid}                     nombre y última vez visto, para la lista de participantes
//   pages/{pageId}                    fondo y tamaño
//     strokes/{strokeId}              un documento por trazo

const db = (): Firestore => getDb()
export const roomRef = (code: string) => doc(db(), 'rooms', code)
export const adminRef = (code: string, uid: string) => doc(db(), 'rooms', code, 'admins', uid)
export const secretRef = (code: string) => doc(db(), 'rooms', code, 'secret', 'admin')
export const membersCol = (code: string) => collection(db(), 'rooms', code, 'members')
export const memberRef = (code: string, uid: string) => doc(membersCol(code), uid)
export const pagesCol = (code: string) => collection(db(), 'rooms', code, 'pages')
export const pageRef = (code: string, pageId: string) => doc(pagesCol(code), pageId)
export const strokesCol = (code: string, pageId: string) => collection(pageRef(code, pageId), 'strokes')
export const strokeRef = (code: string, pageId: string, strokeId: string) => doc(strokesCol(code, pageId), strokeId)

const millis = (t: unknown): number => (t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : Date.now())
const flags = (v: unknown): Record<string, true> => {
  const out: Record<string, true> = {}
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (x === true) out[k] = true
  return out
}

// ---------- Conversión ----------

export function toRoomMeta(code: string, d: DocumentData): RoomMeta {
  return {
    code,
    title: typeof d.title === 'string' ? d.title : '',
    editMode: d.editMode === 'some' ? 'some' : 'all',
    editors: flags(d.editors),
    banned: flags(d.banned),
    follow: typeof d.follow === 'string' ? d.follow : null,
    pageIds: Array.isArray(d.pageIds) ? d.pageIds : [],
    createdAt: millis(d.createdAt),
    updatedAt: millis(d.updatedAt),
  }
}

export function toPageDoc(id: string, d: DocumentData): PageDoc {
  return {
    id,
    width: d.width ?? PAGE_WIDTH,
    height: d.height ?? PAGE_HEIGHT,
    background: d.background,
    createdAt: millis(d.createdAt),
  }
}

export function strokeToDoc(s: Stroke, uid: string): DocumentData {
  const d: DocumentData = {
    tool: s.tool,
    color: s.color,
    size: s.size,
    opacity: s.opacity,
    pts: Bytes.fromUint8Array(encodePoints(s.pts)),
    n: s.pts.length / 3,
    bbox: s.bbox,
    z: s.z,
    simulated: s.simulated,
    createdAt: serverTimestamp(),
    by: uid,
  }
  if (s.shape) d.shape = s.shape
  if (s.item) d.item = s.item
  return d
}

export function docToStroke(id: string, d: DocumentData): Stroke | null {
  if (!(d.pts instanceof Bytes) || !Array.isArray(d.bbox)) return null
  const s: Stroke = {
    id,
    tool: d.tool === 'highlighter' ? 'highlighter' : 'pen',
    color: String(d.color ?? '#000000'),
    size: Number(d.size ?? 4),
    opacity: Number(d.opacity ?? 1),
    z: Number(d.z ?? 0),
    pts: decodePoints(d.pts.toUint8Array()),
    simulated: d.simulated === true,
    bbox: d.bbox as Stroke['bbox'],
  }
  if (d.shape) s.shape = d.shape
  if (d.item && typeof d.item === 'object' && typeof d.item.kind === 'string') s.item = d.item
  return s
}

/** ¿Esta persona puede dibujar en la sala? */
export function canEdit(room: RoomMeta, uid: string, admin: boolean): boolean {
  if (admin) return true
  if (room.banned[uid]) return false
  return room.editMode === 'all' || room.editors[uid] === true
}

// ---------- Salas ----------

/** Clave de administración: larga, para que no se pueda adivinar. */
export function newAdminKey(): string {
  return newId() + newId()
}

/**
 * Crea una sala con un código libre. Si el código ya existe, las reglas rechazan la escritura
 * (sería una modificación, no una creación) y se prueba con otro.
 */
export async function createRoom(
  uid: string,
  opts: { title: string; editMode: EditMode; background: Background; name: string },
): Promise<{ code: string; key: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    const key = newAdminKey()
    const pageId = newId()
    const b = writeBatch(db())
    b.set(roomRef(code), {
      title: opts.title,
      editMode: opts.editMode,
      editors: {},
      banned: {},
      pageIds: [pageId],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    b.set(secretRef(code), { key })
    b.set(adminRef(code, uid), { key })
    b.set(pageRef(code, pageId), {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      background: opts.background,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    b.set(memberRef(code, uid), { name: opts.name, admin: true, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() })
    try {
      await b.commit()
      return { code, key }
    } catch (e) {
      if ((e as { code?: string }).code !== 'permission-denied') throw e
      // Ese código ya existe (o las reglas no están publicadas): si es lo segundo, el último intento lo dirá
      if (attempt === 4) throw e
    }
  }
  throw new Error('No se pudo crear la sala')
}

/** ¿Existe la sala? (para validar el código antes de entrar) */
export async function roomExists(code: string): Promise<boolean> {
  const snap = await getDoc(roomRef(code))
  return snap.exists()
}

/** ¿Administro esta sala? (existe mi documento en admins) */
export function watchAdmin(code: string, uid: string, cb: (admin: boolean) => void, onError?: (e: Error) => void) {
  return onSnapshot(adminRef(code, uid), (snap) => cb(snap.exists()), onError)
}

/** Con el enlace de administración: me sumo como administrador. Las reglas comparan la clave. */
export async function claimAdmin(code: string, uid: string, key: string): Promise<boolean> {
  try {
    await setDoc(adminRef(code, uid), { key })
    return true
  } catch {
    // Si ya administraba (el enlace se abrió dos veces), el documento existe y no se puede reescribir
    const snap = await getDoc(adminRef(code, uid)).catch(() => null)
    return snap?.exists() ?? false
  }
}

/** Entro (o vuelvo) a la sala con mi nombre. */
export function joinRoom(code: string, uid: string, name: string, admin: boolean) {
  return setDoc(memberRef(code, uid), { name, admin, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }, { merge: true })
}

/** «Sigo acá»: para mostrar quién está conectado. */
export function touchMember(code: string, uid: string) {
  return updateDoc(memberRef(code, uid), { lastSeen: serverTimestamp() })
}

export function leaveRoom(code: string, uid: string) {
  // Sin conexión no hay forma de avisar: queda con el último «visto» y se apaga solo
  return updateDoc(memberRef(code, uid), { lastSeen: 0 })
}

export function watchMembers(code: string, cb: (members: Member[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    membersCol(code),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data({ serverTimestamps: 'estimate' })
        return {
          uid: d.id,
          name: String(v.name ?? 'Sin nombre'),
          admin: v.admin === true,
          joinedAt: millis(v.joinedAt),
          lastSeen: typeof v.lastSeen === 'number' ? v.lastSeen : millis(v.lastSeen),
        }
      })
      cb(list.sort((a, b) => Number(b.admin) - Number(a.admin) || a.joinedAt - b.joinedAt))
    },
    onError,
  )
}

// ---------- Permisos (solo quien administra) ----------

export function setEditMode(code: string, editMode: EditMode) {
  return updateDoc(roomRef(code), { editMode, updatedAt: serverTimestamp() })
}

export function setEditor(code: string, uid: string, allowed: boolean) {
  return updateDoc(roomRef(code), { [`editors.${uid}`]: allowed ? true : deleteField(), updatedAt: serverTimestamp() })
}

/** Que todos sigan mi vista (uid), o dejar de guiar (null). */
export function setFollow(code: string, uid: string | null) {
  return updateDoc(roomRef(code), { follow: uid, updatedAt: serverTimestamp() })
}

export function renameRoom(code: string, title: string) {
  return updateDoc(roomRef(code), { title, updatedAt: serverTimestamp() })
}

/** Expulsar: sale de la lista y no puede volver a entrar ni dibujar. */
export async function banMember(code: string, uid: string) {
  await updateDoc(roomRef(code), { [`banned.${uid}`]: true, [`editors.${uid}`]: deleteField(), updatedAt: serverTimestamp() })
  await deleteDoc(memberRef(code, uid))
}

export function unbanMember(code: string, uid: string) {
  return updateDoc(roomRef(code), { [`banned.${uid}`]: deleteField(), updatedAt: serverTimestamp() })
}

// ---------- Lotes ----------

/** Lotes de hasta 450 operaciones (el máximo es 500). */
export class BatchQueue {
  private batches: WriteBatch[] = []
  private count = 0

  private current(): WriteBatch {
    if (!this.batches.length || this.count >= 450) {
      this.batches.push(writeBatch(db()))
      this.count = 0
    }
    this.count++
    return this.batches[this.batches.length - 1]
  }

  set(ref: Parameters<WriteBatch['set']>[0], data: DocumentData) {
    this.current().set(ref, data)
  }

  update(ref: Parameters<WriteBatch['update']>[0], data: DocumentData) {
    this.current().update(ref, data)
  }

  delete(ref: Parameters<WriteBatch['delete']>[0]) {
    this.current().delete(ref)
  }

  get size() {
    return this.batches.length
  }

  commit(): Promise<void[]> {
    const all = this.batches.map((b) => b.commit())
    this.batches = []
    this.count = 0
    return Promise.all(all)
  }
}

export { CODE_LENGTH }
