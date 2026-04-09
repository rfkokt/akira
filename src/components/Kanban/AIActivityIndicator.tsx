import { useEffect, useState, useRef } from 'react'
import { Loader2, Terminal } from 'lucide-react'
import { useAIChatStore } from '@/store'
import type { AITaskState } from '@/store/aiChatStore'

interface AIActivityIndicatorProps {
  taskId: string
  taskState: AITaskState | undefined
  showTerminal?: boolean
  maxHeight?: string
}

export function AIActivityIndicator({ 
  taskId, 
  taskState, 
  showTerminal = false, 
  maxHeight = 'auto' 
}: AIActivityIndicatorProps) {
  const aiChatStore = useAIChatStore()
  const [messages, setMessages] = useState<typeof aiChatStore.messages[string]>([])
  const messagesRef = useRef<typeof aiChatStore.messages[string]>([])
  
  useEffect(() => {
    const updateMessages = () => {
      const newMessages = aiChatStore.getMessages(taskId)
      const prevMessages = messagesRef.current
      
      if (newMessages.length !== prevMessages.length || 
          (newMessages.length > 0 && prevMessages.length > 0 && 
           newMessages[newMessages.length - 1].content !== prevMessages[prevMessages.length - 1]?.content)) {
        messagesRef.current = newMessages
        setMessages(newMessages)
      }
    }
    
    updateMessages()
    
    const interval = setInterval(updateMessages, 500)
    
    return () => clearInterval(interval)
  }, [taskId, aiChatStore])
  
  const assistantMessages = messages.filter(m => m.role === 'assistant')
  const latestOutput = assistantMessages.length > 0 
    ? assistantMessages[assistantMessages.length - 1].content 
    : ''

  const formatFileName = (path: string) => {
    const parts = path.split('/')
    return parts[parts.length - 1]
  }

  const getLastOutputLines = () => {
    if (!latestOutput) return []
    return latestOutput.split('\n').slice(-20)
  }

  const getCurrentAction = () => {
    if (!latestOutput) return 'Initializing...'
    
    const output = latestOutput.toLowerCase()
    const lines = latestOutput.split('\n').filter(Boolean)
    const lastLine = lines[lines.length - 1] || ''
    const lastLower = lastLine.toLowerCase()

    // Claude stream-json tool use format: [Tool: write_file] path/to/file
    if (lastLower.includes('[tool:') || lastLower.includes('tool_use')) {
      const toolMatch = lastLine.match(/\[Tool:\s*([^\]]+)\]/i)
      const toolName = toolMatch ? toolMatch[1].trim() : 'tool'
      if (toolName.includes('write') || toolName.includes('create') || toolName.includes('edit')) return 'Writing files...'
      if (toolName.includes('read') || toolName.includes('view')) return 'Reading files...'
      if (toolName.includes('bash') || toolName.includes('exec') || toolName.includes('run')) return 'Running commands...'
      return `Using ${toolName}...`
    }

    // Generic keyword detection across full output
    if (output.includes('write') || output.includes('create') || output.includes('modify')) {
      return 'Writing files...'
    }
    if (output.includes('read') || output.includes('analyze') || output.includes('examine')) {
      return 'Analyzing code...'
    }
    if (output.includes('run') || output.includes('execute') || output.includes('install') || output.includes('npm') || output.includes('node')) {
      return 'Running commands...'
    }
    if (output.includes('error') || output.includes('failed') || output.includes('exception')) {
      return 'Error occurred'
    }
    if (output.includes('✅') || output.includes('complete') || output.includes('done') || output.includes('finished')) {
      return 'Completed ✅'
    }
    
    return 'AI is working...'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
        <span className="text-xs font-medium text-cyan-400">
          {getCurrentAction()}
        </span>
      </div>
      
      {(showTerminal || taskState?.status === 'running') && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500">Output</span>
            {taskState?.currentFile && (
              <span className="text-xs text-blue-400 font-mono truncate max-w-[150px]">
                {formatFileName(taskState.currentFile)}
              </span>
            )}
          </div>
          <div 
            className="bg-app-bg rounded border border-app-border p-2 font-mono text-xs overflow-y-auto"
            style={{ maxHeight: maxHeight === 'auto' ? '120px' : maxHeight }}
          >
            {latestOutput ? (
              <div className="space-y-0.5">
                <div className="text-yellow-500/70 text-xs mb-1 border-b border-app-border pb-1">
                  {getCurrentAction()}
                </div>
                {getLastOutputLines().map((line, idx) => (
                  <div key={idx} className="text-neutral-300 whitespace-pre-wrap break-all leading-relaxed">
                    {line}
                  </div>
                ))}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-green-500">❯</span>
                  <span className="w-2 h-3 bg-green-500 animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="text-neutral-600 italic flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Initializing AI...
              </div>
            )}
          </div>
        </div>
      )}
      
      {!showTerminal && taskState?.status === 'running' && (
        <div className="flex items-start gap-1.5">
          <Terminal className="w-3 h-3 text-neutral-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-neutral-400 line-clamp-1">
            {taskState.currentFile 
              ? `Editing ${formatFileName(taskState.currentFile)}...` 
              : latestOutput ? 'Processing...' : 'Initializing...'}
          </p>
        </div>
      )}
    </div>
  )
}