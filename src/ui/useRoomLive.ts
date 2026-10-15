import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Board, BoardOptions, RemoteLive } from '../canvas/Board'
import { LiveChannel, type Peer } from '../firebase/live'
import type { Member, RoomMeta } from '../firebase/rooms'
import { colorFor } from '../lib/people'
import type { NoteModel } from '../model/note'

interface Args {
  code: string
  uid: string
  name: string
  room: RoomMeta | null
  members: Member[]
  model: NoteModel | null
  board: RefObject<Board | null>
}

/**
 * Lo en vivo de la sala: el trazo de los demás mientras lo dibujan, sus punteros y «seguir mi
 * vista». Si Realtime Database no está disponible, la sala anda igual, sin esto.
 */
export function useRoomLive({ code, uid, name, room, members, model, board }: Args) {
  const [peers, setPeers] = useState<Map<string, Peer>>(() => new Map())
  const [liveOk, setLiveOk] = useState(true)
  const [paused, setPaused] = useState(false)
  const channel = useRef<LiveChannel | null>(null)
  const leader = room?.follow ?? null
  const leaderRef = useRef(leader)
  const pausedRef = useRef(paused)
  const nameRef = useRef(name)

  useEffect(() => {
    leaderRef.current = leader
    pausedRef.current = paused
    nameRef.current = name
  })

  useEffect(() => {
    const ch = new LiveChannel(code, uid, setPeers, () => setLiveOk(false))
    channel.current = ch
    ch.start(nameRef.current || 'Sin nombre', colorFor(uid))
    return () => {
      ch.stop()
      channel.current = null
    }
  }, [code, uid])

  useEffect(() => {
    channel.current?.setName(name || 'Sin nombre', colorFor(uid))
  }, [name, uid])

  // Si cambia a quién se sigue, se vuelve a seguir
  useEffect(() => setPaused(false), [leader])

  // Si me toca guiar, mando ya lo que veo (después, cada vez que cambia)
  useEffect(() => {
    const b = board.current
    if (leader === uid && b) channel.current?.setView(b.vp.visibleRect)
    if (leader !== uid) channel.current?.setView(null)
  }, [leader, uid, board])

  // Lo que dibujan los demás → el lienzo
  const pushRemote = useCallback(() => {
    const b = board.current
    if (!b || !room) return
    const admins = new Set(members.filter((m) => m.admin).map((m) => m.uid))
    const mayDraw = (id: string) => admins.has(id) || (!room.banned[id] && (room.editMode === 'all' || room.editors[id] === true))
    let committed: Set<string> | null = null
    const isCommitted = (id: string) => {
      committed ??= new Set(model?.pages.flatMap((p) => p.strokes.map((s) => s.id)) ?? [])
      return committed.has(id)
    }
    const remote: RemoteLive = { strokes: [], cursors: [] }
    for (const p of peers.values()) {
      if (room.banned[p.uid]) continue
      if (p.stroke && p.stroke.pts.length >= 3 && mayDraw(p.uid) && !(p.stroke.done && isCommitted(p.stroke.done))) remote.strokes.push(p.stroke)
      if (p.cursor) remote.cursors.push({ ...p.cursor, name: p.name || 'Alguien', color: p.color })
    }
    b.setRemote(remote)
  }, [board, room, members, peers, model])

  useEffect(pushRemote, [pushRemote])
  // Cuando llega por Firestore el trazo que alguien terminó, deja de mostrarse el «en vivo»
  useEffect(() => model?.subscribe((e) => e.type === 'strokes' && e.origin === 'remote' && pushRemote()), [model, pushRemote])

  // Seguir la vista de quien guía
  const leaderView = leader && leader !== uid ? (peers.get(leader)?.view ?? null) : null
  useEffect(() => {
    if (leaderView && !paused) board.current?.showRect(leaderView)
  }, [leaderView, paused, board])

  const boardOptions = useMemo<Partial<BoardOptions>>(
    () => ({
      onLive: (l, id) => channel.current?.stroke(l, id),
      onCursor: (p) => channel.current?.setCursor(p),
      onView: (r) => {
        if (leaderRef.current === uid) channel.current?.setView(r)
      },
      onUserView: () => {
        if (leaderRef.current && leaderRef.current !== uid && !pausedRef.current) setPaused(true)
      },
    }),
    [uid],
  )

  return {
    /** Quiénes están conectados ahora (además de mí) */
    online: peers,
    liveOk,
    boardOptions,
    leader,
    /** Siguiendo a alguien pero lo dejé de seguir moviendo la hoja */
    paused,
    resume: () => setPaused(false),
    pause: () => setPaused(true),
  }
}
