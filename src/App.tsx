import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { firebaseConfigured } from './firebase/app'
import { initAuth, retryAuth, useAuth } from './firebase/auth'
import { SetupMissing } from './ui/SetupMissing'
import { Splash } from './ui/Splash'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { Icon } from './ui/Icon'

// Se cargan bajo demanda (y el service worker las deja precacheadas)
const Home = lazy(() => import('./ui/Home').then((m) => ({ default: m.Home })))
const RoomRoute = lazy(() => import('./ui/RoomRoute').then((m) => ({ default: m.RoomRoute })))

function Gate() {
  const { status, error } = useAuth()
  useEffect(initAuth, [])
  if (!firebaseConfigured) return <SetupMissing />
  if (status === 'loading') return <Splash />
  if (status === 'error') {
    return (
      <main className="center-screen">
        <Icon name="cloudOff" size={48} />
        <h2>No se pudo conectar</h2>
        <p className="muted">{error}</p>
        <button className="btn btn-primary-solid" onClick={retryAuth}>
          Reintentar
        </button>
      </main>
    )
  }
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sala/:code" element={<RoomRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <Gate />
      <UpdatePrompt />
    </BrowserRouter>
  )
}
