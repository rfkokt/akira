import { useState, useCallback } from 'react'
import type { Task } from '@/types'
import { useTaskStore } from '@/store'
import type { AITaskState } from '@/store/aiChatStore'

interface UseTaskDragOptions {
  taskStates: Record<string, AITaskState>
  processingTasks: Set<string>
}

export function useTaskDrag({ taskStates, processingTasks }: UseTaskDragOptions) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const { moveTask } = useTaskStore()

  const handleDragStart = useCallback((event: { active: { data: { current: Task } } }) => {
    const task = event.active.data.current as Task
    setActiveTask(task)
  }, [])

  const handleDragEnd = useCallback(
    (event: { active: { id: string }; over: { id: string } | null }, tasks: Task[], columnIds: string[]) => {
      setActiveTask(null)

      const { active, over } = event

      if (!over) return

      const taskId = active.id as string
      const task = tasks.find((t) => t.id === taskId)

      if (!task) return

      const taskState = taskStates[taskId]
      if (taskState?.status === 'running' || taskState?.status === 'queued') {
        return
      }

      const overId = over.id as string
      let newStatus: Task['status']

      if (columnIds.includes(overId)) {
        newStatus = overId as Task['status']
      } else {
        const overTask = tasks.find((t) => t.id === overId)
        if (!overTask) return
        newStatus = overTask.status
      }

      if (task.status !== newStatus) {
        moveTask(taskId, newStatus)
      }
    },
    [taskStates, moveTask]
  )

  return {
    activeTask,
    setActiveTask,
    handleDragStart,
    handleDragEnd,
    isProcessing: (taskId: string) => processingTasks.has(taskId),
  }
}