import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ChevronDown, Send, Square } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useAIChatStore, useEngineStore, useTaskStore, useWorkspaceStore } from '@/store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Task } from '@/types'

interface ParsedTask {
  title: string
  description: string
  priority: Task['priority']
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
              <code className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 font-mono text-[11px]" {...props}>
                {children}
              </code>
            );
          }
          
          return (
            <pre className="my-2 rounded-lg overflow-hidden border border-white/10 bg-[#1e1e1e] p-3">
              <code className="text-xs font-mono leading-relaxed text-neutral-300">{String(children).replace(/\n$/, '')}</code>
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
  const [parsedTask, setParsedTask] = useState<ParsedTask | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createdSuccess, setCreatedSuccess] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showFileSuggestions, setShowFileSuggestions] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiChatStore = useAIChatStore()
  const { sendSimpleMessage, stopMessage, getMessages } = aiChatStore
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

  const parseTaskFromResponse = (content: string): ParsedTask | null => {
    const taskRegex = /### Task[\s\S]*?Title:\s*(.+?)[\s\S]*?Description:[\s\S]*?(?:```[\s\S]*?```[\s\S]*?)?([\s\S]*?)(?=###|$)/gi
    
    let match
    while ((match = taskRegex.exec(content)) !== null) {
      const title = match[1].trim()
      let description = match[2].trim()
      
      description = description.replace(/```\w*\n?/g, '').trim()
      
      if (title) {
        return {
          title,
          description,
          priority: 'medium'
        }
      }
    }

    const titleOnlyMatch = /^(?:task|title)[:\s]+(.+)$/gim.exec(content)
    if (titleOnlyMatch) {
      return {
        title: titleOnlyMatch[1].trim(),
        description: '',
        priority: 'medium'
      }
    }

    return null
  }

  const handleSend = async () => {
    if (!message.trim() || !activeEngine) return
    
    setParsedTask(null)
    setCreatedSuccess(false)
    
    const systemPrompt = `You are a task assistant. When the user describes what they want to build or modify, create a structured task definition in this exact format:

### Task
Title: [A clear, concise task title]
Description: [A detailed description of what needs to be done, including relevant details from the user's request]

Focus on understanding the user's intent and breaking it down into actionable steps. Keep the title concise but descriptive.`

    setIsStreaming(true)
    
    try {
      const userMsg = message
      setMessage('')
      
      const response = await sendSimpleMessage(taskId, `${systemPrompt}\n\nUser request: ${userMsg}`)
      
      if (response) {
        const parsed = parseTaskFromResponse(response)
        if (parsed) {
          setParsedTask(parsed)
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setIsStreaming(false)
    }
  }

  const handleStop = async () => {
    await stopMessage(taskId)
    setIsStreaming(false)
  }

  const handleCreateTask = async () => {
    if (!parsedTask || !activeWorkspace?.folder_path) return
    
    setIsCreating(true)
    try {
      await createTask({
        title: parsedTask.title,
        description: parsedTask.description,
        status: 'todo',
        priority: parsedTask.priority,
      })
      
      setCreatedSuccess(true)
      setParsedTask(null)
      
      setTimeout(() => setCreatedSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setIsCreating(false)
    }
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
      <div className="px-4 py-2 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white font-geist">Task Creator</h3>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {taskMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div>
              <p className="text-sm text-neutral-300 font-geist">
                Describe your task in plain English
              </p>
              <p className="text-[10px] text-neutral-500 font-geist mt-1">
                AI will create a structured task for you
              </p>
              <p className="text-[10px] text-cyan-500 font-geist mt-2">
                Type @ to reference files
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full">
              {suggestedPrompts.slice(0, 2).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setMessage(prompt)}
                  className="px-3 py-2 text-[10px] text-neutral-400 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-left transition-colors font-geist"
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
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-[#252526] text-neutral-200 border border-white/5 rounded-bl-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="text-xs leading-relaxed">
                    <MarkdownContent content={msg.content} />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</pre>
                )}
                {msg.role === 'assistant' && isStreaming && idx === taskMessages.length - 1 && (
                  <span className="inline-flex ml-1">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce ml-0.5" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce ml-0.5" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        
        {parsedTask && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400 font-geist font-medium">Task Ready</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-neutral-500 font-geist">Title</label>
                <p className="text-sm text-white font-geist">{parsedTask.title}</p>
              </div>
              {parsedTask.description && (
                <div>
                  <label className="text-[10px] text-neutral-500 font-geist">Description</label>
                  <p className="text-xs text-neutral-300 font-geist line-clamp-3">{parsedTask.description}</p>
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
                onClick={() => setParsedTask(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors font-geist"
              >
                Clear
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
            <div className="px-2 py-1.5 text-[10px] text-neutral-500 border-b border-white/5 font-geist">
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
                <span className="text-neutral-500 text-[10px] ml-2">
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
                <span className="text-[10px] text-neutral-400 font-geist">
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
