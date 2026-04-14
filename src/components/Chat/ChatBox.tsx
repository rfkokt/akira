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
  ScrollText,
  Copy,
  Check,
  Trash2,
  PanelLeft,
  Square,
  Loader2,
  Zap,
  User,
} from 'lucide-react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEngineStore } from '@/store/engineStore'
import { useConfigStore } from '@/store/configStore'
import { dbService } from '@/lib/db'
import type { CliOutputEvent, CliCompleteEvent, ChatMessage, RouterProviderInfo } from '@/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
      const unlistenOutput = await listen<CliOutputEvent & { id: string }>('cli-output', (event) => {
        if (event.payload.id !== (taskId || 'chatbox')) return;
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

      const unlistenComplete = await listen<CliCompleteEvent & { id: string }>('cli-complete', async (event) => {
        if (event.payload.id !== (taskId || 'chatbox')) return;
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

    const conversationContext = messages
      .filter(msg => !msg.isStreaming)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')
    
    // Get project rules for context
    let systemContext = '';
    try {
      const projectRules = useConfigStore.getState().getSystemPrompt();
      if (projectRules) {
        systemContext = `[PROJECT CONTEXT]\n${projectRules}\n\n`;
      }
    } catch { /* no config */ }
    
    let fullPrompt = conversationContext 
      ? `${systemContext}Previous conversation:\n${conversationContext}\n\nUser: ${userMessage}\n\nAssistant:`
      : `${systemContext}User: ${userMessage}\n\nAssistant:`

    try {
      if (useRouter) {
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

        await dbService.runCli(taskId || 'chatbox', activeEngine!.binary_path, args, fullPrompt + '\n', projectPath)
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

  if (!isOpen) {
    return (
      <Button
        size="icon"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-app-accent hover:bg-app-accent-hover shadow-[0_0_20px_var(--app-accent-glow)] rounded-full transition-all duration-300 hover:scale-105"
      >
        <MessageSquare className="w-5 h-5 text-white" />
      </Button>
    )
  }

  const mainHeight = isMinimized 
    ? 'h-10' 
    : isExpanded 
      ? 'h-[750px] max-h-[90%]' 
      : 'h-[520px]'

  return (
    <TooltipProvider delay={0}>
      <div 
        className={`fixed right-6 bottom-6 bg-app-panel/90 backdrop-blur-2xl border border-app-border/50 shadow-2xl z-50 flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ease-in-out ${mainHeight} ${
          isExpanded ? 'w-[850px]' : 'w-[450px]'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-11 bg-app-sidebar/40 border-b border-app-border/40 select-none">
          <div className="flex items-center gap-2.5">
            {showTerminal ? (
              <Terminal className="w-4 h-4 text-app-text-muted" />
            ) : (
              <Bot className="w-4 h-4 text-app-accent drop-shadow-[0_0_5px_var(--app-accent)]" />
            )}
            <span className="text-xs font-semibold tracking-wide text-app-text">
              {showTerminal ? 'Terminal' : 'Akira AI'}
            </span>
            {useRouter ? (
              <Badge variant="secondary" className="text-xs bg-app-accent/20 text-app-accent border-app-accent/30 tracking-wider">
                <Zap className="w-3 h-3 mr-1" />
                Router: {selectedRouterProvider || 'None'}
              </Badge>
            ) : (
              activeEngine && (
                <span className="text-xs text-app-text-muted">
                  ({activeEngine.alias}{activeEngine.model && ` • ${activeEngine.model}`})
                </span>
              )
            )}
            {isStreaming && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStop}
                className="h-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs rounded-full px-2"
              >
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Running
              </Button>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {!isMinimized && (
              <>
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => setShowTerminal(!showTerminal)}
                    className={`inline-flex items-center justify-center rounded-lg h-7 w-7 ${showTerminal ? 'text-app-accent bg-app-accent/10' : 'text-app-text-muted hover:text-white hover:bg-app-panel'} transition-colors`}
                  >
                    {showTerminal ? <Bot className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
                  </TooltipTrigger>
                  <TooltipContent>{showTerminal ? 'Show Chat' : 'Show Terminal'}</TooltipContent>
                </Tooltip>
                <div className="w-px h-4 bg-app-border mx-1.5" />
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="inline-flex items-center justify-center rounded-lg h-7 w-7 text-app-text-muted hover:text-white hover:bg-app-panel transition-colors"
                  >
                    {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </TooltipTrigger>
                  <TooltipContent>{isExpanded ? 'Minimize' : 'Maximize'}</TooltipContent>
                </Tooltip>
              </>
            )}
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="inline-flex items-center justify-center rounded-lg h-7 w-7 text-app-text-muted hover:text-white hover:bg-app-panel transition-colors"
                  >
                    {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
                  </TooltipTrigger>
                  <TooltipContent>{isMinimized ? "Show" : "Hide"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg h-7 w-7 text-app-text-muted hover:text-red-400 hover:bg-red-400/10 ml-0.5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Close</TooltipContent>
                </Tooltip>
          </div>
        </div>

        {!isMinimized && (
          <>
            {error && !showTerminal && (
              <div className="px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400 flex-1">{error}</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setShowTerminal(true)}
                    className="text-xs text-red-300 hover:text-red-200 h-auto p-0"
                  >
                    View terminal
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              <div className={`flex flex-col ${showTerminal ? 'w-1/2 border-r border-app-border' : 'w-full'}`}>
                <ScrollArea className="h-full p-4">
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-app-text-muted mt-20">
                        <div className="w-16 h-16 bg-app-accent/10 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_var(--app-accent-glow)]">
                          <Bot className="w-8 h-8 text-app-accent opacity-80" />
                        </div>
                        <p className="text-xs">
                          {activeEngine ? 'Start a conversation' : 'Configure an engine in Settings'}
                        </p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div 
                          key={idx}
                          className={`text-sm leading-relaxed whitespace-pre-wrap flex flex-col ${
                            msg.role === 'user' 
                              ? 'items-end' 
                              : 'items-start'
                          }`}
                        >
                          <div className={`flex items-center gap-2 mb-1 opacity-70 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {msg.role === 'user' ? (
                              <User className="w-3.5 h-3.5 text-app-accent" />
                            ) : (
                              <Bot className="w-3.5 h-3.5 text-app-accent" />
                            )}
                            <span className="text-xs font-semibold tracking-wider uppercase text-app-text-muted">
                              {msg.role}
                            </span>
                          </div>
                          <div className={`px-4 py-2.5 rounded-2xl max-w-[90%] shadow-md ${
                            msg.role === 'user'
                              ? 'bg-app-accent/15 border border-app-accent/20 text-blue-50 focus-visible:ring-0 rounded-tr-sm'
                              : 'bg-app-bg/50 border border-app-border text-app-text rounded-tl-sm'
                          }`}>
                            {stripToolCalls(msg.content) || (msg.isStreaming && (
                              <span className="inline-flex items-center gap-1 h-3">
                                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                            ))}
                            {msg.isStreaming && msg.content && (
                              <span className="inline-block w-1 h-3.5 bg-app-accent animate-pulse ml-1 align-middle" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} className="h-2" />
                  </div>
                </ScrollArea>

                <div className="p-3 bg-app-sidebar/80 border-t border-app-border backdrop-blur-md">
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <div className="flex items-center gap-2">
                      <Button
                        variant={useRouter ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setUseRouter(!useRouter)}
                        className={`h-7 px-2.5 text-xs font-semibold tracking-wider rounded-lg transition-all ${useRouter ? 'bg-app-accent/20 text-app-accent border border-app-accent/30 shadow-[0_0_10px_var(--app-accent-glow)]' : 'text-app-text-muted hover:text-white'}`}
                      >
                        <Zap className="w-3 h-3 mr-1.5" />
                        Router {useRouter ? 'ON' : 'OFF'}
                      </Button>
                      {useRouter && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedRouterProvider || undefined}
                            onValueChange={(val) => setSelectedRouterProvider(val)}
                          >
                            <SelectTrigger className="h-7 px-2 text-xs bg-app-bg/50 border-app-border/50 outline-none focus:ring-1 focus:ring-app-accent rounded-md cursor-pointer transition-colors max-w-[150px]">
                              <SelectValue placeholder="Router" />
                            </SelectTrigger>
                            <SelectContent className="bg-app-panel text-xs text-app-text border-app-border">
                              {routerProviders.filter(p => p.enabled).map(p => (
                                <SelectItem key={p.alias} value={p.alias} className="text-xs cursor-pointer focus:bg-white/10">
                                  {p.alias} ({p.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {pendingSwitch && (
                            <span className="text-xs text-yellow-400/80 animate-pulse font-medium">
                              Switched to: {pendingSwitch.newProvider}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {!useRouter && (
                      <span className="text-xs text-app-text-muted font-medium">
                        Engine: {activeEngine?.alias || 'None'}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-end gap-2.5">
                    <Textarea
                      ref={inputRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        useRouter 
                          ? (selectedRouterProvider ? 'Type your request...' : 'Select a provider first...')
                          : (activeEngine ? 'Type your request...' : 'Configure engine first...')
                      }
                      disabled={(useRouter ? !selectedRouterProvider : !activeEngine) || isStreaming}
                      rows={1}
                      className="flex-1 bg-app-bg/60 text-sm placeholder:text-app-text-muted/60 resize-none px-3.5 py-2.5 max-h-32 min-h-[44px] border-app-border focus-visible:ring-1 focus-visible:ring-app-accent/30 shadow-inner disabled:opacity-50 transition-all custom-scrollbar"
                    />
                    <div className="flex flex-col gap-2">
                       {isStreaming ? (
                        <Button
                          size="icon"
                          onClick={handleStop}
                          className="w-11 h-11 rounded-xl bg-app-accent-alt hover:bg-red-500 shadow-lg shadow-red-500/20 animate-pulse"
                        >
                          <Square className="w-5 h-5 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          onClick={handleSend}
                          disabled={(useRouter ? !selectedRouterProvider : !activeEngine) || !message.trim()}
                          className="w-11 h-11 rounded-xl bg-app-accent hover:bg-app-accent-hover shadow-[0_0_15px_var(--app-accent-glow)] transition-all disabled:shadow-none"
                        >
                          <Send className="w-4 h-4 ml-0.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-xs text-app-text-muted/60 tracking-wide font-medium">
                      Press <kbd className="font-sans px-1 py-0.5 rounded-sm bg-app-bg border border-app-border/50 text-2xs mx-0.5">Enter</kbd> to send
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTerminal(true)}
                      className="h-5 text-xs text-app-text-muted hover:text-app-accent px-1.5"
                    >
                      Show terminal logs
                    </Button>
                  </div>
                </div>
              </div>

              {showTerminal && (
                <div className="w-1/2 flex flex-col bg-app-bg/80 border-l border-app-border">
                  <div className="flex items-center justify-between px-3 py-2 bg-app-sidebar/40 border-b border-app-border">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-app-text-muted" />
                      <span className="text-xs text-app-text tracking-wider uppercase font-semibold">System Output</span>
                    </div>
                    <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger
                        onClick={copyTerminal}
                        className="inline-flex items-center justify-center rounded-md h-6 w-6 text-app-text-muted hover:text-white hover:bg-app-panel transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-app-text-muted" />}
                      </TooltipTrigger>
                      <TooltipContent>Copy Logs</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        onClick={clearTerminal}
                        className="inline-flex items-center justify-center rounded-md h-6 w-6 text-app-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </TooltipTrigger>
                      <TooltipContent>Clear</TooltipContent>
                    </Tooltip>
                    </div>
                  </div>

                  <ScrollArea className="h-full p-3 font-mono text-[11px] leading-relaxed">
                    {terminalLines.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-app-text-muted/50">
                        <ScrollText className="w-10 h-10 mb-3 opacity-20" />
                        <span>Awaiting execution logs...</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {terminalLines.map((line, idx) => (
                          <div 
                            key={idx}
                            className={`px-1.5 py-0.5 rounded-sm ${
                              line.type === 'command' ? 'text-cyan-400 font-semibold' :
                              line.type === 'stderr' ? 'text-red-400' :
                              line.type === 'error' ? 'text-red-400 bg-red-400/10 border-l-2 border-red-500 pl-2' :
                              line.type === 'warning' ? 'text-yellow-400 bg-yellow-400/10 border-l-2 border-yellow-500 pl-2' :
                              line.type === 'system' ? 'text-app-text-muted/70 italic' :
                              'text-app-text/90'
                            }`}
                          >
                            <span className="break-all">{line.content}</span>
                          </div>
                        ))}
                        {isStreaming && (
                          <div className="text-app-text-muted/60 animate-pulse px-1.5">
                            <span>Processing...</span>
                          </div>
                        )}
                        <div ref={terminalEndRef} className="h-4" />
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
