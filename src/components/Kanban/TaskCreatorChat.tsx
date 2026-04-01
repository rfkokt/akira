import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ChevronDown, Send, Square, Loader2, History, X, FileIcon, ChevronLeft } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useAIChatStore, useEngineStore, useTaskStore, useWorkspaceStore } from '@/store'
import { dbService } from '@/lib/db'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ConversationSummary {
  title: string
  description: string
}

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded border-app-border-highlight text-app-accent font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }
          
          return (
            <pre className="my-2 rounded-lg overflow-x-auto border border-app-border bg-app-panel p-3">
              <code className="text-xs font-mono leading-relaxed text-neutral-300 whitespace-pre">{String(children).replace(/\n$/, '')}</code>
            </pre>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} className="text-app-accent hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        hr() {
          return <hr className="my-3 border-app-border" />;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside space-y-1 ml-2">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside space-y-1 ml-2">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-neutral-200">{children}</li>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface TaskCreatorChatProps {
  onHide?: () => void
}

export function TaskCreatorChat({ onHide }: TaskCreatorChatProps) {
  const [message, setMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [createdSuccess, setCreatedSuccess] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyList, setHistoryList] = useState<{ task_id: string; created_at: string; role: string; preview: string; content: string }[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showFileSuggestions, setShowFileSuggestions] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiChatStore = useAIChatStore()
  const { sendSimpleMessage, stopMessage, getMessages, setMessages, clearMessages, streamingMessageId } = aiChatStore
  const { activeEngine, engines, setActiveEngine } = useEngineStore()
  const { createTask } = useTaskStore()
  const { activeWorkspace } = useWorkspaceStore()

  const taskId = `__task_creator__:${activeWorkspace?.id || 'default'}`
  const taskMessages = getMessages(taskId)
  const currentStreamingId = streamingMessageId[taskId]

  const fetchFiles = useCallback(async (path: string) => {
    if (!path) return
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path })
      const fileList = entries
        .filter(e => !e.is_dir && !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: e.path,
          is_dir: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setFiles(fileList)
    } catch (err) {
      console.error('Failed to fetch files:', err)
      setFiles([])
    }
  }, [])

  useEffect(() => {
    if (activeWorkspace?.folder_path) {
      fetchFiles(activeWorkspace.folder_path)
    }
  }, [activeWorkspace?.folder_path, fetchFiles])

  useEffect(() => {
    clearMessages(taskId)
    loadChatHistory()
  }, [activeWorkspace?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages])

  const loadAllHistory = useCallback(async () => {
    try {
      const history = await dbService.getChatHistory(taskId)
      const grouped = history.reduce((acc: Record<string, { task_id: string; created_at: string; role: string; content: string }[]>, msg) => {
        const key = msg.task_id
        if (!acc[key]) acc[key] = []
        acc[key].push(msg)
        return acc
      }, {})
      
      const list = Object.entries(grouped).map(([tid, msgs]) => {
        const sorted = msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const first = sorted[0]
        const preview = first?.content?.substring(0, 50) || ''
        return {
          task_id: tid,
          created_at: first?.created_at || '',
          role: first?.role || '',
          preview: preview + (first?.content?.length > 50 ? '...' : ''),
          content: first?.content || ''
        }
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      
      setHistoryList(list)
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }, [taskId])

  const loadChatHistory = useCallback(async () => {
    if (!taskId) return
    try {
      const history = await dbService.getChatHistory(taskId)
      if (history.length > 0) {
        const loadedMessages: { id: string; taskId: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }[] = history.map((msg: { role: string; content: string; created_at: string }) => ({
          id: `db-${Date.now()}-${Math.random()}`,
          taskId,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
        }))
        setMessages(taskId, loadedMessages)
      }
    } catch (err) {
      console.error('Failed to load chat history:', err)
    }
  }, [taskId, setMessages])

  useEffect(() => {
    loadChatHistory()
  }, [loadChatHistory])

  const filterFiles = (query: string): FileEntry[] => {
    if (!query) return files.slice(0, 10)
    const lowerQuery = query.toLowerCase()
    return files
      .filter(f => f.name.toLowerCase().includes(lowerQuery))
      .slice(0, 10)
  }

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPosition = e.target.selectionStart
    setMessage(value)
    
    const textBeforeCursor = value.slice(0, cursorPosition)
    const lastAt = textBeforeCursor.lastIndexOf('@')
    
    if (lastAt !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAt + 1)
      const hasSpace = textAfterAt.includes(' ') || textAfterAt.includes('\n')
      
      if (!hasSpace && textAfterAt.length <= 50) {
        setAtSymbolIndex(lastAt)
        const filtered = filterFiles(textAfterAt)
        setShowFileSuggestions(filtered.length > 0)
        setSelectedFileIndex(0)
        return
      }
    }
    
    setShowFileSuggestions(false)
    setAtSymbolIndex(-1)
  }

  const insertFileReference = (file: FileEntry) => {
    if (atSymbolIndex === -1) return
    
    const beforeAt = message.slice(0, atSymbolIndex)
    const cursorPos = textareaRef.current?.selectionStart || message.length
    const afterCursor = message.slice(cursorPos)
    
    const newMessage = beforeAt + '@' + file.name + ' ' + afterCursor
    setMessage(newMessage)
    setShowFileSuggestions(false)
    setAtSymbolIndex(-1)
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = atSymbolIndex + file.name.length + 2
        textareaRef.current.focus()
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newPos
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const filteredFiles = atSymbolIndex !== -1 ? filterFiles(message.slice(atSymbolIndex + 1)) : []
    
    if (showFileSuggestions && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedFileIndex(prev => (prev + 1) % filteredFiles.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedFileIndex(prev => (prev - 1 + filteredFiles.length) % filteredFiles.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertFileReference(filteredFiles[selectedFileIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowFileSuggestions(false)
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const cleanDescription = (text: string): string => {
    if (!text) return ''
    
    let cleaned = text.replace(/```[\s\S]*?```/g, '')
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1')
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1')
    cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '')
    cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '')
    cleaned = cleaned.replace(/^\s*\[[ x]\]\s*/gim, '')
    cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '')
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n').trim()
    
    return cleaned.substring(0, 500)
  }

  const handleSend = async () => {
    if (!message.trim() || !activeEngine) return
    
    setConversationSummaries([])
    setIsStreaming(true)
    
    try {
      const userMsg = message
      setMessage('')
      
      await sendSimpleMessage(taskId, userMsg)
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setIsStreaming(false)
    }
  }

  const handleSummarize = async () => {
    const messages = getMessages(taskId)
    if (messages.length === 0) return
    
    setIsSummarizing(true)
    setConversationSummaries([])
    
    try {
      const conversationText = messages
        .filter(m => m.content.trim())
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')
      
      const summaryPrompt = `Based on this conversation, identify all tasks that need to be created. You can output one or multiple tasks. For each task, use this exact format (repeat for each task):

TASK_TITLE: [Short clear title, max 80 chars]
TASK_DESCRIPTION: [Clean description without markdown, max 400 chars]
---
Focus ONLY on the actual coding implementation tasks. Do NOT create tasks for committing code, creating pull requests, testing, or updating git workflows, because those are automatically handled by the system.`

      await sendSimpleMessage(taskId + '_summary', `${summaryPrompt}\n\n---\n${conversationText}`)
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const summaryMessages = getMessages(taskId + '_summary')
      const lastResponse = summaryMessages[summaryMessages.length - 1]?.content || ''
      
      const tasks: ConversationSummary[] = []
      const blocks = lastResponse.split(/TASK_TITLE:/i).slice(1)
      
      for (const block of blocks) {
        const titleLine = block.split('\n')[0].trim()
        const descMatch = block.match(/TASK_DESCRIPTION:\s*([\s\S]*?)(?=TASK_TITLE:|---|$)/i)
        
        if (titleLine) {
          tasks.push({
            title: titleLine.substring(0, 100),
            description: cleanDescription(descMatch?.[1] || '').substring(0, 500)
          })
        }
      }
      
      if (tasks.length > 0) {
        setConversationSummaries(tasks)
      }
      
      clearMessages(taskId + '_summary')
    } catch (err) {
      console.error('Failed to summarize:', err)
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleStop = async () => {
    await stopMessage(taskId)
    setIsStreaming(false)
  }

  const handleCreateTasks = async () => {
    if (conversationSummaries.length === 0 || !activeWorkspace?.folder_path) return
    
    setIsCreating(true)
    try {
      for (const summary of conversationSummaries) {
        await createTask({
          title: summary.title,
          description: summary.description,
          status: 'todo',
          priority: 'medium',
        })
      }
      
      setCreatedSuccess(true)
      setConversationSummaries([])
      clearMessages(taskId)
      
      setTimeout(() => setCreatedSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to create tasks:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleClearChat = () => {
    clearMessages(taskId)
    setConversationSummaries([])
    setCreatedSuccess(false)
  }

  const suggestedPrompts = [
    "Create a login form component",
    "Add dark mode toggle",
    "Build a settings page",
    "Implement search functionality"
  ]

  const currentQuery = atSymbolIndex !== -1 ? message.slice(atSymbolIndex + 1) : ''
  const filteredFiles = filterFiles(currentQuery)

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-0 h-full bg-app-panel rounded-lg border border-app-border overflow-hidden">
        <div className="px-4 py-2 border-b border-app-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white font-geist">Task Creator</h3>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                onClick={() => { loadAllHistory(); setShowHistoryModal(true); }}
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

        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {showHistoryModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-app-panel rounded-lg border border-app-border w-full max-w-md max-h-[70%] overflow-hidden">
                  <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white font-geist">Chat History</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowHistoryModal(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[60%]">
                    {historyList.length === 0 ? (
                      <div className="p-4 text-center text-xs text-neutral-500">No history yet</div>
                    ) : (
                      historyList.map((item, idx) => (
                        <Button
                          key={idx}
                          variant="ghost"
                          className="w-full justify-start h-auto py-3 px-4 rounded-none border-b border-app-border"
                          onClick={() => {
                            clearMessages(taskId)
                            setMessages(taskId, [])
                            setShowHistoryModal(false)
                          }}
                        >
                          <div className="flex flex-col items-start w-full">
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className="text-xs text-app-accent capitalize">{item.role}</span>
                              <span className="text-[10px] text-neutral-500">
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
            {taskMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div>
                  <p className="text-sm text-neutral-300 font-geist">
                    Chat dengan AI untuk diskusi
                  </p>
                  <p className="text-xs text-neutral-500 font-geist mt-1">
                    Setelah diskusi, buat task dari percakapan
                  </p>
                  <p className="text-xs text-app-accent font-geist mt-2">
                    Type @ untuk reference files
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full">
                  {suggestedPrompts.slice(0, 2).map((prompt, idx) => (
                    <Button
                      key={idx}
                      variant="secondary"
                      className="justify-start h-auto py-2"
                      onClick={() => setMessage(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              taskMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`font-geist text-xs leading-relaxed ${
                    msg.role === 'user' ? 'text-blue-400' : 'text-neutral-200'
                  }`}
                >
                  <span className="text-neutral-500 mr-2">{msg.role}:</span>
                  {msg.role === 'assistant' ? (
                    <span className="overflow-x-hidden">
                      <MarkdownContent content={msg.content} />
                    </span>
                  ) : (
                    <pre className="inline whitespace-pre-wrap break-words overflow-hidden">{msg.content}</pre>
                  )}
                  {msg.role === 'assistant' && currentStreamingId === msg.id && (
                    <span className="inline-flex ml-1">
                      <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-0.5" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-0.5" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              ))
            )}
            
            {taskMessages.length > 0 && conversationSummaries.length === 0 && (
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleSummarize}
                  disabled={isSummarizing || isStreaming}
                  className="flex-1 bg-app-accent hover:bg-app-accent-hover"
                >
                  {isSummarizing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                      Summarizing...
                    </>
                  ) : (
                    <>
                      <Check className="w-3 h-3 mr-2" />
                      Summarize & Create Task
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleClearChat}
                  disabled={isStreaming}
                >
                  Clear
                </Button>
              </div>
            )}
            
            {conversationSummaries.length > 0 && (
              <div className="space-y-4 mt-4">
                {conversationSummaries.map((summary, idx) => (
                  <div key={idx} className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Check className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-400 font-geist font-medium">Task {idx + 1} Ready</span>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-app-panel rounded-lg p-3 border border-app-border">
                        <label className="text-[10px] text-neutral-500 font-geist uppercase tracking-wide">Title</label>
                        <p className="text-sm text-white font-geist mt-1 break-words">{summary.title}</p>
                      </div>
                      {summary.description && (
                        <div className="bg-app-panel rounded-lg p-3 border border-app-border">
                          <label className="text-[10px] text-neutral-500 font-geist uppercase tracking-wide">Description</label>
                          <p className="text-xs text-neutral-300 font-geist mt-1 whitespace-pre-wrap break-words leading-relaxed">{summary.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateTasks}
                    disabled={isCreating || createdSuccess}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {createdSuccess ? 'Created!' : isCreating ? 'Creating Tasks...' : `Create ${conversationSummaries.length} Task${conversationSummaries.length > 1 ? 's' : ''}`}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConversationSummaries([])}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-app-border">
          {showFileSuggestions && filteredFiles.length > 0 && (
            <div className="mb-2 bg-app-panel rounded-lg border border-app-border shadow-xl max-h-48 overflow-y-auto">
              <div className="px-2 py-1.5 text-xs text-neutral-500 border-b border-app-border font-geist">
                Files (↑↓ navigate, Enter to insert)
              </div>
              {filteredFiles.map((file, idx) => (
                <Button
                  key={file.path}
                  variant="ghost"
                  className={`w-full justify-start h-auto py-2 rounded-none ${idx === selectedFileIndex ? 'bg-cyan-500/10' : ''}`}
                  onClick={() => insertFileReference(file)}
                >
                  <FileIcon className="w-3 h-3 mr-2 text-neutral-400" />
                  <span className="text-white">{file.name}</span>
                  <span className="text-neutral-500 text-xs ml-2">
                    {file.path.replace(activeWorkspace?.folder_path || '', '')}
                  </span>
                </Button>
              ))}
            </div>
          )}
          
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder={activeEngine ? "Describe what you want to build..." : "Select a model first"}
              disabled={!activeEngine || isStreaming}
              className="w-full px-4 py-3 pb-10 rounded-xl text-sm bg-app-panel text-white placeholder-neutral-600 border border-app-border focus:outline-none focus:border-cyan-500/50 resize-none transition-all"
              rows={3}
            />
            
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                >
                  <span className="text-xs">
                    {activeEngine?.alias || 'Model'}
                  </span>
                  <ChevronDown className="w-3 h-3 ml-1.5 text-neutral-500" />
                </Button>
                
                {showModelDropdown && (
                  <div className="absolute left-0 bottom-full mb-1 bg-app-panel rounded-lg border border-app-border shadow-xl max-h-48 overflow-y-auto min-w-[140px]">
                    {engines.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-neutral-500">
                        No engines
                      </div>
                    ) : (
                      engines.map(engine => (
                        <Button
                          key={engine.id}
                          variant="ghost"
                          className={`w-full justify-start rounded-none ${activeEngine?.id === engine.id ? 'bg-cyan-500/10' : ''}`}
                          onClick={() => {
                            setActiveEngine(engine)
                            setShowModelDropdown(false)
                          }}
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
              
              {isStreaming ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStop}
                >
                  <Square className="w-4 h-4 fill-current" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSend}
                  disabled={!message.trim() || !activeEngine || isStreaming}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
