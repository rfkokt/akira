import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ChevronDown, Send, Square, Loader2, History, X, FileIcon, ChevronLeft, Terminal, FileText, Wrench, Zap, CheckCircle2, AlertCircle, Sparkles, MessageSquarePlus, Copy } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAIChatStore, useEngineStore, useTaskStore, useWorkspaceStore, useSkillStore } from '@/store'
import { injectToolsIntoPrompt } from '@/lib/mcp'
import { useConfigStore } from '@/store/configStore'
import { useAnalyzeProject } from '@/hooks/useAnalyzeProject'
import { useImageAnalysis, buildMessageWithImageAnalysis } from '@/hooks/useImageAnalysis'
import { dbService } from '@/lib/db'
import { getProvider } from '@/lib/providers'
import { isSmallTalk } from '@/lib/helpers'
import { sendGroqSummary } from '@/lib/groq'
import { ImageInput, processPastedImages, type ImageAttachment } from '@/components/shared/ImageInput'
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
import { cn } from '@/lib/utils'

interface ConversationSummary {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  recommendedSkills: string[]
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  relativePath?: string;
}

function FileReference({ path }: { path: string }) {
  const filename = path.split('/').pop() || path
  const isLongPath = path.length > 30
  const displayPath = isLongPath 
    ? `.../${filename}` 
    : path
  
  if (!isLongPath) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-app-accent/15 border border-app-accent/30 rounded text-app-accent font-mono text-xs">
        <FileIcon className="w-2.5 h-2.5 flex-shrink-0" />
        {displayPath}
      </span>
    )
  }
  
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-app-accent/15 border border-app-accent/30 rounded text-app-accent font-mono text-xs max-w-[200px] cursor-default">
        <FileIcon className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{displayPath}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[400px]">
        <code className="text-xs break-all">{path}</code>
      </TooltipContent>
    </Tooltip>
  )
}

function renderContentWithFileRefs(content: string) {
  const parts = content.split(/(@[\w./\-]+)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('@') && part.length > 1) {
      const path = part.slice(1)
      return <FileReference key={idx} path={path} />
    }
    return <span key={idx}>{part}</span>
  })
}

