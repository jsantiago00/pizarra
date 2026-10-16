/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_DATABASE_URL?: string
  /** MyScript (escritura a mano → fórmula), opcional */
  readonly VITE_MYSCRIPT_APP_KEY?: string
  readonly VITE_MYSCRIPT_HMAC_KEY?: string
  /** "1" para usar los emuladores de Firebase (pruebas locales) */
  readonly VITE_USE_EMULATORS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Navigator {
  /** Safari de iOS: true si la página corre como app instalada */
  readonly standalone?: boolean
}
