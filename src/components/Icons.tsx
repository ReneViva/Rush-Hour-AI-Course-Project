import type { ReactNode } from 'react'

const artwork: Record<string, ReactNode> = {
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
  pause: <><path d="M9 5v14M15 5v14" strokeWidth="2.7" /></>,
  next: <><path d="m6 6 9 6-9 6Z" fill="currentColor" stroke="none" /><path d="M18 6v12" /></>,
  previous: <><path d="m18 6-9 6 9 6Z" fill="currentColor" stroke="none" /><path d="M6 6v12" /></>,
  reset: <><path d="M4 11a8 8 0 1 1 2.1 6.3" /><path d="M4 5v6h6" /></>,
  undo: <><path d="m9 6-5 5 5 5" /><path d="M4 11h10a5 5 0 0 1 5 5v2" /></>,
  edit: <><path d="M12 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8" /><path d="m10 14 1-4 7-7 3 3-7 7Z" /></>,
  compare: <><path d="M4 19h16M7 15v-4m5 4V5m5 10V8" /><circle cx="7" cy="9" r="1" /><circle cx="12" cy="3" r="1" /><circle cx="17" cy="6" r="1" /></>,
  shuffle: <><path d="M4 7h2c4 0 6 10 10 10h4m-4-4 4 4-4 4M4 17h2c1.5 0 2.8-1.4 4-3.3M14 8c.6-.7 1.3-1 2-1h4m-4-4 4 4-4 4" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  back: <path d="M20 12H5m6 6-6-6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.1" /></>,
  car: <><path d="m4 11 2-5a2 2 0 0 1 1.8-1h8.4A2 2 0 0 1 18 6l2 5m-16 0h16a1 1 0 0 1 1 1v5H3v-5a1 1 0 0 1 1-1Zm1 6v2m14-2v2M7 14h.1m9.9 0h.1" /></>,
  finish: <><path d="M5 21V4m0 1c5-4 9 3 15 0v10c-6 3-10-4-15 0" /><path d="M10 4v5m5-2v5m-5 1v-4M5 9c5-4 9 3 15 0" /></>,
  add: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2.4-3 4m0 3v.1" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  download: <><path d="M12 4v11m-4-4 4 4 4-4M5 17v3h14v-3" /></>,
}

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {artwork[name]}
    </svg>
  )
}
