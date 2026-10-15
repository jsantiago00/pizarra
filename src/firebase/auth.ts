import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut as fbSignOut,
  type Auth,
  type AuthCredential,
  type User,
  type UserCredential,
} from 'firebase/auth'
import { create } from 'zustand'
import { firebaseConfigured, getFirebaseApp } from './app'

/** Con cuenta de Google (guarda las pizarras) o anónimo (no guarda nada). */
export interface Account {
  name: string
  email: string
  photoURL: string | null
}

interface AuthState {
  /** loading: todavía no sabemos si hay sesión (se resuelve desde IndexedDB) */
  status: 'loading' | 'error' | 'ready'
  uid: string | null
  /** null: anónimo */
  account: Account | null
  error: string | null
  busy: boolean
  /** Error del login con Google (se muestra donde está el botón) */
  loginError: string | null
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', uid: null, account: null, error: null, busy: false, loginError: null }))

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

function loginMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio y probá de nuevo.'
    case 'auth/unauthorized-domain':
      return `Este dominio (${location.hostname}) no está autorizado en Firebase Authentication.`
    case 'auth/operation-not-allowed':
      return 'El acceso con Google no está habilitado en el proyecto de Firebase.'
    case 'auth/network-request-failed':
      return 'No hay conexión.'
    default:
      return `No se pudo entrar con Google${code ? ` (${code})` : ''}.`
  }
}

function accountOf(u: User): Account | null {
  if (u.isAnonymous) return null
  const google = u.providerData.find((p) => p.providerId === 'google.com')
  return {
    name: u.displayName ?? google?.displayName ?? u.email ?? 'Sin nombre',
    email: u.email ?? google?.email ?? '',
    photoURL: u.photoURL ?? google?.photoURL ?? null,
  }
}

function publish(u: User) {
  useAuth.setState({ status: 'ready', uid: u.uid, account: accountOf(u), error: null })
}

/**
 * Sin cuenta, cada navegador entra como usuario anónimo de Firebase. El uid queda guardado en el
 * dispositivo (IndexedDB), así que al volver sigue siendo la misma persona.
 */
export function initAuth(): void {
  if (!firebaseConfigured || auth) return
  const a = (auth = getAuth(getFirebaseApp()))
  a.languageCode = 'es'
  if (USE_EMULATORS) connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true })
  onAuthStateChanged(a, (u) => {
    if (u) return publish(u)
    useAuth.setState({ status: 'loading', account: null })
    signInAnonymously(a).catch((err) => useAuth.setState({ status: 'error', error: messageFor(err) }))
  })
  if (USE_EMULATORS && import.meta.env.DEV) Object.assign(window, { __pizarraAuth: { signInForTests } })
}

/** Reintenta después de un error (sin conexión, por ejemplo). */
export function retryAuth(): void {
  if (!auth) return
  useAuth.setState({ status: 'loading', error: null })
  signInAnonymously(auth).catch((err) => useAuth.setState({ status: 'error', error: messageFor(err) }))
}

function provider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider()
  p.setCustomParameters({ prompt: 'select_account' })
  return p
}

/**
 * Pasa de anónimo a Google. Primero intenta *vincular* la cuenta al usuario anónimo: así se
 * conserva el uid, y con él las salas que administrás y tu lugar en cada sala. Si esa cuenta
 * de Google ya existía (entraste antes en otro dispositivo), se entra con ella.
 */
async function upgrade(link: (u: User) => Promise<UserCredential>, fallback: (err: unknown) => AuthCredential | null) {
  if (!auth?.currentUser) return
  useAuth.setState({ busy: true, loginError: null })
  try {
    try {
      const { user } = await link(auth.currentUser)
      await user.reload()
      publish(auth.currentUser ?? user)
    } catch (err) {
      const code = (err as { code?: string })?.code
      const cred = code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use' ? fallback(err) : null
      if (!cred) throw err
      // onAuthStateChanged publica el usuario nuevo
      await signInWithCredential(auth, cred)
    }
  } catch (err) {
    useAuth.setState({ loginError: loginMessage(err) })
  } finally {
    useAuth.setState({ busy: false })
  }
}

export function signInWithGoogle(): Promise<void> {
  return upgrade(
    (u) => linkWithPopup(u, provider()),
    (err) => GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]),
  )
}

/** Solo con los emuladores (pruebas automáticas): una cuenta de Google falsa, sin ventana. */
function signInForTests(sub: string, email: string, name = 'Prueba'): Promise<void> {
  if (!USE_EMULATORS) throw new Error('Solo con emuladores')
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true, name }))
  return upgrade(
    (u) => linkWithCredential(u, cred),
    () => cred,
  )
}

/** Sale de la cuenta de Google y vuelve a ser anónimo (otro usuario anónimo, nuevo). */
export async function signOut(): Promise<void> {
  if (auth) await fbSignOut(auth)
}
