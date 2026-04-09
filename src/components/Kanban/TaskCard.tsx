import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Play, Loader2, CheckCircle, GitBranch, GitMerge, FileDiff, MessageSquare, RefreshCw, AlertCircle } from 'lucide-react'
import type { Task } from '@/types'
import type { AITaskState } from '@/store/aiChatStore'
import { Button } from '@/components/ui/button'
import { AIActivityIndicator } from './AIActivityIndicator'
import { PRIORITY_COLORS } from './constants'
import { cn } from '@/lib/utils'

interface TaskCardProps {
  task: Task
  onStartAI: (task: Task) => void
  onViewDiff: (task: Task) => void
  onOpenChat: (task: Task) => void
  onComplete: (task: Task) => void
  onRetry: (task: Task) => void
  onClick: (task: Task) => void
  processingTasks: Set<string>
  taskStates: Record<string, AITaskState>
  mergeLoadingTasks: Set<string>
}

export function TaskCard({ 
  task, 
  onStartAI, 
  onViewDiff, 
  onOpenChat, 
  onComplete,
  onRetry,
  onClick,
  processingTasks,
  taskStates,
  mergeLoadingTasks
}: TaskCardProps) {
  const isAIWorking = taskStates[task.id]?.status === 'running' || 
                      taskStates[task.id]?.status === 'queued'
  
  const isMergeLoading = mergeLoadingTasks.has(task.id)
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id, 
    data: task,
    disabled: isAIWorking || task.status === 'done'
  })

const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : (isAIWorking ? 0.8 : 1),
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const target = e.target as HTMLElement
    const closestButton = target.closest('button')
    const closestLink = target.closest('a')
    
    if (closestButton || closestLink) {
      return
    }
    onClick(task)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...((isAIWorking || task.status === 'done') ? {} : listeners)}
      onClick={handleClick}
      className={cn(
        "group relative rounded-xl pl-5 pr-4 py-4 overflow-hidden transition-all duration-300 border",
        isAIWorking 
          ? 'bg-yellow-500/5 border-yellow-500/30 cursor-not-allowed shadow-[0_0_15px_rgba(234,179,8,0.1)]' 
          : 'bg-gradient-to-br from-app-surface-2 to-app-surface-1 hover:from-app-surface-3 hover:to-app-surface-2 border-app-border hover:border-app-border-highlight cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-0.5'
      )}
    >
      {/* Priority Stripe */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1",
        task.priority === 'high' ? 'bg-red-500' : 
        task.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
      )} />

      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={cn(`text-2xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-md border`, PRIORITY_COLORS[task.priority])}>
          {task.priority}
        </span>

        
      </div>
      
      <h3 className="text-[15px] font-semibold text-app-text tracking-tight mb-1.5 leading-snug">
        {task.title}
      </h3>
      
      {task.description && (
        <p className="text-sm text-app-text-secondary line-clamp-3 leading-relaxed">
          {task.description}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end border-t border-app-border/30 pt-3">
        <div className="flex items-center gap-1.5">
          {task.status === 'todo' && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onStartAI(task)
              }}
              disabled={processingTasks.has(task.id)}
              className="bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
              title="Start AI"
            >
              {processingTasks.has(task.id) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {processingTasks.has(task.id) ? 'Starting...' : 'Start'}
            </Button>
          )}

          {task.status === 'review' && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs relative z-10 hover:bg-app-panel"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDiff(task)
                }}
                title="View Diff"
              >
                <FileDiff className="w-4 h-4 mr-1.5" />
                Diff
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs relative z-10 hover:bg-app-panel"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOpenChat(task)
                }}
                title="Chat"
              >
                <MessageSquare className="w-4 h-4 mr-1.5" />
                Chat
              </Button>
            </div>
          )}

          {task.status === 'done' && (
            (task.pr_branch || task.merge_source_branch || taskStates[task.id]?.prBranch) ? (
              <Button
                size="sm"
                className="h-8 px-2.5 text-xs bg-app-accent hover:bg-app-accent-hover text-white shadow-md shadow-app-accent/20"
                onClick={(e) => {
                  e.stopPropagation()
                  onComplete(task)
                }}
                disabled={isMergeLoading}
                title="Merge Branch"
              >
                {isMergeLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <GitMerge className="w-3 h-3" />
                )}
                {isMergeLoading ? 'Merging...' : 'Merge'}
              </Button>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                <CheckCircle className="w-3 h-3" />
                Done
              </div>
            )
          )}

          {task.status === 'failed' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenChat(task)
                }}
                title="View Error"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetry(task)
                }}
                className="bg-red-600 hover:bg-red-700"
                title="Retry Task"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </Button>
            </>
          )}
        </div>
      </div>
      
      {isAIWorking && (
        <div className="mt-2 pt-2 border-t border-yellow-500/10">
          <AIActivityIndicator 
            taskId={task.id} 
            taskState={taskStates[task.id]}
          />
        </div>
      )}

      {task.status === 'in-progress' && taskStates[task.id]?.status === 'completed' && (
        <div className="mt-2 pt-2 border-t border-orange-500/20">
          {taskStates[task.id]?.creatingPR ? (
            <div className="flex items-center gap-1.5 text-xs text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Creating PR...</span>
            </div>
          ) : taskStates[task.id]?.prError ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-orange-400">
                <AlertCircle className="w-3 h-3" />
                <span>AI completed but PR failed</span>
              </div>
              <div className="mt-1 p-1.5 bg-red-500/10 rounded text-xs text-red-400 font-mono">
                {taskStates[task.id].prError}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle className="w-3 h-3" />
              <span>AI completed, finalizing...</span>
            </div>
          )}
          {!taskStates[task.id]?.creatingPR && (
            <>
              <p className="text-xs text-neutral-500 mt-1">
                Check chat for details. Manual PR required.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDiff(task)
                }}
              >
                <FileDiff className="w-3 h-3 mr-1" />
                View Changes
              </Button>
            </>
          )}
        </div>
      )}

      {task.status === 'review' && (
        <div className="mt-2 pt-2 border-t border-green-500/20">
          <Button
            size="sm"
            className="w-full text-xs bg-green-600 hover:bg-green-700 text-white"
            onClick={(e) => {
              e.stopPropagation()
              onComplete(task)
            }}
            disabled={isMergeLoading}
          >
            {isMergeLoading ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <GitMerge className="w-3 h-3 mr-1" />
            )}
            {isMergeLoading ? 'Merging...' : 'Merge'}
          </Button>
        </div>
      )}

      {task.status === 'review' && taskStates[task.id]?.prBranch && (
        <div className="mt-2 pt-2 border-t border-green-500/20">
          {taskStates[task.id]?.prUrl ? (
            <Button
              variant="link"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation()
                const { open } = await import('@tauri-apps/plugin-shell')
                await open(taskStates[task.id].prUrl!)
              }}
              className="h-auto p-0 flex items-center justify-start gap-1.5 text-xs text-app-accent hover:text-app-accent-hover w-full overflow-hidden"
            >
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate leading-normal">{taskStates[task.id].prBranch}</span>
            </Button>
          ) : (
            <div className="flex items-center justify-start gap-1.5 text-xs text-green-400 w-full overflow-hidden">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate leading-normal">{taskStates[task.id].prBranch}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}