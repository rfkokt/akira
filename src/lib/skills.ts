/**
 * Skills Utility — Format and inject skills into AI prompts.
 * 
 * Skills are injected as listings (name + description) into the prompt,
 * with full content loaded on-demand when the skill is invoked.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Skill } from '@/store/skillStore';

export interface SkillContent {
  name: string;
  description: string;
  location: string;
  content: string;
}

export interface SkillInvocation {
  detected: boolean;
  skillName: string | null;
  skillContent: SkillContent | null;
}

const MAX_SKILL_LISTING_CHARS = 8000;

const SKILL_INVOCATION_PATTERNS = [
  /\[SKILL:\s*([\w-]+)\]/i,
  /\[USING SKILL:\s*([\w-]+)\]/i,
  /applying skill:\s*([\w-]+)/i,
  /using the\s*([\w-]+)\s*skill/i,
  /\*\*SKILL:\s*([\w-]+)\*\*/i,
];

export function formatSkillListing(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const lines: string[] = ['<available_skills>'];
  lines.push('When you recognize that a task matches one of the available skills listed below, use the skill tool to load the full skill instructions.');
  lines.push('');
  lines.push('Available agent skills:');
  
  for (const skill of skills) {
    const desc = skill.description?.substring(0, 250) || '';
    lines.push(`- ${skill.name}${desc ? `: ${desc}` : ''}`);
  }
  
  lines.push('</available_skills>');
  
  const result = lines.join('\n');
  
  if (result.length > MAX_SKILL_LISTING_CHARS) {
    const truncatedLines = ['<available_skills>'];
    truncatedLines.push('When you recognize that a task matches one of the available skills listed below, use the skill tool to load the full skill instructions.');
    truncatedLines.push('');
    truncatedLines.push('Available agent skills:');
    
    let currentLength = truncatedLines.join('\n').length;
    
    for (const skill of skills) {
      const desc = skill.description?.substring(0, 250) || '';
      const line = `- ${skill.name}${desc ? `: ${desc}` : ''}`;
      
      if (currentLength + line.length + 1 > MAX_SKILL_LISTING_CHARS) break;
      
      truncatedLines.push(line);
      currentLength += line.length + 1;
    }
    
    truncatedLines.push('</available_skills>');
    return truncatedLines.join('\n');
  }
  
  return result;
}

export function detectSkillInvocation(text: string, installedSkills: Skill[]): SkillInvocation {
  for (const pattern of SKILL_INVOCATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const skillName = match[1].toLowerCase();
      const skill = installedSkills.find(
        s => s.name.toLowerCase() === skillName || 
             s.id.toLowerCase().includes(skillName)
      );
      
      if (skill) {
        return {
          detected: true,
          skillName: skill.name,
          skillContent: null,
        };
      }
    }
  }
  
  return { detected: false, skillName: null, skillContent: null };
}

export async function loadSkillContent(skillPath: string): Promise<SkillContent> {
  const content = await invoke<string>('read_skill_content', { skillPath });
  
  const nameMatch = content.match(/^#\s+(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : 'Unknown Skill';
  
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const description = descMatch 
    ? descMatch[1].trim()
    : content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.substring(0, 200) || '';
  
  return {
    name,
    description,
    location: skillPath,
    content,
  };
}

export function parseSkillInvocation(message: string): { invoked: boolean; skillName?: string } {
  const match = message.match(/^\/skill\s+(\S+)/i);
  if (match) {
    return { invoked: true, skillName: match[1] };
  }
  return { invoked: false };
}

export function formatSkillInstructionPrompt(skillContent: SkillContent, originalUserMessage: string): string {
  return `The following skill has been loaded for context. Apply its instructions to the current task.

<skill name="${skillContent.name}">
${skillContent.content}
</skill>

User's original request: ${originalUserMessage}

Now apply the skill instructions above to help with the task.`;
}

export const SKILL_INSTRUCTION = `
To invoke a skill, mention the skill name in your request. For example:
- "Use the frontend-design skill to create a landing page"
- "Apply next-best-practices to optimize this code"
- "Use shadcn skill to add a button component"
`;