import { useCallback } from 'react'
import { useEngineStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import { useAIChatStore } from '@/store'
import { invoke } from '@tauri-apps/api/core'

// ---------------------------------------------------------------------------
// Deep-Scan Analysis Prompt
// ---------------------------------------------------------------------------
const ANALYSIS_PROMPT = `[ROLE: Senior Software Architect - Project Analyzer]

Analyze project at: {{CWD}}
READ-ONLY: Do not modify any files.

[FILES TO READ]
1. Config: package.json, tsconfig.json, *.config.*
2. README.md (if exists)
3. Root structure (1 level)
4. Source tree: src/ or app/ (2 levels deep)
5. Sample files: 2-3 components, 1 store, 1 service

[OUTPUT - JSON ONLY]
\`\`\`json
{
  "project_overview": "1-2 sentences about what this project does",
  "tech_stack": {
    "runtime": "e.g., Node.js 20 + TypeScript",
    "framework": "e.g., Next.js 14 / React 18",
    "ui": "e.g., Tailwind + Radix",
    "state": "e.g., Zustand / Redux",
    "api": "e.g., REST / tRPC",
    "database": "e.g., PostgreSQL / Mongo",
    "auth": "e.g., JWT / OAuth",
    "testing": "e.g., Vitest / Jest",
    "build": "e.g., Vite / Webpack"
  },
  "architecture": {
    "pattern": "e.g., Feature-based / MVC",
    "key_directories": ["src/components — UI components", "src/store — state"],
    "data_flow": "e.g., Store → API → UI"
  },
  "component_patterns": {
    "reusability": "How components are shared",
    "naming": "File naming convention",
    "state_management": "State approach",
    "forms": "Form handling pattern",
    "styling": "Styling method"
  },
  "code_standards": {
    "do": ["Specific pattern 1", "Specific pattern 2"],
    "dont": ["Anti-pattern 1", "Anti-pattern 2"]
  },
  "security": {
    "auth_pattern": "Auth implementation",
    "role_check": "Authorization method",
    "data_sanitization": "Input validation"
  }
}
\`\`\`

[RULES]
- ONLY output JSON block, nothing else
- Be specific to THIS project (no generic advice)
- Use "N/A" if field doesn't apply
- Keep each value to 1-2 sentences max
- DO/DON'T must be from actual code observed`

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
  tokens?: string
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

    const { sendSimpleMessage, clearMessages } = useAIChatStore.getState()

    const tempTaskId = '__analyze_project__'

    try {
      // Clear any old messages from previous runs so they don't pollute the UX
      clearMessages(tempTaskId)
      
      onStatus?.('🔍 Scanning package files...')
      let pkgInfo = '';
      try {
        pkgInfo = await invoke<string>('read_file', { path: `${cwd}/package.json` });
      } catch {
        pkgInfo = 'No package.json found.';
      }

      onStatus?.('📂 Mapping directory structure...');
      let structure = '';
      try {
        const res = await invoke<{stdout: string, success: boolean}>('run_shell_command', { 
          command: 'find', 
          args: ['.', '-maxdepth', '2', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'],
          cwd 
        });
        structure = res.stdout;
      } catch {
        structure = 'Could not map directory.';
      }

      onStatus?.('🧠 AI analyzing patterns...');
      
      const enrichedPrompt = `${ANALYSIS_PROMPT.replace('{{CWD}}', cwd)}

---
[SYSTEM CONTEXT INJECTED]
Here is the actual project data you must use for your analysis. DO NOT GUESS.
# package.json
${pkgInfo.substring(0, 3000)}

# directory structure
${structure.substring(0, 2000)}
`;

      const aiResponse = await sendSimpleMessage(tempTaskId, enrichedPrompt);
      
      onStatus?.('🧠 Parsing analysis results...')
      // We do not clear messages here immediately so the token info logic stays valid,
      // it will be cleared at the start of the next run anyway.

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

      // Extract token usage if available
      let tokensUsed = undefined;
      const tokenMatch = aiResponse.match(/\[([\d,]+ tokens \| [^\]]+)\]/);
      if (tokenMatch) {
        tokensUsed = tokenMatch[1];
      }

      onStatus?.(tokensUsed ? `✅ Standards generated (${tokensUsed})` : '✅ Workspace standards generated!')
      return { success: true, tokens: tokensUsed }
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