import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously, type Auth } from 'firebase/auth'
import { create } from 'zustand'
import { firebaseConfigured, getFirebaseApp } from './app'

interface AuthState {
  /** loading: todavía no sabemos si hay sesión (se resuelve desde IndexedDB) */
  status: 'loading' | 'error' | 'ready'
  uid: string | null
  error: string | null
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', uid: null, error: null }))

let auth: Auth | undefined

const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1'

function messageFor(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/network-request-failed':
      return 'No hay conexión. Para entrar a una sala hace falta internet.'
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'El acceso anónimo no está habilitado en el proyecto de Firebase (Authentication → Método de acceso → Anónimo).'
    default:
      return `No se pudo conectar${code ? ` (${code})` : ''}.`
  }
}

/**
 * Sin cuentas: cada navegador entra como usuario anónimo de Firebase. El uid queda guardado
 * en el dispositivo (IndexedDB), así que al volver sigue siendo la misma persona.
 */
export function initAuth(): void {
  if (!firebaseConfigured || auth) return
  const a = (auth = getAuth(getFirebaseApp()))
  a.languageCode = 'es'
  if (USE_EMULATORS) connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true })
  onAuthStateChanged(a, (u) => {
    if (u) return useAuth.setState({ status: 'ready', uid: u.uid, error: null })
    signInAnonymously(a).catch((err) => useAuth.setState({ status: 'error', error: messageFor(err) }))
  })
}

/** Reintenta después de un error (sin conexión, por ejemplo). */
export function retryAuth(): void {
  if (!auth) return
  useAuth.setState({ status: 'loading', error: null })
  signInAnonymously(auth).catch((err) => useAuth.setState({ status: 'error', error: messageFor(err) }))
}
