import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Board } from '../canvas/Board'
import { signInWithGoogle, useAuth } from '../firebase/auth'
import { BoardSaver } from '../firebase/library'
import { canEdit, claimAdmin, joinRoom, leaveRoom, renameRoom, setFollow, touchMember, watchAdmin, watchMembers, type Member } from '../firebase/rooms'
import { RoomSync, type SyncState } from '../firebase/roomSync'
import { adminKeyFor, rememberRoom, setName, useLocal } from '../lib/localRooms'
import { formatCode, parseCode } from '../lib/roomCode'
import { Icon } from './Icon'
import { NoteEditor } from './NoteEditor'
import { isOnline, Participants } from './Participants'
import { ShareDialog } from './ShareDialog'
import { Splash } from './Splash'
import { SyncBadge } from './SyncBadge'
import { useRoomLive } from './useRoomLive'

/** Cada cuánto avisamos «sigo acá» (para la lista de quién está conectado). */
const HEARTBEAT_MS = 45_000

/** La sala: pide el nombre si falta, sincroniza la pizarra y maneja participantes y permisos. */
export function RoomRoute() {
  const { code: raw = '' } = useParams()
  const code = parseCode(raw)
  const name = useLocal((s) => s.name)
  if (!code) return <Problem title="Ese enlace no es de una sala" body="El código de una sala tiene 6 letras y números." />
  if (!name.trim()) return <NameGate code={code} />
  return <Room key={code} code={code} />
}

