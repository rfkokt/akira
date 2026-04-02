import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ChevronDown, Send, Square, Loader2, History, X, FileIcon, ChevronLeft, Terminal, FileText, Wrench, Zap, CheckCircle2, AlertCircle, Sparkles, MessageSquarePlus } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAIChatStore, useEngineStore, useTaskStore, useWorkspaceStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { dbService } from '@/lib/db'
import { getProvider } from '@/lib/providers'
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
  priority: 'high' | 'medium' | 'low'
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
  const [chatSessionId, setChatSessionId] = useState<string>('')
  const [summarizedAtLength, setSummarizedAtLength] = useState<number>(-1)
  const [historyList, setHistoryList] = useState<{ task_id: string; created_at: string; role: string; preview: string; content: string }[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showFileSuggestions, setShowFileSuggestions] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1)
  const [executionSteps, setExecutionSteps] = useState<{ type: string; content: string; timestamp: number }[]>([])
  const [showProgress, setShowProgress] = useState(true)
  const [isAnalyzingProject, setIsAnalyzingProject] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const progressEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const unlistenFns = useRef<UnlistenFn[]>([])
  const aiChatStore = useAIChatStore()
  const { sendSimpleMessage, stopMessage, getMessages, setMessages, clearMessages, streamingMessageId } = aiChatStore
  const { activeEngine, engines, setActiveEngine } = useEngineStore()
  const { createTask } = useTaskStore()
  const { activeWorkspace } = useWorkspaceStore()
  const { config, updateField, saveConfig } = useConfigStore()

  const baseTaskId = `__task_creator__:${activeWorkspace?.id || 'default'}`
  const taskId = chatSessionId ? `${baseTaskId}_${chatSessionId}` : baseTaskId
  const taskMessages = getMessages(taskId)
  const currentStreamingId = streamingMessageId[taskId]
  
  // Check if rules are already populated (not just the default template)
  const hasRules = config?.md_rules 
    && config.md_rules.trim() !== '' 
    && config.md_rules.trim() !== '# Rules\n\n## DO\n- \n\n## DON\'T\n- '
    && config.md_rules.split('\n').filter(l => l.trim().startsWith('-') && l.trim().length > 2).length > 2

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
    if (!message.trim() || !activeEngine) return
    
    setConversationSummaries([])
    setExecutionSteps([{
      type: 'step_start',
      content: 'Initializing and thinking...',
      timestamp: Date.now()
    }])
    setIsStreaming(true)
    
    try {
      const userMsg = message
      setMessage('')
      
      const historyMsg = getMessages(taskId)
        .filter(m => m.role !== 'system')
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')
        
      const projectRules = useConfigStore.getState().getSystemPrompt()
      
      const internalPrompt = `[SYSTEM — STRICT MODE — READ CAREFULLY]

You are a PLANNING ASSISTANT inside a project task manager called Akira.
Your ONLY job is to help the user think through, discuss, and define tasks that will later be implemented by a separate AI coding agent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE HARD RULES — NEVER VIOLATE THESE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ❌ DO NOT use any file editing tools (edit_file, write_file, str_replace, etc.)
2. ❌ DO NOT execute shell commands, run bash, run terminal commands of any kind
3. ❌ DO NOT write, apply, or attempt to apply any code changes to the filesystem
4. ❌ DO NOT use computer use tools, browser tools, or any action tools
5. ❌ DO NOT implement features — you are NOT the implementer
6. ✅ ONLY respond with text: discussion, analysis, clarification, and planning
7. ✅ You MAY show code SNIPPETS as examples in your reply text, but never write them to files
8. ✅ Keep responses concise and focused on understanding requirements

If a user asks you to implement something directly, politely remind them:
"I'm the planning assistant — once you're satisfied with the plan, click 'Summarize & Create Task' and the AI agent on the board will implement it."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${projectRules ? '\nProject context & conventions (for planning reference only):\n' + projectRules + '\n' : ''}
${historyMsg ? '\nConversation history:\n' + historyMsg + '\n' : ''}
User: ${userMsg}
Assistant:`

      await sendSimpleMessage(taskId, userMsg, internalPrompt)
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
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

      const blocks = cleanResponse.split(/TASK_TITLE:/i).slice(1)
      const tasks: ConversationSummary[] = []

      for (const block of blocks) {
        const titleLine = block.split('\n')[0].replace(/[*_~`]/g, '').trim()
        const descMatch = block.match(/TASK_DESCRIPTION:\s*([\s\S]*?)(?=TASK_TITLE:|TASK_PRIORITY:|---|$)/i)
        const priorityMatch = block.match(/TASK_PRIORITY:\s*(high|medium|low)/i)

        if (titleLine) {
          tasks.push({
            title: titleLine.substring(0, 100),
            description: cleanDescription(descMatch?.[1] || ''),
            priority: (priorityMatch?.[1]?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
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
      
      const projectRules = useConfigStore.getState().getSystemPrompt()
      
      const summaryPrompt = `You are a task extraction specialist. Analyze the conversation below and extract all actionable coding tasks discussed.

You MUST output a valid JSON array. No markdown, no explanation, ONLY the JSON array.

JSON Schema:
[
  {
    "title": "Short clear title, max 80 chars",
    "description": "A comprehensive implementation prompt for the AI agent. Include: exact file paths mentioned, design decisions agreed upon, specific coding steps, and technical constraints from the discussion. This is the raw instruction the next AI agent will receive — be thorough and precise. Max 2000 chars.",
    "priority": "high | medium | low"
  }
]

Priority guidelines:
- "high": Bug fixes, breaking issues, security concerns, blockers
- "medium": New features, enhancements, refactoring
- "low": Nice-to-have improvements, cosmetic changes, documentation
${projectRules ? '\nThe tasks MUST follow these project rules. Embed relevant rules into each task description so the executing AI follows the conventions:\n' + projectRules : ''}

Rules:
- Extract ONLY coding implementation tasks
- Do NOT create tasks for: git commits, PRs, testing, deployment
- If the conversation is unclear or has no actionable tasks, return an empty array: []
- Output ONLY valid JSON, no surrounding text or markdown fences`

      const summaryId = `__summarize_temp_${Date.now()}__`
      const lastResponse = await sendSimpleMessage(summaryId, `${summaryPrompt}\n\n---\nConversation:\n${conversationText}`)
      
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
      
      clearMessages(summaryId)
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

  const handleCreateTasks = async () => {
    if (conversationSummaries.length === 0 || !activeWorkspace?.folder_path) return
    
    setIsCreating(true)
    try {
      for (const summary of conversationSummaries) {
        await createTask({
          title: summary.title,
          description: (summary.description || '') + '\n<!-- auto-rules-embedded -->',
          status: 'todo',
          priority: summary.priority || 'medium',
        })
      }
      
      setCreatedSuccess(true)
      setConversationSummaries([])
      clearMessages(taskId)
      setSummarizedAtLength(-1)
      
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
    setExecutionSteps([])
    setShowProgress(true)
    setSummarizedAtLength(-1)
  }

  const suggestedPrompts = [
    "Create a login form component",
    "Add dark mode toggle",
    "Build a settings page",
    "Implement search functionality"
  ]

  const handleAnalyzeInCreator = async () => {
    const cwd = activeWorkspace?.folder_path
    if (!activeEngine || !cwd) return

    setIsAnalyzingProject(true)
    const analysisPrompt = `[System: You are a code analyzer. DO NOT modify any files. DO NOT use any tools that write to disk. ONLY read and analyze.]

Analyze the project at ${cwd}. Read package.json, folder structure, and key .ts/.tsx source files.

Generate coding rules that enforce: clean code, reusability, and secure coding practices.

Output EXACTLY in this markdown format and nothing else:

# Rules

## DO
- [specific convention or best practice found in this project]
- [another convention...]
(list 8-15 rules)

## DON'T
- [specific anti-pattern to avoid in this project]
- [another anti-pattern...]
(list 8-15 rules)

Base the rules on the ACTUAL tech stack, patterns, and file structure you find. Be specific to THIS project, not generic advice.`

    const tempId = '__analyze_project_creator__'
    try {
      await sendSimpleMessage(tempId, analysisPrompt)
      await new Promise(r => setTimeout(r, 1500))
      const msgs = getMessages(tempId)
      const aiResponse = msgs.filter(m => m.role === 'assistant').pop()?.content || ''
      clearMessages(tempId)

      if (aiResponse.trim() && config) {
        const existingRules = config.md_rules || ''
        let combinedRules: string

        if (existingRules.trim() && existingRules.split('\n').filter(l => l.trim().startsWith('-') && l.trim().length > 2).length > 2) {
          const existingDos = (existingRules.match(/## DO[\s\S]*?(?=## DON'?T|$)/i)?.[0] || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim())
          const existingDonts = (existingRules.match(/## DON'?T[\s\S]*/i)?.[0] || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim())
          const newDos = (aiResponse.match(/## DO[\s\S]*?(?=## DON'?T|$)/i)?.[0] || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim())
          const newDonts = (aiResponse.match(/## DON'?T[\s\S]*/i)?.[0] || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim())
          const allDos = [...new Set([...existingDos, ...newDos])]
          const allDonts = [...new Set([...existingDonts, ...newDonts])]
          combinedRules = `# Rules\n\n## DO\n${allDos.join('\n')}\n\n## DON'T\n${allDonts.join('\n')}`
        } else {
          combinedRules = aiResponse
        }

        updateField('md_rules', combinedRules)
        await saveConfig({ ...config, md_rules: combinedRules })
      }
    } catch (err) {
      console.error('Analysis in creator failed:', err)
    } finally {
      setIsAnalyzingProject(false)
    }
  }

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
                onClick={() => {
                  setChatSessionId(Date.now().toString());
                  setExecutionSteps([]);
                  setShowProgress(true);
                  setConversationSummaries([]);
                  clearMessages(taskId);
                }}
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
                          className={`w-full justify-start h-auto py-3 px-4 rounded-none border-b border-app-border ${item.task_id === taskId ? 'bg-app-accent/10 block' : 'block'}`}
                          onClick={() => {
                            const base = `__task_creator__:${activeWorkspace?.id || 'default'}`
                            if (item.task_id === base) {
                              setChatSessionId('')
                            } else if (item.task_id.startsWith(`${base}_`)) {
                              setChatSessionId(item.task_id.substring(base.length + 1))
                            }
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
                {!hasRules && (
                  <div className="w-full pt-2">
                    <Button
                      variant="secondary"
                      className="w-full justify-center h-auto py-3 bg-app-accent/10 hover:bg-app-accent/20 text-app-accent border border-app-accent/30 hover:border-app-accent/50 transition-all"
                      onClick={handleAnalyzeInCreator}
                      disabled={isAnalyzingProject || !activeEngine}
                    >
                      {isAnalyzingProject ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Analyzing project...</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5 mr-2" /> Analyze Project & Generate Rules</>
                      )}
                    </Button>
                    <p className="text-[10px] text-neutral-600 text-center mt-1.5">Auto-generate DO/DON'T rules for cleaner AI output</p>
                  </div>
                )}
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
                      {msg.content ? (
                        <MarkdownContent content={msg.content} />
                      ) : currentStreamingId === msg.id ? (
                        <span className="text-neutral-500 italic">Processing...</span>
                      ) : null}
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
            
            {isStreaming && showProgress && (
              <div className="mt-4 border border-app-border/50 rounded-lg overflow-hidden bg-app-bg/50">
                <div className="flex items-center justify-between px-3 py-2 bg-app-sidebar/40 border-b border-app-border/40">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-app-accent" />
                    <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">AI Progress</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowProgress(false)}
                    className="h-5 px-1.5 text-[10px] text-app-text-muted hover:text-white"
                  >
                    Hide
                  </Button>
                </div>
                <div className="max-h-32 overflow-y-auto p-2 font-mono text-[10px] space-y-1">
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
              </div>
            )}
            
            {taskMessages.length > 0 && taskMessages.length > summarizedAtLength && conversationSummaries.length === 0 && !isSummarizing && (
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleSummarize}
                  disabled={isStreaming}
                  className="flex-1 bg-app-accent hover:bg-app-accent-hover"
                >
                  <Check className="w-3 h-3 mr-2" />
                  Summarize & Create Task
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
            
            {isSummarizing && (
              <div className="flex items-center justify-center p-4 mt-4 bg-app-accent/5 rounded-lg border border-app-accent/20">
                <Loader2 className="w-4 h-4 animate-spin text-app-accent" />
                <span className="ml-2 text-xs text-neutral-300 font-geist">Summarizing conversation into tasks...</span>
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
                          <span className="text-xs text-green-400 font-geist font-medium">Task {idx + 1} Ready</span>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityConfig.bg} ${priorityConfig.border} border ${priorityConfig.color} uppercase tracking-wider`}>
                          {priorityConfig.label}
                        </span>
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
          
          <div className="relative flex flex-col bg-app-panel rounded-xl border border-app-border focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all shadow-inner">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder={activeEngine ? "Describe what you want to build..." : "Select a model first"}
              disabled={!activeEngine || isStreaming}
              className="w-full px-4 pt-3 pb-2 text-sm bg-transparent text-white placeholder-neutral-600 focus:outline-none resize-none custom-scrollbar"
              rows={1}
              style={{ minHeight: '52px', maxHeight: '150px' }}
            />
            
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
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
                  disabled={!message.trim() || !activeEngine || isStreaming}
                >
                  <Send className="w-4 h-4 -ml-0.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
