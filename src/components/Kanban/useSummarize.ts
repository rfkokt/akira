import { useState, useCallback } from 'react'
import { useAIChatStore, useEngineStore, useWorkspaceStore, useTaskStore, useSkillStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { sendGroqSummary } from '@/lib/groq'
import { runCLIWithStreaming } from '@/lib/cli'
import { getDefaultBaseBranch } from '@/lib/worktree'

export interface ConversationSummary {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  recommendedSkills: string[]
  taskSpecificFiles?: string[]
  taskSpecificContext?: string
}

// --- Pure utility functions ---

function cleanDescription(text: string): string {
  if (!text) return ''
  let cleaned = text
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')
  cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '')
  cleaned = cleaned.replace(/^\s*\[[ x]\]\s*/gim, '')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.trim()
  return cleaned.substring(0, 2500)
}

function extractFileReferencesFromText(text: string): string[] {
  const fileRefs = new Set<string>()
  const filePattern = /@([\w./\-]+)/g
  const matches = text.matchAll(filePattern)
  for (const match of matches) {
    const filePath = match[1]
    if (filePath.length > 2 && filePath.includes('.')) {
      fileRefs.add(filePath)
    }
  }
  return Array.from(fileRefs)
}

function extractFileReferences(messages: { role: string; content: string }[]): string[] {
  const fileRefs = new Set<string>()
  const filePattern = /@([\w./\-]+)/g
  messages.forEach(msg => {
    const matches = msg.content.matchAll(filePattern)
    for (const match of matches) {
      const filePath = match[1]
      if (filePath.length > 2 && filePath.includes('.')) {
        fileRefs.add(filePath)
      }
    }
  })
  return Array.from(fileRefs)
}

function extractKeyPointsForTask(
  messages: { role: string; content: string }[],
  taskTitle: string,
  taskDescription: string
): string[] {
  const points: string[] = []
  const seen = new Set<string>()
  
  const taskKeywords = (taskTitle + ' ' + taskDescription)
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 10)
  
  const relevantMessages = messages
    .filter(m => {
      if (m.role === 'system') return false
      const content = m.content.toLowerCase()
      const isRelevant = taskKeywords.some(keyword => content.includes(keyword))
      return isRelevant && m.content.trim().length > 20
    })
    .slice(-5)
  
  for (const msg of relevantMessages) {
    let content = msg.content
      .replace(/\[TOOL_EXEC\][\s\S]*?(\n\n|$)/g, '')
      .replace(/\[Tool:[^\]]+\]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/@[\w./\-]+/g, '')
      .trim()
    
    if (content.length < 30 || seen.has(content)) continue
    
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20)
    for (const sentence of sentences.slice(0, 2)) {
      const clean = sentence.trim().replace(/\s+/g, ' ').substring(0, 150)
      if (clean.length > 20 && !seen.has(clean)) {
        seen.add(clean)
        points.push(clean)
      }
    }
  }
  
  return points.slice(0, 5)
}

function buildComprehensiveDescription(
  summary: ConversationSummary,
  allMessages: { role: string; content: string }[],
  allFileReferences: string[]
): string {
  const parts: string[] = []
  
  parts.push(`# ${summary.title}`)
  
  if (summary.recommendedSkills && summary.recommendedSkills.length > 0) {
    parts.push(`\n<!-- skills:${summary.recommendedSkills.join(',')} -->`)
  }
  
  if (summary.taskSpecificContext) {
    parts.push('\n[CONTEXT]')
    parts.push(summary.taskSpecificContext)
  }
  
  if (summary.description) {
    parts.push('\n[IMPLEMENTATION PLAN]')
    parts.push(summary.description)
  }
  
  if (summary.taskSpecificFiles && summary.taskSpecificFiles.length > 0) {
    parts.push('\n[FILES FOR THIS TASK]')
    summary.taskSpecificFiles.forEach(file => {
      parts.push(`- @${file}`)
    })
  }
  
  const otherFiles = allFileReferences.filter(f => !summary.taskSpecificFiles?.includes(f))
  if (otherFiles.length > 0) {
    parts.push('\n[OTHER REFERENCED FILES]')
    otherFiles.slice(0, 10).forEach(file => {
      parts.push(`- @${file}`)
    })
  }
  
  const taskKeyPoints = extractKeyPointsForTask(allMessages, summary.title, summary.description)
  if (taskKeyPoints.length > 0) {
    parts.push('\n[KEY REQUIREMENTS]')
    taskKeyPoints.forEach(point => {
      parts.push(`- ${point}`)
    })
  }
  
  parts.push('\n<!-- auto-rules-embedded -->')
  
  return parts.join('\n')
}

