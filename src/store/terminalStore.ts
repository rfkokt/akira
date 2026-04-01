import { create } from 'zustand'

export interface TerminalSession {
  id: string
  workspaceId: string
  workspaceName: string
  cwd: string
  binary: string
  args: string[]
}

interface TerminalState {
  sessions: TerminalSession[]
  activeSessionId: string | null
  isPanelOpen: boolean
  isPanelMaximized: boolean
  panelHeight: number
  
  createSession: (workspaceId: string, workspaceName: string, cwd: string) => string
  removeSession: (sessionId: string) => void
  setActiveSession: (sessionId: string | null) => void
  togglePanel: () => void
  setPanelOpen: (open: boolean) => void
  toggleMaximize: () => void
  setPanelHeight: (height: number) => void
}

const MIN_PANEL_HEIGHT = 100
const MAX_PANEL_HEIGHT = 800

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: [],
  activeSessionId: null,
  isPanelOpen: false,
  isPanelMaximized: false,
  panelHeight: 280,

  createSession: (workspaceId: string, workspaceName: string, cwd: string) => {
    const id = `terminal-${workspaceId}-${Date.now()}`
    const session: TerminalSession = {
      id,
      workspaceId,
      workspaceName,
      cwd,
      binary: '/bin/zsh',
      args: ['-l'],
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: id,
      isPanelOpen: true,
    }))
    return id
  },

  removeSession: (sessionId: string) => {
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== sessionId)
      const newActiveId = state.activeSessionId === sessionId
        ? newSessions[0]?.id || null
        : state.activeSessionId
      return {
        sessions: newSessions,
        activeSessionId: newActiveId,
        isPanelOpen: newActiveId !== null ? state.isPanelOpen : false,
      }
    })
  },

  setActiveSession: (sessionId: string | null) => {
    set({ activeSessionId: sessionId, isPanelOpen: sessionId !== null })
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }))
  },

  setPanelOpen: (open: boolean) => {
    set({ isPanelOpen: open })
  },

  toggleMaximize: () => {
    set((state) => ({ isPanelMaximized: !state.isPanelMaximized }))
  },

  setPanelHeight: (height: number) => {
    const clampedHeight = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, height))
    set({ panelHeight: clampedHeight })
  },
}))