function Room({ code }: { code: string }) {
  const uid = useAuth((s) => s.uid)!
  const account = useAuth((s) => s.account)
  const name = useLocal((s) => s.name)
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<SyncState>({ status: 'loading' })
  const [admin, setAdmin] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [sharing, setSharing] = useState(() => (location.state as { created?: boolean } | null)?.created === true)
  const [people, setPeople] = useState(false)
  const [claimError, setClaimError] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const sync = useRef<RoomSync | null>(null)
  const boardRef = useRef<Board | null>(null)
  const saver = useRef<BoardSaver | null>(null)

  // Enlace de administración (#admin=clave): me sumo como administrador y saco la clave de la barra
  useEffect(() => {
    const m = /admin=([a-z0-9]+)/.exec(location.hash)
    if (!m) return
    const key = m[1]
    navigate(`${location.pathname}${location.search}`, { replace: true, state: location.state })
    claimAdmin(code, uid, key).then((ok) => {
      if (ok) rememberRoom(code, { adminKey: key })
      else setClaimError(true)
    })
  }, [code, uid, location, navigate])

  useEffect(() => {
    setState({ status: 'loading' })
    const s = new RoomSync(uid, code, setState)
    sync.current = s
    s.start()
    const offAdmin = watchAdmin(code, uid, setAdmin, () => setAdmin(false))
    const offMembers = watchMembers(code, setMembers, () => setMembers([]))
    return () => {
      s.stop()
      offAdmin()
      offMembers()
      sync.current = null
    }
  }, [uid, code])

  const ready = state.status === 'ready'
  const meta = ready ? state.meta : null
  const model = ready ? state.model : null

  // Si entraste con Google en una cuenta que ya existía, cambió tu uid: con la clave guardada en
  // este dispositivo recuperás la administración sin tener que abrir el enlace
  useEffect(() => {
    const key = adminKeyFor(code)
    if (ready && !admin && key) void claimAdmin(code, uid, key)
  }, [ready, admin, code, uid])

  const live = useRoomLive({ code, uid, name: name.trim(), room: meta, members, model, board: boardRef })

  // Con cuenta de Google: la copia en «Mis pizarras»
  const titleRef = useRef('')
  useEffect(() => {
    titleRef.current = meta?.title ?? ''
  }, [meta])
  useEffect(() => {
    if (!account || !model) return
    const s = new BoardSaver(uid, code, model, () => titleRef.current, () => {})
    saver.current = s
    return () => {
      s.stop()
      saver.current = null
    }
  }, [account, model, uid, code])

  const showToast = useCallback((text: string) => {
    setToast(text)
    setTimeout(() => setToast((t) => (t === text ? null : t)), 3500)
  }, [])

  // Me anoto en la sala con mi nombre y aviso cada tanto que sigo conectado
  useEffect(() => {
    if (!ready) return
    const ignore = () => {}
    joinRoom(code, uid, name.trim() || 'Sin nombre', admin).catch(ignore)
    const t = setInterval(() => touchMember(code, uid).catch(ignore), HEARTBEAT_MS)
    const onVisible = () => document.visibilityState === 'visible' && touchMember(code, uid).catch(ignore)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, code, uid, name, admin])

  useEffect(() => () => void leaveRoom(code, uid).catch(() => {}), [code, uid])

  // Para la lista de salas recientes
  useEffect(() => {
    if (meta) rememberRoom(code, { title: meta.title })
  }, [code, meta])

  // Reloj para «conectado» / «desconectado»
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const onlineIds = useMemo(
    () => new Set(members.filter((m) => m.uid === uid || live.online.has(m.uid) || (!live.liveOk && isOnline(m, now))).map((m) => m.uid)),
    [members, now, uid, live.online, live.liveOk],
  )
  const online = onlineIds.size

  if (state.status === 'loading') return <Splash />
  if (state.status === 'missing') {
    return <Problem title={`No existe la sala ${formatCode(code)}`} body="Revisá el código: puede que la hayan borrado o que esté mal escrito." />
  }
  if (state.status === 'error') {
    return state.denied ? (
      <Problem title="No podés entrar a esta sala" body="Quien la administra te sacó de la sala." />
    ) : (
      <Problem title="No se pudo abrir la sala" body={state.message} />
    )
  }

  const room = state.meta
  const editable = canEdit(room, uid, admin)
  const title = room.title || `Sala ${formatCode(code)}`
  const leaderName = live.leader && live.leader !== uid ? (members.find((m) => m.uid === live.leader)?.name ?? 'quien guía') : null

  const saveAction = account
    ? {
        label: 'Guardar en mis pizarras',
        icon: 'download' as const,
        run: () => {
          void saver.current?.save(true).then(() => showToast('Guardada en «Mis pizarras»'))
        },
      }
    : {
        label: 'Entrar con Google para guardarla',
        icon: 'enter' as const,
        run: () => {
          void signInWithGoogle().then(() => {
            const err = useAuth.getState().loginError
            if (err) showToast(err)
            else if (useAuth.getState().account) showToast('Listo: esta pizarra se va a guardar en «Mis pizarras»')
          })
        },
      }
  const followAction = admin
    ? live.leader === uid
      ? { label: 'Dejar de guiar la vista', icon: 'eye' as const, run: () => void setFollow(code, null) }
      : { label: 'Que todos sigan mi vista', icon: 'eye' as const, run: () => void setFollow(code, uid) }
    : null

  return (
    <>
      <NoteEditor
        note={state.model}
        title={title}
        onRename={admin ? (t) => void renameRoom(code, t) : undefined}
        status={<SyncBadge />}
        readOnly={!editable}
        canClear={admin}
        onBoard={(b) => (boardRef.current = b)}
        boardOptions={live.boardOptions}
        headerExtra={
          <>
            <button className="btn btn-small btn-ghost people-btn" onClick={() => setPeople(true)} aria-label={`Participantes: ${online} conectados`} title="Participantes">
              <Icon name="users" size={20} />
              <span>{online}</span>
            </button>
            <button className="icon-btn" onClick={() => setSharing(true)} aria-label="Invitar" title="Invitar">
              <Icon name="share" />
            </button>
          </>
        }
        banner={
          leaderName ? (
            live.paused ? (
              <button className="banner-btn" onClick={live.resume}>
                <Icon name="eye" size={18} /> Volver a seguir a {leaderName}
              </button>
            ) : (
              <button className="banner-btn" onClick={live.pause}>
                <Icon name="eye" size={18} /> Siguiendo a {leaderName} · Dejar de seguir
              </button>
            )
          ) : live.leader === uid ? (
            <button className="banner-btn" onClick={() => void setFollow(code, null)}>
              <Icon name="eye" size={18} /> Todos siguen tu vista · Dejar de guiar
            </button>
          ) : !editable ? (
            <>
              <Icon name="eye" size={18} /> Estás mirando: todavía no podés dibujar
            </>
          ) : null
        }
        actions={[
          { label: 'Invitar a la sala', icon: 'share', run: () => setSharing(true) },
          { label: 'Participantes', icon: 'users', run: () => setPeople(true) },
          ...(followAction ? [followAction] : []),
          saveAction,
        ]}
      />
      {sharing && <ShareDialog code={code} title={room.title} adminKey={admin ? adminKeyFor(code) : undefined} onClose={() => setSharing(false)} />}
      {people && <Participants room={room} members={members} me={uid} admin={admin} online={onlineIds} onClose={() => setPeople(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {claimError && (
        <div className="toast" role="alert">
          El enlace de administración no es válido para esta sala.
          <button className="btn btn-small" onClick={() => setClaimError(false)}>
            Entendido
          </button>
        </div>
      )}
    </>
  )
}

/** Antes de entrar: cómo te van a ver los demás. */
function NameGate({ code }: { code: string }) {
  const [value, setValue] = useState('')
  return (
    <main className="center-screen">
      <Icon name="users" size={48} />
      <h1>Sala {formatCode(code)}</h1>
      <form
        className="name-gate"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) setName(value)
        }}
      >
        <label className="field">
          <span>¿Cómo te llamás?</span>
          <input
            className="text-input"
            value={value}
            autoFocus
            maxLength={40}
            placeholder="Tu nombre"
            autoComplete="given-name"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <small className="muted">Es lo que ven los demás en la sala.</small>
        <button className="btn btn-primary-solid" disabled={!value.trim()}>
          Entrar
        </button>
      </form>
    </main>
  )
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="center-screen">
      <Icon name="info" size={48} />
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <Link to="/" className="btn">
        Volver al inicio
      </Link>
    </div>
  )
}
