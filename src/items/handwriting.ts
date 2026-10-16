import type { Stroke } from '../model/types'

/**
 * Escritura a mano → fórmula, con MyScript (el mismo motor que usan Nebo y Goodnotes).
 * Hace falta una cuenta gratis en developer.myscript.com: la «application key» y la «HMAC key»
 * van en las variables VITE_MYSCRIPT_APP_KEY y VITE_MYSCRIPT_HMAC_KEY. Sin ellas, la opción
 * «Convertir en fórmula» no aparece.
 *
 * Las claves viajan al navegador (no hay servidor propio): conviene restringirlas al dominio de
 * la app desde el panel de MyScript.
 */
const APP_KEY = import.meta.env.VITE_MYSCRIPT_APP_KEY ?? ''
const HMAC_KEY = import.meta.env.VITE_MYSCRIPT_HMAC_KEY ?? ''
const ENDPOINT = 'https://cloud.myscript.com/api/v4.0/iink/batch'

export const handwritingEnabled = Boolean(APP_KEY && HMAC_KEY)

/** El cuerpo del pedido: los trazos (corridos al origen) con tiempos inventados pero crecientes. */
export function buildRequest(strokes: readonly Pick<Stroke, 'pts'>[]): string {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of strokes) {
    for (let i = 0; i + 1 < s.pts.length; i += 3) {
      x0 = Math.min(x0, s.pts[i])
      y0 = Math.min(y0, s.pts[i + 1])
      x1 = Math.max(x1, s.pts[i])
      y1 = Math.max(y1, s.pts[i + 1])
    }
  }
  let t = Date.now()
  const pad = 20
  const list = strokes.map((s) => {
    const x: number[] = []
    const y: number[] = []
    const ts: number[] = []
    const p: number[] = []
    for (let i = 0; i + 2 < s.pts.length; i += 3) {
      x.push(Math.round((s.pts[i] - x0 + pad) * 10) / 10)
      y.push(Math.round((s.pts[i + 1] - y0 + pad) * 10) / 10)
      ts.push((t += 8))
      p.push(Math.round(s.pts[i + 2] * 100) / 100)
    }
    t += 150
    return { x, y, t: ts, p, pointerType: 'PEN' }
  })
  return JSON.stringify({
    xDPI: 96,
    yDPI: 96,
    contentType: 'Math',
    width: Math.ceil(x1 - x0 + pad * 2),
    height: Math.ceil(y1 - y0 + pad * 2),
    configuration: { math: { mimeTypes: ['application/x-latex'], solver: { enable: false } } },
    strokeGroups: [{ strokes: list }],
  })
}

async function hmacHex(body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(APP_KEY + HMAC_KEY), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Saca los delimitadores que a veces agrega el reconocimiento (\[ … \], $ … $, align). */
export function cleanLatex(latex: string): string {
  return latex
    .trim()
    .replace(/^\\\[|\\\]$/g, '')
    .replace(/^\$+|\$+$/g, '')
    .replace(/\\begin\{align\*?\}|\\end\{align\*?\}/g, '')
    .replace(/&/g, '')
    .trim()
}

/** Reconoce la fórmula escrita con estos trazos; devuelve TeX. */
export async function recognizeMath(strokes: readonly Pick<Stroke, 'pts'>[]): Promise<string> {
  if (!handwritingEnabled) throw new Error('Falta configurar MyScript')
  const body = buildRequest(strokes)
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/x-latex, application/json',
        'Content-Type': 'application/json',
        applicationKey: APP_KEY,
        hmac: await hmacHex(body),
      },
      body,
    })
  } catch {
    throw new Error('No hay conexión con el reconocimiento de escritura.')
  }
  const text = await res.text()
  if (!res.ok) {
    let msg = ''
    try {
      msg = (JSON.parse(text) as { message?: string }).message ?? ''
    } catch {
      msg = text.slice(0, 120)
    }
    if (res.status === 401 || res.status === 403) throw new Error(`MyScript rechazó la clave (${res.status}). Revisá las claves y el dominio permitido.`)
    throw new Error(`No se pudo reconocer la fórmula${msg ? `: ${msg}` : ''}.`)
  }
  const latex = cleanLatex(text)
  if (!latex) throw new Error('No se reconoció ninguna fórmula.')
  return latex
}
