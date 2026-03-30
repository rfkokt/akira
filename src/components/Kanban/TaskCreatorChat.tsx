import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ChevronDown, Send, Square, Loader2, History, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useAIChatStore, useEngineStore, useTaskStore, useWorkspaceStore } from '@/store'
import { dbService } from '@/lib/db'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'


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
              <code className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }
          
          return (
            <pre className="my-2 rounded-lg overflow-x-auto border border-white/10 bg-[#1e1e1e] p-3">
              <code className="text-xs font-mono leading-relaxed text-neutral-300 whitespace-pre">{String(children).replace(/\n$/, '')}</code>
            </pre>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} className="text-cyan-400 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        hr() {
          return <hr className="my-3 border-white/10" />;
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

export function TaskCreatorChat() {
  const [message, setMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [conversationSummary, setConversationSummary] = useState<ConversationSummary | null>(null)
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
  const { sendSimpleMessage, stopMessage, getMessages, setMessages, clearMessages } = aiChatStore
  const { activeEngine, engines, setActiveEngine } = useEngineStore()
  const { createTask } = useTaskStore()
  const { activeWorkspace } = useWorkspaceStore()

  const taskId = '__task_creator__'
  const taskMessages = getMessages(taskId)

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
    
    // Remove code blocks
    let cleaned = text.replace(/```[\s\S]*?```/g, '')
    
    // Remove inline code
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
    
    // Remove markdown headers (but keep text)
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')
    
    // Remove bold/italic markers
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1')
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1')
    
    // Remove list markers but keep the text
    cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '')
    cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '')
    
    // Remove checkbox markers
    cleaned = cleaned.replace(/^\s*\[[ x]\]\s*/gim, '')
    
    // Remove horizontal rules
    cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '')
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    
    // Trim each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n').trim()
    
    return cleaned.substring(0, 500) // Limit description length
  }

  const handleSend = async () => {
    if (!message.trim() || !activeEngine) return
    
    setConversationSummary(null)
    
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
    setConversationSummary(null)
    
    try {
      const conversationText = messages
        .filter(m => m.content.trim())
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')
      
      const summaryPrompt = `Based on this conversation, create a task summary in this exact format (no other text):

TASK_TITLE: [Short clear title, max 80 chars]
TASK_DESCRIPTION: [Clean description without markdown, max 400 chars]`

      await sendSimpleMessage(taskId + '_summary', `${summaryPrompt}\n\n---\n${conversationText}`)
      
      // Wait for response and parse
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const summaryMessages = getMessages(taskId + '_summary')
      const lastResponse = summaryMessages[summaryMessages.length - 1]?.content || ''
      
      // Parse the summary
      const titleMatch = lastResponse.match(/TASK_TITLE:\s*(.+?)(?:\n|$)/i)
      const descMatch = lastResponse.match(/TASK_DESCRIPTION:\s*([\s\S]*?)(?=TASK_TITLE:|$)/i)
      
      if (titleMatch) {
        setConversationSummary({
          title: titleMatch[1].trim().substring(0, 100),
          description: cleanDescription(descMatch?.[1] || '').substring(0, 500)
        })
      }
      
      // Clear summary messages
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

  const handleCreateTask = async () => {
    if (!conversationSummary?.title || !activeWorkspace?.folder_path) return
    
    setIsCreating(true)
    try {
      await createTask({
        title: conversationSummary.title,
        description: conversationSummary.description,
        status: 'todo',
        priority: 'medium',
      })
      
      setCreatedSuccess(true)
      setConversationSummary(null)
      
      // Clear chat after creating task
      clearMessages(taskId)
      
      setTimeout(() => setCreatedSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleClearChat = () => {
    clearMessages(taskId)
    setConversationSummary(null)
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
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-lg border border-white/10 overflow-hidden">
      {/* Header - minimal */}
      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white font-geist">Task Creator</h3>
        <button
          onClick={() => { loadAllHistory(); setShowHistoryModal(true); }}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
          title="View History"
        >
          <History className="w-4 h-4 text-neutral-400" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* History Modal */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-[#252526] rounded-lg border border-white/10 w-full max-w-md max-h-[70vh] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white font-geist">Chat History</h3>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4 text-neutral-400" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[60vh]">
                {historyList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-neutral-500">No history yet</div>
                ) : (
                  historyList.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        clearMessages(taskId)
                        setMessages(taskId, [])
                        setShowHistoryModal(false)
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-cyan-400 capitalize">{item.role}</span>
                        <span className="text-[10px] text-neutral-500">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 truncate">{item.preview}</p>
                    </button>
                  ))
                )}
              </div>
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
              <p className="text-xs text-cyan-500 font-geist mt-2">
                Type @ untuk reference files
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full">
              {suggestedPrompts.slice(0, 2).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setMessage(prompt)}
                  className="px-3 py-2 text-xs text-neutral-400 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-left transition-colors font-geist"
                >
                  {prompt}
                </button>
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
              {msg.role === 'assistant' && isStreaming && idx === taskMessages.length - 1 && (
                <span className="inline-flex ml-1">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce ml-0.5" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce ml-0.5" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          ))
        )}
        
        {/* Action buttons when there are messages */}
        {taskMessages.length > 0 && !conversationSummary && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSummarize}
              disabled={isSummarizing || isStreaming}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors font-geist"
            >
              {isSummarizing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Summarizing...
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  Summarize & Create Task
                </>
              )}
            </button>
            <button
              onClick={handleClearChat}
              disabled={isStreaming}
              className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors font-geist"
            >
              Clear
            </button>
          </div>
        )}
        
        {/* Task Summary */}
        {conversationSummary && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400 font-geist font-medium">Task Ready</span>
            </div>
            <div className="space-y-3">
              <div className="bg-[#1e1e1e] rounded-lg p-3 border border-white/5">
                <label className="text-[10px] text-neutral-500 font-geist uppercase tracking-wide">Title</label>
                <p className="text-sm text-white font-geist mt-1 break-words">{conversationSummary.title}</p>
              </div>
              {conversationSummary.description && (
                <div className="bg-[#1e1e1e] rounded-lg p-3 border border-white/5">
                  <label className="text-[10px] text-neutral-500 font-geist uppercase tracking-wide">Description</label>
                  <p className="text-xs text-neutral-300 font-geist mt-1 whitespace-pre-wrap break-words leading-relaxed">{conversationSummary.description}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCreateTask}
                disabled={isCreating || createdSuccess}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors font-geist"
              >
                {createdSuccess ? 'Created!' : isCreating ? 'Creating...' : 'Create Task'}
              </button>
              <button
                onClick={() => setConversationSummary(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors font-geist"
              >
                Edit
              </button>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

        {/* Input Area */}
      <div className="p-4 border-t border-white/5">
        {/* File Suggestions Dropdown */}
        {showFileSuggestions && filteredFiles.length > 0 && (
          <div className="mb-2 bg-[#252526] rounded-lg border border-white/10 shadow-xl max-h-48 overflow-y-auto">
            <div className="px-2 py-1.5 text-xs text-neutral-500 border-b border-white/5 font-geist">
              Files (↑↓ navigate, Enter to insert)
            </div>
            {filteredFiles.map((file, idx) => (
              <button
                key={file.path}
                onClick={() => insertFileReference(file)}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors ${
                  idx === selectedFileIndex ? 'bg-cyan-500/10' : ''
                }`}
              >
                <span className="text-white">{file.name}</span>
                <span className="text-neutral-500 text-xs ml-2">
                  {file.path.replace(activeWorkspace?.folder_path || '', '')}
                </span>
              </button>
            ))}
          </div>
        )}
        
        {/* Input with inline action bar */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={activeEngine ? "Describe what you want to build..." : "Select a model first"}
            disabled={!activeEngine || isStreaming}
            className="w-full px-4 py-3 pb-10 rounded-xl text-sm bg-[#252526] text-white placeholder-neutral-600 border border-white/10 focus:outline-none focus:border-cyan-500/50 resize-none transition-all"
            rows={3}
          />
          
          {/* Action bar inside textarea */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            {/* Model Selector */}
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 hover:border-white/20 transition-colors flex items-center gap-1.5"
              >
                <span className="text-xs text-neutral-400 font-geist">
                  {activeEngine?.alias || 'Model'}
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-500" />
              </button>
              
              {showModelDropdown && (
                <div className="absolute left-0 bottom-full mb-1 bg-[#252526] rounded-lg border border-white/10 shadow-xl max-h-48 overflow-y-auto min-w-[140px]">
                  {engines.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-neutral-500">
                      No engines
                    </div>
                  ) : (
                    engines.map(engine => (
                      <button
                        key={engine.id}
                        onClick={() => {
                          setActiveEngine(engine)
                          setShowModelDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors ${
                          activeEngine?.id === engine.id ? 'bg-cyan-500/10' : ''
                        }`}
                      >
                        <div className={`text-xs ${activeEngine?.id === engine.id ? 'text-cyan-400' : 'text-white'}`}>
                          {engine.alias}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            
            {/* Send / Stop Button */}
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="p-1.5 text-neutral-400 hover:text-white transition-colors"
                title="Stop"
              >
                <Square className="w-4 h-4" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!message.trim() || !activeEngine || isStreaming}
                className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
