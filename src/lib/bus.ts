/** Tiny typed event bus — lets the voice agent drive components without prop drilling. */

export type BusEvent =
  | { type: 'sonify-frame' }
  | { type: 'rebuild-score'; reason: string }
  | { type: 'scroll-to'; section: string }
  | { type: 'unlock-audio' }
  | { type: 'ping'; lat: number; lon: number }
  | { type: 'highlight-source'; id: string }
  | { type: 'start-mic'; mode: 'tap' | 'record' }
  | { type: 'agent-ask'; text: string }

type Handler = (e: BusEvent) => void

const handlers = new Set<Handler>()

export function onBus(h: Handler): () => void {
  handlers.add(h)
  return () => handlers.delete(h)
}

export function emit(e: BusEvent) {
  handlers.forEach((h) => {
    try {
      h(e)
    } catch (err) {
      console.warn('[bus]', err)
    }
  })
}
