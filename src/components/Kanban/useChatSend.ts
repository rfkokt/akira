import { useState, useCallback } from 'react'
import { useAIChatStore, useEngineStore, useWorkspaceStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { useImageAnalysis, buildMessageWithImageAnalysis } from '@/hooks/useImageAnalysis'
import { injectToolsIntoPrompt } from '@/lib/mcp'
import { isSmallTalk } from '@/lib/helpers'
import type { ImageAttachment } from '@/components/shared/ImageInput'

interface UseChatSendParams {
  taskId: string
  yoloMode: boolean
  attachedImages: ImageAttachment[]
  setAttachedImages: (images: ImageAttachment[]) => void
  setImageError: (error: string | null) => void
  setExecutionSteps: React.Dispatch<React.SetStateAction<{ type: string; content: string; timestamp: number }[]>>
}

export function useChatSend({
  taskId,
  yoloMode,
  attachedImages,
  setAttachedImages,
  setImageError,
  setExecutionSteps,
}: UseChatSendParams) {
  const [isStreaming, setIsStreaming] = useState(false)

  const { sendSimpleMessage, stopMessage, getMessages, streamingMessageId } = useAIChatStore()
  const { activeEngine } = useEngineStore()
  const { activeWorkspace } = useWorkspaceStore()

  const { isAnalyzing: isAnalyzingImages, analyzeImages, hasApiKey } = useImageAnalysis()

  const currentStreamingId = streamingMessageId[taskId]

  const handleSend = useCallback(async (message: string) => {
    if ((!message.trim() && attachedImages.length === 0) || !activeEngine) {
      return
    }
    
    const userMsg = message
    const imagesToSend = [...attachedImages]
    
    if (imagesToSend.length > 0 && !hasApiKey) {
      setImageError('Gemini API key belum dikonfigurasi. Buka Settings → Image Analysis untuk menambahkan API key.')
      return
    }
    
    setAttachedImages([])
    setExecutionSteps([{
      type: 'step_start',
      content: 'Initializing and thinking...',
      timestamp: Date.now()
    }])
    setIsStreaming(true)
    
    try {
      let imageAnalysis: string | null = null
      if (imagesToSend.length > 0) {
        setExecutionSteps(prev => [...prev, {
          type: 'tool_use',
          content: `Analyzing ${imagesToSend.length} image${imagesToSend.length > 1 ? 's' : ''}...`,
          timestamp: Date.now()
        }])
        
        const result = await analyzeImages(imagesToSend)
        
        if (!result.analysis) {
          const errorMsg = result.error || 'Failed to analyze image'
          setExecutionSteps(prev => [...prev, {
            type: 'error',
            content: errorMsg,
            timestamp: Date.now()
          }])
          setIsStreaming(false)
          return
        }
        imageAnalysis = result.analysis
      }
      
      const finalMessage = buildMessageWithImageAnalysis(userMsg, imageAnalysis)
      
      const historyMsg = getMessages(taskId)
        .filter(m => m.role !== 'system')
        .slice(-6)
        .map(m => {
          let content = m.content
          const analysisMatch = content.match(/\[IMAGE ANALYSIS\][\s\S]*?\[USER REQUEST\]/)
          if (analysisMatch) {
            content = content.replace(analysisMatch[0], '[Image attached]\n')
          }
          const displayContent = content.substring(0, 500) + (content.length > 500 ? '...[truncated]' : '')
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${displayContent}`
        })
        .join('\n\n')
      
      const isSmallTalkLocal = isSmallTalk(userMsg, attachedImages.length > 0)

      const projectRules = !isSmallTalkLocal 
        ? useConfigStore.getState().getSystemPrompt()
        : ''
      
      let internalPrompt: string
      
      if (isSmallTalkLocal) {
        internalPrompt = `You are a friendly, context-aware coding assistant inside the Akira IDE.
Respond concisely in the same language as the user. Keep answers under 3 sentences unless more detail is warranted.
${historyMsg ? '\nConversation so far:\n' + historyMsg + '\n' : ''}
User: ${finalMessage}`
      } else if (yoloMode) {
        internalPrompt = `${projectRules ? projectRules + '\n\n---\n\n' : ''}You are an expert AI coding agent inside the Akira IDE. You have full permission to read, create, edit, and delete files.

WORKFLOW:
1. Read the relevant files first to understand current state.
2. Plan your changes briefly (1-2 sentences).
3. Execute all changes directly — do NOT ask for permission.
4. Verify the result by reading the modified files.
5. Summarize what you did.

CONSTRAINTS:
- Be concise. No unnecessary commentary.
- Prefix heavy terminal commands with 'rtk' (git, lint, test, build, search).
- If a task is ambiguous, make a reasonable decision and state your assumption.
- Preserve existing comments and code style.

${historyMsg ? 'Recent conversation:\n' + historyMsg + '\n\n' : ''}User request: ${finalMessage}`
      } else {
        internalPrompt = `You are an expert System Architect & Planner inside the Akira IDE.

YOUR ROLE: Explore the codebase and help the user plan implementation. DO NOT modify any files.

WORKFLOW:
1. Use tools to read relevant files and understand the current architecture.
2. Identify what needs to change and where.
3. Provide a clear, structured plan the user can turn into Kanban tasks.

FOR EACH PLANNED CHANGE, include:
- **Files**: Exact paths to create or modify
- **Approach**: What pattern/component to follow from the existing codebase
- **Steps**: Concrete implementation steps (not vague instructions)

${projectRules ? '\nProject rules & context:\n' + projectRules + '\n' : ''}
${historyMsg ? 'Recent conversation:\n' + historyMsg + '\n' : ''}
User: ${finalMessage}`
      }

      // Inject Dynamic MCP tools for non-small talk queries
      let finalPrompt = internalPrompt
      if (!isSmallTalkLocal && activeWorkspace) {
        finalPrompt = injectToolsIntoPrompt(internalPrompt, {
          maxTools: 20,
          format: 'compact',
          workspaceId: activeWorkspace.id,
        })
      } else if (activeWorkspace) {
        finalPrompt = `[CONTEXT] Project: ${activeWorkspace.name}${internalPrompt}`
      }

      await sendSimpleMessage(taskId, userMsg, finalPrompt)
    } catch (err) {
      console.error('[handleSend] Error:', err)
    } finally {
      setIsStreaming(false)
    }
  }, [taskId, yoloMode, attachedImages, activeEngine, activeWorkspace, hasApiKey, getMessages, sendSimpleMessage, analyzeImages, setAttachedImages, setImageError, setExecutionSteps])

  const handleSendAndStart = useCallback(async (message: string) => {
    await handleSend(message)
    localStorage.setItem('akira-auto-start-next-task', 'true')
  }, [handleSend])

  const handleStop = useCallback(async () => {
    await stopMessage(taskId)
    setIsStreaming(false)
  }, [taskId, stopMessage])

  return {
    isStreaming,
    setIsStreaming,
    isAnalyzingImages,
    currentStreamingId,
    handleSend,
    handleSendAndStart,
    handleStop,
  }
}
