/** Un color estable por persona (avatar, puntero y nombre en la hoja). */
export function colorFor(uid: string): string {
  let h = 0
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 55% 45%)`
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
