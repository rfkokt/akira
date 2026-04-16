/**
 * Groq API Service
 * 
 * Free tier: 20 requests/min, 1,000,000 tokens/day
 * Used for small talk and chat to save CLI tokens
 */

import { invoke } from '@tauri-apps/api/core';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Fast & free tier eligible

/**
 * Get key files for project context
 * Reads important config/source files to provide context to AI
 */
async function getProjectContextFiles(workspacePath: string): Promise<string> {
  if (!workspacePath) return '';
  
  const contextParts: string[] = [];
  const maxFileSize = 5000; // Max chars per file
  const maxTotalSize = 15000; // Max total context size
  
  // Priority files to check (in order of importance)
  const priorityFiles = [
    'package.json',
    'Cargo.toml',
    'pyproject.toml',
    'requirements.txt',
    'README.md',
    'README',
    '.env.example',
    'src/config',
    'config',
    'settings.py',
    'urls.py',
    'manage.py',
  ];
  
  try {
    // Read root directory
    const entries = await invoke<FileEntry[]>('read_directory', { path: workspacePath });
    
    for (const filename of priorityFiles) {
      const entry = entries.find(e => e.name === filename || e.name.startsWith(filename));
      if (entry && !entry.is_dir) {
        try {
          const content = await invoke<string>('read_file', { 
            path: entry.path,
            workspaceId: null 
          });
          
          // Truncate if too long
          const truncated = content.length > maxFileSize 
            ? content.substring(0, maxFileSize) + '\n...[truncated]' 
            : content;
          
          contextParts.push(`--- ${filename} ---\n${truncated}`);
          
          // Check total size
          const currentSize = contextParts.join('\n\n').length;
          if (currentSize > maxTotalSize) {
            contextParts.push('...[context truncated due to size]');
            break;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    // Also try to find main config files in common locations
    const configDirs = ['src', 'config', 'app', 'core'];
    for (const dir of configDirs) {
      if (contextParts.join('\n\n').length > maxTotalSize) break;
      
      try {
        const dirPath = `${workspacePath}/${dir}`;
        const dirEntries = await invoke<FileEntry[]>('read_directory', { path: dirPath });
        
        for (const entry of dirEntries) {
          if (entry.name.includes('config') || entry.name.includes('settings')) {
            try {
              const content = await invoke<string>('read_file', { 
                path: entry.path,
                workspaceId: null 
              });
              
              const truncated = content.length > maxFileSize 
                ? content.substring(0, maxFileSize) + '\n...[truncated]' 
                : content;
              
              contextParts.push(`--- ${dir}/${entry.name} ---\n${truncated}`);
              break; // Only take one config file per dir
            } catch {
              // Skip
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't read
      }
    }
  } catch (error) {
    console.warn('[Groq] Failed to read project context:', error);
  }
  
  return contextParts.join('\n\n');
}

/**
 * Send chat completion request to Groq API
 */
export async function sendGroqChat(
  apiKey: string,
  messages: GroqMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<{ content: string; usage?: GroqResponse['usage'] } | null> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 500,
    temperature = 0.7,
  } = options;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Groq] API error:', response.status, error);
      return null;
    }

    const data: GroqResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log('[Groq] Success:', data.usage?.total_tokens, 'tokens');
      return { content: content.trim(), usage: data.usage };
    }
    
    return null;
  } catch (error) {
    console.error('[Groq] Failed:', error);
    return null;
  }
}

/**
 * Evaluate math expression safely
 */
function evaluateMath(expr: string): number | null {
  // Remove common prefixes/suffixes and clean
  const clean = expr
    .replace(/^(berapa|hitung|what is|calculate)\s*/i, '')
    .replace(/[\?=]$/, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/x(?=\d)/gi, '*')
    .trim();
  
  // Only allow safe math characters
  if (!/^[\d+\-*/().\s]+$/.test(clean)) return null;
  
  try {
    // Safe evaluation using Function
    const result = new Function('return (' + clean + ')')();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Check if question requires codebase context (Groq not suitable)
 */
function requiresCodebaseContext(message: string): boolean {
  const technicalPatterns = [
    /\b(login|auth|signin|logout)\b.*\b(url|path|route|endpoint)\b/i,
    /\b(config|setting|env)\b.*\b(file|value|default)\b/i,
    /\b(api|endpoint|route)\b.*\b(url|path|default)\b/i,
    /\b(file|folder|directory|path)\b.*\b(located|ada di|structure)\b/i,
    /\b(database|db|model|schema|table)\b.*\b(structure|field|column)\b/i,
    /\b(default|value|nilai)\b.*\b(config|setting|env|url)\b/i,
    /\bhttp[s]?:\/\/[^\s]+\/(login|auth|api|config)/i, // URLs with paths
    /\b(Django|Flask|Rails|Express|FastAPI|Laravel|Spring)\b.*\b(url|route|config)\b/i,
  ];
  
  return technicalPatterns.some(pattern => pattern.test(message));
}

/**
 * Quick chat for small talk
 * Returns null for technical questions that require codebase context (should use CLI instead)
 */
export async function sendGroqSmallTalk(
  apiKey: string,
  userMessage: string,
  systemPromptOverride?: string,
  _workspacePath?: string
): Promise<{ content: string; usage?: GroqResponse['usage']; model: string } | null> {
  const model = 'llama-3.1-8b-instant';
  
  // Try local math evaluation first for simple expressions
  const mathResult = evaluateMath(userMessage);
  if (mathResult !== null) {
    console.log('[Groq] Local math evaluation:', userMessage, '=', mathResult);
    return {
      content: String(mathResult),
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: 'local-math'
    };
  }
  
  // Check if this question requires codebase context
  // Groq 8B is NOT suitable for these - will return null to trigger CLI fallback
  if (requiresCodebaseContext(userMessage)) {
    console.log('[Groq] Question requires codebase context, skipping Groq (will use CLI):', userMessage.substring(0, 50));
    return null;
  }
  
  // Use custom system prompt if provided, otherwise use default
  const systemPrompt = systemPromptOverride || 'You are a helpful assistant. Answer briefly and directly. Always respond in the same language as the user (Bahasa Indonesia if user speaks Indonesian, English if user speaks English).';
  
  const result = await sendGroqChat(apiKey, [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ], {
    model,
    maxTokens: 150,
    temperature: 0.7,
  });

  if (result?.content) {
    return { 
      content: result.content.trim(), 
      usage: result.usage,
      model 
    };
  }
  return null;
}

/**
 * Extract keywords from text to find relevant files
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lowerText = text.toLowerCase();
  
  // Tech/framework keywords
  const techPatterns: Record<string, string[]> = {
    'login': ['login', 'auth', 'authentication', 'signin', 'sign-in'],
    'user': ['user', 'users', 'profile', 'account'],
    'api': ['api', 'endpoint', 'route', 'controller'],
    'config': ['config', 'configuration', 'setting', 'env'],
    'database': ['database', 'db', 'model', 'schema', 'migration'],
    'ui': ['ui', 'component', 'page', 'view', 'template'],
    'test': ['test', 'spec', 'testing'],
    'deploy': ['deploy', 'build', 'docker', 'ci', 'cd'],
  };
  
  for (const [category, patterns] of Object.entries(techPatterns)) {
    if (patterns.some(p => lowerText.includes(p))) {
      keywords.push(category);
    }
  }
  
  return keywords;
}

/**
 * Search for relevant files based on keywords
 */
async function searchRelevantFiles(
  workspacePath: string,
  keywords: string[]
): Promise<Array<{ name: string; path: string; content: string }>> {
  const relevantFiles: Array<{ name: string; path: string; content: string }> = [];
  const maxFileSize = 8000; // Max chars per file
  const maxFiles = 3; // Max files to return
  
  // File patterns to search based on keywords
  const filePatterns: Record<string, string[]> = {
    'login': ['urls', 'auth', 'login', 'settings'],
    'user': ['models', 'auth', 'user', 'profile'],
    'api': ['urls', 'views', 'api', 'serializers', 'routes'],
    'config': ['settings', 'config', 'constants', 'env'],
    'database': ['models', 'schema', 'migration', 'db'],
    'ui': ['components', 'pages', 'views', 'templates'],
    'test': ['test', 'spec'],
    'deploy': ['docker', 'ci', 'cd', 'deploy'],
  };
  
  try {
    // Get all file patterns to search
    const patternsToSearch = new Set<string>();
    for (const keyword of keywords) {
      const patterns = filePatterns[keyword] || [keyword];
      patterns.forEach(p => patternsToSearch.add(p.toLowerCase()));
    }
    
    // Search in root and common directories
    const dirsToSearch = ['.', 'src', 'app', 'config', 'core', 'api', 'backend'];
    
    for (const dir of dirsToSearch) {
      if (relevantFiles.length >= maxFiles) break;
      
      try {
        const dirPath = dir === '.' ? workspacePath : `${workspacePath}/${dir}`;
        const entries = await invoke<FileEntry[]>('read_directory', { path: dirPath });
        
        for (const entry of entries) {
          if (entry.is_dir) continue;
          
          const entryNameLower = entry.name.toLowerCase();
          
          // Check if file matches any pattern
          const isRelevant = Array.from(patternsToSearch).some(pattern => 
            entryNameLower.includes(pattern)
          );
          
          if (isRelevant) {
            try {
              const content = await invoke<string>('read_file', {
                path: entry.path,
                workspaceId: null
              });
              
              const truncated = content.length > maxFileSize
                ? content.substring(0, maxFileSize) + '\n...[truncated]'
                : content;
              
              relevantFiles.push({
                name: dir === '.' ? entry.name : `${dir}/${entry.name}`,
                path: entry.path,
                content: truncated
              });
              
              if (relevantFiles.length >= maxFiles) break;
            } catch {
              // Skip files we can't read
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }
  } catch (error) {
    console.warn('[Groq] Failed to search relevant files:', error);
  }
  
  return relevantFiles;
}

/**
 * Extract tasks from conversation using Groq
 * Now includes TARGETED project context based on keywords!
 */
export async function sendGroqSummary(
  apiKey: string,
  conversationText: string,
  skillCatalog: string,
  workspacePath?: string
): Promise<string | null> {
  let relevantContext = '';
  
  if (workspacePath) {
    // Step 1: Extract keywords from conversation
    const keywords = extractKeywords(conversationText);
    console.log('[Groq] Detected keywords:', keywords);
    
    // Step 2: Search for relevant files
    if (keywords.length > 0) {
      const relevantFiles = await searchRelevantFiles(workspacePath, keywords);
      console.log('[Groq] Found relevant files:', relevantFiles.map(f => f.name));
      
      // Step 3: Build targeted context
      if (relevantFiles.length > 0) {
        relevantContext = relevantFiles
          .map(f => `--- ${f.name} ---\n${f.content}`)
          .join('\n\n');
      }
    }
    
    // Fallback: if no relevant files found, get general context
    if (!relevantContext) {
      relevantContext = await getProjectContextFiles(workspacePath);
    }
  }
  
  console.log('[Groq] Context size:', relevantContext.length, 'chars');
  
  const result = await sendGroqChat(apiKey, [
    {
      role: 'system',
      content: `You are a task extraction specialist. Analyze the conversation and extract coding tasks.

${relevantContext ? `RELEVANT PROJECT FILES:
${relevantContext}

` : ''}CRITICAL: Group related changes into SINGLE task. AVOID over-splitting!

Output format - VALID JSON array ONLY. Do NOT wrap in markdown code fences. Return raw JSON:
[{"title":"...","description":"...","priority":"medium","recommendedSkills":["..."]}]

MERGE vs SPLIT:
→ MERGE when: Same feature, Related UI changes, CRUD on same entity, Frontend+Backend for same API
→ SPLIT when: Completely different features, Independent components, Task dependencies exist

Priority: "high"=bugs/security, "medium"=features, "low"=docs

If ONE feature → 1 task. If multiple independent features → multiple tasks.
If no tasks → return empty array: []`,
    },
    {
      role: 'user',
      content: `Available skills: ${skillCatalog || 'None'}

Conversation:
${conversationText}

Extract tasks as JSON array ONLY:`,
    },
  ], {
    model: 'llama-3.1-8b-instant',
    maxTokens: 4000,
    temperature: 0.15,
  });

  console.log('[Groq] Summary raw response length:', result?.content?.length, '| first 200 chars:', result?.content?.substring(0, 200));
  return result?.content || null;
}

/**
 * Check if Groq API key is valid
 */
export async function validateGroqKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
