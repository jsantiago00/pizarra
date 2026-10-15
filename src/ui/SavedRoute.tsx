import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../firebase/auth'
import { deleteBoard, loadBoard, type SavedBoard } from '../firebase/library'
import { friendlyError } from '../lib/errors'
import { formatCode, parseCode } from '../lib/roomCode'
import { relativeTime } from '../lib/time'
import { NoteModel } from '../model/note'
import { ConfirmDialog } from './Dialog'
import { Icon } from './Icon'
import { NoteEditor } from './NoteEditor'
import { Splash } from './Splash'

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; meta: SavedBoard; model: NoteModel }

/** Una copia de «Mis pizarras»: se mira, se exporta, y desde acá se vuelve a la sala en vivo. */
export function SavedRoute() {
  const { code: raw = '' } = useParams()
  const code = parseCode(raw)
  const uid = useAuth((s) => s.uid)
  const account = useAuth((s) => s.account)
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!uid || !code || !account) return
    let alive = true
    loadBoard(uid, code)
      .then((r) => alive && setState(r ? { status: 'ready', meta: r.meta, model: new NoteModel(r.pages) } : { status: 'missing' }))
      .catch((e) => alive && setState({ status: 'error', message: friendlyError(e) }))
    return () => {
      alive = false
    }
  }, [uid, code, account])

  if (!code || !account || state.status === 'missing' || state.status === 'error') {
    return (
      <div className="center-screen">
        <Icon name="note" size={48} />
        <h2>{!account ? 'Entrá con Google para ver tus pizarras' : state.status === 'error' ? 'No se pudo abrir la pizarra' : 'No tenés guardada esta pizarra'}</h2>
        {state.status === 'error' && <p className="muted">{state.message}</p>}
        <Link to="/" className="btn">
          Volver al inicio
        </Link>
      </div>
    )
  }
  if (state.status === 'loading') return <Splash />

  const { meta, model } = state
  return (
    <>
      <NoteEditor
        note={model}
        title={meta.title || `Sala ${formatCode(code)}`}
        readOnly
        banner={
          <>
            <Icon name="download" size={18} /> Copia guardada {relativeTime(meta.savedAt)}
          </>
        }
        actions={[
          { label: 'Abrir la sala en vivo', icon: 'enter', run: () => navigate(`/sala/${code}`) },
          { label: 'Borrar de mis pizarras', icon: 'trash', run: () => setConfirmDelete(true) },
        ]}
      />
      {confirmDelete && (
        <ConfirmDialog
          title="¿Borrar esta copia?"
          body="Se borra de «Mis pizarras». La sala en vivo no cambia."
          confirm="Borrar"
          danger
          onConfirm={() => {
            void deleteBoard(uid!, code)
            navigate('/', { replace: true })
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
