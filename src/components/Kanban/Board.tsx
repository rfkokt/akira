import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTaskStore, useAIChatStore, useWorkspaceStore } from '@/store'
import type { Task } from '@/types'
import { TaskImporter } from './TaskImporter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskChatBox } from '@/components/Chat/TaskChatBox'
import { DiffViewer } from '@/components/DiffViewer/DiffViewer'
import { DescriptionWithFileTag } from '@/components/DescriptionWithFileTag'
import { TaskCard } from './TaskCard'
import { TaskDetailModal } from './TaskDetailModal'
import { CodeReviewModal } from './CodeReviewModal'
import { GitPushFlow } from '@/components/AI/AIWorkflowPanel'
import { KanbanColumn } from './KanbanColumn'
import { COLUMNS, PRIORITY_COLORS } from './constants'
import { autoCreatePR } from '@/lib/git'
import { invoke } from '@tauri-apps/api/core'
import { dbService } from '@/lib/db'
import { notify } from '@/lib/notify'
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
} from '@dnd-kit/sortable'

export function KanbanBoard() {
  const { tasks, fetchTasks, moveTask, createTask, deleteTask } = useTaskStore()
  const aiChatStore = useAIChatStore()
  const { enqueueTask, retryTask, taskStates } = aiChatStore
  const { activeWorkspace } = useWorkspaceStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set())
  const [mergeLoadingTasks, setMergeLoadingTasks] = useState<Set<string>>(new Set())
  const [chatTask, setChatTask] = useState<Task | null>(null)
  const [diffTask, setDiffTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [reviewModalTask, setReviewModalTask] = useState<Task | null>(null)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    status: 'todo' as Task['status'],
  })

  // Start AI Branch Context
  const [availableBranches, setAvailableBranches] = useState<string[]>([])
  const [isRefreshingBranches, setIsRefreshingBranches] = useState(false)

  const fetchBranches = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return
    setIsRefreshingBranches(true)
    try {
      // First, silently fetch from origin to get the actual latest branches
      await invoke('run_shell_command', {
        command: 'git',
        args: ['fetch', '--prune'],
        cwd: activeWorkspace.folder_path
      }).catch(() => {})

      const result = await invoke<{success: boolean, stdout: string}>('run_shell_command', {
        command: 'git',
        args: ['branch', '-a', '--format=%(refname:short)'],
        cwd: activeWorkspace.folder_path
      })
      if (result.success) {
        const rawBranches = result.stdout.trim().split('\n').filter(Boolean)
        const cleanSet = new Set<string>()
        
        rawBranches.forEach(b => {
           if (b.includes('HEAD') || b.startsWith('akira/')) return
           const cleanName = b.replace(/^origin\//, '')
           if (!cleanName.startsWith('akira/')) {
             cleanSet.add(cleanName)
           }
        })
        
        // Put main/master/development at the top
        const branches = Array.from(cleanSet).sort((a, b) => {
          const isA_main = ['main', 'master', 'development'].includes(a)
          const isB_main = ['main', 'master', 'development'].includes(b)
          if (isA_main && !isB_main) return -1
          if (!isA_main && isB_main) return 1
          return a.localeCompare(b)
        })
        
        setAvailableBranches(branches)
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err)
    } finally {
      setIsRefreshingBranches(false)
    }
  }, [activeWorkspace?.folder_path])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (!showAddModal) {
      setNewTask({ title: '', description: '', priority: 'medium', status: 'todo' })
    }
  }, [showAddModal])

  const getTasksByStatus = (status: Task['status']) =>
    tasks.filter((task) => task.status === status)

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current as Task
    setActiveTask(task)
  }

  const handleManualPRCreation = useCallback(async (task: Task, workspacePath: string) => {
    setProcessingTasks((prev) => new Set(prev).add(task.id))
    
    try {
      // For revisions after merge, use merged_to_branch as base
      const baseBranch = task.is_merged ? task.merged_to_branch || undefined : undefined
      
      if (baseBranch) {
        console.log(`[Board] Creating revision PR for ${task.id} from base branch: ${baseBranch}`)
      }
      
      // Create PR for manually moved task (with timeout to prevent hangs)
      const PR_TIMEOUT_MS = 60_000; // 60 seconds
      const prPromise = autoCreatePR(task.id, task.title, workspacePath, { baseBranch })
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), PR_TIMEOUT_MS))
      const prResult = await Promise.race([prPromise, timeoutPromise])
      
      if (prResult === null) {
        console.warn(`[Board] autoCreatePR timed out after ${PR_TIMEOUT_MS / 1000}s for task ${task.id}`)
      }
      
      // Capture diff snapshot with cumulative history
      if (prResult?.branch && prResult?.baseBranch) {
        try {
          const diffResult = await invoke<{ diff: string; has_changes: boolean }>
            ('git_get_branch_diff', { 
              cwd: workspacePath, 
              baseBranch: prResult.baseBranch, 
              headBranch: prResult.branch 
            })
          if (diffResult.has_changes) {
            // Get existing diff for cumulative history
            const existingTask = tasks.find(t => t.id === task.id)
            const existingDiff = existingTask?.diff_content || ''
            
            let combinedDiff = ''
            if (existingDiff && existingDiff.trim()) {
              const timestamp = new Date().toISOString()
              combinedDiff = `${existingDiff}\n\n${'='.repeat(60)}\n[REVISION ${timestamp}]\n${'='.repeat(60)}\n\n${diffResult.diff}`
            } else {
              combinedDiff = diffResult.diff
            }
            
            const diffLastCapturedAt = new Date().toISOString()
            await dbService.updateTaskDiffInfo(task.id, combinedDiff, diffLastCapturedAt)
            await fetchTasks()
            
            console.log(`[Board] Manual PR diff captured for ${task.id}: ${diffResult.diff.length} chars new, ${combinedDiff.length} chars total`)
          }
        } catch (e) {
          console.error('[Board] Failed to capture diff:', e)
        }
      }

      // Show notification
      if (prResult?.prUrl) {
        const isRealPR = !prResult.prUrl.includes('/compare/')
        if (isRealPR) {
          await notify('PR Created! ✅', `"${task.title}" - PR auto-created: ${prResult.prUrl}`)
        } else {
          await notify('Branch Pushed! ✅', `"${task.title}" - Branch \`${prResult.branch}\` pushed. Click to create PR.`)
        }
      } else if (prResult?.error) {
        await notify('Branch Created (Push Failed)', `"${task.title}" - Branch \`${prResult.branch}\` created locally but push failed.`)
      } else {
        await notify('Task Moved to Review', `"${task.title}" moved to review. PR creation skipped.`)
      }

      // Update AI chat store with PR info
      if (prResult) {
        useAIChatStore.setState({
          taskStates: {
            ...useAIChatStore.getState().taskStates,
            [task.id]: {
              ...(useAIChatStore.getState().taskStates[task.id] || {
                status: 'completed',
                startTime: null,
                endTime: null,
                errorMessage: null,
                lastResponse: null,
                queuePosition: null,
                currentFile: null,
                filesModified: [],
                toolCalls: [],
              }),
              prBranch: prResult.branch,
              prUrl: prResult.prUrl,
              prCreatedAt: Date.now(),
            }
          }
        })
      }
    } catch (error) {
      console.error('[Board] Manual PR creation failed:', error)
      await notify('PR Creation Failed', `"${task.title}" - Could not create PR. Check git configuration.`)
    } finally {
      setProcessingTasks((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }, [fetchTasks])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const taskId = active.id as string
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const taskState = taskStates[taskId]
    if (taskState?.status === 'running' || taskState?.status === 'queued') return

    const overId = over.id as string
    let newStatus: Task['status']

    if (COLUMNS.some((c) => c.id === overId)) {
      newStatus = overId as Task['status']
    } else {
      const overTask = tasks.find((t) => t.id === overId)
      if (!overTask) return
      newStatus = overTask.status
    }

    if (task.status !== newStatus) {
      await moveTask(taskId, newStatus)
      
      // Trigger PR creation when manually moving from "in-progress" to "review"
      if (task.status === 'in-progress' && newStatus === 'review' && activeWorkspace) {
        // Small delay to let the UI update first
        setTimeout(() => {
          handleManualPRCreation(task, activeWorkspace.folder_path)
        }, 100)
      }
    }
  }

  const handleStartAI = useCallback(async (task: Task, baseBranch?: string) => {
    if (processingTasks.has(task.id)) return
    setProcessingTasks((prev) => new Set(prev).add(task.id))
    
    try {
      if (baseBranch && activeWorkspace) {
        await invoke('run_shell_command', {
          command: 'git',
          args: ['checkout', baseBranch],
          cwd: activeWorkspace.folder_path
        })

        // Auto-pull fast-forward to ensure the base branch is the absolute latest
        // If there's no internet or error, we just proceed with the local branch
        await invoke('run_shell_command', {
          command: 'git',
          args: ['pull', 'origin', baseBranch, '--ff-only'],
          cwd: activeWorkspace.folder_path
        }).catch(() => {
          console.warn(`[Board] git pull --ff-only failed for ${baseBranch}, proceeding with local version`)
        })
      }
      
      await moveTask(task.id, 'in-progress')
      await enqueueTask(task.id, task.title, task.description || undefined)
    } catch (error) {
      console.error('[Board] Failed to start AI:', error)
      setProcessingTasks((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }, [activeWorkspace, processingTasks, moveTask, enqueueTask])

  const handleRetry = useCallback(async (task: Task) => {
    await moveTask(task.id, 'in-progress')
    await retryTask(task.id)
  }, [moveTask, retryTask])

  const handleViewDiff = (task: Task) => setDiffTask(task)
  const handleOpenChat = (task: Task) => setChatTask(task)
  const handleTaskClick = (task: Task) => setDetailTask(task)
  const handleTaskUpdate = (task: Task) => setDetailTask(task)

  const handleAIReview = (task: Task) => setReviewModalTask(task);

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      setDetailTask(null)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const [mergeTask, setMergeTask] = useState<Task | null>(null)

  const handleCompleteTask = async (task: Task) => {
    setMergeTask(task)
  }

  const handleMergeComplete = async (passedTaskId?: string) => {
    const taskId = passedTaskId || mergeTask?.id
    if (taskId) {
      setMergeTask(null)
      setMergeLoadingTasks(prev => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
      await moveTask(taskId, 'done')
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
      styles: { active: { opacity: '0.5' } },
    }),
  }

  return (
    <div className="flex flex-1 min-h-0 h-full w-full overflow-x-auto overflow-y-hidden bg-app-bg relative">
      <div className="flex flex-col min-w-max h-full relative">
        <div className="flex-1 min-h-0">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-5 p-5 w-max h-full">
              {COLUMNS.map((column) => {
              const columnTasks = getTasksByStatus(column.id)
              return (
                <KanbanColumn 
                  key={column.id} 
                  column={column} 
                  tasks={columnTasks} 
                  onAddTask={() => setShowAddModal(true)}
                  onImport={() => setShowImportModal(true)}
                  onRefreshBranches={fetchBranches}
                  isRefreshingBranches={isRefreshingBranches}
                >
                  <SortableContext items={columnTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onStartAI={handleStartAI}
                        onViewDiff={handleViewDiff}
                        onOpenChat={handleOpenChat}
                        onAIReview={handleAIReview}
                        onComplete={handleCompleteTask}
                        onRetry={handleRetry}
                        onClick={handleTaskClick}
                        processingTasks={processingTasks}
                        taskStates={taskStates}
                        mergeLoadingTasks={mergeLoadingTasks}
                        availableBranches={availableBranches}
                      />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              )
            })}
          </div>

          <DragOverlay dropAnimation={dropAnimation}>
            {activeTask && (
              <div className="bg-app-sidebar rounded-md p-3 border border-app-border-highlight shadow-xl opacity-90 rotate-2">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className={`text-xs font-medium uppercase px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[activeTask.priority]}`}>
                    {activeTask.priority}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-neutral-200 mb-1">{activeTask.title}</h3>
              </div>
            )}
          </DragOverlay>
        </DndContext>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-app-panel rounded-lg border border-app-border w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
                <h3 className="text-sm font-semibold text-white">New Task</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowAddModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleCreateTask} className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">Title</label>
                  <Input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="bg-app-sidebar border-app-border focus-visible:ring-1 focus-visible:ring-app-accent placeholder:text-app-text-muted"
                    placeholder="Enter task title..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                    Description<span className="text-neutral-600 ml-1">(type @ to tag files)</span>
                  </label>
                  <DescriptionWithFileTag
                    value={newTask.description}
                    onChange={(desc) => setNewTask({ ...newTask, description: desc })}
                    workspacePath={activeWorkspace?.folder_path}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">Priority</label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(val) => setNewTask({ ...newTask, priority: val as Task['priority'] })}
                  >
                    <SelectTrigger className="w-full bg-app-sidebar border-app-border focus:ring-1 focus:ring-app-accent h-9 rounded-md text-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-app-panel border-app-border rounded-md shadow-xl text-white">
                      <SelectItem value="low" className="focus:bg-white/10 cursor-pointer">Low</SelectItem>
                      <SelectItem value="medium" className="focus:bg-white/10 cursor-pointer">Medium</SelectItem>
                      <SelectItem value="high" className="focus:bg-white/10 cursor-pointer">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
                  <Button type="submit" className="bg-app-accent hover:bg-app-accent-hover">Create Task</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showImportModal && (
          <TaskImporter
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
          />
        )}

        {chatTask && (
          <TaskChatBox
            task={chatTask}
            isOpen={!!chatTask}
            onClose={() => setChatTask(null)}
          />
        )}

        {diffTask && activeWorkspace && (
          <DiffViewer
            task={diffTask}
            isOpen={!!diffTask}
            onClose={() => setDiffTask(null)}
            onDiscard={async () => {
              await moveTask(diffTask.id, 'todo')
              aiChatStore.clearTaskState?.(diffTask.id)
              setDiffTask(null)
            }}
            workspacePath={activeWorkspace.folder_path}
            taskState={taskStates[diffTask.id]}
          />
        )}

        {detailTask && (
          <TaskDetailModal
            task={detailTask}
            taskState={taskStates[detailTask.id]}
            isOpen={true}
            onClose={() => setDetailTask(null)}
            onDelete={handleDeleteTask}
            onUpdate={handleTaskUpdate}
            onStartAI={handleStartAI}
            onOpenChat={handleOpenChat}
            onViewDiff={handleViewDiff}
            onComplete={handleCompleteTask}
            onRetry={handleRetry}
          />
        )}
        
        {mergeTask && activeWorkspace && (
          <GitPushFlow
            task={mergeTask}
            onClose={() => setMergeTask(null)}
            onComplete={handleMergeComplete}
            workspacePath={activeWorkspace.folder_path}
          />
        )}
        {reviewModalTask && (
          <CodeReviewModal
            task={reviewModalTask}
            isOpen={!!reviewModalTask}
            onClose={() => setReviewModalTask(null)}
            onViewDiff={handleViewDiff}
            onOpenChat={handleOpenChat}
            onComplete={handleCompleteTask}
          />
        )}
      </div>
    </div>
  )
}