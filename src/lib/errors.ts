/** Mensajes de error de Firebase en castellano, con qué hacer. */
export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const message = (e as Error)?.message ?? String(e)
  if (code === 'permission-denied' || /insufficient permissions/i.test(message)) {
    return 'Firebase rechazó el acceso. Si sos quien configura la app, revisá que estén publicadas las reglas de firestore.rules (Firestore → Reglas).'
  }
  if (code === 'unavailable') return 'No hay conexión con el servidor. Revisá tu internet y volvé a intentar.'
  if (code === 'failed-precondition') return 'Firestore no está listo en este proyecto (¿se creó la base de datos?).'
  return message
}
