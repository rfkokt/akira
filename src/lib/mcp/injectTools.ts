/**
 * Inject Tools into AI Prompt
 * 
 * Dynamically inject available workspace tools into AI prompts
 */

import type { InternalTool } from './types'
import { useToolRegistry } from './registry'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { parseToolName } from './index'

export interface ToolPromptOptions {
  maxTools?: number
  categories?: string[]
  workspaceId?: string
  includeDescriptions?: boolean
  format?: 'compact' | 'detailed' | 'json'
  readOnly?: boolean
}

/**
 * Get available tools for AI prompt
 */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'Mkdir', 'Rm', 'Rmdir', 'Bash', 'Shell', 'Exec'])

export function getAvailableToolsForPrompt(options: ToolPromptOptions = {}): InternalTool[] {
  const {
    maxTools = 50,
    categories,
    workspaceId,
    readOnly = false,
  } = options

  const registry = useToolRegistry.getState()
  const workspace = useWorkspaceStore.getState().activeWorkspace
  
  // Get workspace tools
  const wsId = workspaceId || workspace?.id
  const workspaceTools = wsId ? registry.getWorkspaceTools(wsId) : []
  
  // Get default tools
  const defaultTools = registry.getAllInternalTools()
  
  // Combine and deduplicate
  let allTools = [...defaultTools, ...workspaceTools]

  // Filter write tools for read-only mode (planning mode)
  if (readOnly) {
    allTools = allTools.filter(t => {
      const isWriteTool = WRITE_TOOLS.has(t.name) || (t.category ? WRITE_TOOLS.has(t.category) : false)
      return !isWriteTool
    })
  }
  
  // Filter by category if specified
  const filtered = categories
    ? allTools.filter(t => categories.includes(t.category || 'default'))
    : allTools
  
  // Limit tools
  return filtered.slice(0, maxTools)
}

/**
 * Build tool prompt for AI
 */
export function buildToolPrompt(tools: InternalTool[], format: 'compact' | 'detailed' | 'json' = 'compact'): string {
  if (tools.length === 0) {
    return ''
  }

  if (format === 'json') {
    return buildJsonToolPrompt(tools)
  }

  if (format === 'detailed') {
    return buildDetailedToolPrompt(tools)
  }

  return buildCompactToolPrompt(tools)
}

/**
 * Compact format - minimal tokens
 */
function buildCompactToolPrompt(tools: InternalTool[]): string {
  const grouped = groupByCategory(tools)
  
  const lines: string[] = ['[AVAILABLE TOOLS]']
  
  for (const [category, categoryTools] of Object.entries(grouped)) {
    const isExternal = category.toLowerCase() === 'external'
    const categoryName = isExternal 
      ? 'EXTERNAL (live MCP connections)'
      : category.toUpperCase()
    
    lines.push(`\n${categoryName}:`)
    
    if (isExternal) {
      lines.push('  Hint: External tools connect to remote/local services. Use them when the user asks about libraries, docs, search, etc.')
    }
    
    for (const tool of categoryTools) {

      
      let params = ''
      if (tool.parameters && tool.parameters.properties) {
        const props = tool.parameters.properties as Record<string, unknown>
        const required = (tool.parameters.required as string[]) || []
        const args = Object.keys(props).map(key => `${key}${required.includes(key) ? '' : '?'}`)
        if (args.length > 0) {
          params = `({ ${args.join(', ')} })`
        }
      }
      
      lines.push(`  ${tool.name}${params} - ${tool.description.split('.')[0]}`)
    }
  }
  
  lines.push('\nTo use a tool, include exactly: [Tool: tool_name {"arg": "value"}]')
  lines.push('[/AVAILABLE TOOLS]')
  
  return lines.join('\n')
}

/**
 * Detailed format - with parameters
 */
function buildDetailedToolPrompt(tools: InternalTool[]): string {
  const grouped = groupByCategory(tools)
  
  const lines: string[] = ['[AVAILABLE TOOLS]']
  
  for (const [category, categoryTools] of Object.entries(grouped)) {
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1)
    lines.push(`\n## ${categoryName} Tools`)
    
    for (const tool of categoryTools) {
      const parsed = parseToolName(tool.name)
      lines.push(`\n### ${parsed.name}`)
      lines.push(`${tool.description}`)
      
      if (tool.parameters && tool.parameters.properties) {
        const props = tool.parameters.properties
        const required = tool.parameters.required || []
        
        if (Object.keys(props).length > 0) {
          lines.push('\nParameters:')
          for (const [paramName, paramSchema] of Object.entries(props)) {
            const schema = paramSchema as { type?: string }
            const isRequired = (required as string[]).includes(paramName)
            const requiredMarker = isRequired ? '(required)' : '(optional)'
            lines.push(`  - ${paramName} ${requiredMarker}: ${schema.type || 'any'}`)
          }
        }
      }
    }
  }
  
  lines.push('\n## How to Use')
  lines.push('To call a tool, include this pattern in your response:')
  lines.push('[Tool: tool_name]')
  lines.push('Or with parameters:')
  lines.push('[Tool: tool_name(arg1="value1", arg2="value2")]')
  lines.push('[/AVAILABLE TOOLS]')
  
  return lines.join('\n')
}

