import { useCallback } from 'react'
import { useEngineStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { useAIChatStore } from '@/store'

// ---------------------------------------------------------------------------
// Deep-Scan Analysis Prompt
// ---------------------------------------------------------------------------
const ANALYSIS_PROMPT = `[System: You are a senior software architect performing a deep project analysis. DO NOT modify any files. DO NOT use any tools that write to disk. ONLY read and analyze.]

Analyze the project at: {{CWD}}

## Files to Read (in order of priority)
1. **Config files**: package.json, tsconfig.json, vite.config.*, next.config.*, tailwind.config.*, Cargo.toml, pyproject.toml
2. **README.md** if present
3. **Top-level folder structure** (ls the root)
4. **Source structure**: Read the directory tree of src/ or app/ (2 levels deep)
5. **Sample components**: Read 2-3 actual component files to understand patterns (pick from components/, _components/, or similar)
6. **State management**: Read 1-2 store files if present (store/, hooks/, or similar)
7. **Service/API layer**: Read 1 file from services/, lib/, or api/ if present
8. **Validation/Schema**: Read 1 file from validations/, schemas/, or types/ if present

## Output Format
You MUST output ONLY a fenced JSON code block. No text before or after. No explanation. No markdown outside the fence.

\`\`\`json
{
  "project_overview": "1-2 sentence summary of what this project does",
  "tech_stack": {
    "runtime": "e.g. Node.js 20 / TypeScript 5.x",
    "framework": "e.g. Next.js 14 App Router",
    "ui": "e.g. Radix UI + Tailwind CSS",
    "state": "e.g. Zustand per-feature stores",
    "api": "e.g. Axios with interceptors",
    "database": "e.g. PostgreSQL via Prisma",
    "auth": "e.g. Cookie-based JWT",
    "testing": "e.g. Vitest + Testing Library",
    "build": "e.g. Vite / Turbopack"
  },
  "architecture": {
    "pattern": "e.g. Feature-based with route groups",
    "key_directories": ["dir1 — purpose", "dir2 — purpose"],
    "data_flow": "e.g. Zustand stores → service layer → Axios"
  },
  "component_patterns": {
    "reusability": "How components are organized for reuse",
    "naming": "File and component naming conventions",
    "state_management": "How state is scoped and managed",
    "forms": "How forms and validation are handled",
    "styling": "CSS approach and conventions"
  },
  "code_standards": {
    "do": [
      "Specific project rule 1 (max 7 rules)"
    ],
    "dont": [
      "Specific anti-pattern 1 (max 7 rules)"
    ]
  },
  "security": {
    "auth_pattern": "How authentication works",
    "role_check": "How authorization is enforced",
    "data_sanitization": "How inputs are validated"
  }
}
\`\`\`

CRITICAL RULES:
- Every value MUST be specific to THIS project. No generic advice.
- Read actual source files to discover real patterns. Do not guess.
- If a field is not applicable, use "N/A".
- Keep values concise — each string should be 1-2 sentences max.
- DO and DON'T rules must come from actual code patterns you observed.
- Output ONLY the JSON block. Nothing else.`

// ---------------------------------------------------------------------------
// JSON Extraction
// ---------------------------------------------------------------------------
function extractJsonFromResponse(raw: string): Record<string, unknown> | null {
  // Strategy 1: Extract from fenced code block
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch {
      console.warn('[AnalyzeProject] Failed to parse fenced JSON, trying fallback')
    }
  }

  // Strategy 2: Find the outermost { ... } in the response
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    } catch {
      console.warn('[AnalyzeProject] Fallback brace extraction also failed')
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Compile JSON → Compact Markdown (for system prompt)
// ---------------------------------------------------------------------------
function compileToMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = []

  lines.push('# Workspace Standards')
  lines.push('')

  // Overview
  if (data.project_overview) {
    lines.push(`## Overview`)
    lines.push(String(data.project_overview))
    lines.push('')
  }

  // Tech Stack
  const tech = data.tech_stack as Record<string, string> | undefined
  if (tech) {
    lines.push('## Tech Stack')
    for (const [key, value] of Object.entries(tech)) {
      if (value && value !== 'N/A') {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        lines.push(`- **${label}**: ${value}`)
      }
    }
    lines.push('')
  }

  // Architecture
  const arch = data.architecture as Record<string, unknown> | undefined
  if (arch) {
    lines.push('## Architecture')
    if (arch.pattern) lines.push(`- **Pattern**: ${arch.pattern}`)
    if (arch.data_flow) lines.push(`- **Data Flow**: ${arch.data_flow}`)
    if (Array.isArray(arch.key_directories) && arch.key_directories.length > 0) {
      lines.push('- **Key Directories**:')
      for (const dir of arch.key_directories) {
        lines.push(`  - ${dir}`)
      }
    }
    lines.push('')
  }

  // Component Patterns
  const comp = data.component_patterns as Record<string, string> | undefined
  if (comp) {
    lines.push('## Component Patterns')
    for (const [key, value] of Object.entries(comp)) {
      if (value && value !== 'N/A') {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        lines.push(`- **${label}**: ${value}`)
      }
    }
    lines.push('')
  }

  // Code Standards
  const standards = data.code_standards as { do?: string[]; dont?: string[] } | undefined
  if (standards) {
    lines.push('## Code Rules')
    if (standards.do && standards.do.length > 0) {
      lines.push('')
      lines.push('### DO')
      for (const rule of standards.do) {
        lines.push(`- ${rule}`)
      }
    }
    if (standards.dont && standards.dont.length > 0) {
      lines.push('')
      lines.push("### DON'T")
      for (const rule of standards.dont) {
        lines.push(`- ${rule}`)
      }
    }
    lines.push('')
  }

  // Security
  const sec = data.security as Record<string, string> | undefined
  if (sec) {
    const secEntries = Object.entries(sec).filter(([, v]) => v && v !== 'N/A')
    if (secEntries.length > 0) {
      lines.push('## Security')
      for (const [key, value] of secEntries) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        lines.push(`- **${label}**: ${value}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// Legacy cleaner (fallback if JSON extraction fails)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
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
      onStatus?.('🔍 Scanning project structure...')
      await sendSimpleMessage(tempTaskId, prompt)
      
      // Give the AI time to finish processing
      await new Promise(r => setTimeout(r, 2000))

      onStatus?.('🧠 Parsing analysis results...')
      const msgs = getMessages(tempTaskId)
      const aiResponse = msgs.filter(m => m.role === 'assistant').pop()?.content || ''
      clearMessages(tempTaskId)

      if (!aiResponse.trim()) {
        return { success: false, error: 'Analysis returned empty. Try again.' }
      }

      // Try structured JSON extraction first
      onStatus?.('📋 Compiling workspace standards...')
      const parsed = extractJsonFromResponse(aiResponse)

      let finalDocument: string

      if (parsed && parsed.project_overview) {
        // Success: Compile JSON → compact markdown
        finalDocument = compileToMarkdown(parsed)
        console.log('[AnalyzeProject] ✅ Parsed structured JSON successfully')
        console.log('[AnalyzeProject] Compiled markdown length:', finalDocument.length)
      } else {
        // Fallback: Use legacy cleaner on raw markdown
        console.warn('[AnalyzeProject] ⚠ JSON extraction failed, falling back to raw markdown')
        finalDocument = cleanResponse(aiResponse)
      }

      if (!finalDocument) {
        return { success: false, error: 'Analysis returned no usable content. Try again.' }
      }

      // Save to md_rules
      updateField('md_rules', finalDocument)
      if (config) {
        await saveConfig({ ...config, md_rules: finalDocument })
      }

      onStatus?.('✅ Workspace standards generated!')
      return { success: true }
    } catch (err) {
      console.error('[AnalyzeProject] Failed:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [config, updateField, saveConfig])

  return {
    analyzeProject,
    activeEngine,
  }
}