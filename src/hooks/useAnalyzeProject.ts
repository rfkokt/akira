import { useCallback } from 'react'
import { useEngineStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { useAIChatStore } from '@/store'

const ANALYSIS_PROMPT = `[System: You are a senior software architect performing a project analysis. DO NOT modify any files. DO NOT use any tools that write to disk. ONLY read and analyze. Output ONLY the markdown document below — no preamble, no commentary.]

Analyze the project at: {{CWD}}

Read these files to understand the project deeply:
- package.json / Cargo.toml / pyproject.toml (dependencies & scripts)
- README.md if present
- Top-level folder structure
- Config files (tsconfig, vite.config, tailwind.config, etc.)

Produce a complete project context document in this EXACT markdown format. Be EXTREMELY concise (under 400 words total).

# Project Overview

## What This Project Does
[1-2 sentences]

## Tech Stack
- **Runtime/Language**: []
- **Framework**: []
- **UI Library**: []
- **Database**: []
- **Key Dependencies**: []
- **Build/Deploy**: []

## Architecture
[1-2 sentences on high-level architecture]

# Code Rules

## DO
- [Project-specific best practice]
(Max 5 specific rules)

## DON'T
- [Specific anti-pattern]
(Max 5 specific rules)

IMPORTANT: Every bullet must be specific to THIS project. No generic advice. Keep it short to save tokens.`

const cleanResponse = (raw: string): string => {
  const withoutToolLines = raw
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (/^\[(Tool|Action|Result|Thought|Step)\s*:/.test(t)) return false
      if (/^✅\s*(Completed|Done|Finished)\s+in\s+\d/i.test(t)) return false
      if (/^\$[\d.]+\s*$/.test(t)) return false
      if (/^(Cost|Tokens|Duration)\s*:/i.test(t)) return false
      return true
    })
    .join('\n')

  const firstHeadingIdx = withoutToolLines.search(/^#{1,3}\s/m)
  const trimmed = firstHeadingIdx !== -1
    ? withoutToolLines.slice(firstHeadingIdx)
    : withoutToolLines

  return trimmed.trim()
}

interface AnalyzeResult {
  success: boolean
  error?: string
}

export function useAnalyzeProject() {
  const { activeEngine } = useEngineStore()
  const { config, updateField, saveConfig } = useConfigStore()

  const analyzeProject = useCallback(async (
    cwd: string,
    onStatus?: (status: string) => void
  ): Promise<AnalyzeResult> => {
    const engine = useEngineStore.getState().activeEngine
    if (!engine) {
      return { success: false, error: 'No active engine selected.' }
    }

    const { sendSimpleMessage, getMessages, clearMessages } = useAIChatStore.getState()

    const prompt = ANALYSIS_PROMPT.replace('{{CWD}}', cwd)
    const tempTaskId = '__analyze_project__'

    try {
      onStatus?.('Scanning project structure...')
      await sendSimpleMessage(tempTaskId, prompt)
      await new Promise(r => setTimeout(r, 1500))

      onStatus?.('AI is analyzing project files...')
      const msgs = getMessages(tempTaskId)
      const aiResponse = msgs.filter(m => m.role === 'assistant').pop()?.content || ''
      clearMessages(tempTaskId)

      if (!aiResponse.trim()) {
        return { success: false, error: 'Analysis returned empty. Try again.' }
      }

      const fullDocument = cleanResponse(aiResponse)

      if (!fullDocument) {
        return { success: false, error: 'Analysis returned no usable content. Try again.' }
      }

      updateField('md_rules', fullDocument)
      if (config) {
        await saveConfig({ ...config, md_rules: fullDocument })
      }

      onStatus?.('✅ Project analyzed — full context saved!')
      return { success: true }
    } catch (err) {
      console.error('Failed to analyze project:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [config, updateField, saveConfig])

  return {
    analyzeProject,
    activeEngine,
  }
}