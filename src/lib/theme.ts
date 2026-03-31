export const APP_COLORS = {
  accent: 'var(--app-accent)',
  accentGlow: 'var(--app-accent-glow)',
  accentHover: 'var(--app-accent-hover)',
  bg: 'var(--app-bg)',
  panel: 'var(--app-panel)',
  sidebar: 'var(--app-sidebar)',
  titlebar: 'var(--app-titlebar)',
  border: 'var(--app-border)',
  text: 'var(--app-text)',
  textMuted: 'var(--app-text-muted)',
} as const

export const STATUS_CONFIG = {
  todo: {
    label: 'To Do',
    color: 'bg-neutral-600',
    colorLight: 'bg-neutral-500/20',
    textColor: 'text-neutral-400',
    borderColor: 'border-neutral-500/30',
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-blue-500',
    colorLight: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
  },
  review: {
    label: 'Review',
    color: 'bg-yellow-500',
    colorLight: 'bg-yellow-500/20',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
  },
  done: {
    label: 'Done',
    color: 'bg-green-500',
    colorLight: 'bg-green-500/20',
    textColor: 'text-green-400',
    borderColor: 'border-green-500/30',
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-500',
    colorLight: 'bg-red-500/20',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
  },
  backlog: {
    label: 'Backlog',
    color: 'bg-neutral-700',
    colorLight: 'bg-neutral-700/20',
    textColor: 'text-neutral-400',
    borderColor: 'border-neutral-700/30',
  },
} as const

export const PRIORITY_CONFIG = {
  high: {
    label: 'High',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    dotColor: 'bg-red-500',
  },
  medium: {
    label: 'Medium',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    dotColor: 'bg-yellow-500',
  },
  low: {
    label: 'Low',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    dotColor: 'bg-green-500',
  },
} as const

export const LAYOUT_SIZES = {
  sidebar: {
    width: 56,
    collapsedWidth: 0,
  },
  taskCreator: {
    width: 480,
    minWidth: 320,
  },
  kanbanColumn: {
    width: 380,
    minWidth: 300,
    gap: 20,
  },
  header: {
    height: 38,
  },
  modal: {
    maxWidth: 480,
    maxHeightPercent: 85,
  },
} as const

export const Z_INDEX = {
  base: 0,
  dropdown: 50,
  modal: 60,
  overlay: 70,
  tooltip: 80,
} as const

export const ANIMATION = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
  },
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
} as const