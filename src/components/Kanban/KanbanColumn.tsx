import { Plus, MoreHorizontal, Upload, GitBranch } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import type { Task } from '@/types'
import { Button } from '@/components/ui/button'
import type { ColumnType } from './constants'

interface KanbanColumnProps {
  column: ColumnType
  tasks: Task[]
  children: React.ReactNode
  onAddTask?: () => void
  onImport?: () => void
}

export function KanbanColumn({
  column,
  tasks,
  children,
  onAddTask,
  onImport,
}: KanbanColumnProps) {
  const { setNodeRef } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className="bg-app-surface-1 backdrop-blur-md border border-app-border rounded-xl flex flex-col w-[320px] shrink-0 h-full overflow-hidden shadow-2xl relative"
    >
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-app-border shrink-0 bg-app-surface-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.color} shadow-[0_0_8px_currentColor]`} />
          <span className="text-xs font-semibold tracking-wider text-app-text">
            {column.label}
          </span>
          <span className="text-xs font-mono text-app-text-muted bg-app-bg px-2 py-0.5 rounded-full border border-app-border">
            {tasks.length}
          </span>
          {column.id === 'todo' && (
            <div className="flex items-center gap-1 text-[10px] text-app-text-muted ml-1" title="Tasks will be started from the base branch (e.g., rdev)">
              <GitBranch className="w-3 h-3" />
              <span>Branch-based</span>
            </div>
          )}
        </div>
        
        {column.id === 'todo' && (
          <div className="flex items-center gap-1">
            {onImport && (
              <Button variant="ghost" size="icon" onClick={onImport} title="Import Tasks">
                <Upload className="w-4 h-4" />
              </Button>
            )}
            {onAddTask && (
              <Button variant="ghost" size="icon" onClick={onAddTask} title="Add Task">
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
        
        {column.id !== 'todo' && (
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto">
        {children}
      </div>

      {column.id === 'todo' && onAddTask && (
        <Button 
          variant="outline"
          className="mx-4 mb-4 gap-2 shrink-0 border-dashed"
          onClick={onAddTask}
        >
          <Plus className="w-4 h-4" />
          Add task
        </Button>
      )}
    </div>
  )
}