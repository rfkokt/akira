import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Play, Square, ChevronDown, Check, X, Terminal, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface Script {
  id: string
  name: string
  command: string
}

interface ScriptEvent {
  type: 'output' | 'error' | 'exit'
  data?: string
  code?: number
}

interface ScriptRunnerProps {
  taskId: string
  workspacePath: string
  scripts?: Script[]
}

export interface ScriptRunnerRef {
  triggerRun: () => void
}

const DEFAULT_SCRIPTS: Script[] = [
  { id: 'test', name: 'Run Tests', command: 'npm test' },
  { id: 'lint', name: 'Lint', command: 'npm run lint' },
  { id: 'build', name: 'Build', command: 'npm run build' },
  { id: 'typecheck', name: 'Type Check', command: 'tsc --noEmit' },
]

// ANSI to HTML converter for colored output
function ansiToHtml(text: string): string {
  const ansiColors: Record<string, string> = {
    '30': 'var(--ansi-black)', '31': 'var(--ansi-red)', '32': 'var(--ansi-green)', 
    '33': 'var(--ansi-yellow)', '34': 'var(--ansi-blue)', '35': 'var(--ansi-magenta)', 
    '36': 'var(--ansi-cyan)', '37': 'var(--ansi-white)',
    '90': 'var(--ansi-bright-black)', '91': 'var(--ansi-bright-red)', 
    '92': 'var(--ansi-bright-green)', '93': 'var(--ansi-bright-yellow)',
    '94': 'var(--ansi-bright-blue)', '95': 'var(--ansi-bright-magenta)', 
    '96': 'var(--ansi-bright-cyan)', '97': 'var(--ansi-bright-white)',
  }

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  let result = ''
  let open = false
  const parts = html.split(/(\x1b\[[0-9;]*m)/)

  for (const part of parts) {
    const m = part.match(/^\x1b\[([0-9;]*)m$/)
    if (m) {
      const codes = m[1].split(';').map(Number)
      if (open) {
        result += '</span>'
        open = false
      }
      const styles: string[] = []
      for (const c of codes) {
        if (c === 0) continue
        if (c === 1) styles.push('font-weight:bold')
        else if (c === 2) styles.push('opacity:0.6')
        else if (c === 3) styles.push('font-style:italic')
        else if (c === 4) styles.push('text-decoration:underline')
        else if (ansiColors[c]) styles.push(`color:${ansiColors[c]}`)
      }
      if (styles.length) {
        result += `<span style="${styles.join(';')}">`
        open = true
      }
    } else {
      result += part
    }
  }
  if (open) result += '</span>'
  return result
}

export const ScriptRunner = forwardRef<ScriptRunnerRef, ScriptRunnerProps>(function ScriptRunner(
  { taskId, workspacePath, scripts = DEFAULT_SCRIPTS },
  ref
) {
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [output, setOutput] = useState<string[]>([])
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [currentScript, setCurrentScript] = useState<Script | null>(null)
  
  const outputRef = useRef<HTMLPreElement>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const runScript = useCallback(async (script: Script) => {
    if (isRunning) return
    
    setIsRunning(true)
    setStatus('running')
    setOutput([])
    setExitCode(null)
    setCurrentScript(script)
    setShowOutput(true)
    setShowDropdown(false)

    try {
      // Listen for script events
      const unlisten = await listen<ScriptEvent>(`script-event-${taskId}`, (event) => {
        const { payload } = event
        
        if (payload.type === 'output' && payload.data) {
          setOutput(prev => [...prev, payload.data!])
        } else if (payload.type === 'error' && payload.data) {
          setOutput(prev => [...prev, payload.data!])
        } else if (payload.type === 'exit') {
          const success = payload.code === 0
          setStatus(success ? 'success' : 'error')
          setExitCode(payload.code ?? -1)
          setIsRunning(false)
          
          // Auto-hide success after 3 seconds
          if (success) {
            setTimeout(() => {
              setStatus('idle')
            }, 3000)
          }
        }
      })
      
      unlistenRef.current = unlisten

      // Start script
      await invoke('run_script_streaming', {
        taskId,
        command: script.command,
        cwd: workspacePath,
      })
    } catch (error) {
      setOutput(prev => [...prev, `Error: ${error}`])
      setStatus('error')
      setIsRunning(false)
    }
  }, [isRunning, taskId, workspacePath])

  const stopScript = useCallback(async () => {
    if (!isRunning) return
    
    try {
      await invoke('stop_script', { taskId })
      setStatus('error')
      setIsRunning(false)
    } catch (error) {
      console.error('Failed to stop script:', error)
    }
  }, [isRunning, taskId])

  const handleRunDefault = useCallback(() => {
    const firstScript = scripts.find(s => s.command.trim())
    if (firstScript) {
      runScript(firstScript)
    }
  }, [scripts, runScript])

  // Expose triggerRun to parent via ref
  useImperativeHandle(ref, () => ({
    triggerRun: handleRunDefault
  }))

  const hasScripts = scripts.length > 0 && scripts.some(s => s.command.trim())

  if (!hasScripts) {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Run Button Group */}
      <div className="flex items-stretch">
        {isRunning ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={stopScript}
            className="h-7 px-2 text-xs bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:text-red-300 rounded-r-none"
          >
            <Square className="w-3 h-3 mr-1" />
            Stop
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRunDefault}
            className={cn(
              "h-7 px-2 text-xs rounded-r-none border",
              status === 'success' && "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20",
              status === 'error' && "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20",
              status === 'idle' && "bg-app-accent/10 text-app-accent border-app-accent/30 hover:bg-app-accent/20"
            )}
          >
            {status === 'success' ? (
              <Check className="w-3 h-3 mr-1" />
            ) : status === 'error' ? (
              <X className="w-3 h-3 mr-1" />
            ) : (
              <Play className="w-3 h-3 mr-1" />
            )}
            Run
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDropdown(!showDropdown)}
          className={cn(
            "h-7 px-1.5 rounded-l-none border-l-0 border",
            isRunning && "bg-red-500/10 text-red-400 border-red-500/30",
            status === 'success' && !isRunning && "bg-green-500/10 text-green-400 border-green-500/30",
            status === 'error' && !isRunning && "bg-red-500/10 text-red-400 border-red-500/30",
            status === 'idle' && !isRunning && "bg-app-accent/10 text-app-accent border-app-accent/30"
          )}
        >
          <ChevronDown className="w-3 h-3" />
        </Button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-app-panel border border-app-border rounded-lg shadow-xl z-50 overflow-hidden">
          {scripts.map((script, idx) => (
            script.command.trim() && (
              <button
                key={script.id}
                onClick={() => runScript(script)}
                disabled={isRunning}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-app-text hover:bg-app-sidebar disabled:opacity-50 transition-colors"
              >
                <Play className="w-3 h-3 text-app-accent" />
                <span className="flex-1 text-left">{script.name}</span>
                {idx === 0 && (
                  <span className="text-[10px] text-app-text-muted bg-app-bg px-1.5 py-0.5 rounded">
                    default
                  </span>
                )}
              </button>
            )
          ))}
          
          {output.length > 0 && !showOutput && (
            <>
              <div className="h-px bg-app-border my-1" />
              <button
                onClick={() => setShowOutput(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-app-text hover:bg-app-sidebar transition-colors"
              >
                <Terminal className="w-3 h-3 text-app-text-muted" />
                <span className="flex-1 text-left">Show last output</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Output Popover */}
      {showOutput && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[500px] max-h-[300px] bg-app-panel border border-app-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-app-border bg-app-sidebar/50">
            <div className="flex items-center gap-2">
              {isRunning && <Loader2 className="w-3 h-3 animate-spin text-app-accent" />}
              <span className="text-xs font-medium text-app-text">
                {currentScript?.name || 'Script'}
              </span>
              {isRunning && (
                <span className="text-[10px] text-app-text-muted">running...</span>
              )}
            </div>
            <button
              onClick={() => setShowOutput(false)}
              className="p-1 text-app-text-muted hover:text-app-text hover:bg-app-bg rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Output */}
          <pre
            ref={outputRef}
            className="p-3 text-[11px] font-mono leading-relaxed text-app-text overflow-auto max-h-[230px] bg-app-bg"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            dangerouslySetInnerHTML={{
              __html: output.length > 0 
                ? output.map(line => ansiToHtml(line)).join('\n')
                : '<span class="text-app-text-muted">No output yet...</span>'
            }}
          />

          {/* Exit Status */}
          {exitCode !== null && (
            <div className={cn(
              "px-3 py-2 text-xs font-medium border-t border-app-border",
              exitCode === 0 
                ? "text-green-400 bg-green-500/5" 
                : "text-red-400 bg-red-500/5"
            )}>
              {exitCode === 0 
                ? '✓ Exited successfully' 
                : `✗ Exit code ${exitCode}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
