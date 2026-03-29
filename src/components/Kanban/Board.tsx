import { useEffect, useState, useCallback } from 'react'
import { Plus, MoreHorizontal, X, Upload, Play, Loader2, CheckCircle, GitBranch, FileDiff, MessageSquare, RefreshCw, Terminal, Sparkles, FileCode, Files, Trash2 } from 'lucide-react'
import { useTaskStore, useAIChatStore } from '@/store'
import type { Task } from '@/types'
import { TaskImporter } from './TaskImporter'
import { TaskChatBox } from '@/components/Chat/TaskChatBox'
import { DiffViewer } from '@/components/DiffViewer/DiffViewer'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type ColumnType = {
  id: 'todo' | 'in-progress' | 'review' | 'done' | 'failed'
  label: string
  color: string
}

const columns: ColumnType[] = [
  { id: 'todo', label: 'To Do', color: 'bg-neutral-600' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-blue-500' },
  { id: 'review', label: 'Review', color: 'bg-yellow-500' },
  { id: 'done', label: 'Done', color: 'bg-green-500' },
  { id: 'failed', label: 'Failed', color: 'bg-red-500' },
]

// AI Activity Indicator Component
interface AIActivityIndicatorProps {
  taskId: string;
  taskState: import('@/store/aiChatStore').AITaskState | undefined;
  showTerminal?: boolean;
  maxHeight?: string;
}

function AIActivityIndicator({ taskId, taskState, showTerminal = false, maxHeight = 'auto' }: AIActivityIndicatorProps) {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);
  const aiChatStore = useAIChatStore();
  const messages = aiChatStore.getMessages(taskId);
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const latestOutput = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Reset and animate progress bar based on status
  useEffect(() => {
    if (taskState?.status === 'running') {
      setProgress(0); // Start from 0 when running
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 10; // Reset for continuous animation
          return prev + Math.random() * 10;
        });
      }, 800);
      return () => clearInterval(interval);
    } else if (taskState?.status === 'queued') {
      setProgress(5); // Small progress for queued
    } else {
      setProgress(0);
    }
  }, [taskState?.status]);

  const getStatusText = () => {
    if (taskState?.status === 'queued') {
      return `Waiting in queue #${taskState.queuePosition || 1}`;
    }
    if (taskState?.status === 'running') {
      return 'AI is processing';
    }
    return 'Processing';
  };

  const formatFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  // Get last lines of output for preview
  const getLastOutputLines = () => {
    if (!latestOutput) return [];
    const lines = latestOutput.split('\n').filter(line => line.trim());
    return lines.slice(-15); // Last 15 lines for better context
  };

  // Get current action description based on output
  const getCurrentAction = () => {
    if (!latestOutput) return null;
    const lines = latestOutput.split('\n');
    // Look for common patterns in AI output
    const actionPatterns = [
      { pattern: /reading|reading file|open|reading file from/i, label: 'Reading files...' },
      { pattern: /writing|writing file|create|updating|modifying/i, label: 'Modifying files...' },
      { pattern: /run|executing|command|npm|node|python/i, label: 'Running commands...' },
      { pattern: /search|find|grep/i, label: 'Searching...' },
      { pattern: /analyzing|thinking|planning/i, label: 'Analyzing...' },
      { pattern: /error|failed|exception/i, label: 'Error occurred' },
    ];
    
    for (const { pattern, label } of actionPatterns) {
      if (pattern.test(latestOutput)) {
        return label;
      }
    }
    return 'Processing...';
  };

  return (
    <div className="space-y-2">
      {/* Status Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-3 h-3 text-yellow-500 animate-pulse" />
        <span className="text-[10px] font-medium text-yellow-400 font-geist">
          {getStatusText()}{dots}
        </span>
      </div>
      
      {/* Progress Bar - Animated */}
      <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-500 animate-gradient-x"
          style={{ 
            width: `${Math.min(progress, 95)}%`,
            transition: 'width 0.8s ease-out'
          }}
        />
      </div>
      
      {/* Current File Being Modified */}
      {taskState?.currentFile && (
        <div className="flex items-start gap-1.5">
          <FileCode className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-neutral-400 font-geist">
              Currently editing:
            </p>
            <p className="text-[10px] text-blue-300 font-geist truncate">
              {formatFileName(taskState.currentFile)}
            </p>
          </div>
        </div>
      )}
      
      {/* Files Modified Count */}
      {taskState?.filesModified && taskState.filesModified.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Files className="w-3 h-3 text-green-400 flex-shrink-0" />
          <p className="text-[10px] text-green-300 font-geist">
            {taskState.filesModified.length} file{taskState.filesModified.length !== 1 ? 's' : ''} modified
          </p>
        </div>
      )}
      
      {/* Terminal Output View */}
      {showTerminal && taskState?.status === 'running' && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-neutral-500" />
              <span className="text-[10px] text-neutral-500 font-geist">AI Terminal</span>
            </div>
            {taskState.currentFile && (
              <span className="text-[10px] text-blue-400 font-mono truncate max-w-[150px]">
                {formatFileName(taskState.currentFile)}
              </span>
            )}
          </div>
          <div 
            className="bg-[#0d0d0d] rounded border border-white/5 p-2 font-mono text-[10px] overflow-y-auto"
            style={{ maxHeight: maxHeight === 'auto' ? '120px' : maxHeight }}
          >
            {latestOutput ? (
              <div className="space-y-0.5">
                <div className="text-yellow-500/70 text-[9px] mb-1 border-b border-white/5 pb-1">
                  {getCurrentAction()}
                </div>
                {getLastOutputLines().map((line, idx) => (
                  <div key={idx} className="text-neutral-300 whitespace-pre-wrap break-all leading-relaxed">
                    {line}
                  </div>
                ))}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-green-500">❯</span>
                  <span className="w-2 h-3 bg-green-500 animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="text-neutral-600 italic flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Initializing AI...
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Simple Preview (non-terminal) */}
      {!showTerminal && taskState?.status === 'running' && (
        <div className="flex items-start gap-1.5">
          <Terminal className="w-3 h-3 text-neutral-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-neutral-400 font-geist line-clamp-1">
            {taskState.currentFile ? `Editing ${formatFileName(taskState.currentFile)}...` : latestOutput ? 'Processing...' : 'Initializing...'}
          </p>
        </div>
      )}
    </div>
  );
}

