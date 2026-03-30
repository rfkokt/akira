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
  Loader2,
  Zap,
} from 'lucide-react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEngineStore } from '@/store/engineStore'
import { dbService } from '@/lib/db'
import type { CliOutputEvent, CliCompleteEvent, ChatMessage, RouterProviderInfo } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp?: Date
}

const TOOL_CALL_REGEX = /\[Tool:\s*[\w ]+\]/gi;
const TOOL_CALL_LINE_REGEX = /^\s*\[Tool:\s*[\w ]+\]\s*$/g;

const isToolCallLine = (line: string): boolean => {
  return TOOL_CALL_LINE_REGEX.test(line.trim());
};

const stripToolCalls = (text: string): string => {
  return text.split('\n')
    .filter(line => !isToolCallLine(line))
    .map(line => line.replace(TOOL_CALL_REGEX, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

interface TerminalLine {
  type: 'command' | 'stdout' | 'stderr' | 'system' | 'error' | 'warning'
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
  const [useRouter, setUseRouter] = useState(true)
  const [routerProviders, setRouterProviders] = useState<RouterProviderInfo[]>([])
  const [selectedRouterProvider, setSelectedRouterProvider] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [pendingSwitch, setPendingSwitch] = useState<{ newProvider: string; sessionId: string } | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeEngine = useEngineStore(state => state.activeEngine)
  const unlistenFns = useRef<UnlistenFn[]>([])

  useEffect(() => {
    if (taskId) loadChatHistory()
  }, [taskId])

  useEffect(() => {
    if (!isOpen) return

    const loadRouterProviders = async () => {
      try {
        const providers = await dbService.getRouterProviders()
        setRouterProviders(providers)
        if (providers.length > 0 && !selectedRouterProvider) {
          const idleProvider = providers.find(p => p.status === 'idle' && p.enabled)
          setSelectedRouterProvider(idleProvider?.alias || providers[0].alias)
        }
      } catch (err) {
        console.error('Failed to load router providers:', err)
      }
    }

    loadRouterProviders()
  }, [isOpen])

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
        
        if (isToolCallLine(line)) return
        
        const cleanedLine = stripToolCalls(line)
        if (!cleanedLine) return
        
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            const newMessages = [...prev]
            newMessages[newMessages.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + cleanedLine + '\n'
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
              await dbService.createChatMessage(taskId, 'assistant', stripToolCalls(lastMsg.content), activeEngine.alias)
            } catch (err) {
              console.error('Failed to save chat message:', err)
            }
          }
        }
      })

      const unlistenAgentOutput = await listen<{ session_id: string; line: string; is_error: boolean }>('agent-output', (event) => {
        const { line, is_error } = event.payload
        
        setTerminalLines(prev => [...prev, {
          type: is_error ? 'stderr' : 'stdout',
          content: line,
          timestamp: new Date()
        }])
        
        if (isToolCallLine(line)) return
        
        const cleanedLine = stripToolCalls(line)
        if (!cleanedLine) return
        
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            const newMessages = [...prev]
            newMessages[newMessages.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + cleanedLine + '\n'
            }
            return newMessages
          }
          return prev
        })
      })

      const unlistenTokenLimit = await listen<{ session_id: string; line: string }>('agent-token-limit', (event) => {
        const { line } = event.payload
        setTerminalLines(prev => [...prev, {
          type: 'system',
          content: `[Token limit detected: ${line.substring(0, 100)}...]`,
          timestamp: new Date()
        }])
      })

      const unlistenAgentComplete = await listen<{ session_id: string; success: boolean; switched: boolean; new_provider: string | null }>('agent-complete', async (event) => {
        const { session_id, switched, new_provider } = event.payload
        setIsStreaming(false)
        
        if (switched && new_provider) {
          setTerminalLines(prev => [...prev, {
            type: 'system',
            content: `[Provider switched to: ${new_provider}]`,
            timestamp: new Date()
          }])
          setPendingSwitch({ newProvider: new_provider, sessionId: session_id })
          setSelectedRouterProvider(new_provider)
        }
        
        if (taskId) {
          const lastMsg = messages[messages.length - 1]
          if (lastMsg?.role === 'assistant') {
            try {
              const engineAlias = useRouter ? selectedRouterProvider! : activeEngine!.alias
              await dbService.createChatMessage(taskId, 'assistant', stripToolCalls(lastMsg.content), engineAlias)
            } catch (err) {
              console.error('Failed to save chat message:', err)
            }
          }
        }
      })

      const unlistenBudgetAlert = await listen<{ total_cost: number; budget_limit: number; threshold: number; alert_threshold_pct: number }>('budget-alert', (event) => {
        const { total_cost, budget_limit, alert_threshold_pct } = event.payload
        setTerminalLines(prev => [...prev, {
          type: 'warning',
          content: `[Budget Alert: $${total_cost.toFixed(2)} spent (${(alert_threshold_pct * 100).toFixed(0)}% of $${budget_limit.toFixed(2)} limit)]`,
          timestamp: new Date()
        }])
      })

      unlistenFns.current = [unlistenOutput, unlistenError, unlistenComplete, unlistenAgentOutput, unlistenTokenLimit, unlistenAgentComplete, unlistenBudgetAlert]
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
      if (useRouter && taskId) {
        await dbService.stopAgent(taskId)
      } else {
        await dbService.stopCli()
      }
      setIsStreaming(false)
      setTerminalLines(prev => [...prev, {
        type: 'system',
        content: '[Stopped by user]',
        timestamp: new Date()
      }])
    } catch (err) {
      console.error('Failed to stop:', err)
    }
  }, [isStreaming, useRouter, taskId])

  const handleSend = useCallback(async () => {
    if (!message.trim() || isStreaming) return
    
    if (useRouter) {
      if (!selectedRouterProvider) {
        setError('No router provider selected. Please select a provider.')
        return
      }
    } else {
      if (!activeEngine) {
        setError('No AI engine selected. Please configure an engine in Settings.')
        return
      }

      if (!activeEngine.enabled) {
        setError('Selected engine is disabled. Please enable it in Settings.')
        return
      }
    }

    const userMessage = message.trim()
    setMessage('')
    setError(null)
    
    const providerAlias = useRouter ? selectedRouterProvider! : activeEngine!.alias
    
    const newMessage: Message = { 
      role: 'user', 
      content: userMessage,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newMessage])
    
    if (taskId) {
      try {
        await dbService.createChatMessage(taskId, 'user', userMessage, providerAlias)
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

    // Build conversation context from previous messages
    const conversationContext = messages
      .filter(msg => !msg.isStreaming)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')
    
    let fullPrompt = conversationContext 
      ? `Previous conversation:\n${conversationContext}\n\nUser: ${userMessage}\n\nAssistant:`
      : userMessage

    try {
      if (useRouter) {
        // Use CLI Router
        const request = {
          task_id: taskId || '',
          provider_alias: selectedRouterProvider!,
          prompt: fullPrompt + '\n',
          cwd: projectPath || process.cwd(),
          session_id: currentSessionId || undefined,
        }
        
        setTerminalLines(prev => [
          ...prev,
          { type: 'system', content: `────────────────────────────────────────`, timestamp: new Date() },
          { type: 'system', content: `Router Mode: ${selectedRouterProvider}`, timestamp: new Date() },
          { type: 'system', content: `Working directory: ${projectPath || '(current)'}`, timestamp: new Date() },
          { type: 'stdout', content: '', timestamp: new Date() }
        ])

        const response = await dbService.runAgent(request)
        
        if (response.switched && response.new_provider) {
          setTerminalLines(prev => [...prev, {
            type: 'system',
            content: `[Auto-switched to ${response.new_provider} due to token limit]`,
            timestamp: new Date()
          }])
        }
        
        setCurrentSessionId(response.session_id)
      } else {
        // Use direct CLI (legacy mode)
        let args: string[] = []
        if (activeEngine!.args) {
          args = activeEngine!.args.split(' ').filter(Boolean)
        }
        
        if (activeEngine!.model) {
          if (activeEngine!.alias.toLowerCase().includes('ollama')) {
            args = ['run', activeEngine!.model, ...args]
          } else if (activeEngine!.alias.toLowerCase().includes('claude')) {
            args = ['--model', activeEngine!.model, ...args]
          }
        }

        const fullCommand = `${activeEngine!.binary_path} ${args.join(' ')}`
        
        setTerminalLines(prev => [
          ...prev,
          { type: 'system', content: `────────────────────────────────────────`, timestamp: new Date() },
          { type: 'system', content: `Working directory: ${projectPath || '(current)'}`, timestamp: new Date() },
          { type: 'command', content: `$ ${fullCommand}`, timestamp: new Date() },
          { type: 'stdout', content: '', timestamp: new Date() }
        ])

        await dbService.runCli(activeEngine!.binary_path, args, fullPrompt + '\n', projectPath)
      }
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
  }, [message, isStreaming, activeEngine, taskId, useRouter, selectedRouterProvider, projectPath, currentSessionId])

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
          {useRouter ? (
            <span className="text-xs text-[#0e639c] flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Router: {selectedRouterProvider || 'None'}
            </span>
          ) : (
            activeEngine && (
              <span className="text-xs text-[#858585]">
                ({activeEngine.alias}{activeEngine.model && ` • ${activeEngine.model}`})
              </span>
            )
          )}
          {isStreaming && (
            <button 
              onClick={handleStop}
              className="flex items-center gap-1 text-xs text-[#c75450] hover:text-[#d75550] hover:underline cursor-pointer"
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
                  className="text-xs text-[#0e639c] hover:underline"
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
                      className={`font-geist text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user' 
                          ? 'text-[#0e639c]' 
                          : 'text-[#cccccc]'
                      }`}
                    >
                      <span className="text-[#6e6e6e] mr-2">{msg.role}:</span>
                      {stripToolCalls(msg.content) || (msg.isStreaming && (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="w-1 h-1 bg-[#0e639c] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 bg-[#0e639c] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-1 bg-[#0e639c] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      ))}
                      {msg.isStreaming && msg.content && (
                        <span className="inline-block w-0.5 h-3 bg-[#0e639c] animate-pulse ml-0.5" />
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {!showTerminal && (
                <div className="p-2 bg-[#252526] border-t border-white/5">
                  {/* Router Toggle */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setUseRouter(!useRouter)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                          useRouter 
                            ? 'bg-[#0e639c]/20 text-[#0e639c]' 
                            : 'bg-[#3c3c3c] text-[#858585]'
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        Router {useRouter ? 'ON' : 'OFF'}
                      </button>
                      {useRouter && (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedRouterProvider || ''}
                            onChange={(e) => setSelectedRouterProvider(e.target.value)}
                            className="bg-[#3c3c3c] text-xs text-[#cccccc] px-2 py-1 rounded border border-white/10 outline-none focus:border-[#0e639c]"
                          >
                            {routerProviders.filter(p => p.enabled).map(p => (
                              <option key={p.alias} value={p.alias}>
                                {p.alias} ({p.status})
                              </option>
                            ))}
                          </select>
                          {pendingSwitch && (
                            <span className="text-xs text-yellow-400 animate-pulse">
                              Switched to {pendingSwitch.newProvider}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {!useRouter && (
                      <span className="text-xs text-[#858585]">
                        Engine: {activeEngine?.alias || 'None'}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        useRouter 
                          ? (selectedRouterProvider ? 'Type a message...' : 'Select a provider first...')
                          : (activeEngine ? 'Type a message...' : 'Configure engine first...')
                      }
                      disabled={(useRouter ? !selectedRouterProvider : !activeEngine) || isStreaming}
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
                        disabled={(useRouter ? !selectedRouterProvider : !activeEngine) || !message.trim()}
                        className="p-2 bg-[#0e639c] hover:bg-[#1177bb] disabled:bg-[#3c3c3c] disabled:opacity-50 text-white transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 px-0.5">
                    <span className="text-xs text-[#6e6e6e]">
                      Press Enter to send
                    </span>
                    <button 
                      onClick={() => setShowTerminal(true)}
                      className="text-xs text-[#6e6e6e] hover:text-[#0e639c] transition-colors"
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
                    <span className="text-xs text-[#858585] uppercase">Output</span>
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
                <div className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-relaxed bg-[#1e1e1e]">
                  {terminalLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[#6e6e6e]">
                      <ScrollText className="w-8 h-8 mb-2 opacity-30" />
                      <span className="text-xs">No output</span>
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