export function parseSummaryResponse(raw: string): ConversationSummary[] {
  if (!raw || raw.trim().length < 2) {
    return []
  }

  let cleaned = raw.trim()
  cleaned = cleaned.replace(/\[TOOL_EXEC\][^\n]*(\n|$)/g, '')
  cleaned = cleaned.replace(/\[TOOL_RES\][^\n]*(\n|$)/g, '')
  cleaned = cleaned.replace(/\[Tool:[^\]]+\]\s*/gi, '')
  cleaned = cleaned.replace(/---\s*Step completed[^\n]*---/g, '')
  cleaned = cleaned.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '')
  cleaned = cleaned.replace(/```thinking[\s\S]*?```/gi, '')
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, '')
  cleaned = cleaned.replace(/✅ Completed[^\n]*/g, '')
  cleaned = cleaned.replace(/❌ Error:[^\n]*/g, '')
  cleaned = cleaned.replace(/\*\*/g, '')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.trim()

  const normalizeTasks = (parsed: any[]): ConversationSummary[] => {
    return parsed
      .filter((t: any) => t.title && typeof t.title === 'string')
      .map((t: any) => {
        const description = cleanDescription(String(t.description || ''))
        const fileRefs = extractFileReferencesFromText(description)
        return {
          title: String(t.title).substring(0, 100),
          description,
          priority: (['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium') as 'high' | 'medium' | 'low',
          recommendedSkills: Array.isArray(t.recommendedSkills)
            ? t.recommendedSkills.filter((s: any) => typeof s === 'string').slice(0, 3)
            : [],
          taskSpecificFiles: fileRefs,
          taskSpecificContext: t.context || t.additionalContext || undefined
        }
      })
  }

  // Strategy 1: Find first [ and its matching ] by counting brackets
  try {
    const firstOpenBracket = cleaned.indexOf('[')
    if (firstOpenBracket !== -1) {
      let depth = 0
      let closeBracket = -1
      for (let i = firstOpenBracket; i < cleaned.length; i++) {
        if (cleaned[i] === '[') depth++
        else if (cleaned[i] === ']') depth--
        if (depth === 0) {
          closeBracket = i
          break
        }
      }
      
      if (closeBracket > firstOpenBracket) {
        const jsonStr = cleaned.substring(firstOpenBracket, closeBracket + 1)
        try {
          const parsed = JSON.parse(jsonStr)
          if (Array.isArray(parsed) && parsed.length > 0) {
            return normalizeTasks(parsed)
          }
        } catch (e) {
          console.warn('[parseSummaryResponse] Bracket-matched JSON parse failed:', e)
        }
      }
    }
  } catch (e) {
    console.warn('[parseSummaryResponse] Strategy 1 failed:', e)
  }

  // Strategy 2: Parse entire cleaned string as JSON
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return normalizeTasks(parsed)
    }
  } catch (e) {
    console.warn('[parseSummaryResponse] Full JSON parse failed:', e)
  }

  // Strategy 3: Fix common JSON issues
  try {
    let fixable = cleaned
    
    if (fixable.trim().startsWith('{')) {
      fixable = '[' + fixable.trim() + ']'
      try {
        const parsed = JSON.parse(fixable)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeTasks(parsed)
        }
      } catch {}
    }

    fixable = fixable.replace(/,\s*([}\]])/g, '$1')
    const parsed = JSON.parse(fixable)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return normalizeTasks(parsed)
    }
  } catch (e) {
    console.warn('[parseSummaryResponse] Strategy 3 JSON fix failed:', e)
  }

  // Strategy 4: Regex-based fallback
  try {
    const fallbackText = cleaned
      .replace(/\*\*?TASK_TITLE:\*\*?/gi, 'TASK_TITLE:')
      .replace(/\*\*?TASK_DESCRIPTION:\*\*?/gi, 'TASK_DESCRIPTION:')
      .replace(/\*\*?TASK_PRIORITY:\*\*?/gi, 'TASK_PRIORITY:')
      .replace(/\*\*?SKILLS:\*\*?/gi, 'SKILLS:')

    const blocks = fallbackText.split(/TASK_TITLE:/i).slice(1)
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
        
        const description = cleanDescription(descMatch?.[1] || '')
        const fileRefs = extractFileReferencesFromText(description)

        tasks.push({
          title: titleLine.substring(0, 100),
          description,
          priority: (priorityMatch?.[1]?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
          recommendedSkills: skills,
          taskSpecificFiles: fileRefs,
        })
      }
    }

    if (tasks.length > 0) return tasks
  } catch (e) {
    console.warn('[parseSummaryResponse] Regex fallback also failed:', e)
  }

  console.warn('[parseSummaryResponse] All strategies failed for response length:', raw.length)
  return []
}

