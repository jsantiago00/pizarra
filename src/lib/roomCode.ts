/**
 * Códigos de sala: 6 caracteres sin los que se confunden al dictarlos o copiarlos
 * (0/O, 1/I/L). Son 31^6, casi 900 millones de combinaciones.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function newCode(): string {
  const a = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/**
 * Normaliza lo que escribió la persona: mayúsculas, sin espacios ni guiones. También acepta el
 * enlace completo de la sala. Devuelve null si no es un código posible.
 */
export function parseCode(input: string): string | null {
  const up = input.toUpperCase()
  const fromLink = /\/SALA\/([A-Z0-9-]+)/.exec(up)
  const code = (fromLink ? fromLink[1] : up).replace(/[\s-]/g, '')
  if (code.length !== CODE_LENGTH) return null
  return [...code].every((c) => ALPHABET.includes(c)) ? code : null
}

/** Para mostrar: ABC-DEF. */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`
}
