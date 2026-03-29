import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  MessageSquare, 
  X, 
  Send, 
  Minimize2, 
  Maximize2, 
  Bot, 
  AlertCircle,
  Terminal,
  ChevronRight,
  ScrollText,
  Copy,
  Check,
  Trash2,
  PanelLeft,
  Square,
  Loader2
} from 'lucide-react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEngineStore } from '@/store/engineStore'
import { dbService } from '@/lib/db'
import type { CliOutputEvent, CliCompleteEvent, ChatMessage } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp?: Date
}

interface TerminalLine {
  type: 'command' | 'stdout' | 'stderr' | 'system' | 'error'
  content: string
  timestamp: Date
}

interface ChatBoxProps {
  taskId?: string
  projectPath?: string
}

export function ChatBox({ taskId, projectPath }: ChatBoxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeEngine = useEngineStore(state => state.activeEngine)
  const unlistenFns = useRef<UnlistenFn[]>([])

  useEffect(() => {
    if (taskId) loadChatHistory()
  }, [taskId])

  const loadChatHistory = async () => {
    if (!taskId) return
    try {
      const history = await dbService.getChatHistory(taskId)
      const loadedMessages: Message[] = history.map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at)
      }))
      setMessages(loadedMessages)
    } catch (err) {
      console.error('Failed to load chat history:', err)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    const setupListeners = async () => {
      const unlistenOutput = await listen<CliOutputEvent>('cli-output', (event) => {
        const { line, is_error } = event.payload
        
        setTerminalLines(prev => [...prev, {
          type: is_error ? 'stderr' : 'stdout',
          content: line,
          timestamp: new Date()
        }])
        
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            const newMessages = [...prev]
            newMessages[newMessages.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + line + '\n'
            }
            return newMessages
          }
          return prev
        })
      })

      const unlistenError = await listen<string>('cli-error', (event) => {
        setError(event.payload)
        setTerminalLines(prev => [...prev, {
          type: 'error',
          content: event.payload,
          timestamp: new Date()
        }])
        setIsStreaming(false)
      })

      const unlistenComplete = await listen<CliCompleteEvent>('cli-complete', async (event) => {
        setIsStreaming(false)
        const { success, exit_code, error_message } = event.payload
        
        setTerminalLines(prev => [...prev, {
          type: 'system',
          content: success 
            ? `[Process exited with code ${exit_code || 0}]`
            : `[Process failed: ${error_message || 'Unknown error'}]`,
          timestamp: new Date()
        }])
        
        if (!success) setError(error_message || 'Process failed')

        if (taskId && activeEngine) {
          const lastMsg = messages[messages.length - 1]
          if (lastMsg?.role === 'assistant') {
            try {
              await dbService.createChatMessage(taskId, 'assistant', lastMsg.content, activeEngine.alias)
            } catch (err) {
              console.error('Failed to save chat message:', err)
            }
          }
        }
      })

      unlistenFns.current = [unlistenOutput, unlistenError, unlistenComplete]
    }

    setupListeners()

    return () => {
      unlistenFns.current.forEach(fn => fn())
      unlistenFns.current = []
    }
  }, [isOpen, taskId, activeEngine, messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  useEffect(() => {
    if (isOpen && !isMinimized && !showTerminal) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMinimized, showTerminal])

  const handleStop = useCallback(async () => {
    if (!isStreaming) return
    
    try {
      await dbService.stopCli()
      setIsStreaming(false)
      setTerminalLines(prev => [...prev, {
        type: 'system',
        content: '[Stopped by user]',
        timestamp: new Date()
      }])
    } catch (err) {
      console.error('Failed to stop:', err)
    }
  }, [isStreaming])

  const handleSend = useCallback(async () => {
    if (!message.trim() || isStreaming) return
    
    if (!activeEngine) {
      setError('No AI engine selected. Please configure an engine in Settings.')
      return
    }

    if (!activeEngine.enabled) {
      setError('Selected engine is disabled. Please enable it in Settings.')
      return
    }

    const userMessage = message.trim()
    setMessage('')
    setError(null)
    
    const newMessage: Message = { 
      role: 'user', 
      content: userMessage,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newMessage])
    
    if (taskId) {
      try {
        await dbService.createChatMessage(taskId, 'user', userMessage, activeEngine.alias)
      } catch (err) {
        console.error('Failed to save user message:', err)
      }
    }

    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: '', 
      isStreaming: true,
      timestamp: new Date()
    }])
    setIsStreaming(true)

    let args: string[] = []
    if (activeEngine.args) {
      args = activeEngine.args.split(' ').filter(Boolean)
    }
    
    if (activeEngine.model) {
      if (activeEngine.alias.toLowerCase().includes('ollama')) {
        args = ['run', activeEngine.model, ...args]
      } else if (activeEngine.alias.toLowerCase().includes('claude')) {
        args = ['--model', activeEngine.model, ...args]
      }
    }

    // Build conversation context from previous messages
    const conversationContext = messages
      .filter(msg => !msg.isStreaming) // Exclude streaming placeholder
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')
    
    // Build full prompt with context
    let fullPrompt = ''
    if (conversationContext) {
      fullPrompt = `Previous conversation:\n${conversationContext}\n\nUser: ${userMessage}\n\nAssistant:`
    } else {
      fullPrompt = userMessage
    }

    const fullCommand = `${activeEngine.binary_path} ${args.join(' ')}`
    
    setTerminalLines(prev => [
      ...prev,
      { type: 'system', content: `────────────────────────────────────────`, timestamp: new Date() },
      { type: 'system', content: `Working directory: ${projectPath || '(current)'}`, timestamp: new Date() },
      { type: 'command', content: `$ ${fullCommand}`, timestamp: new Date() },
      { type: 'stdout', content: '', timestamp: new Date() }
    ])

    try {
      await dbService.runCli(activeEngine.binary_path, args, fullPrompt + '\n', projectPath)
    } catch (err) {
      const errorMsg = String(err)
      setError(errorMsg)
      setTerminalLines(prev => [...prev, {
        type: 'error',
        content: `Failed: ${errorMsg}`,
        timestamp: new Date()
      }])
      setIsStreaming(false)
      setMessages(prev => prev.filter(msg => !msg.isStreaming))
    }
  }, [message, isStreaming, activeEngine, taskId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const copyTerminal = () => {
    const text = terminalLines.map(line => line.content).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const clearTerminal = () => setTerminalLines([])

  const formatTime = (date?: Date) => {
    if (!date) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-10 h-10 bg-[#0e639c] hover:bg-[#1177bb] text-white flex items-center justify-center transition-colors z-50 shadow-lg"
      >
        <MessageSquare className="w-4 h-4" />
      </button>
    )
  }

  const mainHeight = isMinimized 
    ? 'h-9' 
    : isExpanded 
      ? 'h-[700px]' 
      : 'h-[480px]'

  return (
    <div 
      className={`fixed right-4 bottom-4 bg-[#252526] border border-white/10 shadow-2xl z-50 flex flex-col ${mainHeight} ${
        isExpanded ? 'w-[800px]' : 'w-[420px]'
      }`}
    >
      {/* Header - VS Code Style */}
      <div className="flex items-center justify-between px-3 h-9 bg-[#2d2d2d] border-b border-white/5 select-none">
        <div className="flex items-center gap-2">
          {showTerminal ? (
            <Terminal className="w-3.5 h-3.5 text-[#858585]" />
          ) : (
            <Bot className="w-3.5 h-3.5 text-[#858585]" />
          )}
          <span className="text-xs text-[#cccccc] font-geist">
            {showTerminal ? 'Terminal' : 'Chat'}
          </span>
          {activeEngine && (
            <span className="text-[10px] text-[#858585]">
              ({activeEngine.alias}{activeEngine.model && ` • ${activeEngine.model}`})
            </span>
          )}
          {isStreaming && (
            <button 
              onClick={handleStop}
              className="flex items-center gap-1 text-[10px] text-[#c75450] hover:text-[#d75550] hover:underline cursor-pointer"
              title="Click to stop"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Running (click to stop)
            </button>
          )}
        </div>

        <div className="flex items-center">
          {!isMinimized && (
            <>
              <button 
                onClick={() => setShowTerminal(!showTerminal)}
                className={`p-1.5 hover:bg-white/5 transition-colors ${showTerminal ? 'text-[#0e639c]' : 'text-[#858585] hover:text-[#cccccc]'}`}
                title={showTerminal ? 'Show Chat' : 'Show Terminal'}
              >
                {showTerminal ? <Bot className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-[#858585] hover:text-[#cccccc] hover:bg-white/5 transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 text-[#858585] hover:text-[#cccccc] hover:bg-white/5 transition-colors"
            title={isMinimized ? "Show" : "Hide to sidebar"}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-[#858585] hover:text-white hover:bg-[#c75450] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Error Banner */}
          {error && !showTerminal && (
            <div className="px-3 py-2 bg-[#5a1d1d] border-b border-white/10">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#f48771] flex-shrink-0" />
                <p className="text-xs text-[#f48771] font-geist flex-1">{error}</p>
                <button 
                  onClick={() => setShowTerminal(true)}
                  className="text-[10px] text-[#0e639c] hover:underline"
                >
                  View terminal
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Chat Panel */}
            <div className={`flex flex-col ${showTerminal ? 'w-1/2 border-r border-white/5' : 'w-full'}`}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[#6e6e6e]">
                    <Bot className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-xs text-[#858585] font-geist">
                      {activeEngine ? 'Start a conversation' : 'Configure an engine in Settings'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[95%] ${
                          msg.role === 'user'
                            ? 'bg-[#0e639c] text-white'
                            : 'bg-[#3c3c3c] text-[#cccccc] border border-white/5'
                        }`}
                      >
                        {/* Message Header */}
                        <div className={`flex items-center gap-2 px-2.5 py-1.5 border-b ${
                          msg.role === 'user' 
                            ? 'border-white/10' 
                            : 'border-white/5'
                        }`}>
                          {msg.role === 'assistant' ? (
                            <Bot className="w-3 h-3 text-[#858585]" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-white/60" />
                          )}
                          <span className="text-[10px] uppercase tracking-wide text-[#858585]">
                            {msg.role}
                          </span>
                          {msg.timestamp && (
                            <span className="ml-auto text-[9px] text-[#6e6e6e]">
                              {formatTime(msg.timestamp)}
                            </span>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="px-2.5 py-2">
                          <div className="text-xs font-geist leading-relaxed whitespace-pre-wrap">
                            {msg.content || (msg.isStreaming && (
                              <span className="inline-flex items-center gap-1">
                                <span className="w-1 h-1 bg-[#0e639c] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 bg-[#0e639c] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 bg-[#0e639c] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                            ))}
                          </div>
                        </div>

                        {msg.isStreaming && msg.content && (
                          <div className="px-2.5 pb-2">
                            <span className="inline-block w-0.5 h-3 bg-[#0e639c] animate-pulse" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {!showTerminal && (
                <div className="p-2 bg-[#252526] border-t border-white/5">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={activeEngine ? 'Type a message...' : 'Configure engine first...'}
                      disabled={!activeEngine || isStreaming}
                      rows={1}
                      className="flex-1 bg-[#3c3c3c] text-xs text-[#cccccc] placeholder-[#6e6e6e] font-geist resize-none outline-none px-2.5 py-2 max-h-24 min-h-[32px] border border-transparent focus:border-[#0e639c] disabled:opacity-50"
                    />
                    {isStreaming ? (
                      <button
                        onClick={handleStop}
                        className="p-2 bg-[#c75450] hover:bg-[#d75550] text-white transition-colors animate-pulse"
                        title="Stop generation"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={!activeEngine || !message.trim()}
                        className="p-2 bg-[#0e639c] hover:bg-[#1177bb] disabled:bg-[#3c3c3c] disabled:opacity-50 text-white transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 px-0.5">
                    <span className="text-[9px] text-[#6e6e6e]">
                      Press Enter to send
                    </span>
                    <button 
                      onClick={() => setShowTerminal(true)}
                      className="text-[9px] text-[#6e6e6e] hover:text-[#0e639c] transition-colors"
                    >
                      Show terminal
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Panel */}
            {showTerminal && (
              <div className="w-1/2 flex flex-col bg-[#1e1e1e]">
                {/* Terminal Toolbar */}
                <div className="flex items-center justify-between px-2 py-1.5 bg-[#2d2d2d] border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-[#858585]" />
                    <span className="text-[10px] text-[#858585] uppercase">Output</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button 
                      onClick={copyTerminal}
                      className="p-1 text-[#858585] hover:text-[#cccccc] hover:bg-white/5 transition-colors"
                      title="Copy"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button 
                      onClick={clearTerminal}
                      className="p-1 text-[#858585] hover:text-[#f48771] hover:bg-white/5 transition-colors"
                      title="Clear"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Terminal Content */}
                <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed bg-[#1e1e1e]">
                  {terminalLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[#6e6e6e]">
                      <ScrollText className="w-8 h-8 mb-2 opacity-30" />
                      <span className="text-[10px]">No output</span>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {terminalLines.map((line, idx) => (
                        <div 
                          key={idx}
                          className={`${
                            line.type === 'command' ? 'text-[#9cdcfe]' :
                            line.type === 'stderr' ? 'text-[#f48771]' :
                            line.type === 'error' ? 'text-[#f48771] bg-[#5a1d1d]/30' :
                            line.type === 'system' ? 'text-[#6e6e6e]' :
                            'text-[#cccccc]'
                          }`}
                        >
                          <span className="break-all">{line.content}</span>
                        </div>
                      ))}
                      {isStreaming && (
                        <div className="text-[#6e6e6e] animate-pulse">
                          <span>...</span>
                        </div>
                      )}
                      <div ref={terminalEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
