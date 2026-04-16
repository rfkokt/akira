import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { X, Send, Loader2, Copy, Check, MessageSquare, FileIcon, Zap, Terminal, Play } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useAIChatStore, useEngineStore, useConfigStore, useWorkspaceStore } from '@/store'
import { useImageAnalysis, buildMessageWithImageAnalysis } from '@/hooks/useImageAnalysis'
import type { Task, ChatMessage as DbChatMessage } from '@/types'
import type { ChatMessage } from '@/store/aiChatStore'
import { dbService } from '@/lib/db'
import { ImageInput, processPastedImages, type ImageAttachment } from '@/components/shared/ImageInput'
import { Terminal as TerminalComponent } from '@/components/Terminal'
import { ScriptRunner, type ScriptRunnerRef } from '@/components/ScriptRunner'
import { ThinkingBlock, ToolCallGroup, UsageStats } from '@/components/Streaming'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const EMPTY_ARRAY: ChatMessage[] = []

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  relativePath?: string;
}

const CodeBlock = memo(function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);
  
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-app-border/40 bg-app-bg shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-app-sidebar/40 border-b border-app-border/40">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <span className="text-xs text-app-text-muted font-mono tracking-wider uppercase ml-1">
            {language || 'code'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-xs text-app-text-muted hover:text-white"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400 mr-1" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-app-text">
        <code>{code}</code>
      </pre>
    </div>
  );
});

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-app-accent/10 text-app-accent font-mono text-[11px] border border-app-accent/20" {...props}>
                {children}
              </code>
            );
          }
          
          return (
            <CodeBlock
              code={String(children).replace(/\n$/, '')}
              language={match ? match[1] : ''}
            />
          );
        },
        a({ href, children }) {
          return (
            <a 
              href={href} 
              className="text-app-accent hover:text-app-accent-hover hover:underline transition-colors cursor-pointer" 
              onClick={async (e) => {
                e.preventDefault();
                if (href) {
                  const { open } = await import('@tauri-apps/plugin-shell');
                  await open(href);
                }
              }}
            >
              {children}
            </a>
          );
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold text-app-text mt-3 mb-2">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold text-app-text mt-3 mb-1.5">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-medium text-app-text mt-2 mb-1">{children}</h3>;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside space-y-1 ml-2 text-app-text/90">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside space-y-1 ml-2 text-app-text/90">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-app-text/90">{children}</li>;
        },
        p({ children }) {
          return <p className="mb-2.5 last:mb-0 leading-relaxed text-app-text/90 break-words overflow-wrap-anywhere">{children}</p>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-app-accent/50 bg-app-accent/5 pl-3 py-1.5 pr-2 rounded-r italic text-app-text-muted my-3 shadow-inner">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3 border border-app-border/50 rounded-lg">
              <table className="w-full border-collapse text-left">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return <th className="border-b border-app-border/60 px-3 py-2 bg-app-sidebar/40 font-semibold text-app-text">{children}</th>;
        },
        td({ children }) {
          return <td className="border-b border-app-border/30 px-3 py-2 text-app-text/90">{children}</td>;
        },
        hr() {
          return <hr className="border-app-border/50 my-4" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-app-text">{children}</strong>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

interface TaskChatBoxProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

interface MessageItemProps {
  msg: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  };
  currentStreamingId?: string;
}

