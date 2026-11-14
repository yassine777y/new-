import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { emit } from '@/lib/bus'
import { IconInfo } from './Icon'

/* ------------------------------------------------------------------ Panel */

export function Panel({
  children,
  className = '',
  as: Tag = 'div',
  ...rest
}: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'aside' | 'article' } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Tag className={`glass rounded-2xl ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  right,
  icon,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  right?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
      <div className="min-w-0">
        {eyebrow && <div className="label-mono mb-1.5 flex items-center gap-2">{icon}{eyebrow}</div>}
        <h3 className="truncate text-[17px] font-semibold text-mist-50">{title}</h3>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-mist-300">{description}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'warm'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-sonic-300 text-void-950 hover:bg-sonic-200 active:bg-sonic-400 shadow-[0_0_28px_-8px_rgba(110,231,255,0.75)] font-semibold',
  warm: 'bg-carbon-300 text-void-950 hover:bg-carbon-200 font-semibold shadow-[0_0_28px_-8px_rgba(255,209,102,0.7)]',
  ghost: 'bg-white/5 text-mist-100 hover:bg-white/10 border border-white/10',
  outline: 'bg-transparent text-sonic-200 hover:bg-sonic-300/10 border border-sonic-300/40',
  danger: 'bg-heat-500/15 text-heat-300 hover:bg-heat-500/25 border border-heat-500/40',
}

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-[12.5px] gap-2 rounded-xl',
  md: 'h-11 px-5 text-[14px] gap-2 rounded-xl',
  lg: 'h-13 px-6 text-[15px] gap-2.5 rounded-2xl',
}

export function Button({
  variant = 'ghost',
  size = 'sm',
  className = '',
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; active?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        VARIANTS[variant]
      } ${SIZES[size]} ${active ? 'ring-1 ring-sonic-300/70 bg-sonic-300/15' : ''} ${className}`}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className = '',
  children,
  variant = 'ghost',
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-40 ${
        VARIANTS[variant]
      } ${active ? 'ring-1 ring-sonic-300/70 bg-sonic-300/15' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ Badge */

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'cyan' | 'warm' | 'ice' | 'heat'
  className?: string
}) {
  const tones = {
    neutral: 'bg-white/6 text-mist-300 border-white/10',
    cyan: 'bg-sonic-300/12 text-sonic-200 border-sonic-300/30',
    warm: 'bg-carbon-300/12 text-carbon-200 border-carbon-300/30',
    ice: 'bg-ice-400/12 text-ice-200 border-ice-400/30',
    heat: 'bg-heat-500/12 text-heat-300 border-heat-500/30',
  }
  return (
    <span
      className={`data-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] tracking-wide uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Clickable citation chip — jumps to the Sources section and highlights the entry. */
export function SourceBadge({ id, label }: { id: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => emit({ type: 'highlight-source', id })}
      className="data-mono inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[10.5px] text-mist-300 uppercase transition hover:border-sonic-300/50 hover:text-sonic-200"
      aria-label={`Jump to source: ${label ?? id}`}
    >
      <IconInfo size={11} />
      {label ?? id}
    </button>
  )
}

/* ------------------------------------------------------------------ Toggle */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className = '',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  className?: string
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 ${className}`}>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-mist-100">{label}</span>
        {description && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
          checked ? 'border-sonic-300/60 bg-sonic-300/30' : 'border-white/15 bg-white/6'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all duration-200 ${
            checked ? 'left-5.5 bg-sonic-200 shadow-[0_0_12px_rgba(110,231,255,0.8)]' : 'left-0.5 bg-mist-400'
          }`}
          style={{ height: 18, width: 18, left: checked ? 22 : 2 }}
        />
      </button>
    </label>
  )
}

/* ------------------------------------------------------------------ Slider */

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  valueText,
  className = '',
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  valueText?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="label-mono">{label}</span>
        <span className="data-mono text-[12px] text-sonic-200">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="w-full disabled:opacity-40"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueText ?? (format ? format(value) : String(value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ Section heading */

export function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
  align = 'left',
}: {
  id?: string
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  align?: 'left' | 'center'
}) {
  return (
    <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <div className={`label-mono mb-3 flex items-center gap-3 ${align === 'center' ? 'justify-center' : ''}`}>
        <span className="inline-block h-px w-8 bg-sonic-300/60" />
        {eyebrow}
      </div>
      <h2 id={id} className="text-3xl leading-tight font-semibold text-mist-50 sm:text-4xl md:text-[42px]">
        {title}
      </h2>
      {lede && <p className="mt-4 text-[15px] leading-relaxed text-mist-300">{lede}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ Scroll reveal */

export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'article'
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)
  const reduce = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true)
            io.disconnect()
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return (
    <Tag
      // @ts-expect-error – ref type varies with the tag
      ref={ref}
      className={`${className} transition-all duration-700 ease-out ${
        shown ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-6 opacity-0 blur-[2px]'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduce
}

/* ------------------------------------------------------------------ misc */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="data-mono inline-flex min-w-6 items-center justify-center rounded-md border border-white/15 bg-white/6 px-1.5 py-0.5 text-[10.5px] text-mist-200">
      {children}
    </kbd>
  )
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="label-mono truncate">{label}</div>
      <div className="data-mono mt-1 truncate text-[15px] font-semibold" style={{ color: tone ?? 'var(--color-mist-50)' }}>
        {value}
      </div>
    </div>
  )
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-white/25 border-t-sonic-300 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}
