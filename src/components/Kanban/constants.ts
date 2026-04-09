import type { Task } from '@/types'

export type ColumnId = 'todo' | 'in-progress' | 'review' | 'done' | 'failed'

export interface ColumnType {
  id: ColumnId
  label: string
  color: string
}

export const COLUMNS: ColumnType[] = [
  { id: 'todo', label: 'To Do', color: 'bg-neutral-600' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-blue-500' },
  { id: 'review', label: 'Review', color: 'bg-yellow-500' },
  { id: 'done', label: 'Done', color: 'bg-green-500' },
  { id: 'failed', label: 'Failed', color: 'bg-red-500' },
]

export const KANBAN_WIDTHS = {
  taskCreator: 480,
  column: 380,
  gap: 20,
} as const

export const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: 'bg-red-500/10 text-red-500 border-red-500/20 shadow-sm',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-sm',
  low: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm',
}

export const STATUS_COLORS: Record<Task['status'], string> = {
  todo: 'bg-neutral-500',
  'in-progress': 'bg-blue-500',
  review: 'bg-yellow-500',
  done: 'bg-green-500',
  failed: 'bg-red-500',
  backlog: 'bg-neutral-700',
}

export const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
  backlog: 'Backlog',
}