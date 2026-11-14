import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

const base = (size = 18): P => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

export const IconPlay = ({ size, ...p }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none" {...p}>
    <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
  </svg>
)
export const IconPause = ({ size, ...p }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none" {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1.2" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" />
  </svg>
)
export const IconStop = ({ size, ...p }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none" {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)
export const IconRewind = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M11 6 4 12l7 6V6Z" fill="currentColor" stroke="none" />
    <path d="M20 6l-7 6 7 6V6Z" fill="currentColor" stroke="none" />
  </svg>
)
export const IconMic = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)
export const IconRecord = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="9" />
  </svg>
)
export const IconVolume = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 9.5h3L12 5v14l-5-4.5H4z" />
    <path d="M16 9.2a4 4 0 0 1 0 5.6M18.8 6.5a8 8 0 0 1 0 11" />
  </svg>
)
export const IconMute = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 9.5h3L12 5v14l-5-4.5H4z" />
    <path d="m16.5 9.5 5 5m0-5-5 5" />
  </svg>
)
export const IconSearch = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
)
export const IconGlobe = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5S14.4 18.2 12 20.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5Z" />
  </svg>
)
export const IconMap = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z" />
    <path d="M9 4v14M15 6.5v14" />
  </svg>
)
export const IconChart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 20h17M4 16.5 9 11l3.5 3.5L20 6" />
  </svg>
)
export const IconFrame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="m6 16 3.5-4.5 2.5 3 2-2.5L18 16" />
    <circle cx="9" cy="8.5" r="1.2" />
  </svg>
)
export const IconDownload = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4M4.5 18.5h15" />
  </svg>
)
export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)
export const IconChevron = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
export const IconArrow = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" />
  </svg>
)
export const IconInfo = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.4" />
  </svg>
)
export const IconAccess = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="4.6" r="1.8" />
    <path d="M4.5 8.5c4.8 1.6 10.2 1.6 15 0M12 8v6m0 0-3 6.5m3-6.5 3 6.5" />
  </svg>
)
export const IconWave = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M2.5 12h2l1.5-5 2 12 2-16 2 20 2-13 1.5 6h4" />
  </svg>
)
export const IconLoop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 9.5A4.5 4.5 0 0 1 8.5 5H18m0 0-3-3m3 3-3 3M20 14.5a4.5 4.5 0 0 1-4.5 4.5h-9.5m0 0 3 3m-3-3 3-3" />
  </svg>
)
export const IconSpark = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m12 3 1.9 5.4L19.5 10l-5.6 1.6L12 17l-1.9-5.4L4.5 10l5.6-1.6z" />
    <path d="M18.5 16.5 19.4 19l2.6.9-2.6.9-.9 2.6" transform="translate(0,-4)" />
  </svg>
)
export const IconKeyboard = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 13h.01M9 16h6" />
  </svg>
)

/** Per-track glyphs drawn as inline SVG so they stay crisp and colourable. */
export function TrackIcon({ id, size = 22, ...p }: P & { id: string }) {
  const common = base(size)
  switch (id) {
    case 'temperature':
      return (
        <svg {...common} {...p}>
          <path d="M10 4.5a2 2 0 1 1 4 0v9.1a4.5 4.5 0 1 1-4 0z" />
          <path d="M12 8.5v7" />
          <circle cx="12" cy="17.5" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'co2':
      return (
        <svg {...common} {...p}>
          <circle cx="12" cy="12" r="3.2" />
          <circle cx="5" cy="9" r="2.4" />
          <circle cx="19" cy="9" r="2.4" />
          <path d="M7.3 9.8 9 11M17 9.8 15 11M12 15.2v4" />
        </svg>
      )
    case 'emissions':
      return (
        <svg {...common} {...p}>
          <path d="M12 3s4.5 4.2 4.5 8.2A4.5 4.5 0 0 1 12 15.7a4.5 4.5 0 0 1-4.5-4.5C7.5 7.2 12 3 12 3Z" />
          <path d="M9 18.5h6M10 21h4" />
        </svg>
      )
    case 'seaice':
      return (
        <svg {...common} {...p}>
          <path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6" />
          <path d="m9.4 5 2.6 2.4L14.6 5M9.4 19l2.6-2.4 2.6 2.4M4.8 11l3.4.4-1.4 3M19.2 11l-3.4.4 1.4 3" />
        </svg>
      )
    case 'sealevel':
      return (
        <svg {...common} {...p}>
          <path d="M2.5 9c2.4-2.2 4.6-2.2 7 0s4.6 2.2 7 0 3.4-1.6 5-0.6" />
          <path d="M2.5 14c2.4-2.2 4.6-2.2 7 0s4.6 2.2 7 0 3.4-1.6 5-0.6" />
          <path d="M2.5 19c2.4-2.2 4.6-2.2 7 0" />
        </svg>
      )
    case 'oceanheat':
      return (
        <svg {...common} {...p}>
          <path d="M12 3.2c3.6 4.3 6 7.4 6 10.4a6 6 0 0 1-12 0c0-3 2.4-6.1 6-10.4Z" />
          <path d="M9 14.2c.6 2 1.8 3 3 3.4" />
        </svg>
      )
    default:
      return (
        <svg {...common} {...p}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      )
  }
}
