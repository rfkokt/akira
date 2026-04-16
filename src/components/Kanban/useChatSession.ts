import { useState, useCallback, useEffect, useRef } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAIChatStore } from '@/store'
import { dbService } from '@/lib/db'

interface HistoryItem {
  task_id: string
  created_at: string
  role: string
  preview: string
  content: string
}

export function useChatSession(workspaceId: string | undefined) {
  const [chatSessionId, setChatSessionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('akira-chat-session-id')
      return saved || ''
    } catch {
      return ''
    }
  })
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyList, setHistoryList] = useState<HistoryItem[]>([])
  const [executionSteps, setExecutionSteps] = useState<{ type: string; content: string; timestamp: number }[]>([])
  const [showProgress, setShowProgress] = useState(true)

  const unlistenFns = useRef<UnlistenFn[]>([])

  const { getMessages, setMessages, clearMessages } = useAIChatStore()

  const baseTaskId = `__task_creator__:${workspaceId || 'default'}`
  const taskId = chatSessionId ? `${baseTaskId}_${chatSessionId}` : baseTaskId

  // Load chat history from DB
  const loadChatHistory = useCallback(async () => {
    if (!taskId) return
    
    const currentMessages = getMessages(taskId)
    if (currentMessages.length > 0) {
      return
    }
    
    try {
      const history = await dbService.getChatHistory(taskId)
      if (history.length > 0) {
        const loadedMessages = history.map((msg: { role: string; content: string; created_at: string }) => ({
          id: `db-${Date.now()}-${Math.random()}`,
          taskId,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
        }))
        setMessages(taskId, loadedMessages)
      }
    } catch (err) {
      console.error('Failed to load chat history:', err)
    }
  }, [taskId, setMessages, getMessages])

  // Load all session histories for the modal
  const loadAllHistory = useCallback(async () => {
    try {
      const allTasks = await dbService.getAllTasks()
      const basePrefix = `__task_creator__:${workspaceId || 'default'}`
      
      const sessionTaskIds = allTasks
        .map(t => t.id)
        .filter(id => id === basePrefix || id.startsWith(`${basePrefix}_`))
        
      if (!sessionTaskIds.includes(taskId)) {
        sessionTaskIds.push(taskId)
      }
      
      const rawHistories = await Promise.all(sessionTaskIds.map(id => dbService.getChatHistory(id)))
      const list: HistoryItem[] = []
      
      rawHistories.forEach((msgs, index) => {
        if (msgs.length > 0) {
          const tid = sessionTaskIds[index]
          const sorted = msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          const first = sorted[0]
          
          let preview = first?.content?.substring(0, 50) || ''
          if (first?.content?.length > 50) preview += '...'
          
          list.push({
            task_id: tid,
            created_at: first?.created_at || '',
            role: first?.role || '',
            preview,
            content: first?.content || ''
          })
        }
      })
      
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setHistoryList(list)
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }, [workspaceId, taskId])

  // Set up Tauri event listeners
  useEffect(() => {
    const setupListeners = async () => {
      const unlistenComplete = await listen<{ id: string; success: boolean; error_message?: string }>('cli-complete', (event) => {
        const { id, success, error_message } = event.payload
        if (id !== taskId && id !== taskId + '_summary' && id !== '__analyze_project_creator__') return

        setExecutionSteps(prev => [...prev, {
          type: success ? 'complete' : 'error',
          content: success ? 'Completed' : (error_message || 'Failed'),
          timestamp: Date.now()
        }])
      })

      unlistenFns.current = [unlistenComplete]
    }

    setupListeners()

    return () => {
      unlistenFns.current.forEach(fn => fn())
      unlistenFns.current = []
    }
  }, [taskId])

  // Load history when taskId changes
  useEffect(() => {
    loadChatHistory()
  }, [loadChatHistory])

  const handleNewChat = useCallback(() => {
    const newSessionId = Date.now().toString()
    const newTaskId = chatSessionId ? `${baseTaskId}_${newSessionId}` : baseTaskId
    setChatSessionId(newSessionId)
    try {
      localStorage.setItem('akira-chat-session-id', newSessionId)
    } catch { /* ignore */ }
    setExecutionSteps([])
    setShowProgress(true)
    clearMessages(newTaskId)
  }, [baseTaskId, clearMessages, chatSessionId])

  const handleSetChatSessionId = useCallback((sessionId: string) => {
    setChatSessionId(sessionId)
    try {
      if (sessionId) {
        localStorage.setItem('akira-chat-session-id', sessionId)
      } else {
        localStorage.removeItem('akira-chat-session-id')
      }
    } catch { /* ignore */ }
  }, [])

  return {
    taskId,
    baseTaskId,
    chatSessionId,
    showHistoryModal,
    setShowHistoryModal,
    historyList,
    executionSteps,
    setExecutionSteps,
    showProgress,
    setShowProgress,
    loadAllHistory,
    handleNewChat,
    handleSetChatSessionId,
    loadChatHistory,
  }
}
