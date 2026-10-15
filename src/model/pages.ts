import { newId } from './note'
import { PAGE_HEIGHT, PAGE_WIDTH, type Background, type Page } from './types'

export function newPage(background: Background): Page {
  return {
    id: newId(),
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background: { ...background },
    strokes: [],
  }
}
