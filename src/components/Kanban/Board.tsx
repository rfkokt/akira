import { useEffect, useState, useCallback } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { useTaskStore, useAIChatStore, useWorkspaceStore } from '@/store'
import type { Task } from '@/types'
import { TaskImporter } from './TaskImporter'
import { Button } from '@/components/ui/button'
import { TaskChatBox } from '@/components/Chat/TaskChatBox'
import { DiffViewer } from '@/components/DiffViewer/DiffViewer'
import { DescriptionWithFileTag } from '@/components/DescriptionWithFileTag'
import { TaskCreatorChat } from './TaskCreatorChat'
import { TaskCard } from './TaskCard'
import { TaskDetailModal } from './TaskDetailModal'
import { KanbanColumn } from './KanbanColumn'
import { COLUMNS, PRIORITY_COLORS } from './constants'
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
  const [showTaskCreator, setShowTaskCreator] = useState(true)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set())
  const [mergeLoadingTasks, setMergeLoadingTasks] = useState<Set<string>>(new Set())
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

  const handleDragEnd = (event: DragEndEvent) => {
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
      moveTask(taskId, newStatus)
    }
  }

  const handleStartAI = useCallback(async (task: Task) => {
    if (processingTasks.has(task.id)) return
    setProcessingTasks((prev) => new Set(prev).add(task.id))
    await moveTask(task.id, 'in-progress')
    try {
      await enqueueTask(task.id, task.title, task.description || undefined)
    } catch (error) {
      setProcessingTasks((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }, [processingTasks, moveTask, enqueueTask])

  const handleRetry = useCallback(async (task: Task) => {
    await moveTask(task.id, 'in-progress')
    await retryTask(task.id)
  }, [moveTask, retryTask])

  const handleViewDiff = (task: Task) => setDiffTask(task)
  const handleOpenChat = (task: Task) => setChatTask(task)
  const handleTaskClick = (task: Task) => setDetailTask(task)
  const handleTaskUpdate = (task: Task) => setDetailTask(task)

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      setDetailTask(null)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const handleCompleteTask = async (task: Task) => {
    setMergeLoadingTasks(prev => new Set(prev).add(task.id))
    // TODO: Implement merge workflow
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
    <div className="flex h-full w-full overflow-x-auto overflow-y-hidden bg-app-bg relative">
      {showTaskCreator && (
        <div className="w-[480px] shrink-0 h-full sticky left-0 z-20 shadow-2xl bg-app-bg border-r border-app-border">
          <TaskCreatorChat onHide={() => setShowTaskCreator(false)} />
        </div>
      )}

      <div className="flex flex-col min-w-max h-full relative">
        {!showTaskCreator && (
          <div className="px-5 py-2 border-b border-app-border bg-app-bg shrink-0 sticky top-0 z-10 w-full flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setShowTaskCreator(true)} className="h-7 px-2 text-xs">
              <MessageSquare className="w-3.5 h-3.5 mr-1" />
              Show Task Creator
            </Button>
          </div>
        )}

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
                >
                  <SortableContext items={columnTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
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
                        taskStates={taskStates}
                        mergeLoadingTasks={mergeLoadingTasks}
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
                  <span className={`text-xs font-medium uppercase px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[activeTask.priority]} font-geist`}>
                    {activeTask.priority}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-neutral-200 font-geist mb-1">{activeTask.title}</h3>
              </div>
            )}
          </DragOverlay>
        </DndContext>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-app-panel rounded-lg border border-app-border w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
                <h3 className="text-sm font-semibold text-white font-geist">New Task</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowAddModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleCreateTask} className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Title</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full px-3 py-2 rounded text-sm bg-app-sidebar text-white placeholder-white/40 border border-app-border focus:outline-none focus:border-app-accent font-geist"
                    placeholder="Enter task title..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">
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
                  <label className="block text-xs font-medium text-neutral-400 mb-1 font-geist">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                    className="w-full px-3 py-2 rounded text-sm bg-app-sidebar text-white border border-app-border focus:outline-none focus:border-app-accent font-geist"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
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
            workspacePath={activeWorkspace.folder_path}
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
      </div>
    </div>
  )
}