/**
 * JSON format - structured data
 */
function buildJsonToolPrompt(tools: InternalTool[]): string {
  const toolDefs = tools.map(tool => {
    const parsed = parseToolName(tool.name)
    return {
      name: parsed.name,
      category: tool.category,
      description: tool.description,
      parameters: tool.parameters,
    }
  })
  
  return `[AVAILABLE TOOLS]
${JSON.stringify(toolDefs, null, 2)}

To call a tool, include: [Tool: tool_name]
[/AVAILABLE TOOLS]`
}

/**
 * Group tools by category
 */
function groupByCategory(tools: InternalTool[]): Record<string, InternalTool[]> {
  return tools.reduce((acc, tool) => {
    const category = tool.category || 'default'
    if (!acc[category]) acc[category] = []
    acc[category].push(tool)
    return acc
  }, {} as Record<string, InternalTool[]>)
}

/**
 * Inject tools into existing prompt
 */
export function injectToolsIntoPrompt(
  prompt: string,
  options: ToolPromptOptions = {}
): string {
  const tools = getAvailableToolsForPrompt(options)
  
  if (tools.length === 0) {
    return prompt
  }

  const toolPrompt = buildToolPrompt(tools, options.format || 'compact')
  
  // Insert after system prompt or at beginning
  const lines = prompt.split('\n')
  const insertIndex = lines.findIndex(line => 
    line.includes('INSTRUCTIONS') || 
    line.includes('SYSTEM PROMPT') ||
    line.includes('---')
  )
  
  if (insertIndex >= 0) {
    // Insert after the separator
    const before = lines.slice(0, insertIndex + 1).join('\n')
    const after = lines.slice(insertIndex + 1).join('\n')
    return `${before}\n\n${toolPrompt}\n\n${after}`
  }
  
  // Prepend to prompt
  return `${toolPrompt}\n\n${prompt}`
}

/**
 * Build context-specific tool prompt
 * Only include tools relevant to the current context
 */
export function buildContextualToolPrompt(
  context: string,
  options: ToolPromptOptions = {}
): string {
  const allTools = getAvailableToolsForPrompt(options)
  
  // Filter tools based on context keywords
  const relevantTools = filterToolsByContext(allTools, context)
  
  return buildToolPrompt(relevantTools, options.format || 'compact')
}

/**
 * Filter tools by context keywords
 */
function filterToolsByContext(tools: InternalTool[], context: string): InternalTool[] {
  const keywords = extractKeywords(context.toLowerCase())
  
  // Score each tool by relevance
  const scored = tools.map(tool => {
    let score = 0
    const toolLower = tool.name.toLowerCase()
    const descLower = tool.description.toLowerCase()
    
    for (const keyword of keywords) {
      if (toolLower.includes(keyword)) score += 10
      if (descLower.includes(keyword)) score += 5
    }
    
    return { tool, score }
  })
  
  // Sort by score and return top tools
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => s.tool)
}

/**
 * Extract keywords from context
 */
function extractKeywords(context: string): string[] {
  // Common keywords
  const keywords: string[] = []
  
  // Task-related
  if (context.includes('task')) keywords.push('task', 'todo')
  if (context.includes('project')) keywords.push('project', 'workspace')
  if (context.includes('file')) keywords.push('file', 'read', 'write')
  if (context.includes('skill')) keywords.push('skill', 'load')
  
  // Tech-specific
  if (context.includes('react') || context.includes('component')) keywords.push('react', 'component')
  if (context.includes('next') || context.includes('page')) keywords.push('next', 'route')
  if (context.includes('tauri') || context.includes('desktop')) keywords.push('tauri', 'desktop')
  
  // Utility
  if (context.includes('format') || context.includes('date')) keywords.push('format', 'date')
  if (context.includes('valid') || context.includes('check')) keywords.push('valid', 'check')
  
  // Standards
  if (context.includes('cod') || context.includes('standard')) keywords.push('cod', 'standard', 'lint')
  
  return keywords
}

/**
 * Get tool suggestions for a task
 */
export function getToolSuggestionsForTask(
  taskTitle: string,
  taskDescription?: string,
  maxSuggestions: number = 10
): InternalTool[] {
  const context = `${taskTitle} ${taskDescription || ''}`
  const allTools = getAvailableToolsForPrompt({ maxTools: 100 })
  const relevant = filterToolsByContext(allTools, context)
  
  return relevant.slice(0, maxSuggestions)
}

/**
 * Format tool suggestions for display
 */
export function formatToolSuggestions(tools: InternalTool[]): string {
  if (tools.length === 0) {
    return 'No relevant tools found.'
  }

  const lines: string[] = ['Suggested tools:']
  
  for (const tool of tools) {
    const parsed = parseToolName(tool.name)
    lines.push(`  • ${parsed.name} - ${tool.description.split('.')[0]}`)
  }
  
  return lines.join('\n')
}