// Task Detail Modal Component
interface TaskDetailModalProps {
  task: Task;
  taskState: import('@/store/aiChatStore').AITaskState | undefined;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onStartAI: (task: Task) => void;
  onOpenChat: (task: Task) => void;
  onViewDiff: (task: Task) => void;
  onComplete: (task: Task) => void;
  onRetry: (task: Task) => void;
}

function TaskDetailModal({ 
  task, 
  taskState, 
  isOpen, 
  onClose, 
  onDelete,
  onStartAI,
  onOpenChat,
  onViewDiff,
  onComplete,
  onRetry
}: TaskDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  if (!isOpen) return null

  const handleDelete = async () => {
    setIsDeleting(true)
    await onDelete(task.id)
    setIsDeleting(false)
  }

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'todo': return 'bg-neutral-500'
      case 'in-progress': return 'bg-blue-500'
      case 'review': return 'bg-yellow-500'
      case 'done': return 'bg-green-500'
      case 'failed': return 'bg-red-500'
      default: return 'bg-neutral-500'
    }
  }

  const getStatusLabel = (status: Task['status']) => {
    switch (status) {
      case 'todo': return 'To Do'
      case 'in-progress': return 'In Progress'
      case 'review': return 'Review'
      case 'done': return 'Done'
      case 'failed': return 'Failed'
      default: return status
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
            <h3 className="text-sm font-semibold text-white font-geist">Task Details</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-[10px] text-neutral-500 font-geist mb-1">Title</label>
            <h2 className="text-base font-medium text-white font-geist">{task.title}</h2>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <label className="block text-[10px] text-neutral-500 font-geist mb-1">Description</label>
              <p className="text-sm text-neutral-300 font-geist whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-neutral-500 font-geist mb-1">Status</label>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
                <span className="text-sm text-white font-geist">{getStatusLabel(task.status)}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-neutral-500 font-geist mb-1">Priority</label>
              <span className={`text-sm font-geist capitalize ${
                task.priority === 'high' ? 'text-red-400' :
                task.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'
              }`}>{task.priority}</span>
            </div>
          </div>

          {/* AI Status (if applicable) */}
          {(taskState?.status === 'running' || taskState?.status === 'queued' || taskState?.status === 'error') && (
            <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-3">
              <label className="block text-[10px] text-yellow-500 font-geist mb-2">AI Processing Status</label>
              <AIActivityIndicator 
                taskId={task.id} 
                taskState={taskState} 
                showTerminal={true}
                maxHeight="200px"
              />
            </div>
          )}

          {/* Files Modified */}
          {taskState?.filesModified && taskState.filesModified.length > 0 && (
            <div>
              <label className="block text-[10px] text-neutral-500 font-geist mb-2">Files Modified</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {taskState.filesModified.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-neutral-300 font-geist">
                    <FileCode className="w-3 h-3 text-blue-400" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <div>
              <label className="block text-[10px] text-neutral-500 font-geist mb-1">Created</label>
              <span className="text-xs text-neutral-400 font-geist">{formatDate(task.created_at)}</span>
            </div>
            <div>
              <label className="block text-[10px] text-neutral-500 font-geist mb-1">Updated</label>
              <span className="text-xs text-neutral-400 font-geist">{formatDate(task.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-white/5 bg-[#252526]">
          <div className="flex items-center justify-between">
            {/* Left: Delete Button */}
            <div>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-geist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-geist">Are you sure?</span>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-geist"
                  >
                    {isDeleting ? '...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2 py-1 rounded text-xs font-medium text-neutral-400 hover:text-white font-geist"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Status-specific actions */}
              {task.status === 'todo' && (
                <button
                  onClick={() => {
                    onStartAI(task)
                    onClose()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors font-geist"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start AI
                </button>
              )}

              {task.status === 'in-progress' && (
                <button
                  onClick={() => {
                    onOpenChat(task)
                    onClose()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 transition-colors font-geist"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  View Chat
                </button>
              )}

              {task.status === 'review' && (
                <>
                  <button
                    onClick={() => {
                      onViewDiff(task)
                      onClose()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white/5 text-neutral-300 hover:bg-white/10 transition-colors font-geist"
                  >
                    <FileDiff className="w-3.5 h-3.5" />
                    View Diff
                  </button>
                  <button
                    onClick={() => {
                      onComplete(task)
                      onClose()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors font-geist"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Push
                  </button>
                </>
              )}

              {task.status === 'failed' && (
                <button
                  onClick={() => {
                    onRetry(task)
                    onClose()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors font-geist"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded text-xs font-medium text-neutral-300 hover:text-white font-geist transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Task Card Component
function TaskCard({ 
  task, 
  onStartAI, 
  onViewDiff, 
  onOpenChat, 
  onComplete,
  onRetry,
  onClick,
  processingTasks,
  isTaskStreaming,
  taskStates,
  getPriorityColor 
}: { 
  task: Task
  onStartAI: (task: Task) => void
  onViewDiff: (task: Task) => void
  onOpenChat: (task: Task) => void
  onComplete: (task: Task) => void
  onRetry: (task: Task) => void
  onClick: (task: Task) => void
  processingTasks: Set<string>
  isTaskStreaming: (taskId: string) => boolean
  taskStates: Record<string, import('@/store/aiChatStore').AITaskState>
  getPriorityColor: (priority: Task['priority']) => string
}) {
  // Check if AI is currently working on this task
  const isAIWorking = taskStates[task.id]?.status === 'running' || 
                      taskStates[task.id]?.status === 'queued'
  
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
    disabled: isAIWorking // Disable drag when AI is working
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : (isAIWorking ? 0.8 : 1),
  }

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger click if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) {
      return
    }
    onClick(task)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(isAIWorking ? {} : listeners)}
      onClick={handleClick}
      className={`group rounded-md p-3 transition-colors border border-transparent hover:border-white/10 relative ${
        isAIWorking 
          ? 'bg-yellow-500/5 border-yellow-500/20 cursor-not-allowed' 
          : 'bg-[#2d2d2d] hover:bg-[#3c3c3c] cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)} font-geist`}>
          {task.priority}
        </span>

        <div className="flex items-center gap-1">
          {/* Action buttons based on status */}
          {task.status === 'todo' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStartAI(task)
              }}
              disabled={processingTasks.has(task.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors font-geist"
              title="Start AI"
            >
              {processingTasks.has(task.id) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {processingTasks.has(task.id) ? 'Starting...' : 'Start'}
            </button>
          )}

          {task.status === 'in-progress' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenChat(task)
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors font-geist"
              title={isTaskStreaming(task.id) ? "AI is working..." : "View progress"}
            >
              <Loader2 className={`w-3 h-3 ${isTaskStreaming(task.id) ? 'animate-spin' : ''}`} />
              {isTaskStreaming(task.id) ? 'AI Working...' : 
                taskStates[task.id]?.status === 'queued' ? `Queued #${taskStates[task.id]?.queuePosition}` : 'In Progress'}
            </button>
          )}

          {task.status === 'review' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDiff(task)
                }}
                className="p-1.5 rounded text-neutral-500 hover:text-white hover:bg-white/10 transition-colors"
                title="View Diff"
              >
                <FileDiff className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenChat(task)
                }}
                className="p-1.5 rounded text-neutral-500 hover:text-white hover:bg-white/10 transition-colors"
                title="Chat"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onComplete(task)
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-600 hover:bg-green-700 text-white transition-colors font-geist"
              >
                <GitBranch className="w-3 h-3" />
                Push
              </button>
            </>
          )}

          {task.status === 'done' && (
            <div className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-500/20 text-green-400 font-geist">
              <CheckCircle className="w-3 h-3" />
              Done
            </div>
          )}

          {task.status === 'failed' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenChat(task)
                }}
                className="p-1.5 rounded text-neutral-500 hover:text-white hover:bg-white/10 transition-colors"
                title="View Error"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRetry(task)
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-600 hover:bg-red-700 text-white transition-colors font-geist"
                title="Retry Task"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </>
          )}
        </div>
      </div>
      <h3 className="text-sm font-medium text-neutral-200 font-geist mb-1">
        {task.title}
      </h3>
      {task.description && (
        <p className="text-xs text-neutral-500 font-geist line-clamp-2">
          {task.description}
        </p>
      )}
      
      {/* AI Activity Indicator */}
      {isAIWorking && (
        <div className="mt-2 pt-2 border-t border-yellow-500/10">
          <AIActivityIndicator 
            taskId={task.id} 
            taskState={taskStates[task.id]}
          />
        </div>
      )}
    </div>
  )
}

// Column Component
function KanbanColumn({
  column,
  tasks,
  children,
  onAddTask,
}: {
  column: ColumnType
  tasks: Task[]
  children: React.ReactNode
  onAddTask?: () => void
}) {
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
      className="bg-[#252526] rounded-md flex flex-col max-h-[calc(100vh-280px)]"
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.color}`} />
          <span className="text-xs font-medium text-neutral-300 font-geist">
            {column.label}
          </span>
          <span className="text-xs text-neutral-500 font-geist">
            {tasks.length}
          </span>
        </div>
        <button className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/5 transition-colors">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tasks */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px]">
        {children}
      </div>

      {/* Add Task Button */}
      <button 
        onClick={onAddTask}
        className="mx-2 mb-2 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors font-geist"
      >
        <Plus className="w-3.5 h-3.5" />
        Add task
      </button>
    </div>
  )
}

export function KanbanBoard() {
  const { tasks, fetchTasks, moveTask, createTask, deleteTask, isLoading } = useTaskStore()
  const aiChatStore = useAIChatStore()
  const { enqueueTask, retryTask, taskStates } = aiChatStore
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set())
  const [showGitFlow, setShowGitFlow] = useState<Task | null>(null)
  const [chatTask, setChatTask] = useState<Task | null>(null)
  const [diffTask, setDiffTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    status: 'todo' as Task['status'],
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const getTasksByStatus = (status: Task['status']) =>
    tasks.filter((task) => task.status === status)

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'low':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current as Task
    setActiveTask(task)
    console.log('Drag started:', task.id, task.status)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) {
      console.log('No drop target')
      return
    }

    const taskId = active.id as string
    const task = tasks.find((t) => t.id === taskId)

    if (!task) {
      console.log('Task not found')
      return
    }

    // Prevent moving tasks that are being processed by AI
    const taskState = taskStates[taskId]
    if (taskState?.status === 'running' || taskState?.status === 'queued') {
      console.log('Cannot move task: AI is currently working on it')
      return
    }

    // Get the column ID from the over id
    const overId = over.id as string
    let newStatus: Task['status']

    if (columns.some((c) => c.id === overId)) {
      // Dropped on a column
      newStatus = overId as Task['status']
    } else {
      // Dropped on a task, get its column
      const overTask = tasks.find((t) => t.id === overId)
      if (!overTask) {
        console.log('Over task not found')
        return
      }
      newStatus = overTask.status
    }

    console.log('Drop:', { taskId, fromStatus: task.status, toStatus: newStatus })

    if (task.status !== newStatus) {
      console.log('Moving task...')
      moveTask(taskId, newStatus)
    }
  }

  // AI Workflow - Queue based
  const handleStartAI = useCallback(async (task: Task) => {
    if (processingTasks.has(task.id)) return

    setProcessingTasks((prev) => new Set(prev).add(task.id))
    
    // Move to in-progress
    await moveTask(task.id, 'in-progress')
    
    // Enqueue task for AI processing
    try {
      await enqueueTask(task.id, task.title, task.description || undefined)
    } catch (error) {
      console.error('Failed to enqueue task:', error)
      setProcessingTasks((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }, [processingTasks, moveTask, enqueueTask])

  // Handle retry for failed tasks
  const handleRetry = useCallback(async (task: Task) => {
    // Move back to in-progress
    await moveTask(task.id, 'in-progress')
    
    // Retry the task
    await retryTask(task.id)
  }, [moveTask, retryTask])

  const handleViewDiff = (task: Task) => {
    setDiffTask(task)
  }

  const handleOpenChat = (task: Task) => {
    setChatTask(task)
  }

  const handleTaskClick = (task: Task) => {
    setDetailTask(task)
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      setDetailTask(null)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const handleCompleteTask = async (task: Task) => {
    setShowGitFlow(task)
  }

  const handleGitComplete = async () => {
    if (showGitFlow) {
      await moveTask(showGitFlow.id, 'done')
      setShowGitFlow(null)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim()) return

    await createTask({
      title: newTask.title,
      description: newTask.description,
      status: newTask.status,
      priority: newTask.priority,
    })

    setNewTask({ title: '', description: '', priority: 'medium', status: 'todo' })
    setShowAddModal(false)
  }

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white font-geist">Board</h2>
          {isLoading && <span className="text-xs text-neutral-500 font-geist">Loading...</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-md transition-colors font-geist border border-white/10"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] rounded-md transition-colors font-geist"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Kanban Board with DnD */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {columns.map((column) => {
            const columnTasks = getTasksByStatus(column.id)

            return (
              <KanbanColumn key={column.id} column={column} tasks={columnTasks}>
                <SortableContext
                  items={columnTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStartAI={handleStartAI}
                      onViewDiff={handleViewDiff}
                      onOpenChat={handleOpenChat}
                      onComplete={handleCompleteTask}
                      onRetry={handleRetry}
                      onClick={handleTaskClick}
                      processingTasks={processingTasks}
                      isTaskStreaming={aiChatStore.isStreaming}
                      taskStates={taskStates}
                      getPriorityColor={getPriorityColor}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            )
          })}
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <div className="bg-[#3c3c3c] rounded-md p-3 border border-white/20 shadow-xl opacity-90 rotate-2">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span
                  className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded border ${getPriorityColor(activeTask.priority)} font-geist`}
                >
                  {activeTask.priority}
                </span>
              </div>
              <h3 className="text-sm font-medium text-neutral-200 font-geist mb-1">
                {activeTask.title}
              </h3>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#252526] rounded-lg border border-white/10 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white font-geist">New Task</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">
                  Title
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  placeholder="Enter task title..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
                  rows={3}
                  placeholder="Enter task description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">
                    Priority
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })
                    }
                    className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">
                    Status
                  </label>
                  <select
                    value={newTask.status}
                    onChange={(e) =>
                      setNewTask({ ...newTask, status: e.target.value as Task['status'] })
                    }
                    className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                  >
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 font-geist transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <TaskImporter isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* Git Push Flow Modal */}
      {showGitFlow && (
        <GitPushFlow task={showGitFlow} onClose={() => setShowGitFlow(null)} onComplete={handleGitComplete} />
      )}

      {/* Task Chat Box */}
      {chatTask && (
        <TaskChatBox 
          task={chatTask} 
          isOpen={true} 
          onClose={() => setChatTask(null)} 
        />
      )}

      {/* Diff Viewer */}
      <DiffViewer
        task={diffTask}
        isOpen={!!diffTask}
        onClose={() => setDiffTask(null)}
      />

      {/* Task Detail Modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          taskState={taskStates[detailTask.id]}
          isOpen={!!detailTask}
          onClose={() => setDetailTask(null)}
          onDelete={handleDeleteTask}
          onStartAI={handleStartAI}
          onOpenChat={handleOpenChat}
          onViewDiff={handleViewDiff}
          onComplete={handleCompleteTask}
          onRetry={handleRetry}
        />
      )}
    </div>
  )
}

// Git Push Flow Component
interface GitPushFlowProps {
  task: Task
  onClose: () => void
  onComplete: () => void
}

function GitPushFlow({ task, onClose, onComplete }: GitPushFlowProps) {
  const [step, setStep] = useState(1)
  const [tag, setTag] = useState('')
  const [commitMsg, setCommitMsg] = useState(`feat: ${task.title}`)

  const steps = [
    { id: 1, label: 'Stage Changes', description: 'Add modified files to staging area' },
    { id: 2, label: 'Commit', description: 'Create commit with message' },
    { id: 3, label: 'Tag', description: 'Add version tag' },
    { id: 4, label: 'Push', description: 'Push to remote repository' },
  ]

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1)
    } else {
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-lg">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white font-geist">Git Workflow: Complete Task</h3>
        </div>

        <div className="p-4 space-y-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-geist ${
                    step > s.id
                      ? 'bg-green-500 text-white'
                      : step === s.id
                        ? 'bg-[#0e639c] text-white'
                        : 'bg-white/10 text-neutral-500'
                  }`}
                >
                  {step > s.id ? '✓' : s.id}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-px ${step > s.id ? 'bg-green-500' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Current Step Content */}
          <div className="bg-[#252526] rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-medium text-white font-geist mb-1">{steps[step - 1].label}</h4>
            <p className="text-xs text-neutral-500 font-geist mb-3">{steps[step - 1].description}</p>

            {step === 2 && (
              <div>
                <label className="block text-xs text-neutral-400 font-geist mb-1">Commit Message</label>
                <textarea
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
                  rows={2}
                />
              </div>
            )}

            {step === 3 && (
              <div>
                <label className="block text-xs text-neutral-400 font-geist mb-1">Version Tag</label>
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="v1.0.0"
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                />
              </div>
            )}

            {step === 4 && (
              <div className="text-xs font-geist text-neutral-400 space-y-1">
                <p>git add .</p>
                <p>git commit -m "{commitMsg}"</p>
                {tag && <p>git tag {tag}</p>}
                <p>git push origin main {tag && '--tags'}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium text-neutral-400 hover:text-white font-geist transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 rounded text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors"
            >
              {step === 4 ? 'Complete' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
