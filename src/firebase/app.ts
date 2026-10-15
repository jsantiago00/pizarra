import { initializeApp, type FirebaseApp } from 'firebase/app'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  // Realtime Database (lo en vivo). Si no se indica, la de us-central1, que es la que Firebase
  // propone por defecto al crearla
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || (env.VITE_FIREBASE_PROJECT_ID ? `https://${env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com` : undefined),
}

/** Sin .env la app muestra cómo configurarla en vez de romperse. */
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

let app: FirebaseApp | undefined

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('Firebase no está configurado (falta .env)')
  return (app ??= initializeApp(firebaseConfig))
}