// --- Main hook ---

export function useSummarize(taskId: string) {
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([])
  const [summarizedAtLength, setSummarizedAtLength] = useState<number>(-1)
  const [isCreating, setIsCreating] = useState(false)
  const [createdSuccess, setCreatedSuccess] = useState(false)

  const { getMessages, setMessages, clearMessages } = useAIChatStore()
  const { activeEngine } = useEngineStore()
  const { activeWorkspace } = useWorkspaceStore()
  const { createTask } = useTaskStore()
  const { installedSkills } = useSkillStore()

  const handleSummarize = useCallback(async () => {
    const messages = getMessages(taskId)
    if (messages.length === 0) return

    setSummarizedAtLength(messages.length)
    setIsSummarizing(true)
    setConversationSummaries([])

    try {
      const conversationText = messages
        .filter(m => m.content.trim())
        .slice(-20)
        .map(m => {
          let content = m.content.length > 1500 ? m.content.substring(0, 1500) + '...[truncated]' : m.content
          content = content
            .replace(/\[TOOL_EXEC\][^\n]*(\n|$)/g, '')
            .replace(/\[TOOL_RES\][^\n]*(\n|$)/g, '')
            .replace(/\[Tool:[^\]]+\]\s*/gi, '')
            .replace(/```thinking[\s\S]*?```/gi, '')
            .replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
          if (!content) return ''
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`
        })
        .filter(Boolean)
        .join('\n\n')

      const skillCatalog = installedSkills.length > 0
        ? installedSkills.map(s => `- ${s.name}: ${s.description || 'No description'}`).join('\n')
        : ''

      let lastResponse: string | null = null

      const configState = useConfigStore.getState().config
      const groqApiKey = configState?.groq_api_key

      if (groqApiKey) {
        lastResponse = await sendGroqSummary(
          groqApiKey,
          conversationText,
          skillCatalog,
          activeWorkspace?.folder_path
        )
      }

      if (!lastResponse && activeEngine && activeWorkspace) {
        const projectRules = useConfigStore.getState().getSystemPrompt()
        const summaryPrompt = `You are a task extraction engine. Read the conversation and produce a JSON array of implementation tasks.

OUTPUT FORMAT: A single valid JSON array. No markdown fences. No explanation. Just the array.

SCHEMA:
[{"title": "string (max 80 chars)", "description": "string (max 2500 chars)", "priority": "high|medium|low", "recommendedSkills": ["string"]}]

FIELD GUIDELINES:
- title: Clear, action-oriented. e.g. "Add user avatar upload to profile page"
- description: A complete implementation brief for an AI agent. Include:
  • File paths to create or modify
  • Design decisions from the conversation
  • Specific steps in execution order
  • Technical constraints discussed
- priority: "high" = bugs/security/blockers, "medium" = features/refactoring, "low" = cosmetic/docs
- recommendedSkills: Pick 0-2 from the available list below, or empty array

MERGE vs SPLIT (critical):
→ ONE conversation topic = ONE task. Combine frontend + backend + styling for the same feature.
→ Create multiple tasks ONLY for genuinely unrelated features discussed in the same conversation.
→ Default to fewer tasks. Over-splitting wastes execution time.

EXCLUDE: git operations, CI/CD, PR creation, deployment steps — these are handled automatically.

Available skills: ${skillCatalog || 'None'}
${projectRules ? '\nProject rules (embed relevant ones into task descriptions):\n' + projectRules : ''}`

        const fullPrompt = `${summaryPrompt}\n\n---\nConversation:\n${conversationText}`
        const summaryId = `__summarize_${Date.now()}__`

        try {
          let accumulatedContent = ''
          const result = await runCLIWithStreaming({
            taskId: summaryId,
            engineAlias: activeEngine.alias,
            binaryPath: activeEngine.binary_path,
            engineArgs: activeEngine.args || '',
            prompt: fullPrompt,
            cwd: activeWorkspace.folder_path,
            mode: 'standard',
            onOutput: (text) => {
              accumulatedContent += text
            },
          })

          lastResponse = accumulatedContent || result.content
        } catch (err) {
          console.warn('[handleSummarize] CLI error:', err)
        }
      }

      if (lastResponse) {
        const tasks = parseSummaryResponse(lastResponse)

        if (tasks.length > 0) {
          setConversationSummaries(tasks)
        } else {
          const warningMsg = {
            id: `warn-${Date.now()}`,
            taskId,
            role: 'system' as const,
            content: '⚠️ Tidak bisa mengekstrak task dari percakapan ini. Coba diskusikan lebih detail tentang apa yang ingin dikerjakan, lalu tekan Summarize lagi.',
            timestamp: Date.now(),
          }
          setMessages(taskId, [...getMessages(taskId), warningMsg])
          setSummarizedAtLength(-1)
        }
      }
    } catch (err) {
      console.error('Failed to summarize:', err)
      const errorMsg = {
        id: `err-${Date.now()}`,
        taskId,
        role: 'system' as const,
        content: `❌ Gagal melakukan summarize: ${err instanceof Error ? err.message : 'Unknown error'}. Silakan coba lagi.`,
        timestamp: Date.now(),
      }
      setMessages(taskId, [...getMessages(taskId), errorMsg])
      setSummarizedAtLength(-1)
    } finally {
      setIsSummarizing(false)
    }
  }, [taskId, getMessages, setMessages, activeEngine, activeWorkspace, installedSkills])

  const handleCreateTasks = useCallback(async () => {
    if (conversationSummaries.length === 0 || !activeWorkspace?.folder_path) return
    
    setIsCreating(true)
    try {
      const allMessages = getMessages(taskId)
      const allFileReferences = extractFileReferences(allMessages)
      
      let baseBranch = 'rdev'
      try {
        baseBranch = await getDefaultBaseBranch(activeWorkspace.folder_path)
      } catch (err) {
        console.warn('[TaskCreator] Failed to detect base branch, using default:', err)
      }
      
      for (const summary of conversationSummaries) {
        const finalDescription = buildComprehensiveDescription(summary, allMessages, allFileReferences)
        
        await createTask({
          title: summary.title,
          description: finalDescription,
          status: 'todo',
          priority: summary.priority || 'medium',
          base_branch: baseBranch,
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
  }, [taskId, conversationSummaries, activeWorkspace, getMessages, clearMessages, createTask])

  return {
    isSummarizing,
    conversationSummaries,
    setConversationSummaries,
    summarizedAtLength,
    setSummarizedAtLength,
    isCreating,
    createdSuccess,
    handleSummarize,
    handleCreateTasks,
  }
}