const MessageItem = memo(function MessageItem({ msg, currentStreamingId }: MessageItemProps) {
  // Check if message is from Groq (has Groq model info in content)
  const isGroqMessage = msg.role === 'assistant' && 
    (msg.content?.includes('[Model: llama') || msg.content?.includes('[Model: mixtral') || msg.content?.includes('[Model: gemma'));
  
  // Clean content for display (remove token metadata)
    let displayContent = msg.content?.replace(/\s*\[\d+ tokens \| [^\]]+\]$/, '') || msg.content;
  
  // Extract Tool Results (handle multiple)
  let toolResultsText = null;
  const toolResultsMatches = [...displayContent.matchAll(/\[TOOL RESULTS\]([\s\S]*?)\[\/TOOL RESULTS\]/g)];
  if (toolResultsMatches.length > 0) {
    toolResultsText = toolResultsMatches.map(m => m[1].trim()).filter(Boolean).join('\n\n---\n\n');
    // Remove closed tool results from main display
    displayContent = displayContent.replace(/\[TOOL RESULTS\][\s\S]*?\[\/TOOL RESULTS\]/g, '').trim();
  }
  
  // Clean up any remaining unclosed [TOOL RESULTS] and also [TOOL_EXEC]/[TOOL_RES] markers and <think> blocks
  displayContent = displayContent
    .replace(/\[TOOL RESULTS\][\s\S]*?(?:\[\/TOOL RESULTS\]|$)/g, '')
    .replace(/\[TOOL_EXEC\].*(\n|$)/g, '')
    .replace(/\[TOOL_RES\].*(\n|$)/g, '')
    .replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '')
    .replace(/```thinking[\s\S]*?```/gi, '')
    .trim();

  return (
    <div
      className={`flex flex-col gap-1 ${
        msg.role === 'user' ? 'items-end' : 'items-start'
      }`}
    >
      <div className={`px-4 py-3 max-w-[90%] rounded-2xl shadow-sm border ${
        msg.role === 'user'
          ? 'bg-app-accent/15 border border-app-accent/20 text-blue-50 rounded-tr-sm'
          : msg.role === 'system'
            ? 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20 rounded-bl-sm'
            : isGroqMessage
              ? 'bg-green-500/5 border-green-500/20 text-app-text rounded-tl-sm'
              : 'bg-app-bg/50 border-app-border text-app-text rounded-tl-sm'
      }`}>
        {msg.role === 'assistant' && isGroqMessage && (
          <div className="flex items-center gap-1 mb-1.5">
            <Zap className="w-3 h-3 text-green-400" />
            <span className="text-2xs text-green-400 font-medium">Groq (Free)</span>
          </div>
        )}
        {msg.role === 'assistant' ? (
          <div className="text-[13px] leading-relaxed min-w-0 overflow-hidden">
            <MarkdownContent content={displayContent} />
            {currentStreamingId === msg.id && (
              <span className="inline-flex mt-1">
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-1" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-1" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>
        ) : (
          displayContent && <pre className="whitespace-pre-wrap break-all text-[13px] leading-relaxed">{displayContent}</pre>
        )}
        
        {toolResultsText && (
          <div className="mt-2 border border-app-border/40 rounded-lg bg-black/20 overflow-hidden">
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
      </div>
    </div>
  );
});

const ChatInput = memo(function ChatInput({ 
  onSend, 
  isStreaming, 
  hasEngine,
  placeholder,
  hasApiKey: hasApiKeyProp,
  files,
  onFetchFiles,
}: { 
  onSend: (msg: string) => void; 
  isStreaming: boolean;
  hasEngine: boolean;
  placeholder: string;
  hasApiKey: boolean;
  files: FileEntry[];
  onFetchFiles: () => void;
}) {
  const [message, setMessage] = useState('')
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [showFileSuggestions, setShowFileSuggestions] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileSuggestionsRef = useRef<HTMLDivElement>(null)
  const { isAnalyzing, analyzeImages, hasApiKey: hasApiKeyHook } = useImageAnalysis()
  
  const hasApiKey = hasApiKeyProp ?? hasApiKeyHook
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [message])

  useEffect(() => {
    onFetchFiles()
  }, [onFetchFiles])

  const filterFiles = useCallback((query: string): FileEntry[] => {
    if (!query) return files.slice(0, 10)
    const lowerQuery = query.toLowerCase()
    return files
      .filter(f => {
        const relativePath = (f.relativePath || f.name).toLowerCase()
        return relativePath.includes(lowerQuery)
      })
      .sort((a, b) => {
        const aPath = a.relativePath || a.name
        const bPath = b.relativePath || b.name
        const aStartsWith = aPath.toLowerCase().startsWith(lowerQuery)
        const bStartsWith = bPath.toLowerCase().startsWith(lowerQuery)
        if (aStartsWith && !bStartsWith) return -1
        if (!aStartsWith && bStartsWith) return 1
        return aPath.localeCompare(bPath)
      })
      .slice(0, 10)
  }, [files])

  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
  }, [filterFiles])

  const insertFileReference = useCallback((file: FileEntry) => {
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
  }, [message, atSymbolIndex])

  const handleSendCb = useCallback(async () => {
    const hasContent = message.trim() || attachedImages.length > 0
    if (!hasContent || isAnalyzing || isUploading) return
    
    const currentImages = [...attachedImages]
    const currentMessage = message.trim()
    
    setMessage('')
    setAttachedImages([])
    setShowFileSuggestions(false)
    setAtSymbolIndex(-1)
    
    if (currentImages.length > 0) {
      if (!hasApiKey) {
        const errorMsg = `[ERROR: Cannot analyze images - Gemini API key not configured. Please add it in Settings → Image Analysis.]\n\n${currentMessage || '(image attached)'}`
        onSend(errorMsg)
        return
      }
      
      setIsUploading(true)
      try {
        const result = await analyzeImages(currentImages)
        
        let finalMessage: string
        if (result.analysis) {
          finalMessage = buildMessageWithImageAnalysis(currentMessage || 'Analyze this image', result.analysis)
        } else {
          const err = result.error || 'Unknown error'
          finalMessage = `[ERROR: Image analysis failed - ${err}]\n\n${currentMessage || '(image attached)'}`
        }
        
        onSend(finalMessage)
      } finally {
        setIsUploading(false)
      }
    } else {
      onSend(currentMessage)
    }
  }, [message, attachedImages, isAnalyzing, isUploading, hasApiKey, analyzeImages, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const currentQuery = atSymbolIndex !== -1 ? message.slice(atSymbolIndex + 1) : ''
    const filteredFiles = filterFiles(currentQuery)
    
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
      handleSendCb()
    }
  }, [showFileSuggestions, atSymbolIndex, message, selectedFileIndex, filterFiles, insertFileReference, handleSendCb])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const handled = processPastedImages(e.nativeEvent, attachedImages, setAttachedImages, 3)
    if (handled) {
      e.preventDefault()
    }
  }, [attachedImages])

  const isDisabled = !hasEngine || isStreaming || isAnalyzing || isUploading
  const currentQuery = atSymbolIndex !== -1 ? message.slice(atSymbolIndex + 1) : ''
  const filteredFiles = filterFiles(currentQuery)

  return (
    <div className="shrink-0 p-3 bg-app-sidebar/80 backdrop-blur-md border-t border-app-border/60 relative">
      {(isUploading || isAnalyzing) && (
        <div className="mb-2 flex items-center gap-2 text-xs text-app-accent">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Analyzing image{attachedImages.length > 1 ? 's' : ''}...</span>
        </div>
      )}
      
      {attachedImages.length > 0 && !isUploading && !isAnalyzing && (
        <div className="mb-2">
          <ImageInput
            images={attachedImages}
            onImagesChange={setAttachedImages}
            maxImages={3}
            disabled={isDisabled}
          />
          {!hasApiKey && (
            <p className="text-xs text-yellow-500 mt-1">
              ⚠️ Set Gemini API key in Settings → Image Analysis to analyze images
            </p>
          )}
        </div>
      )}
      
      {/* File suggestions dropdown */}
      {showFileSuggestions && filteredFiles.length > 0 && (
        <div 
          ref={fileSuggestionsRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-app-panel border border-app-border rounded-lg shadow-xl max-h-48 overflow-y-auto z-50"
        >
          {filteredFiles.map((file, idx) => {
            const filename = file.name
            const relativePath = file.relativePath || file.name
            const isLongPath = relativePath.length > 40
            const displayPath = isLongPath 
              ? `.../${filename}` 
              : relativePath
            
            return (
              <div
                key={file.path}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs ${
                  idx === selectedFileIndex 
                    ? 'bg-app-accent/20 text-app-accent' 
                    : 'text-neutral-300 hover:bg-white/5'
                }`}
                onClick={() => insertFileReference(file)}
              >
                <FileIcon className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
                <span className="truncate font-mono">{displayPath}</span>
              </div>
            )
          })}
        </div>
      )}
      
      <div className="flex items-end gap-2.5">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={isDisabled}
          className="flex-1 px-4 py-3 rounded-xl text-sm bg-[#1e1e1e] text-white placeholder-neutral-500 border border-app-border focus:outline-none focus:border-app-accent/70 focus:ring-1 focus:ring-app-accent/30 resize-none transition-all shadow-inner custom-scrollbar"
          rows={1}
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          {attachedImages.length === 0 && !isUploading && !isAnalyzing && (
            <ImageInput
              images={attachedImages}
              onImagesChange={setAttachedImages}
              maxImages={3}
              disabled={isDisabled}
            />
          )}
          <Button
            size="icon"
            onClick={handleSendCb}
            disabled={(!message.trim() && attachedImages.length === 0) || isDisabled}
            className="w-11 h-11 shrink-0 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 shadow-[0_0_15px_var(--app-accent-glow)] transition-all disabled:shadow-none"
          >
            {isStreaming || isAnalyzing || isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white ml-0.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

export function TaskChatBox({ task, isOpen, onClose }: TaskChatBoxProps) {
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { sendMessage, setMessages, streamingMessageId } = useAIChatStore()
  const taskMessages = useAIChatStore(
    useCallback(state => state.messages[task.id] ?? EMPTY_ARRAY, [task.id])
  )
  const { activeEngine } = useEngineStore()
  const { activeWorkspace } = useWorkspaceStore()
  const config = useConfigStore(state => state.config)
  const hasApiKey = !!config?.google_api_key
  
  const currentStreamingId = streamingMessageId[task.id]
  const isTaskStreaming = useAIChatStore(
    useCallback(state => state.streamingMessageId[task.id] != null, [task.id])
  )

  // Structured streaming state — read from the store
  const taskStreamingState = useAIChatStore(
    useCallback(state => state.streamingState[task.id], [task.id])
  )
  const streamingThinking = taskStreamingState?.thinking || ''
  const streamingContent = taskStreamingState?.content || ''
  const streamingTools = taskStreamingState?.tools || []
  const streamingUsage = taskStreamingState?.usage || null

  const fetchFiles = useCallback(async () => {
    const path = activeWorkspace?.folder_path
    if (!path) return
    
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path })
      const allFiles: FileEntry[] = []
      
      const processEntries = async (entries: FileEntry[], relativePath: string = '') => {
        for (const entry of entries) {
          if (entry.is_dir) {
            if (entry.name.startsWith('.') || 
                ['node_modules', 'dist', 'build', '.git', '.next', 'out', 'target', 'vendor'].includes(entry.name)) {
              continue
            }
            try {
              const subEntries = await invoke<FileEntry[]>('read_directory', { path: entry.path })
              await processEntries(subEntries, relativePath ? `${relativePath}/${entry.name}` : entry.name)
            } catch {
              // Skip directories we can't read
            }
          } else if (!entry.name.startsWith('.')) {
            allFiles.push({
              name: entry.name,
              path: entry.path,
              is_dir: false,
              relativePath: relativePath ? `${relativePath}/${entry.name}` : entry.name,
            })
          }
        }
      }
      
      await processEntries(entries, path)
      allFiles.sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name))
      setFiles(allFiles)
    } catch (err) {
      console.error('Failed to fetch files:', err)
      setFiles([])
    }
  }, [activeWorkspace?.folder_path])

  useEffect(() => {
    if (!task.id || historyLoaded) return
    
    const loadHistory = async () => {
      try {
        const history = await dbService.getChatHistory(task.id)
        console.log('[TaskChatBox] Loaded history from DB:', history.length, 'messages')
        if (history && history.length > 0) {
          const existingMessages = useAIChatStore.getState().messages[task.id] || []
          console.log('[TaskChatBox] Existing messages in store:', existingMessages.length)
          if (existingMessages.length === 0) {
            const storeMessages = history.map((msg: DbChatMessage) => ({
              id: `db-${msg.id}`,
              taskId: msg.task_id,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
              timestamp: new Date(msg.created_at).getTime(),
            }))
            console.log('[TaskChatBox] Setting messages to store:', storeMessages.length)
            setMessages(task.id, storeMessages)
          }
        }
        setHistoryLoaded(true)
      } catch (err) {
        console.error('Failed to load chat history:', err)
        setHistoryLoaded(true)
      }
    }
    
    loadHistory()
  }, [task.id, historyLoaded, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages, isTaskStreaming, streamingContent, streamingThinking])

  const handleSend = useCallback(async (msg: string) => {
    if (!activeEngine) return
    
    try {
      await dbService.createChatMessage(task.id, 'user', msg, activeEngine.alias)
      console.log('[TaskChatBox] Saved user message to DB')
    } catch (err) {
      console.error('Failed to save user message:', err)
    }
    
    await sendMessage(task.id, msg)
  }, [task.id, activeEngine, sendMessage])

  const [activeTab, setActiveTab] = useState<'chat' | 'terminal' | 'scripts'>('chat')
  const scriptRunnerRef = useRef<ScriptRunnerRef>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘⇧R - Trigger script run
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        if (isOpen && activeTab === 'scripts') {
          scriptRunnerRef.current?.triggerRun()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, activeTab])

  if (!isOpen) return null

  return (
    <div 
      className="fixed z-[60] bg-app-panel/95 backdrop-blur-2xl border border-app-border/60 rounded-2xl shadow-2xl overflow-hidden shadow-black/40 bottom-6 right-6 w-[600px] h-[550px] flex flex-col transition-all"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-app-sidebar/40 border-b border-app-border/40 select-none">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold text-app-text tracking-wide">
              Task AI Assistant
            </h3>
            <p className="text-xs text-app-text-muted truncate max-w-[280px] mt-0.5">
              {task.title}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-app-bg/50 rounded-lg p-0.5 border border-app-border/30">
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                activeTab === 'chat' 
                  ? 'bg-app-accent text-white shadow-sm' 
                  : 'text-app-text-muted hover:text-app-text hover:bg-app-bg'
              )}
            >
              <MessageSquare className="w-3 h-3" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                activeTab === 'terminal' 
                  ? 'bg-app-accent text-white shadow-sm' 
                  : 'text-app-text-muted hover:text-app-text hover:bg-app-bg'
              )}
            >
              <Terminal className="w-3 h-3" />
              Terminal
            </button>
            <button
              onClick={() => setActiveTab('scripts')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                activeTab === 'scripts' 
                  ? 'bg-app-accent text-white shadow-sm' 
                  : 'text-app-text-muted hover:text-app-text hover:bg-app-bg'
              )}
            >
              <Play className="w-3 h-3" />
              Scripts
            </button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 rounded-lg text-app-text-muted hover:text-red-400 hover:bg-red-400/10"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="px-4 py-2 bg-app-sidebar/20 border-b border-app-border/30">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${activeEngine ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`} />
          <span className="text-xs text-app-text-muted font-mono uppercase tracking-wider">
            {activeEngine ? activeEngine.alias : 'No engine selected'}
          </span>
        </div>
      </div>

      {activeTab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0">
            {taskMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center mt-10">
                <div className="w-16 h-16 bg-app-accent/10 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_var(--app-accent-glow)]">
                  <MessageSquare className="w-7 h-7 text-app-accent opacity-60" />
                </div>
                <p className="text-sm font-medium text-app-text mb-1">
                  {task.status === 'review' ? 'Request Revisions' : 'Start a conversation'}
                </p>
                <p className="text-xs text-app-text-muted/70 max-w-[220px] leading-relaxed">
                  {task.status === 'review' 
                    ? 'Tell the AI what to change — it will directly modify the code'
                    : `AI is ready to help you implement "${task.title}"`}
                </p>
                <p className="text-xs text-app-accent/70 mt-2">
                  Type @ to reference files
                </p>
              </div>
            ) : (
              taskMessages.map((msg, idx) => (
                <MessageItem key={msg.id || idx} msg={msg} currentStreamingId={currentStreamingId ?? undefined} />
              ))
            )}
            
            {/* Structured Streaming Output */}
            {(isTaskStreaming || streamingContent || streamingThinking) && (
              <div className="flex flex-col gap-3 items-start">
                {/* Thinking Block */}
                {streamingThinking && (
                  <ThinkingBlock 
                    content={streamingThinking} 
                    isStreaming={isTaskStreaming && !streamingContent}
                    className="max-w-[90%]"
                  />
                )}
                
                {/* Tool Calls */}
                {streamingTools.length > 0 && (
                  <ToolCallGroup 
                    tools={streamingTools}
                    isStreaming={isTaskStreaming}
                    className="max-w-[90%] w-full"
                  />
                )}
                
                {/* Streaming Content */}
                {streamingContent && (
                  <div className="px-4 py-3 max-w-[90%] rounded-2xl bg-app-bg/50 border border-app-border text-app-text rounded-tl-sm">
                    <div className="text-[13px] leading-relaxed">
                      <MarkdownContent content={streamingContent} />
                      {isTaskStreaming && (
                        <span className="inline-flex mt-1">
                          <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-1" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce ml-1" style={{ animationDelay: '300ms' }} />
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Usage Stats */}
                {streamingUsage && !isTaskStreaming && (
                  <UsageStats 
                    inputTokens={streamingUsage.input}
                    outputTokens={streamingUsage.output}
                    cacheTokens={streamingUsage.cache}
                    className="max-w-[90%]"
                  />
                )}
              </div>
            )}
            
            <div ref={messagesEndRef} className="h-2" />
          </div>

          <ChatInput 
            onSend={handleSend}
            isStreaming={isTaskStreaming}
            hasEngine={!!activeEngine}
            placeholder={activeEngine ? (task.status === 'review' ? "Describe what to revise..." : "Ask AI about this task...") : "Select an AI engine first"}
            hasApiKey={hasApiKey}
            files={files}
            onFetchFiles={fetchFiles}
          />
        </>
      ) : activeTab === 'terminal' ? (
        <div className="flex-1 min-h-0 p-3 bg-[#1a1a1a]">
          {/* Use task worktree if available, otherwise fallback to workspace */}
          {(task.worktree_path || activeWorkspace?.folder_path) ? (
            <TerminalComponent 
              sessionId={`task-${task.id}`}
              cwd={task.worktree_path || activeWorkspace!.folder_path}
              visible={true}
              className="h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-app-text-muted">
              No workspace selected
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-4">
          {/* Use task worktree if available, otherwise fallback to workspace */}
          {(task.worktree_path || activeWorkspace?.folder_path) ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-app-text">Run Scripts</h4>
                  {/* Show which directory scripts will run in */}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-app-accent/10 text-app-accent font-mono">
                    {task.worktree_path ? '🌿 Worktree' : '📁 Workspace'}
                  </span>
                </div>
                <span className="text-xs text-app-text-muted">Run tests, lint, build, etc.</span>
              </div>
              <ScriptRunner
                taskId={task.id}
                workspacePath={task.worktree_path || activeWorkspace!.folder_path}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-app-text-muted">
              No workspace selected
            </div>
          )}
        </div>
      )}
    </div>
  )
}
