/**
 * Skill Adapter
 * 
 * Converts installed skills into Internal MCP tools.
 * This allows AI to invoke skills dynamically via the tool registry.
 */

import type { InternalTool } from '../types';
import { loadSkillContent } from '@/lib/skills';
import type { Skill } from '@/store/skillStore';

// ============================================================================
// Types
// ============================================================================

export interface SkillToolContext {
  skillId: string;
  skillPath: string;
  skillName: string;
}

// ============================================================================
// Skill Content Parser
// ============================================================================

interface ParsedSkillContent {
  patterns: Array<{ name: string; description: string; code?: string }>;
  examples: Array<{ title: string; code: string; description?: string }>;
  checklists: Array<{ title: string; items: string[] }>;
  rules: Array<{ title: string; description: string }>;
}

function parseSkillMarkdown(content: string): ParsedSkillContent {
  const patterns: ParsedSkillContent['patterns'] = [];
  const examples: ParsedSkillContent['examples'] = [];
  const checklists: ParsedSkillContent['checklists'] = [];
  const rules: ParsedSkillContent['rules'] = [];
  
  const lines = content.split('\n');
  let currentSection = '';
  let currentItem: Record<string, unknown> = {};
  let inCodeBlock = false;
  let codeBlockContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockContent = '';
      } else {
        inCodeBlock = false;
        if (currentItem.code !== undefined) {
          (currentItem as { code: string }).code = codeBlockContent;
        }
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockContent += line + '\n';
      continue;
    }
    
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase();
      continue;
    }
    
    if (trimmed.startsWith('### ')) {
      const title = trimmed.replace('### ', '');
      if (currentSection.includes('pattern')) {
        currentItem = { name: title, description: '' };
        patterns.push(currentItem as { name: string; description: string; code?: string });
      } else if (currentSection.includes('example')) {
        currentItem = { title, code: '' };
        examples.push(currentItem as { title: string; code: string; description?: string });
      } else if (currentSection.includes('checklist')) {
        currentItem = { title, items: [] };
        checklists.push(currentItem as { title: string; items: string[] });
      } else if (currentSection.includes('rule') || currentSection.includes('best practice')) {
        currentItem = { title, description: '' };
        rules.push(currentItem as { title: string; description: string });
      }
      continue;
    }
    
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = trimmed.replace(/^[-*]\s+/, '');
      if (currentSection.includes('checklist') && 'items' in currentItem) {
        (currentItem as { items: string[] }).items.push(text);
      } else if ('description' in currentItem && typeof (currentItem as { description?: string }).description === 'string') {
        (currentItem as { description: string }).description += (currentItem as { description: string }).description ? ' ' + text : text;
      }
    }
  }
  
  return { patterns, examples, checklists, rules };
}

// ============================================================================
// Skill Tool Factory
// ============================================================================

export function createSkillTools(skill: Skill): InternalTool[] {
  const tools: InternalTool[] = [];
  
  tools.push({
    name: `skill_${skill.name}_load`,
    description: `Load the full content of skill "${skill.name}" for detailed instructions`,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'skill',
    handler: async () => {
      try {
        const content = await loadSkillContent(skill.skill_path);
        return {
          name: content.name,
          description: content.description,
          location: content.location,
          content: content.content,
        };
      } catch (err) {
        throw new Error(`Failed to load skill: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
  });
  
  tools.push({
    name: `skill_${skill.name}_get_patterns`,
    description: `Get code patterns and best practices from skill "${skill.name}"`,
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category tofilter patterns',
        },
      },
      required: [],
    },
    category: 'skill',
    handler: async (args) => {
      try {
        const content = await loadSkillContent(skill.skill_path);
        const parsed = parseSkillMarkdown(content.content);
        
        let filteredPatterns = parsed.patterns;
        if (args.category && typeof args.category === 'string') {
          const categoryLower = args.category.toLowerCase();
          filteredPatterns = parsed.patterns.filter(
            p => p.name.toLowerCase().includes(categoryLower) ||
                 p.description.toLowerCase().includes(categoryLower)
          );
        }
        
        return {
          patterns: filteredPatterns.slice(0, 5),
        };
      } catch (err) {
        throw new Error(`Failed to get patterns: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
  });
  
  tools.push({
    name: `skill_${skill.name}_get_examples`,
    description: `Get code examples from skill "${skill.name}"`,
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Optional keyword to filter examples',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of examples to return',
        },
      },
      required: [],
    },
    category: 'skill',
    handler: async (args) => {
      try {
        const content = await loadSkillContent(skill.skill_path);
        const parsed = parseSkillMarkdown(content.content);
        
        let filteredExamples = parsed.examples;
        if (args.keyword && typeof args.keyword === 'string') {
          const keywordLower = args.keyword.toLowerCase();
          filteredExamples = parsed.examples.filter(
            e => e.title.toLowerCase().includes(keywordLower) ||
                 e.code.toLowerCase().includes(keywordLower)
          );
        }
        
        const limit = typeof args.limit === 'number' ? args.limit : 3;
        
        return {
          examples: filteredExamples.slice(0, limit),
        };
      } catch (err) {
        throw new Error(`Failed to get examples: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
  });
  
  tools.push({
    name: `skill_${skill.name}_validate`,
    description: `Validate code against best practices from skill "${skill.name}"`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to validate',
        },
        context: {
          type: 'string',
          description: 'Additional context about the code',
        },
      },
      required: ['code'],
    },
    category: 'skill',
    handler: async (args) => {
      try {
        const content = await loadSkillContent(skill.skill_path);
        const parsed = parseSkillMarkdown(content.content);
        
        const suggestions: string[] = [];
        const code = typeof args.code === 'string' ? args.code : '';
        const context = typeof args.context === 'string' ? args.context : '';
        
        for (const rule of parsed.rules.slice(0, 5)) {
          suggestions.push(`${rule.title}: ${rule.description}`);
        }
        
        for (const pattern of parsed.patterns.slice(0, 3)) {
          suggestions.push(`Consider pattern: ${pattern.name}`);
        }
        
        return {
          rules: parsed.rules.slice(0, 5),
          suggestions,
          codeLength: code.length,
          hasContext: !!context,
        };
      } catch (err) {
        throw new Error(`Failed to validate: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
  });
  
  return tools;
}

// ============================================================================
// Skill Registry Methods
// ============================================================================

export function registerSkillTools(
  skills: Skill[],
  register: (tool: InternalTool) => void
): void {
  for (const skill of skills) {
    const tools = createSkillTools(skill);
    for (const tool of tools) {
      register(tool);
    }
  }
}

export function unregisterSkillTools(
  skills: Skill[],
  unregister: (name: string) => void
): void {
  for (const skill of skills) {
    unregister(`skill_${skill.name}_load`);
    unregister(`skill_${skill.name}_get_patterns`);
    unregister(`skill_${skill.name}_get_examples`);
    unregister(`skill_${skill.name}_validate`);
  }
}