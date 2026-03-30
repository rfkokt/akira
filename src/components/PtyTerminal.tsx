import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { Minus, Maximize2, X, Terminal as TerminalIcon } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface PtyTerminalProps {
  sessionId: string
  binary: string
  args: string[]
  cwd: string
  onClose?: () => void
  onMaximize?: () => void
  isMaximized?: boolean
  title?: string
}

export function PtyTerminal({ 
  sessionId, 
  binary, 
  args, 
  cwd, 
  onClose, 
  onMaximize,
  isMaximized,
  title 
}: PtyTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const readInterval = useRef<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const startPty = useCallback(async () => {
    try {
      await invoke('spawn_pty_session', {
        sessionId,
        binary,
        args,
        cwd,
      })
      setIsConnected(true)
    } catch (err) {
      console.error('[PtyTerminal] Failed to spawn:', err)
    }
  }, [sessionId, binary, args, cwd])

  const stopPty = useCallback(async () => {
    if (readInterval.current) {
      clearInterval(readInterval.current)
      readInterval.current = null
    }
    try {
      await invoke('pty_kill', { sessionId })
    } catch (err) {
      console.error('[PtyTerminal] Failed to kill:', err)
    }
    setIsConnected(false)
  }, [sessionId])

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
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
    term.loadAddon(new WebLinksAddon())

    term.open(terminalRef.current)
    fit.fit()

    terminalInstance.current = term

    term.onData((data) => {
      invoke('pty_write', { sessionId, data }).catch(console.error)
    })

    startPty()

    readInterval.current = window.setInterval(async () => {
      try {
        const output = await invoke<string>('pty_read', { sessionId })
        if (output) {
          term.write(output)
        }
      } catch (err) {
        console.error('[PtyTerminal] Read error:', err)
      }
    }, 50)

    const handleResize = () => {
      if (fitAddon.current) {
        try {
          fitAddon.current.fit()
          const { rows, cols } = term
          invoke('pty_resize', { sessionId, rows, cols }).catch(console.error)
        } catch {
        }
      }
    }

    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver(handleResize)
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (readInterval.current) {
        clearInterval(readInterval.current)
      }
      stopPty()
      term.dispose()
    }
  }, [sessionId, startPty, stopPty])

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-[#1e1e1e] rounded-md overflow-hidden border border-white/10">
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
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onMaximize}
                  className="h-7 w-7"
                >
                  {isMaximized ? (
                    <Minus className="w-3 h-3" />
                  ) : (
                    <Maximize2 className="w-3 h-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isMaximized ? 'Minimize' : 'Maximize'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-7 w-7 hover:bg-red-400/10"
                >
                  <X className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div ref={terminalRef} className="flex-1 p-1" />
      </div>
    </TooltipProvider>
  )
}
