/** Caja alineada a los ejes: [x0, y0, x1, y1]. */
export type BBox = [number, number, number, number]

/** Herramientas que dejan tinta. */
export type InkTool = 'pen' | 'highlighter'

/** Forma reconocida (etapa 6): se guarda como metadato del trazo. */
export interface ShapeMeta {
  kind: string
  params: number[]
}

export interface Stroke {
  id: string
  tool: InkTool
  color: string
  /** Opacidad (el resaltador va por debajo de la tinta, semitransparente) */
  opacity: number
  /** Orden de dibujo: hora del cliente con desempate */
  z: number
  /** Diámetro base, en unidades de página */
  size: number
  /** Puntos intercalados x, y, presión (0–1), en coordenadas de la página */
  pts: number[]
  /** La presión es simulada por velocidad (mouse o dedo) */
  simulated: boolean
  /** Caja del contorno ya dibujado, con el grosor incluido */
  bbox: BBox
  shape?: ShapeMeta
  /**
   * Objeto (texto, fórmula, ejes…) en vez de tinta. Los puntos son el contorno de su caja
   * (rectángulo cerrado de 5 puntos), así el lazo lo mueve y lo escala como a cualquier trazo.
   * En el texto y las fórmulas, `size` es el tamaño de letra; en las figuras, el grosor de línea.
   */
  item?: Item
}

export type MathFormat = 'ascii' | 'tex'

export type Item =
  | { kind: 'text'; text: string; bold?: boolean }
  /** ascii: lo escrito con el teclado (x^2 + 2); tex: lo que devuelve el reconocimiento de escritura */
  | { kind: 'math'; src: string; fmt: MathFormat }
  | { kind: 'axes'; xmin: number; xmax: number; ymin: number; ymax: number; grid: boolean; fns: string[] }
  | { kind: 'numberline'; min: number; max: number }

export type ItemKind = Item['kind']

export type BackgroundType = 'blank' | 'ruled' | 'grid' | 'dots'

export interface Background {
  type: BackgroundType
  /** Distancia entre líneas o puntos, en unidades de página */
  spacing: number
  /** Color de las líneas o puntos */
  color: string
  /** Color del papel */
  paper: string
}

export interface Page {
  id: string
  width: number
  height: number
  background: Background
  strokes: Stroke[]
}

/** Tamaño tipo A4 (1240 × 1754 unidades), igual para todas las páginas. */
export const PAGE_WIDTH = 1240
export const PAGE_HEIGHT = 1754
