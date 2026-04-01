import { useState, useEffect } from 'react'
import { X, Play, MessageSquare, FileDiff, GitMerge, RefreshCw, FileCode, Trash2, AlertTriangle, Check, Loader2, Pencil, Save } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore, useTaskStore } from '@/store'
import type { Task } from '@/types'
import type { AITaskState } from '@/store/aiChatStore'
import { Button } from '@/components/ui/button'
import { AIActivityIndicator } from './AIActivityIndicator'
import { STATUS_COLORS, STATUS_LABELS } from './constants'

interface TaskDetailModalProps {
  task: Task
  taskState: AITaskState | undefined
  isOpen: boolean
  onClose: () => void
  onDelete: (taskId: string) => void
  onUpdate: (task: Task) => void
  onStartAI: (task: Task) => void
  onOpenChat: (task: Task) => void
  onViewDiff: (task: Task) => void
  onComplete: (task: Task) => void
  onRetry: (task: Task) => void
}

export function TaskDetailModal({ 
  task, 
  taskState, 
  isOpen, 
  onClose, 
  onDelete,
  onUpdate,
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
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDescription, setEditDescription] = useState(task.description || '')
  const [editPriority, setEditPriority] = useState<Task['priority']>(task.priority)
  const [isSaving, setIsSaving] = useState(false)
  const { activeWorkspace } = useWorkspaceStore()
  const { updateTask } = useTaskStore()

  useEffect(() => {
    setEditTitle(task.title)
    setEditDescription(task.description || '')
    setEditPriority(task.priority)
  }, [task])

  useEffect(() => {
    if (!isOpen || !activeWorkspace?.folder_path) return

    const stripWorkspacePath = (files: string[]): string[] => {
      const workspacePath = activeWorkspace!.folder_path.replace(/\/$/, '')
      return files.map(file => {
        if (file.startsWith(workspacePath)) {
          return file.replace(workspacePath, '').replace(/^\//, '')
        }
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

  const handleSave = async () => {
    if (!editTitle.trim()) return
    setIsSaving(true)
    try {
      await updateTask(task.id, editTitle.trim(), editDescription.trim() || null, editPriority)
      onUpdate({
        ...task,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
      })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update task:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditTitle(task.title)
    setEditDescription(task.description || '')
    setEditPriority(task.priority)
    setIsEditing(false)
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

  const getPriorityColorClass = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-400'
      case 'medium': return 'text-yellow-400'
      case 'low': return 'text-green-400'
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-app-panel rounded-lg border border-app-border shadow-2xl w-full max-w-lg max-h-[85%] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status]}`} />
            <h3 className="text-sm font-semibold text-white font-geist">Task Details</h3>
          </div>
          <div className="flex items-center gap-1">
            {task.status === 'todo' && !isEditing && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-7 px-2">
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {isEditing ? (
            <>
              <div>
                <label className="block text-xs text-neutral-500 font-geist mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm bg-app-sidebar text-white placeholder-white/40 border border-app-border focus:outline-none focus:border-app-accent font-geist"
                  placeholder="Enter task title..."
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 font-geist mb-1">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm bg-app-sidebar text-white placeholder-white/40 border border-app-border focus:outline-none focus:border-app-accent font-geist resize-none"
                  rows={4}
                  placeholder="Enter task description..."
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 font-geist mb-1">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Task['priority'])}
                  className="w-full px-3 py-2 rounded text-sm bg-app-sidebar text-white border border-app-border focus:outline-none focus:border-app-accent font-geist"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-neutral-500 font-geist mb-1">Title</label>
                <h2 className="text-base font-medium text-white font-geist">{task.title}</h2>
              </div>

              {task.description && (
                <div>
                  <label className="block text-xs text-neutral-500 font-geist mb-1">Description</label>
                  <p className="text-sm text-neutral-300 font-geist whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-500 font-geist mb-1">Status</label>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status]}`} />
                    <span className="text-sm text-white font-geist">{STATUS_LABELS[task.status]}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 font-geist mb-1">Priority</label>
                  <span className={`text-sm font-geist capitalize ${getPriorityColorClass(task.priority)}`}>
                    {task.priority}
                  </span>
                </div>
              </div>
            </>
          )}

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

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-app-border">
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

        <div className="px-4 py-3 border-t border-app-border bg-app-panel shrink-0">
          <div className="flex items-center justify-between">
            {isEditing ? (
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving || !editTitle.trim()} className="bg-app-accent hover:bg-app-accent-hover">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <>
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
                      <Button size="sm" onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                        {isDeleting ? '...' : 'Yes'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {task.status === 'todo' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onStartAI(task)
                        onClose()
                      }}
                      className="bg-app-accent hover:bg-app-accent-hover"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start AI
                    </Button>
                  )}

                  {task.status === 'in-progress' && (
                    <>
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
                      {taskState?.status === 'completed' && (
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
                      )}
                    </>
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
                        className="bg-app-accent hover:bg-app-accent-hover"
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

                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}