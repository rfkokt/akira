/**
 * AI Chat Store Helpers
 * 
 * Extracted utilities: localStorage persistence, file detection from AI output.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface SavedTask {
  taskId: string;
  taskTitle: string;
  startedAt: number;
}

// ─── LocalStorage Helpers ───────────────────────────────────────────────

const STORAGE_KEY = 'akira_running_task';

export function saveRunningTask(taskId: string, taskTitle: string): void {
  const saved: SavedTask = {
    taskId,
    taskTitle,
    startedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (e) {
    console.error('Failed to save running task:', e);
  }
}

export function clearRunningTask(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear running task:', e);
  }
}

export function getSavedRunningTask(): SavedTask | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as SavedTask;
    }
  } catch (e) {
    console.error('Failed to get saved task:', e);
  }
  return null;
}

// ─── Token Optimization Helpers ──────────────────────────────────────────

/**
 * Detects if a message is "small talk" (short, non-technical, no files/images).
 * Used to skip loading heavy project rules and save tokens.
 * 
 * Supports both English and Indonesian languages.
 */
export function isSmallTalk(message: string, hasAttachments: boolean = false): boolean {
  if (hasAttachments || message.includes('@')) return false;
  
  const msg = message.toLowerCase().trim();
  if (msg.length > 100) return false;
  
  // ✅ ADD: Indonesian math patterns
  // "2+2 berapa?", "berapa 5x5?", "hitung 10/2", "2+2=?"
  const indonesianMathPattern = /^(?:berapa|hitung)\s*[\d\s\+\-\*\/x×÷\(\)]+|[\d\s\+\-\*\/x×÷\(\)]+\s*(?:berapa|\?|=?)$/;
  if (indonesianMathPattern.test(msg)) return true;
  
  // Mathematical expressions like "2+2", "10/2" are definitely small talk
  const isMath = /^[\d\s\+\-\*\/\(\)\=\?]+$/.test(msg);
  if (isMath) return true;
  
  // ✅ ADD: Indonesian small talk patterns
  const idSmallTalkPatterns = [
    /^(halo|hi|hey|hello)/i,
    /^(terima\s*kasih|thanks|makasih|thx|ty)/i,
    /^(oke|ok|baik|sip|mantap|siap|yoi)/i,
    /^(apa\s+kabar|how\s+are\s+you|how\s+are\s+ya)/i,
    /^(siapa\s+kamu|who\s+are\s+you)/i,
    /^(selamat\s*(pagi|siang|sore|malam))/i,
    /^(sampai\s*jumpa|bye|goodbye|dadah|see\s+you)/i,
    /^(bagus|nice|good|great|awesome)/i,
    /^(iya|yes|yep|yup|no|tidak|nope)/i,
    /^(nggak|ga|gak|tidak|no)/i,
    /^(ya|yes|yoi|okeh)/i,
    /^(test|testing|coba|cek|check)$/i,  // Test chat messages
    /^(ping|pong)$/i,  // Simple ping
    /^(help|bantu|tolong)$/i,  // Help requests
  ];
  
  if (idSmallTalkPatterns.some(pattern => pattern.test(msg))) return true;
  
  // Technical keywords that should always trigger project rules
  const technicalKeywords = [
    'code', 'build', 'fix', 'add', 'create', 'implement', 'error', 'bug', 
    'file', 'refactor', 'function', 'component', 'style', 'route',
    'api', 'db', 'database', 'git', 'commit', 'branch', 'pr', 'merge',
    'setup', 'config', 'run', 'install', 'npm', 'cargo', 'rust', 'react',
    'component', 'hook', 'state', 'props', 'interface', 'type', 'const',
    'let', 'var', 'import', 'export', 'from', 'return', 'async', 'await',
    'unit test', 'integration test', 'e2e test', 'test file', 'testing'  // Contextual test keywords only
  ];
  
  const hasTechnicalKeyword = technicalKeywords.some(kw => msg.includes(kw));
  if (hasTechnicalKeyword) return false;
  
  // If it's short and has no technical keywords, it's likely small talk
  return true;
}

/**
 * Global RTK (Rust Token Killer) instructions for AI providers.
 * Consistent across all chat interfaces and tasks.
 */
export const GLOBAL_RTK_INSTRUCTION = `
[TOKEN SAVING]
Prefix heavy terminal commands with 'rtk' to save 60-90% tokens:
- Git: 'rtk git <args>'
- Lint: 'rtk lint <linter>'
- Test: 'rtk test <runner>'
- Build: 'rtk build <tool>'
- Search: 'rtk search <tool>' (grep/rg)
- System: 'rtk system <command>' (ps/top)
This ensures output is compressed without losing important details.`;

// ─── File Extraction ────────────────────────────────────────────────────

/**
 * Extract file paths mentioned in AI output.
 * Used to track which files the AI is modifying.
 */
export function extractFileInfo(content: string): { currentFile: string | null; filesModified: string[] } {
  const filesModified: string[] = [];
  let currentFile: string | null = null;

  const stripPrefix = (path: string): string => {
    if (path.includes('/a/resources/js/app/')) {
      const parts = path.split('/a/resources/js/app/');
      return parts[parts.length - 1] || path;
    }
    return path.replace(/^[a-z]\/resources\/js\/app\//i, '');
  };

  const filePatterns = [
    /(?:creating|updating|modifying|editing|writing to)\s+[`"]?(\S+\.(?:tsx|ts|jsx|js|css|scss|json|md|py|rs|go|java|cpp|c|h|yaml|yml|xml|html|vue|svelte))[`"]?/i,
    /[`"]([^`"]+\.(?:tsx|ts|jsx|js|css|scss|json|md|py|rs|go|java|cpp|c|h|yaml|yml|xml|html|vue|svelte))[`"]/i,
    /(src\/[^\s:]+\.(?:tsx|ts|jsx|js))/i,
    /(components\/[^\s:]+\.(?:tsx|ts|jsx|js))/i,
    /(pages\/[^\s:]+\.(?:tsx|ts|jsx|js))/i,
    /(lib\/[^\s:]+\.(?:tsx|ts|jsx|js))/i,
    /(app\/[^\s:]+\.(?:tsx|ts|jsx|js))/i,
  ];

  for (const pattern of filePatterns) {
    const matches = content.match(new RegExp(pattern, 'gi'));
    if (matches) {
      for (const match of matches) {
        const fileMatch = match.match(/[`"']?([^`"'\s]+\.(?:tsx|ts|jsx|js|css|scss|json|md|py|rs|go|java|cpp|c|h|yaml|yml|xml|html|vue|svelte))[`"]?/i);
        if (fileMatch) {
          const cleanPath = stripPrefix(fileMatch[1]);
          if (!filesModified.includes(cleanPath)) {
            filesModified.push(cleanPath);
          }
        }
      }
    }
  }

  if (filesModified.length > 0) {
    currentFile = filesModified[filesModified.length - 1];
  }

  return { currentFile, filesModified };
}
