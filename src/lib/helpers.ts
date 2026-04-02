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
