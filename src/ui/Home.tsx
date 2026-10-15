import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../firebase/auth'
import { createRoom, roomExists, type EditMode } from '../firebase/rooms'
import { LOGO } from '../lib/assets'
import { friendlyError } from '../lib/errors'
import { forgetRoom, rememberRoom, setName, useLocal } from '../lib/localRooms'
import { formatCode, parseCode } from '../lib/roomCode'
import { relativeTime } from '../lib/time'
import { readLastBackground } from '../model/background'
import { Icon } from './Icon'
import { ThemeButton } from './ThemeButton'

/** Inicio: tu nombre, crear una sala, entrar con un código y las salas recientes. */
export function Home() {
  const uid = useAuth((s) => s.uid)
  const name = useLocal((s) => s.name)
  const rooms = useLocal((s) => s.rooms)
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [editMode, setEditMode] = useState<EditMode>('all')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState<{ where: 'name' | 'create' | 'join'; text: string } | null>(null)

  const needName = () => {
    if (name.trim()) return false
    setError({ where: 'name', text: 'Escribí tu nombre: es lo que ven los demás en la sala.' })
    document.getElementById('name')?.focus()
    return true
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!uid || busy || needName()) return
    setBusy('create')
    setError(null)
    try {
      const t = title.trim()
      const { code, key } = await createRoom(uid, { title: t, editMode, background: readLastBackground(), name: name.trim() })
      rememberRoom(code, { title: t, adminKey: key })
      navigate(`/sala/${code}`, { state: { created: true } })
    } catch (err) {
      setError({ where: 'create', text: friendlyError(err) })
      setBusy(null)
    }
  }

  const join = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || needName()) return
    const c = parseCode(code)
    if (!c) {
      setError({ where: 'join', text: 'El código tiene 6 letras y números, por ejemplo ABC-234.' })
      return
    }
    setBusy('join')
    setError(null)
    try {
      if (!(await roomExists(c))) {
        setError({ where: 'join', text: `No hay ninguna sala con el código ${formatCode(c)}.` })
        setBusy(null)
        return
      }
      navigate(`/sala/${c}`)
    } catch (err) {
      setError({ where: 'join', text: friendlyError(err) })
      setBusy(null)
    }
  }

  return (
    <div className="home-page">
      <header className="home-top">
        <div className="brand">
          <img src={LOGO} alt="" width={36} height={36} />
          <span>Pizarra</span>
        </div>
        <ThemeButton />
      </header>

      <main className="home-main">
        <p className="home-lead">Una pizarra compartida para trabajar, estudiar o dar clases en vivo. Sin cuentas: alcanza con el código de la sala.</p>

        <label className="field name-field">
          <span>Tu nombre</span>
          <input
            id="name"
            className="text-input"
            value={name}
            maxLength={40}
            placeholder="Por ejemplo, Santi"
            autoComplete="given-name"
            onChange={(e) => {
              setName(e.target.value)
              if (error?.where === 'name') setError(null)
            }}
          />
          {error?.where === 'name' && (
            <small className="error" role="alert">
              {error.text}
            </small>
          )}
        </label>

        <div className="home-cards">
          <form className="home-card" onSubmit={join}>
            <h2>
              <Icon name="enter" /> Entrar a una sala
            </h2>
            <label className="field">
              <span>Código</span>
              <input
                className="text-input code-input"
                value={code}
                placeholder="ABC-234"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                onChange={(e) => {
                  setCode(e.target.value)
                  if (error?.where === 'join') setError(null)
                }}
              />
            </label>
            {error?.where === 'join' && (
              <p className="error" role="alert">
                {error.text}
              </p>
            )}
            <button className="btn btn-primary-solid" disabled={!uid || busy !== null || !code.trim()}>
              {busy === 'join' ? 'Buscando…' : 'Entrar'}
            </button>
          </form>

          <form className="home-card" onSubmit={create}>
            <h2>
              <Icon name="plus" /> Crear una sala
            </h2>
            <label className="field">
              <span>Nombre de la sala (opcional)</span>
              <input
                className="text-input"
                value={title}
                maxLength={120}
                placeholder="Por ejemplo, Matemática con Juli"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <fieldset className="field radio-group">
              <legend>¿Quién puede dibujar?</legend>
              <label>
                <input type="radio" name="mode" checked={editMode === 'all'} onChange={() => setEditMode('all')} />
                <span>
                  <strong>Todos</strong>
                  <small className="muted">Para trabajar juntos</small>
                </span>
              </label>
              <label>
                <input type="radio" name="mode" checked={editMode === 'some'} onChange={() => setEditMode('some')} />
                <span>
                  <strong>Solo yo y a quien habilite</strong>
                  <small className="muted">Para dar clase: los demás miran hasta que les des permiso</small>
                </span>
              </label>
            </fieldset>
            {error?.where === 'create' && (
              <p className="error" role="alert">
                {error.text}
              </p>
            )}
            <button className="btn btn-primary-solid" disabled={!uid || busy !== null}>
              {busy === 'create' ? 'Creando…' : 'Crear sala'}
            </button>
          </form>
        </div>

        {rooms.length > 0 && (
          <section className="recent">
            <h2>Salas recientes</h2>
            <ul>
              {rooms.map((r) => (
                <li key={r.code}>
                  <button className="recent-item" onClick={() => !needName() && navigate(`/sala/${r.code}`)}>
                    <span className="recent-code">{formatCode(r.code)}</span>
                    <span className="recent-title">
                      {r.title || 'Sala sin nombre'}
                      {r.adminKey && <small className="badge">la administrás</small>}
                    </span>
                    <small className="muted">{relativeTime(r.lastOpened)}</small>
                  </button>
                  <button
                    className="icon-btn icon-btn-small"
                    aria-label={`Quitar ${formatCode(r.code)} de la lista`}
                    title="Quitar de la lista"
                    onClick={() => forgetRoom(r.code)}
                  >
                    <Icon name="x" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
