export interface ChatMessage {
  id: string
  taskId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export type AITaskStatus = 'idle' | 'queued' | 'running' | 'completed' | 'error'

export interface AITaskState {
  status: AITaskStatus
  startTime: number | null
  endTime: number | null
  errorMessage: string | null
  lastResponse: string | null
  queuePosition: number | null
  currentFile: string | null
  filesModified: string[]
  prBranch?: string
  prUrl?: string
  prCreatedAt?: number
  isMerged?: boolean
  mergeSourceBranch?: string
  prError?: string
  creatingPR?: boolean
}

export interface TaskQueueItem {
  taskId: string
  taskTitle: string
  taskDescription?: string
}

export interface SavedTask {
  taskId: string
  taskTitle: string
  startedAt: number
}

export const STORAGE_KEY = 'akira_running_task'

export function createDefaultTaskState(): AITaskState {
  return {
    status: 'idle',
    startTime: null,
    endTime: null,
    errorMessage: null,
    lastResponse: null,
    queuePosition: null,
    currentFile: null,
    filesModified: [],
    creatingPR: false,
  }
}