import { create } from 'zustand'

/** Lo que este dispositivo recuerda: tu nombre y las salas en las que estuviste. */
export interface RecentRoom {
  code: string
  title: string
  lastOpened: number
  /** Si la creaste (o administrás) desde acá: la clave del enlace de administración */
  adminKey?: string
}

interface LocalState {
  name: string
  rooms: RecentRoom[]
}

const NAME = 'pizarra.name'
const ROOMS = 'pizarra.rooms'
const MAX_ROOMS = 30

function read(): LocalState {
  try {
    const rooms = JSON.parse(localStorage.getItem(ROOMS) ?? '[]') as RecentRoom[]
    return { name: localStorage.getItem(NAME) ?? '', rooms: Array.isArray(rooms) ? rooms : [] }
  } catch {
    return { name: '', rooms: [] }
  }
}

export const useLocal = create<LocalState>(read)

function save(s: LocalState) {
  try {
    localStorage.setItem(NAME, s.name)
    localStorage.setItem(ROOMS, JSON.stringify(s.rooms))
  } catch {
    /* sin localStorage: queda solo en memoria */
  }
}

useLocal.subscribe(save)

export function setName(name: string) {
  useLocal.setState({ name: name.trim().slice(0, 40) })
}

/** Anota (o actualiza) una sala como recién abierta. */
export function rememberRoom(code: string, patch: Partial<Omit<RecentRoom, 'code'>> = {}) {
  useLocal.setState((s) => {
    const prev = s.rooms.find((r) => r.code === code)
    const next: RecentRoom = { code, title: '', ...prev, lastOpened: Date.now(), ...patch }
    return { rooms: [next, ...s.rooms.filter((r) => r.code !== code)].slice(0, MAX_ROOMS) }
  })
}

export function forgetRoom(code: string) {
  useLocal.setState((s) => ({ rooms: s.rooms.filter((r) => r.code !== code) }))
}

export function adminKeyFor(code: string): string | undefined {
  return useLocal.getState().rooms.find((r) => r.code === code)?.adminKey
}
