/**
 * Skills Scanner
 * 
 * Parse installed skills from workspace config and convert to MCP tools
 */

import type { InternalTool } from '../types'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useSkillStore } from '@/store/skillStore'
import { loadSkillContent } from '@/lib/skills'

interface SkillContent {
  name: string
  description: string
  content: string
  location: string
  tools?: SkillTool[]
}

interface SkillTool {
  name: string
  description: string
  parameters: Record<string, any>
}

export async function scanSkills(workspaceId: string): Promise<InternalTool[]> {
  const tools: InternalTool[] = []
  
  try {
    // Get workspace
    const workspaceStore = useWorkspaceStore.getState()
    const workspace = workspaceStore.workspaces.find(w => w.id === workspaceId)
    
    if (!workspace) {
      console.log('[SkillsScanner] Workspace not found:', workspaceId)
      return tools
    }

    // Get installed skills from skill store
    const skillStore = useSkillStore.getState()
    const installedSkills = skillStore.installedSkills || []
    
    if (installedSkills.length === 0) {
      console.log('[SkillsScanner] No skills installed')
      return tools
    }

    console.log(`[SkillsScanner] Found ${installedSkills.length} installed skills`)

    // Process each skill
    for (const skill of installedSkills) {
      try {
        const skillTools = await convertSkillToTools(skill.id, skill.name, skill.skill_path)
        tools.push(...skillTools)
        
        console.log(`[SkillsScanner] Converted skill "${skill.name}" to ${skillTools.length} tools`)
      } catch (error) {
        console.error(`[SkillsScanner] Error processing skill ${skill.name}:`, error)
      }
    }

    console.log(`[SkillsScanner] Total tool count: ${tools.length}`)
    return tools
  } catch (error) {
    console.error('[SkillsScanner] Scan failed:', error)
    return tools
  }
}

async function convertSkillToTools(
  _skillId: string,
  skillName: string,
  skillPath: string
): Promise<InternalTool[]> {
  const tools: InternalTool[] = []
  
  try {
    // Load skill content
    const rawContent = await loadSkillContent(skillPath)
    const skillContent: SkillContent = {
      name: rawContent.name,
      description: rawContent.description,
      content: rawContent.content,
      location: rawContent.location,
      tools: [], // Custom tools not supported yet
    }
    
    // Normalize skill ID for tool naming (remove special chars)
    const normalizedName = skillName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

    // Tool 1: Load skill context
    tools.push({
      name: `skill_${normalizedName}_load`,
      description: `Load ${skillName} skill context and instructions`,
      source: 'internal',
      category: 'skills',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return {
          success: true,
          data: {
            name: skillContent.name,
            description: skillContent.description,
            instructions: skillContent.content,
            location: skillContent.location,
          },
        }
      },
    })

    // Tool 2: Get patterns
    tools.push({
      name: `skill_${normalizedName}_get_patterns`,
      description: `Get code patterns from ${skillName} skill`,
      source: 'internal',
      category: 'skills',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const patterns = extractPatterns(skillContent)
        return {
          success: true,
          data: patterns,
        }
      },
    })

    // Tool 3: Get examples
    tools.push({
      name: `skill_${normalizedName}_get_examples`,
      description: `Get code examples from ${skillName} skill`,
      source: 'internal',
      category: 'skills',
      parameters: {
        type: 'object',
        properties: {
          pattern_name: {
            type: 'string',
            description: 'Optional pattern name to get specific examples',
          },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const patternName = args.pattern_name as string | undefined
        const examples = extractExamples(skillContent, patternName)
        return {
          success: true,
          data: examples,
        }
      },
    })

    // Tool 4+: Custom tools defined in skill
    if (skillContent.tools && skillContent.tools.length > 0) {
      for (const tool of skillContent.tools) {
        tools.push({
          name: `skill_${normalizedName}_${tool.name}`,
          description: tool.description,
          source: 'internal',
          category: 'skills',
          parameters: {
            type: 'object',
            properties: tool.parameters,
          },
          handler: async (args: Record<string, unknown>) => {
            // Execute skill-specific tool
            // Note: This would require skill tool execution framework
            return {
              success: true,
              data: {
                message: `Custom tool ${tool.name} executed`,
                args,
                note: 'Custom skill tools require implementation',
              },
            }
          },
        })
      }
    }

    return tools
  } catch (error) {
    console.error(`[SkillsScanner] Error converting skill ${skillName}:`, error)
    return tools
  }
}

function extractPatterns(skillContent: SkillContent): string[] {
  const patterns: string[] = []
  const content = skillContent.content
  
  // Extract patterns from skill markdown
  // Look for ## Pattern or ### Pattern headers
  const patternRegex = /(?:##|###)\s+(?:Pattern|Best Practice|Anti[- ]?Pattern)[:\s]+([^\n]+)/gi
  let match
  
  while ((match = patternRegex.exec(content)) !== null) {
    const patternName = match[1].trim()
    if (patternName) {
      patterns.push(patternName)
    }
  }
  
  // Also extract code blocks titles
  const codeBlockRegex = /```[^\n]*\n([^\n]*)/g
  let codeMatch
  while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
    const firstLine = codeMatch[1].trim()
    // Check if first line looks like a title/comment
    if (firstLine.startsWith('//') || firstLine.startsWith('#') || firstLine.startsWith('/*')) {
      const title = firstLine.replace(/^(\/\/|#|\s*\*?\s*)/, '').trim()
      if (title && title.length < 100) {
        patterns.push(title)
      }
    }
  }

  return [...new Set(patterns)] // Remove duplicates
}

function extractExamples(skillContent: SkillContent, patternName?: string): any[] {
  const examples: any[] = []
  const content = skillContent.content
  
  // If pattern name specified, find that section
  if (patternName) {
    const patternSectionRegex = new RegExp(
      `(?:##|###)\\s+${escapeRegExp(patternName)}[\\s\\S]*?(?=(?:##|###|$))`,
      'i'
    )
    const sectionMatch = patternSectionRegex.exec(content)
    
    if (sectionMatch) {
      const section = sectionMatch[0]
      extractCodeBlocks(section, examples, patternName)
    }
  } else {
    // Extract all code blocks
    extractCodeBlocks(content, examples)
  }
  
  return examples
}

function extractCodeBlocks(content: string, examples: any[], context?: string): void {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'unknown'
    const code = match[2].trim()
    
    if (code) {
      examples.push({
        language,
        code,
        context,
      })
    }
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}