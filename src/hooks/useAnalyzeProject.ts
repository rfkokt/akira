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
- Key source files (src/, app/, lib/, components/ etc.)
- Config files (tsconfig, vite.config, tailwind.config, etc.)

Produce a complete project context document in this EXACT markdown format:

# Project Overview

## What This Project Does
[2-4 sentences describing what this project is, what problem it solves, and who uses it. Be specific — name actual features, not generic descriptions.]

## Tech Stack
- **Runtime/Language**: [e.g. TypeScript, Rust, Python]
- **Framework**: [e.g. React + Vite, Next.js, Tauri, Django]
- **UI Library**: [e.g. Tailwind CSS + shadcn/ui, Material UI, none]
- **Database**: [e.g. SQLite via sqlx, PostgreSQL, none]
- **Key Dependencies**: [list 3-5 most important libs and what they do]
- **Build/Deploy**: [e.g. npm + Tauri bundler, Docker, Vercel]

## Architecture
[3-5 sentences describing the high-level architecture: how modules are structured, how data flows, key patterns used (e.g. Zustand stores, Rust commands bridged via IPC, REST API layers, etc.)]

## Key Directories
- \`src/components/\` — [what lives here]
- \`src/store/\` — [what lives here]
- [list other important dirs]

# Code Rules

## DO
- [Project-specific best practice derived from what you found — mention actual file names, patterns, or libs when relevant]
- [Another specific rule]
(8-12 rules, grounded in the ACTUAL codebase)

## DON'T
- [Specific anti-pattern that would break this project]
- [Another anti-pattern specific to this stack]
(8-12 rules)

IMPORTANT: Every bullet must be specific to THIS project. No generic advice like "write clean code" or "use meaningful variable names".
If this is a web project (Next.js, React, Vue, etc.), you MUST include mobile-responsive design rules in the DO section — e.g., use of responsive breakpoints, mobile-first CSS, touch-friendly interactions, avoiding fixed pixel widths, etc.`

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