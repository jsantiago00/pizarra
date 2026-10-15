import { useState } from 'react'
import { formatCode } from '../lib/roomCode'
import { Modal } from './Dialog'
import { Icon } from './Icon'

interface Props {
  code: string
  title: string
  /** Solo si administrás la sala desde este dispositivo */
  adminKey?: string
  onClose: () => void
}

export function roomUrl(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}sala/${code}`
}

/** Invitar: el código, el enlace y (para quien administra) el enlace de administración. */
export function ShareDialog({ code, title, adminKey, onClose }: Props) {
  const url = roomUrl(code)
  const [copied, setCopied] = useState<string | null>(null)
  const [showAdmin, setShowAdmin] = useState(false)

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Sin permiso para el portapapeles: se selecciona para copiar a mano
      window.prompt('Copiá este texto:', text)
    }
    setCopied(what)
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000)
  }

  const share = () => {
    void navigator.share?.({ title: title || 'Pizarra', text: `Sumate a la pizarra con el código ${formatCode(code)}`, url }).catch(() => {})
  }

  return (
    <Modal onClose={onClose} label="Invitar a la sala">
      <h2 className="dialog-title">Invitar a la sala</h2>
      <p className="muted dialog-body">Pasales el código o el enlace. Entran sin crear una cuenta.</p>
      <div className="share-code" aria-label={`Código ${code.split('').join(' ')}`}>
        {formatCode(code)}
      </div>
      <div className="share-row">
        <input className="text-input" value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Enlace de la sala" />
        <button className="btn btn-primary-solid" onClick={() => copy(url, 'link')}>
          <Icon name={copied === 'link' ? 'check' : 'link'} size={18} />
          {copied === 'link' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {'share' in navigator && (
        <button className="btn btn-ghost share-native" onClick={share}>
          <Icon name="share" size={18} /> Compartir…
        </button>
      )}

      {adminKey && (
        <section className="admin-link">
          <button className="btn btn-small btn-ghost" onClick={() => setShowAdmin((v) => !v)} aria-expanded={showAdmin}>
            <Icon name="key" size={18} /> Enlace de administración
          </button>
          {showAdmin && (
            <>
              <p className="muted">
                Abrilo en tu otro dispositivo (la compu, la tablet) para administrar la sala desde ahí también. <strong>No lo compartas</strong>: quien lo
                tenga puede cambiar los permisos y sacar gente.
              </p>
              <button className="btn btn-small" onClick={() => copy(`${url}#admin=${adminKey}`, 'admin')}>
                <Icon name={copied === 'admin' ? 'check' : 'copy'} size={18} />
                {copied === 'admin' ? 'Copiado' : 'Copiar enlace de administración'}
              </button>
            </>
          )}
        </section>
      )}

      <div className="dialog-actions">
        <button className="btn btn-primary-solid" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  )
}
