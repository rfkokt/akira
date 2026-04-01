import { useState, useCallback, useRef, useEffect } from 'react'
import { useTerminalStore } from '@/store/terminalStore'
import { PtyTerminal } from './PtyTerminal'
import { ChevronDown, ChevronUp, X, Terminal as TerminalIcon, GripHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef({ startY: 0, startHeight: 0, rafId: null as number | null })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStateRef.current.startY = e.clientY
    dragStateRef.current.startHeight = panelHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    document.body.style.pointerEvents = 'none'
  }, [panelHeight])

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
      document.body.style.pointerEvents = ''
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
        bg-app-bg
        flex flex-col
        ${isPanelMaximized ? 'flex-1' : ''}
        ${isDragging ? '' : 'transition-[height] duration-150 ease-out'}
      `}
      style={{ height: isPanelMaximized ? undefined : panelHeight }}
    >
      {/* Resize Handle */}
      <div 
        className={`
          h-1.5 flex items-center justify-center cursor-ns-resize 
          ${isDragging ? 'bg-app-accent/30' : 'hover:bg-app-accent/20'} 
          transition-colors duration-100
        `}
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className={`w-4 h-4 transition-colors ${isDragging ? 'text-app-accent' : 'text-neutral-600'}`} />
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 bg-app-titlebar border-b border-app-border shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-300 font-geist">Terminal</span>
          {sessions.length > 0 && (
            <div className="flex items-center gap-1 ml-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session.id)}
                  className={`
                    px-2 py-0.5 text-[10px] rounded transition-colors font-geist
                    ${session.id === activeSessionId 
                      ? 'bg-app-accent/20 text-app-accent border border-app-accent/30' 
                      : 'bg-app-sidebar text-neutral-400 hover:text-white border border-transparent'}
                  `}
                >
                  {session.workspaceName}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={toggleMaximize}
              >
                {isPanelMaximized ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPanelMaximized ? 'Minimize' : 'Maximize'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-red-400/10"
                onClick={() => {
                  if (activeSessionId) {
                    removeSession(activeSessionId)
                  } else {
                    togglePanel()
                  }
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden min-h-0">
        {activeSession ? (
          <PtyTerminal
            sessionId={activeSession.id}
            binary={activeSession.binary}
            args={activeSession.args}
            cwd={activeSession.cwd}
            onClose={() => removeSession(activeSession.id)}
            onMaximize={toggleMaximize}
            isMaximized={isPanelMaximized}
            title={activeSession.workspaceName}
            showHeader={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500">
            <TerminalIcon className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs font-geist">No terminal session</p>
            <p className="text-[10px] text-neutral-600 mt-1">Open a workspace to start</p>
          </div>
        )}
      </div>
    </div>
  )
}