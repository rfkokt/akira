import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ChevronDown, Send, Square, Loader2, History, X, FileIcon, ChevronLeft, Terminal, FileText, Wrench, Zap, CheckCircle2, AlertCircle, Sparkles, MessageSquarePlus } from 'lucide-react'
import { useAIChatStore, useEngineStore, useWorkspaceStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { useAnalyzeProject } from '@/hooks/useAnalyzeProject'
import { ImageInput, processPastedImages, type ImageAttachment } from '@/components/shared/ImageInput'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Extracted modules
import { MemoizedMarkdownContent, renderContentWithFileRefs } from './ChatMarkdown'
import { useFileAutocomplete } from './useFileAutocomplete'
import { useChatSession } from './useChatSession'
import { useChatSend } from './useChatSend'
import { useSummarize } from './useSummarize'

interface TaskCreatorChatProps {
  onHide?: () => void
}

export function TaskCreatorChat({ onHide }: TaskCreatorChatProps) {
  const [message, setMessage] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [isAnalyzingProject, setIsAnalyzingProject] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)
  const [yoloMode, setYoloMode] = useState(() => {
    try {
      const saved = localStorage.getItem('akira-yolo-mode')
      return saved === 'true'
    } catch {
      return false
    }
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { getMessages } = useAIChatStore()
  const { activeEngine, engines, setActiveEngine } = useEngineStore()
  const { activeWorkspace } = useWorkspaceStore()
  const { config } = useConfigStore()
  const { analyzeProject } = useAnalyzeProject()

  // --- Hooks ---
  const session = useChatSession(activeWorkspace?.id)
  const { taskId, handleNewChat, handleSetChatSessionId, loadAllHistory } = session

  const fileAutocomplete = useFileAutocomplete(activeWorkspace?.folder_path)
  const { showFileSuggestions, selectedFileIndex, setSelectedFileIndex, setShowFileSuggestions, filterFiles, handleAtDetection, insertFileReference, atSymbolIndex } = fileAutocomplete

  const chatSend = useChatSend({
    taskId,
    yoloMode,
    attachedImages,
    setAttachedImages,
    setImageError,
    setExecutionSteps: session.setExecutionSteps,
  })
  const { isStreaming, isAnalyzingImages, currentStreamingId, handleStop } = chatSend

  const summarize = useSummarize(taskId)
  const { isSummarizing, conversationSummaries, setConversationSummaries, summarizedAtLength, setSummarizedAtLength, isCreating, createdSuccess, handleSummarize, handleCreateTasks } = summarize

  const taskMessages = getMessages(taskId)

  // Check if workspace standards are generated
  const hasRules = config?.md_rules 
    && config.md_rules.trim() !== '' 
    && config.md_rules.trim() !== '# Rules\n\n## DO\n- \n\n## DON\'T\n- '
    && (config.md_rules.includes('# Workspace Standards') || config.md_rules.split('\n').filter(l => l.trim().startsWith('-') && l.trim().length > 2).length > 2)

  // --- Effects ---

  // Load config when workspace changes
  useEffect(() => {
    if (activeWorkspace?.id) {
      useConfigStore.getState().loadConfig(activeWorkspace.id)
    }
  }, [activeWorkspace?.id])

  // Reset summarize state when taskId changes
  useEffect(() => {
    setSummarizedAtLength(-1)
  }, [taskId, activeWorkspace?.id])

  // Smart auto-scroll: only when user is near the bottom
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
    if (!viewport) return
    const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
    if (isNearBottom) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      })
    }
  }, [taskMessages])

  // Sync isStreaming reset when streaming completes externally
  useEffect(() => {
    if (isStreaming && !currentStreamingId) {
      const timer = setTimeout(() => {
        chatSend.setIsStreaming(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [currentStreamingId, isStreaming])

  // Listen for 'akira:new-task' event from keyboard shortcut
  useEffect(() => {
    const handleNewTaskEvent = () => {
      textareaRef.current?.focus()
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    window.addEventListener('akira:new-task', handleNewTaskEvent)
    return () => window.removeEventListener('akira:new-task', handleNewTaskEvent)
  }, [])

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [message])

  // --- Handlers ---

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setMessage(value)
    setImageError(null)
    handleAtDetection(value, e.target.selectionStart)
  }

  const handleSend = async () => {
    if (!message.trim() && attachedImages.length === 0) return
    const msg = message
    setMessage('')
    setConversationSummaries([])
    await chatSend.handleSend(msg)
  }

  const handleSendAndStart = async () => {
    if (!message.trim() && attachedImages.length === 0) return
    const msg = message
    setMessage('')
    setConversationSummaries([])
    await chatSend.handleSendAndStart(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const currentQuery = atSymbolIndex !== -1 ? message.slice(atSymbolIndex + 1) : ''
    const filtered = filterFiles(currentQuery)
    
    if (showFileSuggestions && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedFileIndex(prev => (prev + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedFileIndex(prev => (prev - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertFileReference(filtered[selectedFileIndex], message, textareaRef, setMessage)
        return
      }
      if (e.key === 'Escape') {
        setShowFileSuggestions(false)
        return
      }
    }
    
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (e.shiftKey) {
        handleSendAndStart()
      } else {
        handleSend()
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const handled = processPastedImages(e.nativeEvent, attachedImages, setAttachedImages, 3)
    if (handled) {
      e.preventDefault()
    }
  }, [attachedImages])

  const handleToggleYoloMode = useCallback(() => {
    setYoloMode(prev => {
      const newValue = !prev
      try {
        localStorage.setItem('akira-yolo-mode', String(newValue))
      } catch { /* ignore */ }
      return newValue
    })
  }, [])

  const handleAnalyzeInCreator = async () => {
    const cwd = activeWorkspace?.folder_path
    if (!cwd || !activeEngine) return
    setIsAnalyzingProject(true)
    const result = await analyzeProject(cwd, (status) => setAnalysisStatus(status))
    if (!result.success) setAnalysisStatus(`❌ ${result.error}`)
    setIsAnalyzingProject(false)
    setTimeout(() => setAnalysisStatus(null), 3000)
  }

  const suggestedPrompts = yoloMode 
    ? ["Refactor this function to be cleaner", "Add error handling to the API", "Create a button component", "Fix the bug in login flow"]
    : ["Create a login form component", "Add dark mode toggle", "Build a settings page", "Implement search functionality"]

  const currentQuery = atSymbolIndex !== -1 ? message.slice(atSymbolIndex + 1) : ''
  const filteredFiles = filterFiles(currentQuery)

  // --- Render ---
  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-0 h-full bg-app-panel rounded-lg border border-app-border overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">
              {yoloMode ? 'YOLO Chat' : 'Task Creator'}
            </h3>
            <div className="flex items-center gap-1 ml-2">
              <Tooltip>
                <TooltipTrigger
                  onClick={handleToggleYoloMode}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    yoloMode 
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' 
                      : 'bg-white/5 text-neutral-400 border border-transparent hover:border-app-border'
                  }`}
                >
                  <Zap className="w-3 h-3 inline mr-1" />
                  YOLO
                </TooltipTrigger>
                <TooltipContent>
                  {yoloMode 
                    ? 'YOLO Mode ON: AI akan mengeksekusi langsung' 
                    : 'YOLO Mode OFF: AI hanya diskusi perencanaan'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                onClick={handleNewChat}
              >
                <div className="p-2">
                  <MessageSquarePlus className="w-4 h-4 text-neutral-400" />
                </div>
              </TooltipTrigger>
              <TooltipContent>New Chat</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                onClick={() => { loadAllHistory(); session.setShowHistoryModal(true); }}
              >
                <div className="p-2">
                  <History className="w-4 h-4 text-neutral-400" />
                </div>
              </TooltipTrigger>
              <TooltipContent>View History</TooltipContent>
            </Tooltip>
            {onHide && (
              <Tooltip>
                <TooltipTrigger
                  className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                  onClick={onHide}
                >
                  <div className="p-2">
                    <ChevronLeft className="w-4 h-4 text-neutral-400" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Hide</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 w-full">
          <div className="p-4 space-y-4 w-full">
            {/* History Modal */}
            {session.showHistoryModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-app-panel rounded-lg border border-app-border w-full max-w-md max-h-[70%] overflow-hidden">
                  <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Chat History</h3>
                    <Button variant="ghost" size="icon" onClick={() => session.setShowHistoryModal(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[60%]">
                    {session.historyList.length === 0 ? (
                      <div className="p-4 text-center text-xs text-neutral-500">No history yet</div>
                    ) : (
                      session.historyList.map((item, idx) => (
                        <Button
                          key={idx}
                          variant="ghost"
                          className={`w-full justify-start h-auto py-3 px-4 rounded-none border-b border-app-border ${item.task_id === taskId ? 'bg-app-accent/10 block' : 'block'}`}
                          onClick={() => {
                            const base = `__task_creator__:${activeWorkspace?.id || 'default'}`
                            if (item.task_id === base) {
                              handleSetChatSessionId('')
                            } else if (item.task_id.startsWith(`${base}_`)) {
                              handleSetChatSessionId(item.task_id.substring(base.length + 1))
                            }
                            session.setShowHistoryModal(false)
                          }}
                        >
                          <div className="flex flex-col items-start w-full">
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className="text-xs text-app-accent capitalize">{item.role}</span>
                              <span className="text-xs text-neutral-500">
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-300 truncate w-full text-left">{item.preview}</p>
                          </div>
                        </Button>
                      ))
                    )}
                  </ScrollArea>
                </div>
              </div>
            )}

            {/* Empty State */}
            {taskMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div>
                  <p className="text-sm text-neutral-300">
                    {yoloMode ? 'Chat dengan AI untuk eksekusi langsung' : 'Chat dengan AI untuk diskusi'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {yoloMode 
                      ? 'AI akan langsung mengeksekusi permintaan Anda'
                      : 'Setelah diskusi, buat task dari percakapan'}
                  </p>
                  <p className="text-xs text-app-accent mt-2">
                    Type @ untuk reference files
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full">
                  {suggestedPrompts.slice(0, 2).map((prompt, idx) => (
                    <Button key={idx} variant="secondary" className="justify-start h-auto py-2" onClick={() => setMessage(prompt)}>
                      {prompt}
                    </Button>
                  ))}
                </div>
                {!hasRules && (
                  <div className="w-full pt-3">
                    <div className="rounded-xl border border-app-accent/20 bg-gradient-to-b from-app-accent/5 to-transparent p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-app-accent/15 flex items-center justify-center shrink-0 border border-app-accent/20">
                          <Sparkles className="w-4.5 h-4.5 text-app-accent" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white">Setup Workspace Standards</h4>
                          <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                            Generate coding standards, design patterns, and security rules so AI follows your project's conventions.
                          </p>
                        </div>
                      </div>
                      <Button
                        className="w-full justify-center h-9 bg-app-accent hover:bg-app-accent-hover text-white text-xs font-medium shadow-[0_0_12px_var(--app-accent-glow)] transition-all"
                        onClick={handleAnalyzeInCreator}
                        disabled={isAnalyzingProject || !activeEngine}
                      >
                        {isAnalyzingProject ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> {analysisStatus || 'Analyzing...'}</>
                        ) : (
                          <><Sparkles className="w-3.5 h-3.5 mr-2" /> Generate Standards</>
                        )}
                      </Button>
                      {!isAnalyzingProject && (
                        <p className="text-[11px] text-neutral-600 text-center">Or configure manually in Settings → Project Config</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Message List */
              taskMessages.map((msg, idx) => {
                const tokenMatch = msg.content?.match(/\[(\d+)?\s*tokens?\s*\|\s*([^\]]+)\]$/i)
                const tokenCount = tokenMatch ? tokenMatch[1] : null
                const modelName = tokenMatch ? tokenMatch[2]?.trim() : null
                
                const isGroqMessage = msg.role === 'assistant' && 
                  modelName && (
                    modelName.includes('llama') || 
                    modelName.includes('mixtral') || 
                    modelName.includes('gemma') || 
                    modelName.includes('local-math')
                  )

                let displayContent = msg.content?.replace(/\s*\[\d+ tokens \| [^\]]+\]$/, '') || msg.content
                
                let toolResultsText = null
                const toolResultsMatches = [...displayContent.matchAll(/\[TOOL RESULTS\]([\s\S]*?)\[\/TOOL RESULTS\]/g)]
                if (toolResultsMatches.length > 0) {
                  toolResultsText = toolResultsMatches.map(m => m[1].trim()).filter(Boolean).join('\n\n---\n\n')
                  displayContent = displayContent.replace(/\[TOOL RESULTS\][\s\S]*?\[\/TOOL RESULTS\]/g, '').trim()
                }
                displayContent = displayContent.replace(/\[TOOL RESULTS\][\s\S]*$/, '').trim()

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex w-full",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div className={cn(
                      "max-w-[85%] min-w-0 px-4 py-2.5 text-xs leading-relaxed overflow-hidden",
                      msg.role === 'user' 
                        ? 'bg-app-accent/15 border border-app-accent/20 rounded-2xl rounded-br-md text-app-text shadow-sm' 
                        : 'bg-app-surface-2 border border-app-border rounded-2xl rounded-bl-md text-app-text shadow-sm'
                    )}>
                      {isGroqMessage && msg.role === 'assistant' && (
                        <div className="mb-2">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 text-green-400 text-2xs rounded border border-green-500/20">
                            <Zap className="w-2.5 h-2.5" />
                            Groq (Free)
                          </span>
                        </div>
                      )}
                      {msg.role === 'assistant' ? (
                        <div className="overflow-x-hidden">
                          {displayContent ? (
                            <MemoizedMarkdownContent content={displayContent} />
                          ) : currentStreamingId === msg.id ? (
                            <span className="text-neutral-500 italic">Processing...</span>
                          ) : null}
                        </div>
                      ) : (
                        displayContent && (
                          <div className="whitespace-pre-wrap break-words">
                            {renderContentWithFileRefs(displayContent)}
                          </div>
                        )
                      )}
                      
                      {toolResultsText && (
                        <div className="mt-2.5 mb-1.5 border border-app-border/40 rounded-lg bg-black/20 overflow-hidden">
                          <details className="group">
                            <summary className="px-3 py-2 text-xs font-mono text-app-text-muted hover:text-white cursor-pointer hover:bg-white/5 flex items-center select-none">
                              <span className="group-open:hidden mr-1.5 opacity-50">▶</span>
                              <span className="hidden group-open:inline mr-1.5 opacity-50">▼</span>
                              🔧 View Tool Results
                            </summary>
                            <div className="px-3 py-2 text-[11px] font-mono text-neutral-400 whitespace-pre-wrap max-h-[300px] overflow-y-auto custom-scrollbar border-t border-app-border/40 bg-black/40">
                              {toolResultsText}
                            </div>
                          </details>
                        </div>
                      )}
                      
                      {isGroqMessage && tokenCount && (
                        <div className="mt-2 text-2xs text-app-text-muted flex items-center justify-end gap-1 opacity-70">
                          <span className="text-green-400/60">⚡</span>
                          <span>{tokenCount} tokens • {modelName}</span>
                        </div>
                      )}
                      {msg.role === 'assistant' && currentStreamingId === msg.id && (
                        <div className="flex gap-1 mt-2">
                          <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            
            {/* Progress Panel */}
            {isStreaming && (
              <div className="mt-4 border border-app-border/50 rounded-lg overflow-hidden bg-app-bg/50">
                <div className="flex items-center justify-between px-3 py-2 bg-app-sidebar/40 border-b border-app-border/40">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-app-accent" />
                    <span className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">AI Progress</span>
                    {session.executionSteps.length > 0 && !session.showProgress && (
                      <span className="text-xs text-neutral-500">({session.executionSteps.length} steps)</span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => session.setShowProgress(!session.showProgress)} className="h-5 px-1.5 text-xs text-app-text-muted hover:text-white">
                    {session.showProgress ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {session.showProgress && (
                  <div className="max-h-32 overflow-y-auto p-2 font-mono text-xs space-y-1">
                    {session.executionSteps.length === 0 ? (
                      <div className="flex items-center gap-2 text-neutral-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Waiting for response...</span>
                      </div>
                    ) : (
                      session.executionSteps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          {step.type === 'step_start' && (
                            <><Zap className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" /><span className="text-yellow-400">{step.content}</span></>
                          )}
                          {step.type === 'tool_use' && (
                            <><Wrench className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" /><span className="text-cyan-300">{step.content}</span></>
                          )}
                          {step.type === 'text' && (
                            <><FileText className="w-3 h-3 text-neutral-500 flex-shrink-0 mt-0.5" /><span className="text-neutral-400">{step.content}</span></>
                          )}
                          {step.type === 'complete' && (
                            <><CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" /><span className="text-green-400">{step.content}</span></>
                          )}
                          {step.type === 'error' && (
                            <><AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" /><span className="text-red-400">{step.content}</span></>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Summarize Button */}
            {!yoloMode && taskMessages.length > 0 && taskMessages.length > summarizedAtLength && conversationSummaries.length === 0 && !isSummarizing && (
              <div className="flex gap-2 mt-4">
                <Button onClick={handleSummarize} disabled={isStreaming} className="flex-1 bg-app-accent hover:bg-app-accent-hover">
                  <Check className="w-3 h-3 mr-2" />
                  Summarize & Create Task
                </Button>
              </div>
            )}
            
            {/* Summarizing Indicator */}
            {isSummarizing && (
              <div className="flex items-center justify-center p-4 mt-4 bg-app-accent/5 rounded-lg border border-app-accent/20">
                <Loader2 className="w-4 h-4 animate-spin text-app-accent" />
                <span className="ml-2 text-xs text-neutral-300">Summarizing conversation into tasks...</span>
              </div>
            )}
            
            {/* Summary Cards */}
            {conversationSummaries.length > 0 && (
              <div className="space-y-4 mt-4">
                {conversationSummaries.map((summary, idx) => {
                  const priorityConfig = {
                    high: { color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30', label: 'High' },
                    medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', label: 'Medium' },
                    low: { color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30', label: 'Low' },
                  }[summary.priority || 'medium']
                  
                  return (
                    <div key={idx} className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400" />
                          <span className="text-xs text-green-400 font-medium">Task {idx + 1} Ready</span>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityConfig.bg} ${priorityConfig.border} border ${priorityConfig.color} uppercase tracking-wider`}>
                          {priorityConfig.label}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-app-panel rounded-lg p-3 border border-app-border">
                          <label className="text-xs text-neutral-500 uppercase tracking-wide">Title</label>
                          <p className="text-sm text-white mt-1 break-words">{summary.title}</p>
                        </div>
                        {summary.description && (
                          <div className="bg-app-panel rounded-lg p-3 border border-app-border">
                            <label className="text-xs text-neutral-500 uppercase tracking-wide">Description</label>
                            <p className="text-xs text-neutral-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">{summary.description}</p>
                          </div>
                        )}
                        {summary.recommendedSkills && summary.recommendedSkills.length > 0 && (
                          <div className="bg-app-panel rounded-lg p-3 border border-app-border">
                            <label className="text-xs text-neutral-500 uppercase tracking-wide">Recommended Skills</label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {summary.recommendedSkills.map((skill, skillIdx) => (
                                <span key={skillIdx} className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                
                <div className="flex gap-2">
                  <Button onClick={handleCreateTasks} disabled={isCreating || createdSuccess} className="flex-1 bg-green-600 hover:bg-green-700">
                    {createdSuccess ? 'Created!' : isCreating ? 'Creating Tasks...' : `Create ${conversationSummaries.length} Task${conversationSummaries.length > 1 ? 's' : ''}`}
                  </Button>
                  <Button variant="secondary" onClick={() => { setConversationSummaries([]); setSummarizedAtLength(-1); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t border-app-border">
          {showFileSuggestions && filteredFiles.length > 0 && (
            <div className="mb-2 bg-app-panel rounded-lg border border-app-border shadow-xl max-h-48 overflow-y-auto">
              <div className="px-2 py-1.5 text-xs text-neutral-500 border-b border-app-border">
                Files (↑↓ navigate, Enter to insert)
              </div>
              {filteredFiles.map((file, idx) => (
                <Button
                  key={file.path}
                  variant="ghost"
                  className={`w-full justify-start h-auto py-2 rounded-none ${idx === selectedFileIndex ? 'bg-cyan-500/10' : ''}`}
                  onClick={() => insertFileReference(file, message, textareaRef, setMessage)}
                >
                  <FileIcon className="w-3 h-3 mr-2 text-neutral-400" />
                  <span className="text-white">{file.relativePath || file.name}</span>
                </Button>
              ))}
            </div>
          )}
          
          {imageError && (
            <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-300">{imageError}</span>
            </div>
          )}
          
          <div className="relative flex flex-col bg-app-panel rounded-xl border border-app-border focus-within:border-app-accent focus-within:ring-1 focus-within:ring-app-accent-glow transition-all shadow-inner">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={activeEngine 
                ? (yoloMode 
                    ? "Tell AI what to build or fix..." 
                    : "Describe what you want to build...")
                : "Select a model first"}
              disabled={!activeEngine || isStreaming}
              className="w-full px-4 pt-3 pb-2 text-sm bg-transparent text-app-text placeholder-app-text-muted focus:outline-none resize-none custom-scrollbar"
              rows={1}
              style={{ minHeight: '52px', maxHeight: '150px' }}
            />
            
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="flex items-center gap-2">
                <ImageInput
                  images={attachedImages}
                  onImagesChange={(images) => { setAttachedImages(images); setImageError(null); }}
                  maxImages={3}
                  disabled={isStreaming || !activeEngine}
                />
                
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                  >
                    {activeEngine?.alias || 'Model'}
                    <ChevronDown className="w-3 h-3 ml-1.5 opacity-70" />
                  </Button>
                  
                  {showModelDropdown && (
                    <div className="absolute left-0 bottom-full mb-1 bg-app-panel rounded-lg border border-app-border shadow-xl max-h-48 overflow-y-auto min-w-[140px]">
                      {engines.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-neutral-500">No engines</div>
                      ) : (
                        engines.map(engine => (
                          <Button
                            key={engine.id}
                            variant="ghost"
                            className={`w-full justify-start rounded-none ${activeEngine?.id === engine.id ? 'bg-cyan-500/10' : ''}`}
                            onClick={() => { setActiveEngine(engine); setShowModelDropdown(false); }}
                          >
                            <span className={`text-xs ${activeEngine?.id === engine.id ? 'text-cyan-400' : 'text-white'}`}>
                              {engine.alias}
                            </span>
                          </Button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {isStreaming ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg" onClick={handleStop}>
                  <Square className="w-4 h-4 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white shadow-md disabled:shadow-none transition-all"
                  onClick={handleSend}
                  disabled={(!message.trim() && attachedImages.length === 0) || !activeEngine || isStreaming || isAnalyzingImages}
                >
                  {isAnalyzingImages ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 -ml-0.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