function MarkdownContent({ content }: { content: string }) {
  // Filter out tool calls and thinking blocks from display
  const filteredContent = content
    .replace(/\[TOOL_EXEC\].*(\n|$)/g, '') // Remove tool execution lines
    .replace(/\[TOOL_RES\].*(\n|$)/g, '') // Remove tool result lines
    .replace(/\[Tool: [^\]]+\]\s*(?=\[Tool:|$)/gi, '') // Remove empty tool calls
    .replace(/\[Tool: [^\]]+\]\s*/gi, '') // Remove tool call markers
    .replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '') // Remove thinking blocks
    .replace(/```thinking[\s\S]*?```/gi, '') // Remove thinking code blocks
    .trim()
  
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
      {filteredContent}
    </ReactMarkdown>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-app-panel/80 border border-app-border/80 text-app-text-muted hover:text-white hover:bg-app-panel opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copy message"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
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
  const [chatSessionId, setChatSessionId] = useState<string>(() => {
    // Persist chat session ID across navigation
    try {
      const saved = localStorage.getItem('akira-chat-session-id')
      return saved || ''
    } catch {
      return ''
    }
  })
  const [summarizedAtLength, setSummarizedAtLength] = useState<number>(-1)
  const [historyList, setHistoryList] = useState<{ task_id: string; created_at: string; role: string; preview: string; content: string }[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showFileSuggestions, setShowFileSuggestions] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1)
  const [executionSteps, setExecutionSteps] = useState<{ type: string; content: string; timestamp: number }[]>([])
  const [showProgress, setShowProgress] = useState(true)
  const [isAnalyzingProject, setIsAnalyzingProject] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [yoloMode, setYoloMode] = useState(() => {
    // Persist YOLO mode across navigation
    try {
      const saved = localStorage.getItem('akira-yolo-mode')
      return saved === 'true'
    } catch {
      return false
    }
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const progressEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const unlistenFns = useRef<UnlistenFn[]>([])
  const aiChatStore = useAIChatStore()
  const { sendSimpleMessage, stopMessage, getMessages, setMessages, clearMessages, streamingMessageId } = aiChatStore
  const { activeEngine, engines, setActiveEngine } = useEngineStore()
  const { createTask } = useTaskStore()
  const { activeWorkspace } = useWorkspaceStore()
  const { config } = useConfigStore()
  const { analyzeProject } = useAnalyzeProject()
  const { isAnalyzing: isAnalyzingImages, analyzeImages, hasApiKey } = useImageAnalysis()
  const { installedSkills } = useSkillStore()

  const baseTaskId = `__task_creator__:${activeWorkspace?.id || 'default'}`
  const taskId = chatSessionId ? `${baseTaskId}_${chatSessionId}` : baseTaskId
  const taskMessages = getMessages(taskId)
  const currentStreamingId = streamingMessageId[taskId]
  
  // Check if workspace standards are generated (new format or legacy with real content)
  const hasRules = config?.md_rules 
    && config.md_rules.trim() !== '' 
    && config.md_rules.trim() !== '# Rules\n\n## DO\n- \n\n## DON\'T\n- '
    && (config.md_rules.includes('# Workspace Standards') || config.md_rules.split('\n').filter(l => l.trim().startsWith('-') && l.trim().length > 2).length > 2)

  const fetchFiles = useCallback(async (path: string) => {
    if (!path) return
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path })
      const allFiles: FileEntry[] = []
      
      const processEntries = async (entries: FileEntry[], relativePath: string = '') => {
        for (const entry of entries) {
          if (entry.is_dir) {
            // Skip hidden directories and common non-code directories
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
  }, [])

  useEffect(() => {
    if (activeWorkspace?.folder_path) {
      fetchFiles(activeWorkspace.folder_path)
    }
  }, [activeWorkspace?.folder_path, fetchFiles])

  // Load config when workspace changes to ensure Groq API key is available
  useEffect(() => {
    if (activeWorkspace?.id) {
      useConfigStore.getState().loadConfig(activeWorkspace.id)
    }
  }, [activeWorkspace?.id])

  useEffect(() => {
    // DO NOT call clearMessages(taskId) here — it wipes the current chat.
    // loadChatHistory will handle restoring messages from DB when switching sessions.
    loadChatHistory()
    setSummarizedAtLength(-1)
  }, [taskId, activeWorkspace?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages])

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [executionSteps])

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenOutput = await listen<{ id: string; line: string; is_error: boolean }>('cli-output', (event) => {
        const { id, line, is_error } = event.payload
        if (id !== taskId && id !== taskId + '_summary' && id !== '__analyze_project_creator__') return;

        const timestamp = Date.now()
        
        // Get fresh engine state from store
        const currentEngine = useEngineStore.getState().activeEngine
        console.log('[TaskCreatorChat] cli-output received:', line.substring(0, 100), '| is_error:', is_error, '| engine:', currentEngine?.alias)
        
        if (is_error) {
          setExecutionSteps(prev => [...prev, {
            type: 'error',
            content: line,
            timestamp
          }])
          return
        }
        
        // Parse output using provider registry
        const provider = getProvider(currentEngine?.alias || '')
        const parsed = provider.parseOutputLine(line)
        
        if (parsed?.step) {
          setExecutionSteps(prev => [...prev, {
            type: parsed.step!.type,
            content: parsed.step!.content,
            timestamp
          }])
        }
      })

      const unlistenComplete = await listen<{ id: string; success: boolean; error_message?: string }>('cli-complete', (event) => {
        const { id, success, error_message } = event.payload
        if (id !== taskId && id !== taskId + '_summary' && id !== '__analyze_project_creator__') return;

        console.log('[TaskCreatorChat] cli-complete received, success:', success)
        setExecutionSteps(prev => [...prev, {
          type: success ? 'complete' : 'error',
          content: success ? 'Completed' : (error_message || 'Failed'),
          timestamp: Date.now()
        }])
      })

      unlistenFns.current = [unlistenOutput, unlistenComplete]
      console.log('[TaskCreatorChat] Listeners set up for', taskId)
    }

    setupListeners()

    return () => {
      unlistenFns.current.forEach(fn => fn())
      unlistenFns.current = []
    }
  }, [taskId]) // Re-run when taskId changes

  const loadAllHistory = useCallback(async () => {
    try {
      const allTasks = await dbService.getAllTasks()
      const basePrefix = `__task_creator__:${activeWorkspace?.id || 'default'}`
      
      const sessionTaskIds = allTasks
          .map(t => t.id)
          .filter(id => id === basePrefix || id.startsWith(`${basePrefix}_`))
          
      // Also potentially include current taskId if it's not yet saved as Task
      if (!sessionTaskIds.includes(taskId)) {
        sessionTaskIds.push(taskId)
      }
      
      const rawHistories = await Promise.all(sessionTaskIds.map(id => dbService.getChatHistory(id)))
      const list: { task_id: string; created_at: string; role: string; preview: string; content: string }[] = []
      
      rawHistories.forEach((msgs, index) => {
        if (msgs.length > 0) {
          const tid = sessionTaskIds[index]
          const sorted = msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          const first = sorted[0]
          
          let preview = first?.content?.substring(0, 50) || ''
          if (first?.content?.length > 50) preview += '...'
          
          list.push({
            task_id: tid,
            created_at: first?.created_at || '',
            role: first?.role || '',
            preview,
            content: first?.content || ''
          })
        }
      })
      
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setHistoryList(list)
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }, [activeWorkspace?.id, taskId])

  const loadChatHistory = useCallback(async () => {
    if (!taskId) return
    
    // Don't reload if there are already messages in memory (user is in active chat)
    const currentMessages = getMessages(taskId)
    if (currentMessages.length > 0) {
      console.log('[loadChatHistory] Skipping - messages already in memory')
      return
    }
    
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
        console.log('[loadChatHistory] Loaded', loadedMessages.length, 'messages from DB')
      }
    } catch (err) {
      console.error('Failed to load chat history:', err)
    }
  }, [taskId, setMessages, getMessages])

  useEffect(() => {
    loadChatHistory()
  }, [loadChatHistory])

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [message])

  const filterFiles = (query: string): FileEntry[] => {
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
        // Prefer files that start with the query
        const aStartsWith = aPath.toLowerCase().startsWith(lowerQuery)
        const bStartsWith = bPath.toLowerCase().startsWith(lowerQuery)
        if (aStartsWith && !bStartsWith) return -1
        if (!aStartsWith && bStartsWith) return 1
        return aPath.localeCompare(bPath)
      })
      .slice(0, 10)
  }

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPosition = e.target.selectionStart
    setMessage(value)
    setImageError(null)
    
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

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const handled = processPastedImages(e.nativeEvent, attachedImages, setAttachedImages, 3)
    if (handled) {
      e.preventDefault()
    }
  }, [attachedImages])

  const cleanDescription = (text: string): string => {
    if (!text) return ''
    
    let cleaned = text
    // Remove heading markers but keep the text
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')
    // Remove horizontal rules
    cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove checkbox markers
    cleaned = cleaned.replace(/^\s*\[[ x]\]\s*/gim, '')
    // Collapse excessive newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    cleaned = cleaned.trim()
    
    return cleaned.substring(0, 2500)
  }

  const handleSend = async () => {
    console.log('[handleSend] message:', message.trim(), 'attachedImages:', attachedImages.length, 'activeEngine:', !!activeEngine)
    
    if ((!message.trim() && attachedImages.length === 0) || !activeEngine) {
      console.log('[handleSend] Early return - conditions not met')
      return
    }
    
const userMsg = message
    const imagesToSend = [...attachedImages]
    
    console.log('[handleSend] hasApiKey:', hasApiKey)
    
    if (imagesToSend.length > 0 && !hasApiKey) {
      console.log('[handleSend] No API key, showing error')
      setImageError('Gemini API key belum dikonfigurasi. Buka Settings → Image Analysis untuk menambahkan API key.')
      return
    }
    
    setMessage('')
    setAttachedImages([])
    setConversationSummaries([])
    setExecutionSteps([{
      type: 'step_start',
      content: 'Initializing and thinking...',
      timestamp: Date.now()
    }])
    setIsStreaming(true)
    
    console.log('[handleSend] Starting send process...')
    
    try {
      let imageAnalysis: string | null = null;
      if (imagesToSend.length > 0) {
        console.log('[handleSend] Analyzing', imagesToSend.length, 'images...')
        setExecutionSteps(prev => [...prev, {
          type: 'tool_use',
          content: `Analyzing ${imagesToSend.length} image${imagesToSend.length > 1 ? 's' : ''}...`,
          timestamp: Date.now()
        }]);
        
        const result = await analyzeImages(imagesToSend);
        console.log('[handleSend] Analysis result:', result)
        
        if (!result.analysis) {
          const errorMsg = result.error || 'Failed to analyze image';
          console.error('[handleSend] Analysis failed:', errorMsg)
          setExecutionSteps(prev => [...prev, {
            type: 'error',
            content: errorMsg,
            timestamp: Date.now()
          }]);
          setIsStreaming(false);
          return;
        }
        imageAnalysis = result.analysis;
        console.log('[handleSend] Analysis complete, length:', imageAnalysis.length)
      }
      
      console.log('[handleSend] Building message...')
      const finalMessage = buildMessageWithImageAnalysis(userMsg, imageAnalysis)
      
      const historyMsg = getMessages(taskId)
        .filter(m => m.role !== 'system')
        .slice(-6)
        .map(m => {
          let content = m.content;
          // Strip [IMAGE ANALYSIS] block to avoid filling history with massive text
          const analysisMatch = content.match(/\[IMAGE ANALYSIS\][\s\S]*?\[USER REQUEST\]/);
          if (analysisMatch) {
            content = content.replace(analysisMatch[0], '[Image attached]\n');
          }
          const displayContent = content.substring(0, 500) + (content.length > 500 ? '...[truncated]' : '');
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${displayContent}`;
        })
        .join('\n\n')
      
      // ✅ LAZY LOAD: Check small talk FIRST before loading project rules
      const isSmallTalkLocal = isSmallTalk(userMsg, attachedImages.length > 0);

      // ✅ LAZY LOAD: Only load projectRules if NOT small talk
      const projectRules = !isSmallTalkLocal 
        ? useConfigStore.getState().getSystemPrompt()
        : '';
      
      let internalPrompt: string
      
      if (isSmallTalkLocal) {
        // ✅ MINIMAL: Ultra-light prompt without project rules but WITH history context
        internalPrompt = `[CONTEXT AWARE ASSISTANT]
${historyMsg ? 'Recent History:\n' + historyMsg + '\n\n' : ''}Briefly answer: ${finalMessage}`;
      } else if (yoloMode) {
        // YOLO Mode: Direct execution with clear instructions
        internalPrompt = `[ROLE: AI Coding Assistant - Direct Execution Mode]

Your job: IMMEDIATELY implement the user's request by writing/modifying code.

USER REQUEST: ${finalMessage}

${historyMsg ? `CONVERSATION HISTORY:\n${historyMsg}\n\n` : ''}
${projectRules ? `PROJECT RULES:\n${projectRules}\n\n` : ''}
[EXECUTION GUIDELINES]
1. Analyze the request quickly
2. Identify files to modify/create using @filepath format
3. IMPLEMENT the changes immediately - don't ask for confirmation
4. Show the code you're writing with clear comments
5. If you encounter errors, fix them proactively
6. Use rtk prefix for terminal commands (rtk git, rtk test, etc.)

[OUTPUT FORMAT]
- State what you're doing: "Creating @src/components/NewComponent.tsx..."
- Show the code implementation
- Verify it works or note any issues

Start implementing now.`;
      } else {
        // Planning Mode
        internalPrompt = `[ROLE: System Architect & Planner - READ-ONLY MODE]

Your job: EXPLORE, ANALYZE, and CREATE A PLAN. DO NOT write any files.

USER REQUEST: ${finalMessage}

${historyMsg ? `CONVERSATION HISTORY:\n${historyMsg}\n\n` : ''}
${projectRules ? `PROJECT CONTEXT:\n${projectRules}\n\n` : ''}
[PLANNING PROCESS]
1. EXPLORE: Read relevant files to understand current state
2. ANALYZE: Identify what needs to change and why
3. PLAN: Break down into specific, actionable steps

[OUTPUT FORMAT - STRUCTURED PLAN]
For each task you identify, provide:

**Task: [Clear Title]**
- Files to modify: @filepath1, @filepath2
- Files to create: @newfilepath
- Changes needed: [Specific description]
- Estimated complexity: [Low/Medium/High]
- Dependencies: [Any prerequisites]

[PLANNING GUIDELINES]
- Use @filepath format for all file references
- Reference existing patterns from the codebase
- Suggest which skills/tools would help execute this
- Consider edge cases and potential issues
- Estimate effort for each task

Create a comprehensive plan now.`;
      }

// Inject Dynamic MCP tools for non-small talk queries
      // Both YOLO and Planning modes can benefit from tools
      let finalPrompt = internalPrompt
      if (!isSmallTalkLocal && activeWorkspace) {
        finalPrompt = injectToolsIntoPrompt(internalPrompt, {
          maxTools: 20,
          format: 'compact',
          workspaceId: activeWorkspace.id,
        })
        console.log('[DynamicMCP] Tools injected into prompt for workspace:', activeWorkspace.id, '| mode:', yoloMode ? 'YOLO' : 'Planning')
      } else if (activeWorkspace) {
        // For small talk, inject minimal project context only
        finalPrompt = `[CONTEXT] Project: ${activeWorkspace.name}${internalPrompt}`
        console.log('[DynamicMCP] Minimal context injected for small talk')
      }

      console.log('[handleSend] Sending message to AI...')
      await sendSimpleMessage(taskId, userMsg, finalPrompt)
      console.log('[handleSend] Message sent successfully')
    } catch (err) {
      console.error('[handleSend] Error:', err)
    } finally {
      console.log('[handleSend] Cleaning up...')
      setIsStreaming(false)
    }
  }

  const parseSummaryResponse = (raw: string): ConversationSummary[] => {
    // Strategy 1: Try JSON parse first
    try {
      const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .filter((t: any) => t.title && typeof t.title === 'string')
            .map((t: any) => ({
              title: String(t.title).substring(0, 100),
              description: cleanDescription(String(t.description || '')),
              priority: (['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium') as 'high' | 'medium' | 'low',
              recommendedSkills: Array.isArray(t.recommendedSkills) 
                ? t.recommendedSkills.filter((s: any) => typeof s === 'string').slice(0, 3) 
                : [],
            }))
        }
      }
    } catch (e) {
      console.warn('[Summarize] JSON parse failed, trying fallback:', e)
    }

    // Strategy 2: Fallback to regex-based parsing (legacy format)
    try {
      const cleanResponse = raw
        .replace(/\*\*?TASK_TITLE:\*\*?/gi, 'TASK_TITLE:')
        .replace(/\*\*?TASK_DESCRIPTION:\*\*?/gi, 'TASK_DESCRIPTION:')
        .replace(/\*\*?TASK_PRIORITY:\*\*?/gi, 'TASK_PRIORITY:')
        .replace(/\*\*?SKILLS:\*\*?/gi, 'SKILLS:')

      const blocks = cleanResponse.split(/TASK_TITLE:/i).slice(1)
      const tasks: ConversationSummary[] = []

      for (const block of blocks) {
        const titleLine = block.split('\n')[0].replace(/[*_~`]/g, '').trim()
        const descMatch = block.match(/TASK_DESCRIPTION:\s*([\s\S]*?)(?=TASK_TITLE:|TASK_PRIORITY:|SKILLS:|---|$)/i)
        const priorityMatch = block.match(/TASK_PRIORITY:\s*(high|medium|low)/i)
        const skillsMatch = block.match(/SKILLS:\s*([^\n]+)/i)

        if (titleLine) {
          const skillsStr = skillsMatch?.[1] || ''
          const skills = skillsStr
            .split(/[,;]/)
            .map((s: string) => s.trim().toLowerCase())
            .filter((s: string) => s.length > 0)
            .slice(0, 3)

          tasks.push({
            title: titleLine.substring(0, 100),
            description: cleanDescription(descMatch?.[1] || ''),
            priority: (priorityMatch?.[1]?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
            recommendedSkills: skills,
          })
        }
      }

      if (tasks.length > 0) return tasks
    } catch (e) {
      console.warn('[Summarize] Regex fallback also failed:', e)
    }

    return []
  }

  const handleSummarize = async () => {
    const messages = getMessages(taskId)
    if (messages.length === 0) return

    setSummarizedAtLength(messages.length)
    setIsSummarizing(true)
    setConversationSummaries([])

    try {
      // Limit context window: max 20 messages, max 1500 chars per message
      const conversationText = messages
        .filter(m => m.content.trim())
        .slice(-20)
        .map(m => {
          const content = m.content.length > 1500 ? m.content.substring(0, 1500) + '...[truncated]' : m.content
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`
        })
        .join('\n\n')

      // Build skill catalog for recommendation
      const skillCatalog = installedSkills.length > 0
        ? installedSkills.map(s => `- ${s.name}: ${s.description || 'No description'}`).join('\n')
        : ''

      let lastResponse: string | null = null

      // Try Groq API first (FREE!)
      const config = useConfigStore.getState().config
      const groqApiKey = config?.groq_api_key

      if (groqApiKey) {
        console.log('[handleSummarize] Using Groq API for summary (FREE)')
        lastResponse = await sendGroqSummary(groqApiKey, conversationText, skillCatalog)
      }

      // Fallback to CLI if Groq not available or failed
      if (!lastResponse) {
        console.log('[handleSummarize] Falling back to CLI for summary')
        const projectRules = useConfigStore.getState().getSystemPrompt()

        const summaryPrompt = `You are a task extraction specialist. Analyze the conversation and extract coding tasks.

MOST IMPORTANT RULE: ALWAYS prefer FEWER tasks. When in doubt, MERGE into ONE task.

OUTPUT: Valid JSON array ONLY. No markdown, no explanation.

JSON Schema:
[
  {
    "title": "Short clear title, max 80 chars",
    "description": "All implementation details in one description. Include: file paths with @ prefix, all changes needed, technical requirements, expected behavior. Max 2000 chars.",
    "priority": "high | medium | low",
    "recommendedSkills": ["skill-name-1", "skill-name-2"]
  }
]

MERGING RULES (STRICTLY ENFORCED):
1. If the conversation discusses ONE file → ALWAYS 1 task. NEVER split changes to a single file.
2. If the conversation discusses ONE feature/component → ALWAYS 1 task, even if multiple files are involved.
3. Changes to the same area (e.g., same component, same module, same page) → 1 task.
4. Frontend + Backend + Styling for the same feature → 1 task.
5. Bug fix + related refactor in the same file → 1 task.
6. Multiple small changes mentioned casually → 1 task with a combined description.

ONLY SPLIT into multiple tasks when:
- The conversation EXPLICITLY discusses 2+ COMPLETELY UNRELATED features (e.g., "fix login bug" AND "add dark mode to settings page")
- The features have ZERO overlap in files or functionality

NEVER split when:
- Different aspects of the same file (e.g., "fix prompt" and "add validation" in same file = 1 task)
- Sub-steps of the same feature (e.g., "create component", "add styles", "connect API" for one feature = 1 task)
- Changes that are part of the same user request

Priority: "high" = bugs/security, "medium" = features, "low" = docs/cosmetic

Available skills (max 2):
${skillCatalog || 'None'}

RULES:
- description: Focus on WHAT to build/modify
- Include @filepath for all files mentioned
- No tasks for: git, PRs, testing, deployment
- Output ONLY JSON

${projectRules ? '\nProject rules:\n' + projectRules : ''}

BAD EXAMPLE (over-split - DO NOT DO THIS):
Conversation about fixing a prompt in TaskCreatorChat.tsx:
❌ Task 1: "Update system prompt" | Task 2: "Add validation logic" | Task 3: "Fix output format"
✅ Task 1: "Optimize task summarization prompt in @TaskCreatorChat.tsx" (combines ALL changes into one description)

GOOD EXAMPLE (legitimate split):
Conversation about login + unrelated settings page:
✅ Task 1: "Implement login form" | Task 2: "Add settings page theme toggle"

Extract tasks from this conversation (prefer FEWER tasks, merge aggressively):`

        const summaryId = `__summarize_temp_${Date.now()}__`
        lastResponse = await sendSimpleMessage(summaryId, `${summaryPrompt}\n\n---\nConversation:\n${conversationText}`)
        clearMessages(summaryId)
      }

      if (lastResponse) {
        const tasks = parseSummaryResponse(lastResponse)

        if (tasks.length > 0) {
          setConversationSummaries(tasks)
        } else {
          // Provide feedback to user when no tasks could be extracted
          const warningMsg = {
            id: `warn-${Date.now()}`,
            taskId,
            role: 'system' as const,
            content: '⚠️ Tidak bisa mengekstrak task dari percakapan ini. Coba diskusikan lebih detail tentang apa yang ingin dikerjakan, lalu tekan Summarize lagi.',
            timestamp: Date.now(),
          }
          setMessages(taskId, [...getMessages(taskId), warningMsg])
          setSummarizedAtLength(-1) // Allow re-summarize
        }
      }
    } catch (err) {
      console.error('Failed to summarize:', err)
      // Show error feedback to user
      const errorMsg = {
        id: `err-${Date.now()}`,
        taskId,
        role: 'system' as const,
        content: `❌ Gagal melakukan summarize: ${err instanceof Error ? err.message : 'Unknown error'}. Silakan coba lagi.`,
        timestamp: Date.now(),
      }
      setMessages(taskId, [...getMessages(taskId), errorMsg])
      setSummarizedAtLength(-1) // Allow retry
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleStop = async () => {
    await stopMessage(taskId)
    setIsStreaming(false)
  }

  const extractFileReferences = (messages: { role: string; content: string }[]): string[] => {
    const fileRefs = new Set<string>()
    const filePattern = /@([\w./\-]+)/g
    
    messages.forEach(msg => {
      const matches = msg.content.matchAll(filePattern)
      for (const match of matches) {
        const filePath = match[1]
        // Filter out likely non-file mentions (too short or no extension for code files)
        if (filePath.length > 2 && filePath.includes('.')) {
          fileRefs.add(filePath)
        }
      }
    })
    
    return Array.from(fileRefs)
  }

  const buildComprehensiveDescription = (
    summary: ConversationSummary,
    messages: { role: string; content: string }[],
    fileReferences: string[]
  ): string => {
    const parts: string[] = []
    
    // 1. Skills tag (if any)
    if (summary.recommendedSkills && summary.recommendedSkills.length > 0) {
      parts.push(`<!-- skills:${summary.recommendedSkills.join(',')} -->`)
    }
    
    // 2. Original description
    if (summary.description) {
      parts.push('\n[IMPLEMENTATION PLAN]')
      parts.push(summary.description)
    }
    
    // 3. File references mentioned in chat
    if (fileReferences.length > 0) {
      parts.push('\n[RELEVANT FILES]')
      fileReferences.forEach(file => {
        parts.push(`- @${file}`)
      })
    }
    
    // 4. Extract key decisions/requirements from conversation
    const keyPoints = extractKeyPoints(messages)
    if (keyPoints.length > 0) {
      parts.push('\n[KEY REQUIREMENTS]')
      keyPoints.forEach(point => {
        parts.push(`- ${point}`)
      })
    }
    
    // 5. Auto-rules marker
    parts.push('\n<!-- auto-rules-embedded -->')
    
    return parts.join('\n')
  }

  /**
   * Extract key decisions and requirements from conversation
   * Filters out tool executions and technical noise
   */
  const extractKeyPoints = (messages: { role: string; content: string }[]): string[] => {
    const points: string[] = []
    const seen = new Set<string>()
    
    // Process only last 15 messages, skip system
    const relevantMessages = messages
      .filter(m => m.role !== 'system' && m.content.trim())
      .slice(-15)
    
    for (const msg of relevantMessages) {
      let content = msg.content
      
      // Skip tool execution blocks entirely
      if (content.includes('[TOOL_EXEC]') || content.includes('[Tool:')) {
        continue
      }
      
      // Clean up content
      content = content
        .replace(/\[TOOL_EXEC\][\s\S]*?(\n\n|$)/g, '')
        .replace(/\[Tool:[^\]]+\]/g, '')
        .replace(/```[\s\S]*?```/g, '[code block]')
        .replace(/\[IMAGE ANALYSIS\][\s\S]*?\[USER REQUEST\]/, '')
        .replace(/@[\w./\-]+/g, '') // Remove file refs (already listed separately)
        .trim()
      
      // Skip if too short or already seen
      if (content.length < 20 || seen.has(content)) continue
      
      // Extract key decision patterns
      const decisionPatterns = [
        /(?:harus|should|must|need to|perlu) ([^.]+)/i,
        /(?:ubah|change|convert|modify|update) ([^.]+)/i,
        /(?:tampilkan|display|show|hide) ([^.]+)/i,
        /(?:tambahkan|add|create) ([^.]+)/i,
        /(?:hapus|remove|delete) ([^.]+)/i,
        /(?:gunakan|use|pakai) ([^.]+)/i,
        /(?:ketika|when|if|jika) ([^.]+)/i,
      ]
      
      for (const pattern of decisionPatterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          const point = match[1].trim()
            .replace(/\s+/g, ' ')
            .substring(0, 150)
          
          if (point.length > 10 && !seen.has(point)) {
            seen.add(point)
            points.push(point)
          }
          break // Only take first match per message
        }
      }
      
      // If no pattern matched but content looks like a requirement
      if (!decisionPatterns.some(p => p.test(content)) && content.length < 200) {
        const summary = content
          .replace(/^Baik,\s*/i, '')
          .replace(/^Oke,\s*/i, '')
          .replace(/^Mari\s+saya\s*/i, '')
          .substring(0, 150)
        
        if (summary.length > 20 && !seen.has(summary)) {
          seen.add(summary)
          points.push(summary)
        }
      }
    }
    
    // Limit to most relevant 8 points
    return points.slice(0, 8)
  }

  const handleNewChat = useCallback(() => {
    const newSessionId = Date.now().toString()
    const newTaskId = `${baseTaskId}_${newSessionId}`
    setChatSessionId(newSessionId)
    try {
      localStorage.setItem('akira-chat-session-id', newSessionId)
    } catch { /* ignore */ }
    setExecutionSteps([])
    setShowProgress(true)
    setConversationSummaries([])
    clearMessages(newTaskId)
    setSummarizedAtLength(-1)
  }, [baseTaskId, clearMessages])

  const handleCreateTasks = async () => {
    if (conversationSummaries.length === 0 || !activeWorkspace?.folder_path) return
    
    setIsCreating(true)
    try {
      // Get all messages for context
      const allMessages = getMessages(taskId)
      
      for (const summary of conversationSummaries) {
        // Extract file references from entire chat
        const fileReferences = extractFileReferences(allMessages)
        
        // Build comprehensive description with full context
        const finalDescription = buildComprehensiveDescription(summary, allMessages, fileReferences)
        
        await createTask({
          title: summary.title,
          description: finalDescription,
          status: 'todo',
          priority: summary.priority || 'medium',
        })
      }
      
      setCreatedSuccess(true)
      handleNewChat()
      
      setTimeout(() => setCreatedSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to create tasks:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggleYoloMode = useCallback(() => {
    setYoloMode(prev => {
      const newValue = !prev
      try {
        localStorage.setItem('akira-yolo-mode', String(newValue))
      } catch { /* ignore */ }
      return newValue
    })
  }, [])

  const handleSetChatSessionId = useCallback((sessionId: string) => {
    setChatSessionId(sessionId)
    try {
      if (sessionId) {
        localStorage.setItem('akira-chat-session-id', sessionId)
      } else {
        localStorage.removeItem('akira-chat-session-id')
      }
    } catch { /* ignore */ }
  }, [])

  const suggestedPrompts = yoloMode 
    ? [
        "Refactor this function to be cleaner",
        "Add error handling to the API",
        "Create a button component",
        "Fix the bug in login flow"
      ]
    : [
        "Create a login form component",
        "Add dark mode toggle",
        "Build a settings page",
        "Implement search functionality"
      ]

  const handleAnalyzeInCreator = async () => {
    const cwd = activeWorkspace?.folder_path
    if (!cwd || !activeEngine) return

    setIsAnalyzingProject(true)
    
    const result = await analyzeProject(cwd, (status) => {
      setAnalysisStatus(status)
    })
    
    if (!result.success) {
      setAnalysisStatus(`❌ ${result.error}`)
    }

    setIsAnalyzingProject(false)
    setTimeout(() => setAnalysisStatus(null), 3000)
  }

  const currentQuery = atSymbolIndex !== -1 ? message.slice(atSymbolIndex + 1) : ''
  const filteredFiles = filterFiles(currentQuery)

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-0 h-full bg-app-panel rounded-lg border border-app-border overflow-hidden">
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

        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="p-4 space-y-4">
            {showHistoryModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-app-panel rounded-lg border border-app-border w-full max-w-md max-h-[70%] overflow-hidden">
                  <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Chat History</h3>
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
                          className={`w-full justify-start h-auto py-3 px-4 rounded-none border-b border-app-border ${item.task_id === taskId ? 'bg-app-accent/10 block' : 'block'}`}
onClick={() => {
                            const base = `__task_creator__:${activeWorkspace?.id || 'default'}`
                            if (item.task_id === base) {
                              handleSetChatSessionId('')
                            } else if (item.task_id.startsWith(`${base}_`)) {
                              handleSetChatSessionId(item.task_id.substring(base.length + 1))
                            }
                            setShowHistoryModal(false)
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
              taskMessages.map((msg, idx) => {
                // Extract token info from content first
                const tokenMatch = msg.content?.match(/\[(\d+)?\s*tokens?\s*\|\s*([^\]]+)\]$/i);
                const tokenCount = tokenMatch ? tokenMatch[1] : null;
                const modelName = tokenMatch ? tokenMatch[2]?.trim() : null;
                
                // Check if message is from Groq (has Groq model info in content)
                // Groq models: llama-3.1-8b-instant, mixtral-8x7b, gemma-7b, or local-math
                const isGroqMessage = msg.role === 'assistant' && 
                  modelName && (
                    modelName.includes('llama') || 
                    modelName.includes('mixtral') || 
                    modelName.includes('gemma') || 
                    modelName.includes('local-math')
                  );
                
                // Debug logging
                if (msg.role === 'assistant') {
                  console.log('[TaskCreatorChat] content:', msg.content?.substring(0, 60));
                  console.log('[TaskCreatorChat] isGroqMessage:', isGroqMessage, 'tokenCount:', tokenCount, 'modelName:', modelName);
                }
                
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
                
                // Clean up any remaining unclosed [TOOL RESULTS] at the end of the string (usually caused by AI echoing during stream)
                displayContent = displayContent.replace(/\[TOOL RESULTS\][\s\S]*$/, '').trim();

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex w-full group relative",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div className={cn(
                      "relative max-w-[85%] px-4 py-2.5 text-xs leading-relaxed",
                      msg.role === 'user' 
                        ? 'bg-app-accent/15 border border-app-accent/20 rounded-2xl rounded-br-md text-app-text shadow-sm' 
                        : 'bg-app-surface-2 border border-app-border rounded-2xl rounded-bl-md text-app-text shadow-sm'
                    )}>
                      <CopyMessageButton content={displayContent} />
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
                            <MarkdownContent content={displayContent} />
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
                      
                      {/* Token info for Groq messages */}
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
                );
              })
            )}
            
            {isStreaming && (
              <div className="mt-4 border border-app-border/50 rounded-lg overflow-hidden bg-app-bg/50">
                <div className="flex items-center justify-between px-3 py-2 bg-app-sidebar/40 border-b border-app-border/40">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-app-accent" />
                    <span className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">AI Progress</span>
                    {executionSteps.length > 0 && !showProgress && (
                      <span className="text-xs text-neutral-500">({executionSteps.length} steps)</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowProgress(!showProgress)}
                    className="h-5 px-1.5 text-xs text-app-text-muted hover:text-white"
                  >
                    {showProgress ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {showProgress && (
                  <div className="max-h-32 overflow-y-auto p-2 font-mono text-xs space-y-1">
                    {executionSteps.length === 0 ? (
                      <div className="flex items-center gap-2 text-neutral-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Waiting for response...</span>
                      </div>
                    ) : (
                      executionSteps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          {step.type === 'step_start' && (
                            <>
                              <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                              <span className="text-yellow-400">{step.content}</span>
                            </>
                          )}
                          {step.type === 'tool_use' && (
                            <>
                              <Wrench className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
                              <span className="text-cyan-300">{step.content}</span>
                            </>
                          )}
                          {step.type === 'text' && (
                            <>
                              <FileText className="w-3 h-3 text-neutral-500 flex-shrink-0 mt-0.5" />
                              <span className="text-neutral-400">{step.content}</span>
                            </>
                          )}
                          {step.type === 'error' && (
                            <>
                              <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                              <span className="text-red-400">{step.content}</span>
                            </>
                          )}
                          {step.type === 'complete' && (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                              <span className="text-green-400">Completed</span>
                            </>
                          )}
                        </div>
                      ))
                    )}
                    <div ref={progressEndRef} />
                  </div>
                )}
              </div>
            )}
            
            {!yoloMode && taskMessages.length > 0 && taskMessages.length > summarizedAtLength && conversationSummaries.length === 0 && !isSummarizing && (
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleSummarize}
                  disabled={isStreaming}
                  className="flex-1 bg-app-accent hover:bg-app-accent-hover"
                >
                  <Check className="w-3 h-3 mr-2" />
                  Summarize & Create Task
                </Button>
              </div>
            )}
            
            {isSummarizing && (
              <div className="flex items-center justify-center p-4 mt-4 bg-app-accent/5 rounded-lg border border-app-accent/20">
                <Loader2 className="w-4 h-4 animate-spin text-app-accent" />
                <span className="ml-2 text-xs text-neutral-300">Summarizing conversation into tasks...</span>
              </div>
            )}
            
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
                  <Button
                    onClick={handleCreateTasks}
                    disabled={isCreating || createdSuccess}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {createdSuccess ? 'Created!' : isCreating ? 'Creating Tasks...' : `Create ${conversationSummaries.length} Task${conversationSummaries.length > 1 ? 's' : ''}`}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConversationSummaries([])
                      setSummarizedAtLength(-1)
                    }}
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
              <div className="px-2 py-1.5 text-xs text-neutral-500 border-b border-app-border">
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
                  onImagesChange={(images) => {
                    setAttachedImages(images)
                    setImageError(null)
                  }}
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
              </div>
              
              {isStreaming ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg"
                  onClick={handleStop}
                >
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
