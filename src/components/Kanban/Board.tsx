import { useEffect, useState, useCallback } from 'react'
import { Plus, MoreHorizontal, X, Upload, Play, Loader2, CheckCircle, GitBranch, GitMerge, FileDiff, MessageSquare, RefreshCw, Terminal, FileCode, Trash2, AlertTriangle, Check, Sparkles } from 'lucide-react'
import { useTaskStore, useAIChatStore, useWorkspaceStore, useEngineStore } from '@/store'
import { dbService } from '@/lib/db'
import type { AITaskState } from '@/store/aiChatStore'
import { invoke } from '@tauri-apps/api/core'
import type { Task } from '@/types'
import { TaskImporter } from './TaskImporter'
import { Button } from '@/components/ui/button'
import { TaskChatBox } from '@/components/Chat/TaskChatBox'
import { DiffViewer } from '@/components/DiffViewer/DiffViewer'
import { DescriptionWithFileTag } from '@/components/DescriptionWithFileTag'
import { TaskCreatorChat } from './TaskCreatorChat'
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
  const aiChatStore = useAIChatStore();
  // Use state and effect for reactivity
  const [messages, setMessages] = useState<typeof aiChatStore.messages[string]>([]);
  
  useEffect(() => {
    // Initial load
    setMessages(aiChatStore.getMessages(taskId));
    
    // Subscribe to updates - check every 500ms for new messages
    const interval = setInterval(() => {
      const newMessages = aiChatStore.getMessages(taskId);
      if (newMessages.length !== messages.length || 
          (newMessages.length > 0 && messages.length > 0 && 
           newMessages[newMessages.length - 1].content !== messages[messages.length - 1]?.content)) {
        setMessages(newMessages);
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [taskId, aiChatStore]);
  
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const latestOutput = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
  
  const formatFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  // Get last lines of output for preview
  const getLastOutputLines = () => {
    if (!latestOutput) return [];
    const lines = latestOutput.split('\n');
    return lines.slice(-20); // Last 20 lines
  };

  // Get current action description based on output
  const getCurrentAction = () => {
    if (!latestOutput) return 'Initializing...';
    
    const output = latestOutput.toLowerCase();
    
    // Check for specific actions
    if (output.includes('write') || output.includes('create') || output.includes('modify')) {
      return 'Writing files...';
    }
    if (output.includes('read') || output.includes('analyze') || output.includes('examine')) {
      return 'Analyzing code...';
    }
    if (output.includes('run') || output.includes('execute') || output.includes('install') || output.includes('npm') || output.includes('node')) {
      return 'Running commands...';
    }
    if (output.includes('error') || output.includes('failed') || output.includes('exception')) {
      return 'Error occurred';
    }
    if (output.includes('complete') || output.includes('done') || output.includes('finished')) {
      return 'Completed';
    }
    
    return 'AI is working...';
  };

  return (
    <div className="space-y-3">
      {/* Status Header */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
        <span className="text-xs font-medium text-cyan-400 font-geist">
          {getCurrentAction()}
        </span>
      </div>
      
      {/* Terminal Output View */}
      {(showTerminal || taskState?.status === 'running') && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500 font-geist">Output</span>
            {taskState?.currentFile && (
              <span className="text-xs text-blue-400 font-mono truncate max-w-[150px]">
                {formatFileName(taskState.currentFile)}
              </span>
            )}
          </div>
          <div 
            className="bg-[#0d0d0d] rounded border border-white/5 p-2 font-mono text-xs overflow-y-auto"
            style={{ maxHeight: maxHeight === 'auto' ? '120px' : maxHeight }}
          >
            {latestOutput ? (
              <div className="space-y-0.5">
                <div className="text-yellow-500/70 text-xs mb-1 border-b border-white/5 pb-1">
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
          <p className="text-xs text-neutral-400 font-geist line-clamp-1">
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
  const [actualGitChanges, setActualGitChanges] = useState<string[]>([])
  const [loadingGitChanges, setLoadingGitChanges] = useState(false)
  const { activeWorkspace } = useWorkspaceStore()
  
  useEffect(() => {
    if (!isOpen || !activeWorkspace?.folder_path) return
    
    const stripWorkspacePath = (files: string[]): string[] => {
      const workspacePath = activeWorkspace!.folder_path.replace(/\/$/, '')
      return files.map(file => {
        if (file.startsWith(workspacePath)) {
          return file.replace(workspacePath, '').replace(/^\//, '')
        }
        // Also strip common prefixes like "a/resources/js/app/"
        if (file.includes('/a/resources/js/app/')) {
          return file.split('/a/resources/js/app/').pop() || file
        }
        return file
      })
    }
    
    const fetchGitChanges = async () => {
      setLoadingGitChanges(true)
      try {
        const result = await invoke<{ changed_files: string[] }>('git_get_diff', { 
          cwd: activeWorkspace.folder_path 
        })
        
        if (result && 'changed_files' in result) {
          setActualGitChanges(stripWorkspacePath(result.changed_files))
        } else {
          const stagedResult = await invoke<{ changed_files: string[] }>('git_get_staged_diff', { 
            cwd: activeWorkspace.folder_path 
          })
          if (stagedResult && 'changed_files' in stagedResult) {
            setActualGitChanges(stripWorkspacePath(stagedResult.changed_files))
          } else {
            setActualGitChanges([])
          }
        }
      } catch (err) {
        console.error('Failed to fetch git changes:', err)
        setActualGitChanges([])
      } finally {
        setLoadingGitChanges(false)
      }
    }
    
    fetchGitChanges()
  }, [isOpen, activeWorkspace])
  
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
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
            <h3 className="text-sm font-semibold text-white font-geist">Task Details</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Title */}
          <div>
            <label className="block text-xs text-neutral-500 font-geist mb-1">Title</label>
            <h2 className="text-base font-medium text-white font-geist">{task.title}</h2>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <label className="block text-xs text-neutral-500 font-geist mb-1">Description</label>
              <p className="text-sm text-neutral-300 font-geist whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-500 font-geist mb-1">Status</label>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
                <span className="text-sm text-white font-geist">{getStatusLabel(task.status)}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 font-geist mb-1">Priority</label>
              <span className={`text-sm font-geist capitalize ${
                task.priority === 'high' ? 'text-red-400' :
                task.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'
              }`}>{task.priority}</span>
            </div>
          </div>

          {/* AI Status (if applicable) */}
          {(taskState?.status === 'running' || taskState?.status === 'queued' || taskState?.status === 'error') && (
            <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-3">
              <label className="block text-xs text-yellow-500 font-geist mb-2">AI Processing Status</label>
              <AIActivityIndicator 
                taskId={task.id} 
                taskState={taskState} 
                showTerminal={true}
                maxHeight="200px"
              />
            </div>
          )}

          {/* Actual Git Changes in Workspace */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-neutral-500 font-geist">Actual Workspace Changes</label>
              {loadingGitChanges ? (
                <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
              ) : actualGitChanges.length > 0 ? (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {actualGitChanges.length} file(s)
                </span>
              ) : (
                <span className="text-xs text-neutral-500">0 files</span>
              )}
            </div>
            {actualGitChanges.length > 0 ? (
              <div className="space-y-1 max-h-32 overflow-y-auto bg-green-500/5 rounded-lg p-2">
                {actualGitChanges.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-green-300 font-geist">
                    <FileCode className="w-3 h-3 text-green-400" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
              </div>
            ) : !loadingGitChanges && (
              <div className="text-xs text-neutral-600 italic bg-neutral-500/5 rounded-lg p-2">
                No uncommitted changes found in workspace
              </div>
            )}
          </div>

          {/* AI Extracted Files (may not match) */}
          {taskState?.filesModified && taskState.filesModified.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3 h-3 text-yellow-500" />
                <label className="block text-xs text-yellow-500 font-geist">AI Reported Files</label>
              </div>
              <p className="text-xs text-yellow-500/60 font-geist mb-2 italic">
                These are extracted from AI output - may not match actual changes
              </p>
              <div className="space-y-1 max-h-24 overflow-y-auto bg-yellow-500/5 rounded-lg p-2">
                {taskState.filesModified.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-yellow-300 font-geist">
                    <FileCode className="w-3 h-3 text-yellow-400" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <div>
              <label className="block text-xs text-neutral-500 font-geist mb-1">Created</label>
              <span className="text-xs text-neutral-400 font-geist">{formatDate(task.created_at)}</span>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 font-geist mb-1">Updated</label>
              <span className="text-xs text-neutral-400 font-geist">{formatDate(task.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-white/5 bg-[#252526] shrink-0">
          <div className="flex items-center justify-between">
            {/* Left: Delete Button */}
            <div>
              {!showDeleteConfirm ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-geist">Are you sure?</span>
                  <Button
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isDeleting ? '...' : 'Yes'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Status-specific actions */}
              {task.status === 'todo' && (
                <Button
                  size="sm"
                  onClick={() => {
                    onStartAI(task)
                    onClose()
                  }}
                  className="bg-[#0e639c] hover:bg-[#1177bb]"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start AI
                </Button>
              )}

              {task.status === 'in-progress' && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChat(task)
                    onClose()
                  }}
                  className="bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  View Chat
                </Button>
              )}

              {task.status === 'review' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onViewDiff(task)
                      onClose()
                    }}
                  >
                    <FileDiff className="w-3.5 h-3.5" />
                    View Diff
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onComplete(task)
                      onClose()
                    }}
                    className="bg-[#0e639c] hover:bg-[#1177bb]"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    Merge
                  </Button>
                </>
              )}

              {task.status === 'failed' && (
                <Button
                  size="sm"
                  onClick={() => {
                    onRetry(task)
                    onClose()
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Close
              </Button>
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
      className={`group rounded-lg p-4 transition-all duration-300 border relative ${
        isAIWorking 
          ? 'bg-yellow-500/5 border-yellow-500/20 cursor-not-allowed' 
          : 'bg-app-sidebar/80 hover:bg-app-panel border-app-border cursor-grab active:cursor-grabbing shadow-lg hover:shadow-[0_0_15px_var(--app-accent-glow)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-xs font-medium uppercase px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)} font-geist`}>
          {task.priority}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Action buttons based on status */}
          {task.status === 'todo' && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onStartAI(task)
              }}
              disabled={processingTasks.has(task.id)}
              className="bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50"
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
            <div className="flex items-center -space-x-1 [&>button]:rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 relative z-10"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDiff(task)
                }}
                title="View Diff"
              >
                <FileDiff className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 relative z-10"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenChat(task)
                }}
                title="Chat"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 relative z-10 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                onClick={(e) => {
                  e.stopPropagation()
                  onComplete(task)
                }}
                title="Merge"
              >
                <GitMerge className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {task.status === 'done' && (
            <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 font-geist">
              <CheckCircle className="w-3 h-3" />
              Done
            </div>
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
      <h3 className="text-sm font-medium text-neutral-200 font-geist mb-2 leading-snug">
        {task.title}
      </h3>
      {task.description && (
        <p className="text-xs text-neutral-500 font-geist line-clamp-3 leading-relaxed">
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

      {/* PR Info Badge for Review tasks */}
      {task.status === 'review' && taskStates[task.id]?.prBranch && (
        <div className="mt-2 pt-2 border-t border-green-500/20">
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <GitBranch className="w-3 h-3" />
            <span className="font-mono truncate">{taskStates[task.id].prBranch}</span>
          </div>
          {taskStates[task.id]?.prUrl && (
            <div className="mt-1">
              <a 
                href={taskStates[task.id].prUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-[#0e639c] hover:text-[#1177bb] underline truncate block"
                onClick={(e) => e.stopPropagation()}
              >
                View PR
              </a>
            </div>
          )}
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
  onImport,
}: {
  column: ColumnType
  tasks: Task[]
  children: React.ReactNode
  onAddTask?: () => void
  onImport?: () => void
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
      className="bg-app-panel/40 backdrop-blur-xl border border-app-border rounded-xl flex flex-col w-[380px] shrink-0 h-full overflow-hidden shadow-2xl relative"
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-app-border shrink-0 bg-app-sidebar/50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.color} shadow-[0_0_8px_currentColor]`} />
          <span className="text-xs font-semibold tracking-wider text-app-text font-geist">
            {column.label}
          </span>
          <span className="text-[10px] font-mono text-app-text-muted bg-app-bg px-2 py-0.5 rounded-full border border-app-border">
            {tasks.length}
          </span>
        </div>
        
        {/* TODO Column Actions */}
        {column.id === 'todo' && (
          <div className="flex items-center gap-1">
            {onImport && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onImport}
                title="Import Tasks"
              >
                <Upload className="w-4 h-4" />
              </Button>
            )}
            {onAddTask && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onAddTask}
                title="Add Task"
              >
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

      {/* Tasks */}
      <div className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto">
        {children}
      </div>

      {/* Add Task Button - Only show for TODO column */}
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

export function KanbanBoard() {
  const { tasks, fetchTasks, moveTask, createTask, deleteTask } = useTaskStore()
  const aiChatStore = useAIChatStore()
  const { enqueueTask, retryTask, taskStates } = aiChatStore
  const { activeWorkspace } = useWorkspaceStore()
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showTaskCreator, setShowTaskCreator] = useState(true)
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

  useEffect(() => {
    if (!showAddModal) {
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
      })
    }
  }, [showAddModal])

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
      // Just close the modal, keep task in Review
      // User will manually move to Done after merging
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
    <div className="flex gap-4 h-full">
      {/* Task Creator Panel - Left Sidebar (Fixed, no scroll) */}
      {showTaskCreator && (
        <div className="w-[480px] shrink-0 h-full">
          <TaskCreatorChat onHide={() => setShowTaskCreator(false)} />
        </div>
      )}

      {/* Kanban Board Area (Scrollable) */}
      <div className="flex-1 min-w-0 h-full overflow-auto">
        {!showTaskCreator && (
          <div className="px-4 py-2 border-b border-white/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTaskCreator(true)}
              className="h-7 px-2 text-xs"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1" />
              Show Task Creator
            </Button>
          </div>
        )}
        {/* Kanban Columns with DnD */}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-5 pb-4 min-w-max">
          {columns.map((column) => {
            const columnTasks = getTasksByStatus(column.id)

            return (
              <KanbanColumn 
                key={column.id} 
                column={column} 
                tasks={columnTasks} 
                onAddTask={() => setShowAddModal(true)}
                onImport={() => setShowImportModal(true)}
              >
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
                    className={`text-xs font-medium uppercase px-1.5 py-0.5 rounded border ${getPriorityColor(activeTask.priority)} font-geist`}
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAddModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
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
                  <span className="text-neutral-600 ml-1">(type @ to tag files)</span>
                </label>
                <DescriptionWithFileTag
                  value={newTask.description}
                  onChange={(desc) => setNewTask({ ...newTask, description: desc })}
                  workspacePath={activeWorkspace?.folder_path}
                  rows={3}
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#0e639c] hover:bg-[#1177bb]"
                >
                  Create Task
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <TaskImporter isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* Git Push Flow Modal */}
      {showGitFlow && (
        <GitPushFlow 
          task={showGitFlow} 
          taskState={taskStates[showGitFlow.id]} 
          onClose={() => setShowGitFlow(null)} 
          onComplete={handleGitComplete} 
        />
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
        workspacePath={activeWorkspace?.folder_path}
        taskState={diffTask ? taskStates[diffTask.id] : null}
        prBranch={diffTask?.pr_branch}
        onDiscard={() => {
          if (diffTask) {
            useTaskStore.getState().moveTask(diffTask.id, 'todo')
            setDiffTask(null)
          }
        }}
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
    </div>
  )
}

// Git Workflow Component
interface GitPushFlowProps {
  task: Task
  taskState?: AITaskState
  onClose: () => void
  onComplete: () => void
}

function GitPushFlow({ task, taskState, onClose }: GitPushFlowProps) {
  const [commitMsg, setCommitMsg] = useState(`feat: ${task.title}`)
  const [changedFiles, setChangedFiles] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [targetBranch, setTargetBranch] = useState('rdev')
  const [remoteName, setRemoteName] = useState('origin')
  const [tag, setTag] = useState('')
  const [tagType, setTagType] = useState<'patch' | 'minor' | 'major'>('patch')
  const [createTag, setCreateTag] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUserEdited, setIsUserEdited] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(taskState?.prUrl || null)
  const prBranch = taskState?.prBranch || null
  const [isPRCreated, setIsPRCreated] = useState(!!taskState?.prBranch)
  const [isMerged, setIsMerged] = useState(taskState?.isMerged || false) // Track if PR has been merged
  const [mergeSourceBranch, setMergeSourceBranch] = useState(taskState?.mergeSourceBranch || '') // Branch to merge from
  const { activeWorkspace } = useWorkspaceStore()
  const [singleMerge, setSingleMerge] = useState(true) // Single merge mode - only merge to target

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const runGit = async (args: string[]): Promise<{ success: boolean; output: string }> => {
    return invoke<{ success: boolean; output: string }>('run_shell_command', {
      command: 'git',
      args,
      cwd: activeWorkspace?.folder_path || ''
    })
  }

  useEffect(() => {
    if (!activeWorkspace?.folder_path) return
    
    const fetchGitInfo = async () => {
      try {
        // If there's a PR branch, use it as current branch
        if (taskState?.prBranch) {
          setCurrentBranch(taskState.prBranch)
        } else {
          const branchResult = await runGit(['branch', '--show-current'])
          if (branchResult.success) {
            setCurrentBranch(branchResult.output.trim())
          }
        }

        const remoteResult = await runGit(['remote'])
        if (remoteResult.success && remoteResult.output.trim()) {
          setRemoteName(remoteResult.output.trim().split('\n')[0])
        }

        const branchesResult = await invoke<{ current: string; local: string[]; remote: string[] }>('git_get_branches', { 
          cwd: activeWorkspace.folder_path 
        })
        if (branchesResult?.remote) {
          const allBranches = branchesResult.remote
            .map(b => b.replace(/^[^/]+\//, ''))
            .filter(b => b && !b.includes('HEAD'))
          setRemoteBranches([...new Set(allBranches)])
          
          const hasRdev = allBranches.find(b => b.includes('rdev'))
          const hasDev = allBranches.find(b => b.includes('development'))
          if (hasRdev) setTargetBranch(hasRdev)
          else if (hasDev) setTargetBranch(hasDev)
          else if (allBranches.length > 0) setTargetBranch(allBranches[0])
        }

        // Get changed files - from PR diff if PR exists, otherwise from local
        let files: string[] = []
        if (prBranch) {
          // Fetch files from PR diff
          try {
            const prDiffResult = await invoke<{ changed_files: string[]; diff: string }>('git_get_pr_diff', { 
              cwd: activeWorkspace.folder_path,
              branch: prBranch
            })
            if (prDiffResult?.changed_files?.length > 0) {
              files = prDiffResult.changed_files
            }
          } catch (e) {
            console.log('[GitPushFlow] Failed to get PR diff:', e)
          }
        }
        
        // Fallback to local diff if no PR files
        if (files.length === 0) {
          const diffResult = await invoke<{ changed_files: string[] }>('git_get_diff', { 
            cwd: activeWorkspace.folder_path 
          })
          if (diffResult?.changed_files?.length > 0) {
            files = diffResult.changed_files
          } else {
            const stagedResult = await invoke<{ changed_files: string[] }>('git_get_staged_diff', { 
              cwd: activeWorkspace.folder_path 
            })
            files = stagedResult?.changed_files || []
          }
        }
        setChangedFiles(files)

        const currentTag = await getCurrentTag()
        setTag(calculateNextTag(currentTag, tagType))
      } catch (err) {
        console.error('Failed to fetch git info:', err)
        setChangedFiles([])
      }
    }
    fetchGitInfo()
  }, [activeWorkspace])

  const cleanFilePath = (file: string): string => {
    let cleaned = file
    if (activeWorkspace?.folder_path) {
      cleaned = cleaned.replace(activeWorkspace.folder_path, '')
    }
    cleaned = cleaned.replace(/^[a-z]\/resources\/js\/app\//i, '/')
    cleaned = cleaned.replace(/^\//, '')
    return cleaned
  }

  const getCurrentTag = async (): Promise<string | null> => {
    // Get latest tag from target branch
    const result = await runGit(['ls-remote', '--tags', remoteName, targetBranch])
    if (result.success && result.output.trim()) {
      const tags = result.output.trim().split('\n')
        .map(line => line.split('refs/tags/')[1])
        .filter(tag => tag && tag.startsWith('alpha.'))
        .sort((a, b) => {
          const aMatch = a.match(/alpha\.(\d+)\.(\d+)\.(\d+)/)
          const bMatch = b.match(/alpha\.(\d+)\.(\d+)\.(\d+)/)
          if (!aMatch || !bMatch) return 0
          const aVer = [aMatch[1], aMatch[2], aMatch[3]].map(Number)
          const bVer = [bMatch[1], bMatch[2], bMatch[3]].map(Number)
          for (let i = 0; i < 3; i++) {
            if (aVer[i] !== bVer[i]) return bVer[i] - aVer[i]
          }
          return 0
        })
      if (tags.length > 0) return tags[0]
    }
    // Fallback: local tags
    const localResult = await runGit(['tag', '--list', 'alpha.*', '--sort=-v:refname'])
    if (localResult.success && localResult.output.trim()) {
      return localResult.output.trim().split('\n')[0]
    }
    return null
  }

  const calculateNextTag = (currentTag: string | null, type: 'patch' | 'minor' | 'major'): string => {
    if (!currentTag) return 'alpha.0.0.1'
    
    const match = currentTag.match(/alpha\.(\d+)\.(\d+)\.(\d+)/)
    if (!match) return 'alpha.0.0.1'
    
    let [, major, minor, patch] = match.map(Number)
    
    if (type === 'major') {
      major += 1
      minor = 0
      patch = 0
    } else if (type === 'minor') {
      minor += 1
      patch = 0
    } else {
      patch += 1
    }
    
    return `alpha.${major}.${minor}.${patch}`
  }

  const generateCommitMessage = async (isManualRegenerate = false) => {
    const engine = useEngineStore.getState().activeEngine
    if (!engine || !activeWorkspace?.folder_path) return
    
    setIsGenerating(true)
    try {
      // Use Tauri backend command for faster response
      const result = await invoke<{ message: string; success: boolean }>('generate_commit_message', {
        model: engine.model || 'llama3.2',
        files: changedFiles,
        cwd: activeWorkspace.folder_path,
      })

      if (result.success && result.message) {
        let generatedMsg = result.message.trim()
        if (generatedMsg.length > 72) {
          generatedMsg = generatedMsg.substring(0, 69) + '...'
        }
        if (generatedMsg) {
          setCommitMsg(generatedMsg)
          if (!isManualRegenerate) {
            setIsUserEdited(false)
          }
        }
      }
    } catch (err) {
      console.error('Failed to generate commit message:', err)
      // Fallback to manual message
      if (changedFiles.length > 0) {
        setCommitMsg(`feat: update ${changedFiles.length} files`)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    const hasEngine = !!useEngineStore.getState().activeEngine
    if (changedFiles.length > 0 && !isUserEdited && !isGenerating && hasEngine) {
      generateCommitMessage()
    }
  }, [changedFiles.length, isUserEdited, isGenerating])

  // Update tag when type changes
  useEffect(() => {
    const updateTag = async () => {
      const currentTag = await getCurrentTag()
      setTag(calculateNextTag(currentTag, tagType))
    }
    updateTag()
  }, [tagType])

  const createPR = async () => {
    if (!activeWorkspace?.folder_path) return

    setLoading(true)
    setError(null)
    setLogs([])

    try {
      addLog('Starting PR workflow...')

      // Step 1: Stage and commit
      addLog('Staging changes...')
      const addResult = await runGit(['add', '.'])
      if (!addResult.success) throw new Error(`git add failed: ${addResult.output}`)
      addLog('✓ Changes staged')

      // Commit
      addLog(`Creating commit: "${commitMsg}"`)
      const commitResult = await runGit(['commit', '-m', commitMsg])
      if (!commitResult.success) throw new Error(`git commit failed: ${commitResult.output}`)
      addLog('✓ Commit created')

      // Push branch
      addLog(`Pushing branch: ${currentBranch}`)
      const pushResult = await runGit(['push', '-u', remoteName, currentBranch])
      if (!pushResult.success) throw new Error(`git push failed: ${pushResult.output}`)
      addLog('✓ Branch pushed')

      // Create PR (try GitHub CLI first, then GitLab)
      addLog('Creating PR...')
      
      // Try gh CLI
      let prResult = await runGit(['config', '--global', 'gh.prompt', 'false'])
      if (prResult.success) {
        // Check if gh is authenticated
        const ghCheck = await runGit(['auth', 'status'])
        if (ghCheck.success) {
          const prCreateResult = await runGit([
            'pr', 'create',
            '--base', targetBranch,
            '--title', commitMsg,
            '--body', `Task: ${task.title}\n\nAutomated PR from Akira`
          ])
          if (prCreateResult.success) {
            setPrUrl(prCreateResult.output.trim())
            addLog(`✓ PR created: ${prCreateResult.output.trim()}`)
          }
        }
      }

      // Fallback: show manual PR instructions
      if (!prUrl) {
        addLog('Note: No GitHub/GitLab CLI detected')
        addLog(`Create PR manually: ${currentBranch} → ${targetBranch}`)
      }

      addLog('✓ PR created! Click Merge when ready.')
      setIsPRCreated(true)
      setLoading(false)

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      addLog(`✗ Error: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const executeMerge = async () => {
    if (!activeWorkspace?.folder_path) return

    setLoading(true)
    setError(null)
    setLogs([])

    // Determine which branch to merge from:
    // - If already merged: use mergeSourceBranch (e.g., rdev)
    // - If PR created: use PR branch
    // - Otherwise: use currentBranch
    let branchToMerge: string
    
    if (isMerged && mergeSourceBranch) {
      branchToMerge = mergeSourceBranch
      addLog(`Merging from: source branch (${mergeSourceBranch})`)
    } else if (prBranch) {
      branchToMerge = prBranch
      addLog(`Merging from: PR branch (${prBranch})`)
    } else {
      branchToMerge = currentBranch
      addLog(`Merging from: current branch (${currentBranch})`)
    }

    try {
      addLog(`Starting ${singleMerge ? 'single' : 'double'} merge: ${branchToMerge} → ${targetBranch}...`)

      // Step 1: Merge to target branch (e.g., rdev)
      addLog(`Merging to ${targetBranch}...`)
      const merge1Result = await runGit(['checkout', targetBranch])
      if (!merge1Result.success) throw new Error(`checkout ${targetBranch} failed: ${merge1Result.output}`)
      
      const pull1Result = await runGit(['pull', remoteName, targetBranch])
      if (!pull1Result.success) addLog(`Pull warning: ${pull1Result.output}`)
      
      const mergeResult = await runGit(['merge', branchToMerge, '--no-ff', '-m', `Merge ${branchToMerge} into ${targetBranch}`])
      if (!mergeResult.success) throw new Error(`merge to ${targetBranch} failed: ${mergeResult.output}`)
      addLog(`✓ Merged ${branchToMerge} into ${targetBranch}`)

      const push1Result = await runGit(['push', remoteName, targetBranch])
      if (!push1Result.success) throw new Error(`push ${targetBranch} failed: ${push1Result.output}`)
      addLog(`✓ Pushed ${targetBranch}`)

      // Step 2: Only do second merge if not single merge mode
      if (!singleMerge) {
        const mainBranch = remoteBranches.find(b => 
          b.includes('main') || b.includes('master') || b.includes('production')
        ) || 'development'
        
        addLog(`Merging to ${mainBranch}...`)
        const checkoutDevResult = await runGit(['checkout', mainBranch])
        if (!checkoutDevResult.success) throw new Error(`checkout ${mainBranch} failed: ${checkoutDevResult.output}`)
        
        const pullDevResult = await runGit(['pull', remoteName, mainBranch])
        if (!pullDevResult.success) addLog(`Pull warning: ${pullDevResult.output}`)
        
        const mergeDevResult = await runGit(['merge', targetBranch, '--no-ff', '-m', `Merge ${targetBranch} into ${mainBranch}`])
        if (!mergeDevResult.success) throw new Error(`merge to ${mainBranch} failed: ${mergeDevResult.output}`)
        addLog(`✓ Merged into ${mainBranch}`)

        addLog(`Pushing ${mainBranch}...`)
        const pushDevResult = await runGit(['push', remoteName, mainBranch])
        if (!pushDevResult.success) throw new Error(`push ${mainBranch} failed: ${pushDevResult.output}`)
        addLog(`✓ Pushed ${mainBranch}`)
      }

      // Create tag only if checkbox is checked
      if (createTag) {
        const calculatedTag = calculateNextTag(await getCurrentTag(), tagType)
        addLog(`Creating tag: ${calculatedTag}`)
        const tagResult = await runGit(['tag', '-a', calculatedTag, '-m', `Release ${calculatedTag}`])
        if (!tagResult.success) throw new Error(`tag failed: ${tagResult.output}`)
        addLog(`✓ Tag created: ${calculatedTag}`)

        const pushTagsResult = await runGit(['push', remoteName, '--tags'])
        if (!pushTagsResult.success) addLog(`Push tags warning: ${pushTagsResult.output}`)
        addLog(`✓ Tags pushed`)
        addLog(`✓ Version: ${calculatedTag}`)
      }
      addLog(createTag ? `✓ ${singleMerge ? 'Merge' : 'Double merge'} and tag completed!` : `✓ ${singleMerge ? 'Merge' : 'Double merge'} completed!`)
      
      // After successful merge, update state
      if (isPRCreated) {
        setIsMerged(true)
        setIsPRCreated(false) // PR is now merged
        
        // Save merge state to database
        try {
          await dbService.updateTaskMergeInfo(task.id, true, prBranch || null)
          addLog(`✓ Merge state saved to database`)
        } catch (e) {
          console.error('Failed to save merge state to database:', e)
        }
        
        // Delete the PR branch after successful merge
        if (prBranch) {
          addLog(`Deleting PR branch: ${prBranch}`)
          const deleteBranch = await runGit(['branch', '-d', prBranch])
          if (deleteBranch.success) {
            addLog(`✓ PR branch deleted locally`)
          } else {
            // Try force delete if branch wasn't fully merged
            const forceDelete = await runGit(['branch', '-D', prBranch])
            if (forceDelete.success) {
              addLog(`✓ PR branch force deleted locally`)
            } else {
              addLog(`⚠ Failed to delete local branch: ${deleteBranch.output}`)
            }
          }
          
          // Also try to delete the remote branch
          const deleteRemote = await runGit(['push', 'origin', '--delete', prBranch])
          if (deleteRemote.success) {
            addLog(`✓ PR branch deleted from remote`)
          } else {
            addLog(`⚠ Remote branch delete skipped: ${deleteRemote.output}`)
          }
        }
      }
      
      // Checkout to target branch after merge
      const checkoutBack = await runGit(['checkout', targetBranch])
      if (checkoutBack.success) {
        setCurrentBranch(targetBranch)
        setMergeSourceBranch(targetBranch) // Source for next merge is now the target
        addLog(`✓ Switched to ${targetBranch}`)
      }
      
      setLoading(false)

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      addLog(`✗ Error: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white font-geist">Git Workflow</h3>
          <p className="text-xs text-neutral-500 font-geist mt-0.5">{task.title}</p>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* PR Created Banner */}
          {isPRCreated && prBranch && !isMerged && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-400 font-geist font-medium">PR Created</span>
              </div>
              <p className="text-xs text-neutral-400 font-geist mt-1">
                Branch: <span className="text-white font-mono">{prBranch}</span>
              </p>
              {prUrl && (
                <p className="text-xs text-[#0e639c] font-geist mt-1">
                  {prUrl}
                </p>
              )}
            </div>
          )}

          {/* Merged Banner */}
          {isMerged && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-blue-400 font-geist font-medium">PR Merged</span>
              </div>
              <p className="text-xs text-neutral-400 font-geist mt-1">
                {prBranch} → {targetBranch}
              </p>
              <p className="text-xs text-blue-400 font-geist mt-1">
                ✓ Branch {targetBranch} sekarang mengandung perubahan task ini
              </p>
            </div>
          )}

          {/* Branch Info */}
          <div className="space-y-2 text-xs">
            {isMerged ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 shrink-0 w-14">Source:</span>
                  <select
                    value={mergeSourceBranch}
                    onChange={(e) => setMergeSourceBranch(e.target.value)}
                    className="bg-[#3c3c3c] text-white text-xs px-2 py-1 rounded border border-white/10 flex-1"
                  >
                    {remoteBranches.filter(b => b !== targetBranch).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 shrink-0 w-14">Target:</span>
                  <span className="text-white font-mono truncate bg-[#252526] px-2 py-1 rounded flex-1" title={targetBranch}>
                    {targetBranch}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 shrink-0 w-14">Branch:</span>
                  <span className="text-white font-mono truncate bg-[#252526] px-2 py-1 rounded flex-1" title={currentBranch}>
                    {currentBranch}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const branchResult = await runGit(['branch', '--show-current'])
                      if (branchResult.success) {
                        setCurrentBranch(branchResult.output.trim())
                        setMergeSourceBranch(branchResult.output.trim())
                      }
                    }}
                    className="text-[#0e639c] hover:text-[#1177bb]"
                  >
                    ↻ Refresh
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 shrink-0 w-14">Current:</span>
                  <span className="text-white font-mono truncate bg-[#252526] px-2 py-1 rounded flex-1" title={currentBranch}>
                    {currentBranch || '...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 shrink-0 w-14">Target:</span>
                  <select
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    className="bg-[#3c3c3c] text-white text-xs px-2 py-1 rounded border border-white/10 flex-1"
                  >
                    {remoteBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-neutral-500 font-geist">Double merge</span>
                    <input
                      type="checkbox"
                      checked={!singleMerge}
                      onChange={(e) => setSingleMerge(!e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-500 bg-[#3c3c3c] text-[#0e639c] focus:ring-[#0e639c]"
                    />
                  </label>
                  <span className="text-xs text-yellow-500 font-geist">
                    {!singleMerge ? 'Merge to target + main' : 'Merge to target only'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Changed Files */}
          <div>
            <label className="block text-xs text-neutral-400 font-geist mb-2">
              Files to commit ({changedFiles.length})
            </label>
            {changedFiles.length > 0 ? (
              <div className="bg-[#252526] rounded-lg p-3 border border-white/5 max-h-28 overflow-y-auto">
                {changedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-green-300 font-mono group">
                    <span className="text-green-500">+</span>
                    <span className="truncate" title={file}>{cleanFilePath(file)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#252526] rounded-lg p-3 border border-white/5 text-xs text-neutral-500 italic">
                No changes to commit
              </div>
            )}
          </div>

          {/* Commit Message */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-neutral-400 font-geist">Commit Message</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generateCommitMessage(true)}
                disabled={isGenerating || !useEngineStore.getState().activeEngine}
                className="text-[#0e639c] hover:text-[#1177bb]"
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Regenerate
              </Button>
            </div>
            <textarea
              value={commitMsg}
              onChange={(e) => {
                setCommitMsg(e.target.value)
                setIsUserEdited(true)
              }}
              className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
              rows={2}
              disabled={loading}
              placeholder="Enter commit message..."
            />
          </div>

          {/* Version Tag */}
          <div className={createTag ? '' : 'opacity-50'}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-neutral-400 font-geist">Version Tag</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createTag}
                  onChange={(e) => setCreateTag(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-500 bg-[#3c3c3c] text-[#0e639c] focus:ring-[#0e639c]"
                />
                <span className="text-xs text-neutral-400 font-geist">Create tag after merge</span>
              </label>
            </div>
            <div className="flex gap-2">
              <div className="flex gap-1">
                {(['patch', 'minor', 'major'] as const).map(type => (
                  <Button
                    key={type}
                    size="sm"
                    onClick={() => setTagType(type)}
                    disabled={!createTag}
                    className={tagType === type ? 'bg-[#0e639c]' : 'bg-[#3c3c3c]'}
                  >
                    {type}
                  </Button>
                ))}
              </div>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="flex-1 px-3 py-1 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist font-mono"
                disabled={loading || !createTag}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-400 font-geist">{error}</p>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <div>
              <label className="block text-xs text-neutral-400 font-geist mb-1">Output</label>
              <div className="bg-black rounded-lg p-3 border border-white/5 max-h-40 overflow-y-auto">
                {logs.map((log, idx) => (
                  <p key={idx} className={`text-xs font-mono ${
                    log.includes('✓') ? 'text-green-400' : 
                    log.includes('✗') ? 'text-red-400' : 
                    'text-neutral-300'
                  }`}>
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-white/5 flex justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {isPRCreated ? 'Close' : 'Cancel'}
          </Button>
          <div className="flex gap-2">
            {!isPRCreated && (
              <Button
                onClick={createPR}
                disabled={loading || changedFiles.length === 0}
                className="bg-[#238636] hover:bg-[#2ea043]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitBranch className="w-4 h-4" />
                )}
                Create PR
              </Button>
            )}
            <Button
              onClick={executeMerge}
              disabled={loading || changedFiles.length === 0}
              className="bg-[#0e639c] hover:bg-[#1177bb]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GitMerge className="w-4 h-4" />
              )}
              Merge
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
