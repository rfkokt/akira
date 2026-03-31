import { useState, useCallback } from 'react'
import { useAIChatStore, useTaskStore } from '@/store'

export function useAIWorkflow() {
  const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set())
  const { enqueueTask, retryTask } = useAIChatStore()
  const { moveTask } = useTaskStore()

  const startAI = useCallback(async (taskId: string, taskTitle: string, taskDescription?: string) => {
    if (processingTasks.has(taskId)) return null

    setProcessingTasks((prev) => new Set(prev).add(taskId))
    
    await moveTask(taskId, 'in-progress')
    
    try {
      await enqueueTask(taskId, taskTitle, taskDescription)
      return { success: true }
    } catch (error) {
      console.error('Failed to start AI:', error)
      setProcessingTasks((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
      return { success: false, error }
    }
  }, [processingTasks, moveTask, enqueueTask])

  const retry = useCallback(async (taskId: string) => {
    await moveTask(taskId, 'in-progress')
    await retryTask(taskId)
  }, [moveTask, retryTask])

  const finishProcessing = useCallback((taskId: string) => {
    setProcessingTasks((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }, [])

  return {
    processingTasks,
    startAI,
    retry,
    finishProcessing,
    isProcessing: (taskId: string) => processingTasks.has(taskId),
  }
}