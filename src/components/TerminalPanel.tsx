import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTerminalStore } from '@/store/terminalStore'
import { PtyTerminal } from './PtyTerminal'
import { ChevronDown, ChevronUp, X, Terminal as TerminalIcon, Plus, Columns, Trash2 } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const MIN_HEIGHT = 100
const MAX_HEIGHT = 800

export function TerminalPanel() {
  const { 
    sessions, 
    activeSessionId, 
    isPanelOpen, 
    isPanelMaximized,
    panelHeight,
    removeSession, 
    setActiveSession, 
    togglePanel, 
    toggleMaximize,
    setPanelHeight
  } = useTerminalStore()

  const [isDragging, setIsDragging] = useState(false)
  const [isSplitView, setIsSplitView] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef({ startY: 0, startHeight: 0, rafId: null as number | null })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isPanelMaximized) return
    e.preventDefault()
    setIsDragging(true)
    dragStateRef.current.startY = e.clientY
    dragStateRef.current.startHeight = panelHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [panelHeight, isPanelMaximized])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // Cancel previous animation frame if exists
      if (dragStateRef.current.rafId) {
        cancelAnimationFrame(dragStateRef.current.rafId)
      }
      
      // Use requestAnimationFrame for smooth updates
      dragStateRef.current.rafId = requestAnimationFrame(() => {
        const deltaY = dragStateRef.current.startY - e.clientY
        const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStateRef.current.startHeight + deltaY))
        setPanelHeight(newHeight)
      })
    }

    const handleMouseUp = () => {
      if (dragStateRef.current.rafId) {
        cancelAnimationFrame(dragStateRef.current.rafId)
      }
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (dragStateRef.current.rafId) {
        cancelAnimationFrame(dragStateRef.current.rafId)
      }
    }
  }, [isDragging, setPanelHeight])

  if (!isPanelOpen && sessions.length === 0) return null

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div 
      ref={panelRef}
      className={`
        border-t border-app-border 
        relative
        bg-app-bg
        flex flex-col
        ${isPanelMaximized ? 'flex-1' : ''}
        ${isDragging ? '' : 'transition-[height] duration-150 ease-out'}
        ${!isPanelOpen ? 'hidden' : ''}
      `}
      style={{ height: isPanelMaximized ? undefined : panelHeight }}
    >
      {/* Resize Handle - Larger hit area */}
      {!isPanelMaximized && (
        <div 
          className="absolute top-0 -translate-y-1/2 inset-x-0 h-4 cursor-ns-resize z-50 flex items-center justify-center group"
          onMouseDown={handleMouseDown}
        >
          <div className={`
            h-1 w-12 rounded-full transition-colors duration-200
            ${isDragging ? 'bg-app-accent' : 'bg-transparent group-hover:bg-app-accent/40'}
          `} />
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-1.5 bg-app-titlebar border-b border-app-border shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-300">Terminal</span>
          {sessions.length > 0 && (
            <div className="flex items-center gap-1 ml-2 overflow-x-auto hide-scrollbar">
              {sessions.map((session, index) => (
                <div key={session.id} className="relative group/tab flex items-center">
                  <button
                    onClick={() => setActiveSession(session.id)}
                    className={`
                      px-2.5 py-1 pr-6 text-xs rounded transition-colors flex items-center gap-1.5
                      ${session.id === activeSessionId 
                        ? 'bg-app-accent/20 text-app-accent border border-app-accent/30 tracking-wide font-medium shadow-[0_0_8px_rgba(255,255,255,0.05)]' 
                        : 'bg-app-sidebar text-neutral-400 hover:text-neutral-200 border border-transparent'}
                    `}
                  >
                    zsh {index + 1}
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSession(session.id)
                      invoke('pty_kill', { sessionId: session.id }).catch(console.error)
                      if (sessions.length === 1 && isPanelOpen) {
                        togglePanel()
                      }
                    }}
                    className={`
                      absolute right-1 top-1/2 -translate-y-1/2 
                      w-4 h-4 rounded-sm flex items-center justify-center
                      transition-all duration-200
                      ${session.id === activeSessionId 
                        ? 'opacity-100 hover:bg-app-accent/30 text-app-accent hover:text-white' 
                        : 'opacity-0 group-hover/tab:opacity-100 hover:bg-white/10 text-neutral-400 hover:text-white'}
                    `}
                    title="Close Tab"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setIsSplitView(!isSplitView)}
                className={`w-5 h-5 ml-1 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors ${isSplitView ? 'text-app-accent bg-app-accent/20' : 'text-neutral-400 hover:text-white'}`}
                title={isSplitView ? "Single View" : "Split View"}
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (activeSession) {
                    useTerminalStore.getState().createSession(activeSession.workspaceId, activeSession.workspaceName, activeSession.cwd)
                  }
                }}
                className="w-5 h-5 ml-0.5 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
                title="New Terminal"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (activeSession) {
                    removeSession(activeSession.id)
                    invoke('pty_kill', { sessionId: activeSession.id }).catch(console.error)
                    if (sessions.length === 1 && isPanelOpen) {
                      togglePanel()
                    }
                  }
                }}
                className="w-5 h-5 ml-1 rounded-md hover:bg-red-400/20 text-neutral-400 hover:text-red-400 flex items-center justify-center transition-colors"
                title="Kill Terminal"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">

          <Tooltip>
            <TooltipTrigger
              className="w-5 h-5 ml-1 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors text-neutral-400 hover:text-white"
              onClick={toggleMaximize}
            >
                {isPanelMaximized ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
            </TooltipTrigger>
            <TooltipContent>{isPanelMaximized ? 'Minimize' : 'Maximize'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              className="h-6 w-6 hover:bg-neutral-800 transition-colors inline-flex items-center justify-center rounded-md"
              onClick={() => {
                useTerminalStore.getState().setPanelOpen(false)
              }}
            >
              <X className="w-3.5 h-3.5" />
            </TooltipTrigger>
            <TooltipContent>Close Panel</TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      <div className={`flex-1 overflow-hidden min-h-0 relative ${isSplitView && sessions.length > 1 ? 'flex bg-app-bg divide-x divide-white/5' : ''}`}>
        {sessions.map(session => {
          const isActive = session.id === activeSessionId
          const showInSplit = isSplitView && sessions.length > 1
          const isVisible = showInSplit || isActive
          
          return (
            <div 
              key={session.id} 
              className={`
                min-w-0 h-full overflow-hidden shrink-0
                ${showInSplit ? 'flex-1 flex flex-col relative' : 'absolute inset-0 w-full'}
                ${!isVisible ? 'hidden' : ''}
              `}
              style={showInSplit ? { minWidth: '150px' } : {}}
            >
              <PtyTerminal
                sessionId={session.id}
                binary={session.binary}
                args={session.args}
                cwd={session.cwd}
                onClose={() => {
                  removeSession(session.id)
                  invoke('pty_kill', { sessionId: session.id }).catch(console.error)
                  if (sessions.length === 1 && isPanelOpen) togglePanel()
                }}
                onMaximize={toggleMaximize}
                isMaximized={isPanelMaximized}
                title={session.workspaceName}
                showHeader={false}
              />
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500">
            <TerminalIcon className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No terminal session</p>
            <p className="text-xs text-neutral-600 mt-1">Open a workspace to start</p>
          </div>
        )}
      </div>

      {isDragging && (
        <div className="fixed inset-0 z-[99999] cursor-ns-resize" />
      )}
    </div>
  )
}