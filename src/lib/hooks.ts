import { useEffect, useRef, useState } from 'react'

/** True while the element is on screen (with a margin) — used to pause WebGL work. */
export function useInView<T extends Element>(options?: IntersectionObserverInit & { once?: boolean }) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          setInView(e.isIntersecting)
          if (e.isIntersecting && options?.once) io.disconnect()
        })
      },
      { threshold: options?.threshold ?? 0.05, rootMargin: options?.rootMargin ?? '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ref, inView }
}

/** Throttles a rapidly changing value (e.g. the playhead) to a maximum update rate. */
export function useThrottledValue<T>(value: T, ms = 100): T {
  const [throttled, setThrottled] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setThrottled(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return throttled
}

/** Copies text to the clipboard with a fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
