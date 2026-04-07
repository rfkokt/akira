import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Minus, Maximize2, X, Terminal as TerminalIcon } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const spawnedSessions = new Set<string>()

interface PtyTerminalProps {
  sessionId: string
  binary: string
  args: string[]
  cwd: string
  onClose?: () => void
  onMaximize?: () => void
  isMaximized?: boolean
  title?: string
  showHeader?: boolean
}

export function PtyTerminal({ 
  sessionId, 
  binary, 
  args, 
  cwd, 
  onClose, 
  onMaximize,
  isMaximized,
  title,
  showHeader = true
}: PtyTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const unlistenRef = useRef<(() => void) | null>(null)
  const unlistenExitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"MesloLGS NF", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "Hack Nerd Font", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      allowTransparency: false,
    })

    const fit = new FitAddon()
    fitAddon.current = fit
    term.loadAddon(fit)
    
    // Configure WebLinksAddon to use Tauri's native open
    term.loadAddon(new WebLinksAddon(async (e, uri) => {
      e.preventDefault();
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(uri);
      } catch (err) {
        console.error('Failed to open terminal link:', err);
      }
    }));

    term.open(terminalRef.current)
    
    // Initial fit after fonts load
    document.fonts.ready.then(() => {
      fit.fit()
      if (term.rows > 0 && term.cols > 0) {
        invoke('pty_resize', { sessionId, rows: term.rows, cols: term.cols }).catch(console.error)
      }
    })

    terminalInstance.current = term

    // Handle input
    term.onData((data) => {
      invoke('pty_write', { sessionId, data }).catch(console.error)
    })

    // Spawn PTY
    if (!spawnedSessions.has(sessionId)) {
      spawnedSessions.add(sessionId)
      invoke('spawn_pty_session', {
        sessionId,
        binary,
        args,
        cwd,
      }).then(() => {
        setIsConnected(true)
        // Ensure PTY understands the current dimensions
        invoke('pty_resize', { sessionId, rows: term.rows, cols: term.cols }).catch(console.error)
      }).catch((err) => {
        console.error('[PtyTerminal] Failed to spawn:', err)
        term.write(`\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`)
      })
    } else {
      setIsConnected(true)
    }

    // Listen for PTY output events
    let isCleanedUp = false
    let unlistenOutput: (() => void) | undefined
    let unlistenExit: (() => void) | undefined

    const setupListener = async () => {
      unlistenOutput = await listen<string>(`pty-output-${sessionId}`, (event) => {
        if (terminalInstance.current) {
          terminalInstance.current.write(event.payload)
        }
      })

      unlistenExit = await listen<void>(`pty-exit-${sessionId}`, () => {
        if (terminalInstance.current) {
          terminalInstance.current.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n')
        }
        setIsConnected(false)
      })

      if (isCleanedUp) {
        if (unlistenOutput) unlistenOutput()
        if (unlistenExit) unlistenExit()
      } else {
        unlistenRef.current = unlistenOutput
        unlistenExitRef.current = unlistenExit
      }
    }
    setupListener()

    // Handle resize
    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current) {
        try {
          fitAddon.current.fit()
          const { rows, cols } = terminalInstance.current
          if (rows > 0 && cols > 0) {
            invoke('pty_resize', { sessionId, rows, cols }).catch(console.error)
          }
        } catch {
          // Ignore resize errors
        }
      }
    }

    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver(handleResize)
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    return () => {
      isCleanedUp = true
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      
      // Cleanup event listeners
      if (unlistenRef.current) {
        unlistenRef.current()
      }
      if (unlistenExitRef.current) {
        unlistenExitRef.current()
      }
      // Dispose xterm, leave PTY running on backend unless explicitly killed
      term.dispose()
    }
  }, [sessionId, binary, args, cwd])

  useEffect(() => {
    // Resize on maximize change
    if (fitAddon.current && terminalInstance.current) {
      document.fonts.ready.then(() => {
        setTimeout(() => {
          try {
            fitAddon.current?.fit()
            if (terminalInstance.current) {
              const { rows, cols } = terminalInstance.current
              if (rows > 0 && cols > 0) {
                invoke('pty_resize', { sessionId, rows, cols }).catch(console.error)
              }
            }
          } catch {
            // Ignore
          }
        }, 100)
      })
    }
  }, [isMaximized])

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full bg-[#1e1e1e] ${showHeader ? 'rounded-md overflow-hidden border border-white/10' : ''}`}>
        {showHeader && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#323232] border-b border-white/10">
            <div className="flex items-center gap-2">
              <TerminalIcon className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-xs text-neutral-300 font-medium">
                {title || `${binary} ${args.join(' ')}`}
              </span>
              {!isMaximized && (
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`} />
              )}
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  onClick={onMaximize}
                  className="inline-flex items-center justify-center rounded-md h-7 w-7 text-app-text-muted hover:text-white hover:bg-app-panel transition-colors"
                >
                  {isMaximized ? (
                    <Minus className="w-3 h-3" />
                  ) : (
                    <Maximize2 className="w-3 h-3" />
                  )}
                </TooltipTrigger>
                <TooltipContent>{isMaximized ? 'Minimize' : 'Maximize'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-md h-7 w-7 text-app-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <X className="w-3 h-3" />
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
        <div className={`flex-1 relative overflow-hidden ${showHeader ? 'p-1' : ''}`}>
          <div ref={terminalRef} className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    </TooltipProvider>
  )
}