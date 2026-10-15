import { useState } from 'react'
import { banMember, setEditMode, setEditor, unbanMember, type Member, type RoomMeta } from '../firebase/rooms'
import { ConfirmDialog } from './Dialog'
import { Icon } from './Icon'
import { colorFor, initials } from '../lib/people'

/** Sin «sigo acá» en este tiempo, se considera desconectado. */
const ONLINE_MS = 100_000

export function isOnline(m: Member, now: number): boolean {
  return m.lastSeen > 0 && now - m.lastSeen < ONLINE_MS
}

interface Props {
  room: RoomMeta
  members: Member[]
  me: string
  admin: boolean
  /** Quiénes están conectados ahora */
  online: Set<string>
  onClose: () => void
}

/** Panel lateral: quién está en la sala y, para quien administra, quién puede dibujar. */
export function Participants({ room, members, me, admin, online, onClose }: Props) {
  const [kick, setKick] = useState<Member | null>(null)
  const sorted = [...members].sort((a, b) => Number(online.has(b.uid)) - Number(online.has(a.uid)))
  const bannedIds = Object.keys(room.banned)
  const fail = (e: unknown) => console.error('No se pudo cambiar el permiso:', e)

  return (
    <div className="side-sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="side-sheet" role="dialog" aria-label="Participantes">
        <header className="side-sheet-head">
          <h2>Participantes</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <Icon name="x" />
          </button>
        </header>

        {admin ? (
          <fieldset className="field radio-group compact">
            <legend>¿Quién puede dibujar?</legend>
            <label>
              <input type="radio" name="edit-mode" checked={room.editMode === 'all'} onChange={() => setEditMode(room.code, 'all').catch(fail)} />
              <span>Todos</span>
            </label>
            <label>
              <input type="radio" name="edit-mode" checked={room.editMode === 'some'} onChange={() => setEditMode(room.code, 'some').catch(fail)} />
              <span>Solo quienes habilite</span>
            </label>
          </fieldset>
        ) : (
          <p className="muted side-sheet-note">
            {room.editMode === 'all' ? 'Todos pueden dibujar en esta sala.' : 'Dibujan quienes habilite quien administra la sala.'}
          </p>
        )}

        <ul className="people">
          {sorted.map((m) => {
            const on = online.has(m.uid)
            const draws = m.admin || room.editMode === 'all' || room.editors[m.uid] === true
            return (
              <li key={m.uid} className={on ? 'is-online' : ''}>
                <span className="avatar" style={{ background: colorFor(m.uid) }} aria-hidden="true">
                  {initials(m.name)}
                </span>
                <span className="person">
                  <strong>
                    {m.name}
                    {m.uid === me && <span className="muted"> (vos)</span>}
                  </strong>
                  <small className="muted">
                    {on ? 'Conectado' : 'Desconectado'}
                    {' · '}
                    {m.admin ? 'Administra' : draws ? 'Puede dibujar' : 'Solo mira'}
                  </small>
                </span>
                {admin && !m.admin && (
                  <span className="person-actions">
                    {room.editMode === 'some' && (
                      <label className="switch" title={draws ? 'Quitarle el permiso para dibujar' : 'Dejarlo dibujar'}>
                        <input
                          type="checkbox"
                          checked={draws}
                          onChange={(e) => setEditor(room.code, m.uid, e.target.checked).catch(fail)}
                          aria-label={`${m.name} puede dibujar`}
                        />
                        <span aria-hidden="true" />
                      </label>
                    )}
                    <button className="icon-btn icon-btn-small" onClick={() => setKick(m)} aria-label={`Sacar a ${m.name} de la sala`} title="Sacar de la sala">
                      <Icon name="x" size={18} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {admin && bannedIds.length > 0 && (
          <section className="banned">
            <h3>Sacaste de la sala a {bannedIds.length === 1 ? '1 persona' : `${bannedIds.length} personas`}</h3>
            <button className="btn btn-small btn-ghost" onClick={() => bannedIds.forEach((id) => unbanMember(room.code, id).catch(fail))}>
              Dejarlas volver
            </button>
          </section>
        )}
      </aside>
      {kick && (
        <ConfirmDialog
          title={`¿Sacar a ${kick.name} de la sala?`}
          body="No va a poder volver a entrar ni a dibujar, aunque tenga el código."
          confirm="Sacar"
          danger
          onConfirm={() => banMember(room.code, kick.uid).catch(fail)}
          onClose={() => setKick(null)}
        />
      )}
    </div>
  )
}
