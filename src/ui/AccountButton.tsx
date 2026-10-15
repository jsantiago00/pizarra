import { useState } from 'react'
import { signInWithGoogle, signOut, useAuth } from '../firebase/auth'
import { Icon } from './Icon'
import { Menu } from './NoteEditor'

/** Arriba a la derecha: «Entrar con Google», o tu cuenta con la opción de salir. */
export function AccountButton() {
  const account = useAuth((s) => s.account)
  const busy = useAuth((s) => s.busy)
  const [open, setOpen] = useState(false)

  if (!account) {
    return (
      <button className="btn btn-small btn-google" onClick={() => void signInWithGoogle()} disabled={busy}>
        <GoogleLogo />
        {busy ? 'Abriendo Google…' : 'Entrar con Google'}
      </button>
    )
  }
  return (
    <div className="menu-anchor">
      <button className="avatar-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Tu cuenta: ${account.name}`} title={account.email}>
        {account.photoURL ? <img src={account.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{account.name[0]?.toUpperCase()}</span>}
      </button>
      {open && (
        <Menu onClose={() => setOpen(false)}>
          <div className="menu-header">
            <strong>{account.name}</strong>
            <small className="muted">{account.email}</small>
          </div>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
          >
            <Icon name="logout" size={18} /> Salir de la cuenta
          </button>
        </Menu>
      )}
    </div>
  )
}

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5Z" />
    </svg>
  )
}
