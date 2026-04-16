import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useEngineStore } from './engineStore';
import { useTaskStore } from './taskStore';
import { useWorkspaceStore } from './workspaceStore';
import { useConfigStore } from './configStore';
import { useSkillStore } from './skillStore';
import { dbService } from '@/lib/db';
import { runCLIWithStreaming } from '@/lib/cli';
import { autoCreatePR } from '@/lib/git';
import { notify } from '@/lib/notify';
import {
  extractFileInfo,
  saveRunningTask,
  clearRunningTask,
  getSavedRunningTask as getSavedTask,
  isSmallTalk,
  GLOBAL_RTK_INSTRUCTION,
  type SavedTask,
} from '@/lib/helpers';
import { formatSkillListing, loadSkillContent, detectSkillInvocation } from '@/lib/skills';
import { sendGroqSmallTalk } from '@/lib/groq';
import { routeQuery, logRoutingDecision } from '@/lib/queryRouter';
import { compressHistory } from '@/lib/promptCompression';
import {
  extractToolCallsFromResponse,
  executeToolCalls,
  formatToolResultsForPrompt,
  formatToolResultsForChat,
} from '@/lib/mcp/aiIntegration';
import { trackToolCall } from '@/lib/mcp/analytics';
import { injectToolsIntoPrompt } from '@/lib/mcp';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export type AITaskStatus = 'idle' | 'queued' | 'running' | 'completed' | 'error';

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  durationMs?: number;
  timestamp: number;
}

export interface AITaskState {
  status: AITaskStatus;
  startTime: number | null;
  endTime: number | null;
  errorMessage: string | null;
  lastResponse: string | null;
  queuePosition: number | null;
  currentFile: string | null;
  filesModified: string[];
  prBranch?: string;
  prUrl?: string;
  prCreatedAt?: number;
  isMerged?: boolean;
  mergeSourceBranch?: string;
  prError?: string;
  creatingPR?: boolean;
  toolCalls: ToolCallRecord[];
}

interface TaskQueueItem {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
}

interface InvokedSkill {
  name: string;
  content: string;
  location: string;
}

interface AIChatState {
  messages: Record<string, ChatMessage[]>;
  taskStates: Record<string, AITaskState>;
  taskQueue: TaskQueueItem[];
  currentRunningTask: string | null;
  isProcessingQueue: boolean;
  useRouter: boolean;
  routerProvider: string | null;
  currentSessionId: string | null;
  streamingMessageId: Record<string, string | null>;
  invokedSkills: Record<string, InvokedSkill[]>;
  stopStreaming: (taskId: string) => void;

  // Actions
  enqueueTask: (taskId: string, taskTitle: string, taskDescription?: string) => Promise<void>;
  processQueue: () => Promise<void>;
  runAITask: (taskId: string, taskTitle: string, taskDescription?: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  sendMessage: (taskId: string, content: string) => Promise<void>;
  sendSimpleMessage: (taskId: string, prompt: string, internalPrompt?: string) => Promise<string>;
  sendDirectAPI: (prompt: string) => Promise<string>;
  stopMessage: (taskId: string) => Promise<void>;
  clearMessages: (taskId: string) => void;
  getMessages: (taskId: string) => ChatMessage[];
  setMessages: (taskId: string, msgs: ChatMessage[]) => void;
  getTaskState: (taskId: string) => AITaskState;
  isStreaming: (taskId: string) => boolean;
  setUseRouter: (useRouter: boolean) => void;
  setRouterProvider: (provider: string | null) => void;
  addInvokedSkill: (taskId: string, skill: InvokedSkill) => void;
  getInvokedSkills: (taskId: string) => InvokedSkill[];
  
  // Tool Call Actions
  addToolCall: (taskId: string, toolCall: ToolCallRecord) => void;
  updateToolCall: (taskId: string, toolCallId: string, updates: Partial<ToolCallRecord>) => void;
  getToolCalls: (taskId: string) => ToolCallRecord[];
  clearToolCalls: (taskId: string) => void;
  clearTaskState: (taskId: string) => void;
}

// ─── Exports ────────────────────────────────────────────────────────────

export const getSavedRunningTask = (): SavedTask | null => getSavedTask();
export const clearSavedRunningTask = () => clearRunningTask();

// ─── Defaults ───────────────────────────────────────────────────────────

const defaultTaskState = (): AITaskState => ({
  status: 'idle',
  startTime: null,
  endTime: null,
  errorMessage: null,
  lastResponse: null,
  queuePosition: null,
  currentFile: null,
  filesModified: [],
  toolCalls: [],
});

// ─── Helpers ────────────────────────────────────────────────────────────

/** Add a message to a task's chat */
function addMessage(get: () => AIChatState, set: (s: Partial<AIChatState>) => void, taskId: string, msg: ChatMessage) {
  const { messages } = get();
  set({ messages: { ...messages, [taskId]: [...(messages[taskId] || []), msg] } });
}

/** Update the content of an existing message by ID */
function appendToMessage(get: () => AIChatState, set: (s: Partial<AIChatState>) => void, taskId: string, messageId: string, text: string) {
  const { messages } = get();
  const taskMessages = messages[taskId] || [];
  const idx = taskMessages.findIndex(m => m.id === messageId);
  if (idx < 0) return;

  const updated = [...taskMessages];
  updated[idx] = { ...updated[idx], content: updated[idx].content + text };
  set({ messages: { ...messages, [taskId]: updated } });
}

/** Update task state partially */
function updateTaskState(get: () => AIChatState, set: (s: Partial<AIChatState>) => void, taskId: string, patch: Partial<AITaskState>) {
  const { taskStates } = get();
  set({
    taskStates: {
      ...taskStates,
      [taskId]: { ...(taskStates[taskId] || defaultTaskState()), ...patch },
    },
  });
}

/** Get workspace cwd */
function getWorkspaceCwd(): string | null {
  return useWorkspaceStore.getState().activeWorkspace?.folder_path || null;
}

async function getSkillListing(): Promise<string> {
  try {
    const skills = useSkillStore.getState().installedSkills;
    if (skills.length === 0) return '';
    return formatSkillListing(skills);
  } catch {
    return '';
  }
}

// ── Project Context Cache ───────────────────────────────────────────────

let _projectContextCache: { context: string; cwd: string; cachedAt: number } | null = null;
const PROJECT_CONTEXT_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Build a compact project structure for AI context awareness.
 * Cached for 2 minutes to avoid re-scanning the filesystem every message.
 */
async function getProjectContext(): Promise<string> {
  const cwd = getWorkspaceCwd();
  if (!cwd) return '';

  // Return cache if valid
  if (_projectContextCache && _projectContextCache.cwd === cwd && Date.now() - _projectContextCache.cachedAt < PROJECT_CONTEXT_TTL) {
    return _projectContextCache.context;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');

    const SKIP_DIRS = new Set([
      'node_modules', 'dist', 'build', '.git', '.next', 'out', 'target',
      'vendor', '.cache', '.turbo', 'coverage', '__pycache__', '.venv',
      'venv', '.idea', '.vscode', '.akira', '.serena',
    ]);

    const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>('read_directory', { path: cwd });
    const lines: string[] = [];

    // Root-level files (config files only for brevity)
    const rootFiles = entries
      .filter(e => !e.is_dir && !e.name.startsWith('.'))
      .map(e => e.name);
    
    const importantFiles = rootFiles.filter(f =>
      f === 'package.json' || f === 'tsconfig.json' || f === 'Cargo.toml' ||
      f === 'go.mod' || f === 'requirements.txt' || f === 'pyproject.toml' ||
      f === 'tauri.conf.json' || f.includes('.config.') || f === 'vite.config.ts' ||
      f === 'next.config.ts' || f === 'next.config.js' || f === 'README.md'
    );

    if (importantFiles.length > 0) {
      lines.push(`Root: ${importantFiles.join(', ')}`);
    }

    // Top-level directories with their immediate children
    const dirs = entries
      .filter(e => e.is_dir && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of dirs.slice(0, 15)) { // Max 15 top-level dirs
      try {
        const subEntries = await invoke<Array<{ name: string; is_dir: boolean }>>('read_directory', { path: dir.path });
        const subItems = subEntries
          .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
          .slice(0, 12) // Max 12 items per folder
          .map(e => e.is_dir ? `${e.name}/` : e.name);
        
        if (subItems.length > 0) {
          const truncated = subEntries.length > 12 ? ` (+${subEntries.length - 12} more)` : '';
          lines.push(`${dir.name}/: ${subItems.join(', ')}${truncated}`);
        } else {
          lines.push(`${dir.name}/`);
        }
      } catch {
        lines.push(`${dir.name}/`);
      }
    }

    const context = lines.length > 0
      ? `[PROJECT STRUCTURE]\n${lines.join('\n')}`
      : '';

    _projectContextCache = { context, cwd, cachedAt: Date.now() };
    return context;
  } catch (err) {
    console.warn('[AI] Failed to build project context:', err);
    return '';
  }
}

async function loadSkillForTask(skillName: string): Promise<{ name: string; content: string; location: string } | null> {
  try {
    const skills = useSkillStore.getState().installedSkills;
    const skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase() || s.id.includes(skillName.toLowerCase()));
    if (!skill) return null;
    
    const skillContent = await loadSkillContent(skill.skill_path);
    return {
      name: skillContent.name,
      content: skillContent.content,
      location: skillContent.location,
    };
  } catch (err) {
    console.error('[Skills] Failed to load skill:', err);
    return null;
  }
}

function buildTaskPrompt(taskTitle: string, taskDescription?: string, skillListing?: string, invokedSkillsContent?: string, projectContext?: string): string {
  const hasEmbeddedRules = taskDescription?.includes('<!-- auto-rules-embedded -->');
  
  let systemPrompt = '';
  if (!hasEmbeddedRules) {
    try { systemPrompt = useConfigStore.getState().getSystemPrompt(); } catch { /* no config */ }
  }

  const cleanDescription = taskDescription?.replace('<!-- auto-rules-embedded -->', '').trim();

  const skillSection = skillListing ? `\n\n[AVAILABLE SKILLS]\n${skillListing}` : '';
  const invokedSkillsSection = invokedSkillsContent ? `\n\n[ACTIVE SKILLS CONTEXT]\n${invokedSkillsContent}` : '';

  // Build prompt with TASK FIRST (most important for AI focus)
  const taskSection = `TASK: ${taskTitle}
${cleanDescription ? `CONTEXT: ${cleanDescription}` : ''}

Please analyze and implement this task.`;

  const workspace = useWorkspaceStore.getState().activeWorkspace;
  
  // Start with task section (highest priority)
  let prompt = taskSection;
  
  // Add system context after task (for reference)
  if (systemPrompt || GLOBAL_RTK_INSTRUCTION) {
    prompt += `\n\n---\n\n${GLOBAL_RTK_INSTRUCTION}`;
    if (systemPrompt) {
      prompt += `\n\n${systemPrompt}`;
    }
  }
  
  // Add skills
  prompt += skillSection;
  prompt += invokedSkillsSection;
  
  // Add project structure context
  if (projectContext) {
    prompt += `\n\n${projectContext}`;
  }
  
  // Add output format guidance
  prompt += `\n\n[OUTPUT FORMAT]
1. Analyze: What needs to be done and why
2. Plan: List files to create/modify with @filepath format
3. Implement: Show code changes with clear comments
4. Verify: Confirm edge cases are handled`;
  
  // Inject tools at the end
  if (workspace) {
    prompt = injectToolsIntoPrompt(prompt, {
      maxTools: 30,
      format: 'compact',
      workspaceId: workspace.id,
    });
    console.log('[DynamicMCP] Tools injected into task prompt');
  }

  return prompt;
}

/** Detect and execute tool calls from AI response */
async function processToolCallsFromResponse(
  response: string,
  taskId?: string,
  _onToolCallStart?: (toolCallId: string, toolName: string) => void,
  onToolCallComplete?: (toolCallId: string, success: boolean, result?: string, error?: string) => void
): Promise<{ hasToolCalls: boolean; toolResults?: string; toolResultsDisplay?: string }> {
  const toolCalls = extractToolCallsFromResponse(response);
  
  if (toolCalls.length === 0) {
    return { hasToolCalls: false };
  }

  console.log(`[ToolExecution] Detected ${toolCalls.length} tool calls in response`);
  
  // Track tool calls if taskId provided
  if (taskId) {
    for (const call of toolCalls) {
      useAIChatStore.getState().addToolCall(taskId, {
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        status: 'pending',
        timestamp: Date.now(),
      });
    }
  }
  
  // Execute all tool calls
  const results = await executeToolCalls(toolCalls, { timeout: 30000 });
  
  // Update status for each result
  for (const result of results) {
    if (taskId) {
      useAIChatStore.getState().updateToolCall(taskId, result.toolCallId, {
        status: result.success ? 'success' : 'error',
        result: result.result,
        error: result.error,
        durationMs: result.duration_ms,
      });
    }
    
    // Track tool call analytics
    trackToolCall(
      result.toolName,
      result.success,
      result.duration_ms || 0,
      { error: result.error }
    );
    
    if (onToolCallComplete) {
      onToolCallComplete(result.toolCallId, result.success, result.result, result.error);
    }
  }
  
  // Format results: one for AI prompt, one for chat display  
  const formattedResultsForPrompt = formatToolResultsForPrompt(results);
  const formattedResultsForChat = formatToolResultsForChat(results);
  
  return {
    hasToolCalls: true,
    toolResults: formattedResultsForPrompt,
    toolResultsDisplay: formattedResultsForChat,
  };
}

/** Post-task completion: capture diff, create PR, move to review */
async function handleTaskCompletion(
  get: () => AIChatState,
  set: (s: Partial<AIChatState>) => void,
  taskId: string,
  taskTitle: string,
) {
  // Mark that we're creating PR
  updateTaskState(get, set, taskId, { creatingPR: true });

  try {
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      await useTaskStore.getState().moveTask(taskId, 'review');
      await notify('Task Ready for Review ✅', `"${taskTitle}" has been completed and is ready for review.`);
      return;
    }

    // Check if task has been merged before - use merged_to_branch as base for revision
    const tasks = useTaskStore.getState().tasks;
    const task = tasks.find(t => t.id === taskId);
    const baseBranch = task?.is_merged ? task.merged_to_branch || undefined : undefined;
    
    if (baseBranch) {
      console.log(`[AI] Task ${taskId} revision - creating branch from ${baseBranch}`);
    }

    // Add timeout to prevent indefinite hangs from slow git operations
    const PR_TIMEOUT_MS = 60_000; // 60 seconds
    const prPromise = autoCreatePR(taskId, taskTitle, cwd, { baseBranch: baseBranch || undefined });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), PR_TIMEOUT_MS));
    
    const prResult = await Promise.race([prPromise, timeoutPromise]);
    
    if (prResult === null) {
      console.warn(`[AI] autoCreatePR timed out after ${PR_TIMEOUT_MS / 1000}s for task ${taskId}`);
    }

    // Capture diff snapshot — use branch diff if we have a PR branch (isolated per task)
    try {
      let newDiff = '';
      let hasChanges = false;

      if (prResult?.branch && prResult?.baseBranch) {
        const baseBranch = prResult.baseBranch;

        const diffResult = await invoke<{ diff: string; has_changes: boolean }>
          ('git_get_branch_diff', { cwd, baseBranch, headBranch: prResult.branch });
        if (diffResult.has_changes) {
          newDiff = diffResult.diff;
          hasChanges = true;
        }
      } else {
        // Fallback: working directory diff
        const diffResult = await invoke<{ diff: string; has_changes: boolean }>('git_get_diff', { cwd });
        if (diffResult.has_changes) {
          newDiff = diffResult.diff;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        // Get existing diff from task and append for cumulative history
        const tasks = useTaskStore.getState().tasks;
        const task = tasks.find(t => t.id === taskId);
        const existingDiff = task?.diff_content || '';
        
        // Build cumulative diff with revision marker
        let combinedDiff = '';
        if (existingDiff && existingDiff.trim()) {
          const timestamp = new Date().toISOString();
          combinedDiff = `${existingDiff}\n\n${'='.repeat(60)}\n[REVISION ${timestamp}]\n${'='.repeat(60)}\n\n${newDiff}`;
        } else {
          combinedDiff = newDiff;
        }

        const diffLastCapturedAt = new Date().toISOString();
        await dbService.updateTaskDiffInfo(taskId, combinedDiff, diffLastCapturedAt);
        await useTaskStore.getState().fetchTasks();
        
        console.log(`[AI] Diff captured for ${taskId}: ${newDiff.length} chars new, ${combinedDiff.length} chars total`);
      }
    } catch (e) {
      console.error('[AI] Failed to capture diff:', e);
    }

    // Add result message
    let resultContent = '';

    if (!prResult) {
      resultContent = `⚠️ **Task completed but PR automation failed**\n\nAI finished the task but could not automatically commit/push to remote.\n\nYou can:\n1. Check git configuration\n2. Create branch and PR manually\n3. Or use "View Diff" to see changes\n\nTask moved to **Review** for manual handling.`;
    } else if (prResult.error) {
      resultContent = `⚠️ **Task completed but remote push failed**\n\nAI finished the task and created branch \`${prResult.branch}\` locally, but could not push to remote.\n\n**Error:**\n\`\`\`\n${prResult.error}\n\`\`\`\n\nYou can:\n1. Check git branch/remote settings\n2. Push the branch manually\n\nTask moved to **Review** for manual handling.`;
    } else if (prResult.prUrl) {
      const isRealPR = !prResult.prUrl.includes('/compare/');
      if (isRealPR) {
        resultContent = `✅ **Task completed! PR auto-created.**\n\nBranch: \`${prResult.branch}\`\n\n🔗 [View Pull Request](${prResult.prUrl})`;
      } else {
        resultContent = `✅ **Task completed and branch pushed!**\n\nBranch: \`${prResult.branch}\`\n\n[Click here to create PR](${prResult.prUrl})\n\nOr run: \`git checkout ${prResult.branch}\``;
      }
    } else {
      resultContent = `✅ **Task completed and branch pushed!**\n\nBranch: \`${prResult.branch}\`\n\nCreate PR manually from your git provider.`;
    }

    const newMessage = {
      id: crypto.randomUUID(),
      taskId,
      role: 'system' as const,
      content: resultContent,
      timestamp: Date.now(),
    };

    addMessage(get, set, taskId, newMessage);

    // Save the PR outcome system message to DB to persist logs across reloads
    try {
      await dbService.createChatMessage(taskId, 'system', resultContent, 'akira');
    } catch (err) {
      console.error('Failed to save completion message to DB:', err);
    }

    if (prResult) {
      updateTaskState(get, set, taskId, {
        prBranch: prResult.branch,
        prUrl: prResult.prUrl,
        prCreatedAt: Date.now(),
      });
    } else {
      // PR creation failed completely
      updateTaskState(get, set, taskId, {
        prError: 'PR automation failed or timed out',
      });
    }

    await useTaskStore.getState().moveTask(taskId, 'review');
    await notify('Task Ready for Review ✅', `"${taskTitle}" has been completed and moved to review.`);
  } catch (err) {
    console.error('[AI] handleTaskCompletion error:', err);
    // Still move to review even if PR creation fails
    try {
      await useTaskStore.getState().moveTask(taskId, 'review');
      await notify('Task Moved to Review', `"${taskTitle}" completed. PR creation encountered an error.`);
    } catch { /* last resort */ }
  } finally {
    // ALWAYS reset creatingPR flag to prevent permanent stuck state
    updateTaskState(get, set, taskId, { creatingPR: false });
  }
}

// ─── Store ──────────────────────────────────────────────────────────────

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: {},
  taskStates: {},
  taskQueue: [],
  currentRunningTask: null,
  isProcessingQueue: false,
  useRouter: true,
  routerProvider: null,
  currentSessionId: null,
  streamingMessageId: {},
  invokedSkills: {},

  stopStreaming: (taskId) => {
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
  },

  addInvokedSkill: (taskId, skill) => {
    const { invokedSkills } = get();
    const existing = invokedSkills[taskId] || [];
    if (existing.find(s => s.name === skill.name)) return;
    set({
      invokedSkills: {
        ...invokedSkills,
        [taskId]: [...existing, skill],
      },
    });
  },

  getInvokedSkills: (taskId) => get().invokedSkills[taskId] || [],

  // ── Queue Management ────────────────────────────────────────────────

  enqueueTask: async (taskId, taskTitle, taskDescription) => {
    const { taskQueue } = get();
    if (taskQueue.find(t => t.taskId === taskId) || get().currentRunningTask === taskId) return;

    const newQueue = [...taskQueue, { taskId, taskTitle, taskDescription }];

    set({ taskQueue: newQueue });
    updateTaskState(get, set, taskId, { status: 'queued', queuePosition: newQueue.length });

    if (!get().isProcessingQueue) get().processQueue();
  },

  processQueue: async () => {
    const { taskQueue, isProcessingQueue, currentRunningTask } = get();
    if (isProcessingQueue || taskQueue.length === 0 || currentRunningTask) return;

    set({ isProcessingQueue: true });
    const [nextTask, ...remaining] = taskQueue;
    set({ taskQueue: remaining, currentRunningTask: nextTask.taskId });
    saveRunningTask(nextTask.taskId, nextTask.taskTitle);

    // Update queue positions
    const { taskStates } = get();
    const updated = { ...taskStates };
    remaining.forEach((item, i) => {
      if (updated[item.taskId]) {
        updated[item.taskId] = { ...updated[item.taskId], queuePosition: i + 1 };
      }
    });
    set({ taskStates: updated });

    try {
      await get().runAITask(nextTask.taskId, nextTask.taskTitle, nextTask.taskDescription);
    } catch (error) {
      console.error('Error running AI task:', error);
    }

    set({ currentRunningTask: null, isProcessingQueue: false });
    clearRunningTask();
    setTimeout(() => get().processQueue(), 100);
  },

  // ── Run AI Task ─────────────────────────────────────────────────────

  runAITask: async (taskId, taskTitle, taskDescription) => {
    const engine = useEngineStore.getState().activeEngine;

    if (!engine) {
      addMessage(get, set, taskId, {
        id: `msg-${Date.now()}`, taskId, role: 'system',
        content: '❌ Error: No AI engine selected. Please configure an engine in Settings.',
        timestamp: Date.now(),
      });
      updateTaskState(get, set, taskId, { status: 'error', errorMessage: 'No AI engine selected' });
      return;
    }

    const startTime = Date.now();

    // Extract recommended skills from task description
    const skillsMatch = taskDescription?.match(/<!--\s*skills:([^>]+)-->/);
    const recommendedSkillNames = skillsMatch?.[1]?.split(',').map(s => s.trim().toLowerCase()).filter(s => s) || [];

    // Clean description by removing the skills tag
    const cleanTaskDescription = taskDescription?.replace(/<!--\s*skills:[^>]+-->\n?/, '');

    // Preload recommended skills
    if (recommendedSkillNames.length > 0) {
      const installedSkills = useSkillStore.getState().installedSkills;
      for (const skillName of recommendedSkillNames) {
        const skill = installedSkills.find(s => s.name.toLowerCase() === skillName);
        if (skill) {
          try {
            const skillContent = await loadSkillContent(skill.skill_path);
            get().addInvokedSkill(taskId, {
              name: skillContent.name,
              content: skillContent.content,
              location: skillContent.location,
            });
            console.log(`[Skills] Preloaded recommended skill: ${skill.name}`);
          } catch (err) {
            console.warn(`[Skills] Failed to preload skill ${skillName}:`, err);
          }
        }
      }
    }

    // System message
    addMessage(get, set, taskId, {
      id: `msg-${startTime}-system`, taskId, role: 'system',
      content: `🚀 Starting AI workflow for: "${taskTitle}"`,
      timestamp: startTime,
    });
    
    if (recommendedSkillNames.length > 0) {
      addMessage(get, set, taskId, {
        id: `msg-${Date.now()}-skills`, taskId, role: 'system',
        content: `📚 Preloaded skills: ${recommendedSkillNames.join(', ')}`,
        timestamp: Date.now(),
      });
    }
    
    updateTaskState(get, set, taskId, { status: 'running', startTime });

    // Load skill listing, invoked skills, and project context
    const skillListing = await getSkillListing();
    const projectContext = await getProjectContext();
    const invokedSkills = get().invokedSkills[taskId] || [];
    const invokedSkillsContent = invokedSkills.length > 0
      ? invokedSkills.map(s => `--- ${s.name} ---\n${s.content}`).join('\n\n')
      : undefined;

    // AI response placeholder
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });

    const prompt = buildTaskPrompt(taskTitle, cleanTaskDescription, skillListing, invokedSkillsContent, projectContext);
    const cwd = getWorkspaceCwd();
    let responseContent = '';

    try {
      const result = await runCLIWithStreaming({
        taskId,
        engineAlias: engine.alias,
        binaryPath: engine.binary_path,
        engineArgs: engine.args,
        prompt,
        cwd,
        mode: 'standard',  // Task execution always needs full context
        onOutput: (text) => {
          responseContent += text + '\n';
          appendToMessage(get, set, taskId, aiMessageId, text + '\n');

          // Track files
          const { currentFile, filesModified } = extractFileInfo(responseContent);
          if (currentFile || filesModified.length > 0) {
            const state = get().taskStates[taskId];
            if (state) {
              updateTaskState(get, set, taskId, {
                currentFile,
                filesModified: [...new Set([...state.filesModified, ...filesModified])],
              });
            }
          }
        },
      });

      const endTime = Date.now();

      if (result.success) {
        // Check for skill invocation in response
        const skills = useSkillStore.getState().installedSkills;
        const skillInvocation = detectSkillInvocation(responseContent, skills);
        
        if (skillInvocation.detected && skillInvocation.skillName) {
          // Skill invocation detected - load skill and send follow-up
          const skill = skills.find(s => s.name === skillInvocation.skillName);
          
          if (skill) {
            addMessage(get, set, taskId, {
              id: `msg-${Date.now()}-skill`, taskId, role: 'system',
              content: `📚 Loading skill "${skill.name}"...`,
              timestamp: Date.now(),
            });
            
            try {
              const skillContent = await loadSkillContent(skill.skill_path);
              get().addInvokedSkill(taskId, {
                name: skillContent.name,
                content: skillContent.content,
                location: skillContent.location,
              });
              
              // Send follow-up prompt with skill context
              const followUpPrompt = buildTaskPrompt(
                taskTitle,
                cleanTaskDescription,
                skillListing,
                `${skillContent.name}\n${skillContent.content}`,
                projectContext
              );
              
              // Record cost for first response
              const duration = (endTime - startTime) / 1000;
              try {
                await invoke('record_cli_cost', {
                  providerAlias: engine.alias,
                  inputTokens: Math.ceil(responseContent.length / 4),
                  outputTokens: Math.ceil(responseContent.length / 4),
                  cost: duration * 0.001,
                });
              } catch { /* cost recording is non-critical */ }
              
              // New AI response placeholder for follow-up
              const followUpMessageId = `msg-${Date.now()}-follow`;
              addMessage(get, set, taskId, {
                id: followUpMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
              });
              
              let followUpContent = '';
              
              const followUpResult = await runCLIWithStreaming({
                taskId: `${taskId}-skill`,
                engineAlias: engine.alias,
                binaryPath: engine.binary_path,
                engineArgs: engine.args,
                prompt: followUpPrompt,
                cwd,
                mode: 'standard',  // Skill follow-up needs full context
                onOutput: (text) => {
                  followUpContent += text + '\n';
                  appendToMessage(get, set, taskId, followUpMessageId, text + '\n');
                },
              });
              
              if (followUpResult.success) {
                updateTaskState(get, set, taskId, {
                  status: 'completed', endTime: Date.now(), lastResponse: followUpContent,
                });
                
                // Save to DB
                try {
                  await dbService.createChatMessage(taskId, 'system', `🚀 Starting AI workflow for: "${taskTitle}"`, engine.alias);
                  await dbService.createChatMessage(taskId, 'assistant', responseContent.trim(), engine.alias);
                  await dbService.createChatMessage(taskId, 'assistant', followUpContent.trim(), engine.alias);
                } catch { /* non-critical */ }
                
                setTimeout(() => handleTaskCompletion(get, set, taskId, taskTitle), 500);
              } else {
                appendToMessage(get, set, taskId, followUpMessageId, `\n\n❌ Error: ${followUpResult.errorMessage || 'Skill follow-up failed'}`);
                updateTaskState(get, set, taskId, {
                  status: 'error', endTime: Date.now(), errorMessage: followUpResult.errorMessage,
                });
              }
              
              return; // Skip normal completion flow
            } catch (skillError) {
              console.error('Failed to load skill:', skillError);
              addMessage(get, set, taskId, {
                id: `msg-${Date.now()}-error`, taskId, role: 'system',
                content: `❌ Failed to load skill "${skillInvocation.skillName}": ${skillError}`,
                timestamp: Date.now(),
              });
            }
          }
        }
        
        // Normal completion flow (no skill invocation or skill failed to load)
        // Record cost
        const duration = (endTime - startTime) / 1000;
        try {
          await invoke('record_cli_cost', {
            providerAlias: engine.alias,
            inputTokens: Math.ceil(responseContent.length / 4),
            outputTokens: Math.ceil(responseContent.length / 4),
            cost: duration * 0.001,
          });
        } catch { /* cost recording is non-critical */ }

        updateTaskState(get, set, taskId, {
          status: 'completed', endTime, lastResponse: responseContent,
        });

        // Save chat history to DB
        try {
          await dbService.createChatMessage(taskId, 'system', `🚀 Starting AI workflow for: "${taskTitle}"`, engine.alias);
          if (responseContent.trim()) {
            await dbService.createChatMessage(taskId, 'assistant', responseContent.trim(), engine.alias);
          }
        } catch { /* non-critical */ }

        // Create PR and move to review
        setTimeout(() => handleTaskCompletion(get, set, taskId, taskTitle), 500);
      } else {
        // Failed
        appendToMessage(get, set, taskId, aiMessageId, `\n\n❌ Error: ${result.errorMessage || 'AI process failed'}`);
        updateTaskState(get, set, taskId, {
          status: 'error', endTime, errorMessage: result.errorMessage || 'AI process failed',
        });
        setTimeout(() => useTaskStore.getState().moveTask(taskId, 'failed'), 500);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to get AI response';
      appendToMessage(get, set, taskId, aiMessageId, `\n\n❌ Error: ${errorMsg}`);
      updateTaskState(get, set, taskId, {
        status: 'error', endTime: Date.now(), errorMessage: errorMsg,
      });
      setTimeout(() => useTaskStore.getState().moveTask(taskId, 'failed'), 500);
    }
  },

  // ── Retry Task ──────────────────────────────────────────────────────

  retryTask: async (taskId) => {
    const msgs = get().messages[taskId] || [];
    const systemMsg = msgs.find(m => m.role === 'system' && m.content.includes('Starting AI workflow'));
    if (!systemMsg) return;

    const match = systemMsg.content.match(/"([^"]+)"/);
    const taskTitle = match ? match[1] : 'Unknown Task';

    updateTaskState(get, set, taskId, { status: 'running', startTime: Date.now() });
    set({ currentRunningTask: taskId });
    get().runAITask(taskId, taskTitle);
  },

// ── Send Message (Chat / Revision) ─────────────────────────────────

  sendMessage: async (taskId, content) => {
    const existingMessages = get().messages[taskId] || [];

    // Extract task title from system message
    let taskTitle = 'Unknown Task';
    const sysMsg = existingMessages.find(m => m.role === 'system' && m.content.includes('Starting AI workflow'));
    if (sysMsg) {
      const m = sysMsg.content.match(/"([^"]+)"/);
      if (m) taskTitle = m[1];
    }

    // Check for skill invocation
    const skillInvocation = content.match(/^\/skill\s+(\S+)/i);
    if (skillInvocation) {
      const skillName = skillInvocation[1];
      const skillData = await loadSkillForTask(skillName);
      
      if (skillData) {
        get().addInvokedSkill(taskId, skillData);
        addMessage(get, set, taskId, {
          id: `msg-${Date.now()}`, taskId, role: 'system',
          content: `✅ Skill "${skillData.name}" loaded. Its instructions will be included in the next prompt.`,
          timestamp: Date.now(),
        });
        return;
      } else {
        addMessage(get, set, taskId, {
          id: `msg-${Date.now()}`, taskId, role: 'system',
          content: `❌ Skill "${skillName}" not found. Use /skill <name> to load a skill.`,
          timestamp: Date.now(),
        });
        return;
      }
    }

    // Detect revision mode
    const task = useTaskStore.getState().tasks.find(t => t.id === taskId);
    const isRevisionMode = task?.status === 'review' || task?.status === 'in-progress';

    // Add user message
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}`, taskId, role: 'user', content, timestamp: Date.now(),
    });

    // Save user message to DB
    try {
      await dbService.createChatMessage(taskId, 'user', content, 'user');
    } catch { /* non-critical */ }

    // Move to in-progress if revision
    if (isRevisionMode) {
      await useTaskStore.getState().moveTask(taskId, 'in-progress');
      updateTaskState(get, set, taskId, { status: 'running', startTime: Date.now() });
    }

    const engine = useEngineStore.getState().activeEngine;
    if (!engine) return;

    // Check if we're in a technical conversation thread (for context awareness)
    const lastAssistantMsg = [...existingMessages].reverse().find(m => m.role === 'assistant');
    const inTechnicalThread = lastAssistantMsg && (
      lastAssistantMsg.content.length > 500 ||
      lastAssistantMsg.content.includes('```') ||
      lastAssistantMsg.content.includes('✅ Completed') ||
      /\b(file|code|function|component|implement|summary|endpoint|modal)\b/i.test(lastAssistantMsg.content)
    );

    // Load skill listing and invoked skills
    // Don't treat as small talk if we're in a technical thread (follow-up question)
    const smallTalk = !inTechnicalThread && isSmallTalk(content);

    // DIRECT API FALLBACK for small talk (only if not in technical thread)
    if (smallTalk && !isRevisionMode) {
      const directResponse = await get().sendDirectAPI(content);
      if (directResponse) {
        addMessage(get, set, taskId, {
          id: `msg-${Date.now()}-ai`, taskId, role: 'assistant', content: directResponse, timestamp: Date.now(),
        });
        set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
        
        try {
          await dbService.createChatMessage(taskId, 'assistant', directResponse, 'direct-api');
        } catch { /* non-critical */ }
        return;
      }
    }

    const skillListing = !smallTalk ? await getSkillListing() : '';
    const projectContext = !smallTalk ? await getProjectContext() : '';
    const invokedSkills = get().invokedSkills[taskId] || [];
    const invokedSkillsContent = !smallTalk && invokedSkills.length > 0
      ? invokedSkills.map(s => `--- ${s.name} ---\n${s.content}`).join('\n\n')
      : undefined;

    // AI response placeholder
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: aiMessageId } });

    // Calculate previous chat for context awareness in all modes
    const relevantMessages = existingMessages.filter(m => m.role !== 'system');
    let previousChat = '';
    
    if (relevantMessages.length > 5) {
      const compressed = compressHistory(relevantMessages, 1500);
      previousChat = compressed.summary
        ? `${compressed.summary}\n\n${compressed.recentMessages}`
        : compressed.recentMessages;
    } else if (relevantMessages.length > 0) {
      previousChat = relevantMessages.slice(-5).map(m => {
        let msgContent = m.content;
        const analysisMatch = msgContent.match(/\[IMAGE ANALYSIS\][\s\S]*?\[USER REQUEST\]/);
        if (analysisMatch) {
          msgContent = msgContent.replace(analysisMatch[0], '[Image attached]\n');
        }
        const displayContent = msgContent.substring(0, 500) + (msgContent.length > 500 ? '...[truncated]' : '');
        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${displayContent}`;
      }).join('\n');
    }

    // Build prompt
    let chatPrompt: string;
    const workspaceName = useWorkspaceStore.getState().activeWorkspace?.name || 'this project';
    const miniIdentity = `[IDENTITY] Assistant for Akira. Project: ${workspaceName}.`;

    if (smallTalk) {
      // COMPACT PATH: Still knows who/where it is, but includes recent trace
      chatPrompt = `[CONTEXT AWARE]
${previousChat ? `Recent History:\n${previousChat}\n\n` : ''}${miniIdentity} Briefly answer: ${content}`;
    } else if (isRevisionMode) {
      // Check if rules are already embedded (auto-generated task)
      const hasEmbeddedRules = task?.description?.includes('<!-- auto-rules-embedded -->');
      
      let sysPrompt = '';
      if (!hasEmbeddedRules) {
        try { sysPrompt = useConfigStore.getState().getSystemPrompt(); } catch { /* */ }
      }

      const cleanDesc = task?.description?.replace('<!-- auto-rules-embedded -->', '').trim();

      const skillSection = skillListing ? `\n\n[AVAILABLE SKILLS]\n${skillListing}` : '';
      const invokedSection = invokedSkillsContent ? `\n\n[ACTIVE SKILLS CONTEXT]\n${invokedSkillsContent}` : '';
      const projectSection = projectContext ? `\n\n${projectContext}` : '';

      chatPrompt = `${sysPrompt ? sysPrompt + '\n' : ''}${GLOBAL_RTK_INSTRUCTION}${skillSection}${invokedSection}${projectSection}
      
---

REVISION FOR TASK: "${taskTitle}"
${cleanDesc ? `CONTEXT: ${cleanDesc}` : ''}

${previousChat ? `PREVIOUS CHAT:\n${previousChat}\n` : ''}
USER FEEDBACK:
${content}

Please implement the requested changes. Be concise and use 'rtk' for all terminal commands.`;
    } else {
      const skillSection = skillListing ? `\n\n[AVAILABLE SKILLS]\n${skillListing}` : '';
      const invokedSection = invokedSkillsContent ? `\n\n[ACTIVE SKILLS CONTEXT]\n${invokedSkillsContent}` : '';
      const projectSection = projectContext ? `\n\n${projectContext}` : '';
      
      let sysPrompt = '';
      try { sysPrompt = useConfigStore.getState().getSystemPrompt(); } catch { /* */ }

      chatPrompt = `${sysPrompt ? sysPrompt + '\n' : ''}${GLOBAL_RTK_INSTRUCTION}${skillSection}${invokedSection}${projectSection}

---

TASK: "${taskTitle}"

${previousChat ? `PREVIOUS CHAT:\n${previousChat}\n` : ''}
USER QUESTION:
${content}

Please respond concisely. Use 'rtk' for any commands.`;
    }

    // Inject Dynamic MCP tools for task chat
    const workspace = useWorkspaceStore.getState().activeWorkspace;
    if (workspace) {
      chatPrompt = injectToolsIntoPrompt(chatPrompt, {
        maxTools: 30,
        format: 'compact',
        workspaceId: workspace.id,
      });
      console.log('[DynamicMCP] Tools injected into chat prompt');
    }

    const cwd = getWorkspaceCwd();

    try {
      const result = await runCLIWithStreaming({
        taskId,
        engineAlias: engine.alias,
        binaryPath: engine.binary_path,
        engineArgs: engine.args,
        prompt: chatPrompt,
        cwd,
        mode: smallTalk ? 'minimal' : 'standard',  // Use minimal context for small talk
        onOutput: (text) => {
          appendToMessage(get, set, taskId, aiMessageId, text + '\n');
        },
      });

      // Check for tool calls in response and execute them
      const toolResult = await processToolCallsFromResponse(result.content, taskId);
      
      if (toolResult.hasToolCalls && toolResult.toolResults) {
        // Add tool results as system message - use display format (no AI instructions)
        addMessage(get, set, taskId, {
          id: `msg-${Date.now()}-tools`,
          taskId,
          role: 'system',
          content: toolResult.toolResultsDisplay || toolResult.toolResults,
          timestamp: Date.now(),
        });
        
        // Save tool results to DB
        try {
          await dbService.createChatMessage(taskId, 'system', toolResult.toolResultsDisplay || toolResult.toolResults, 'tool-execution');
        } catch { /* non-critical */ }
      }

      // Save to DB
      if (result.content.trim()) {
        try {
          await dbService.createChatMessage(taskId, 'assistant', result.content.trim(), engine.alias);
        } catch { /* non-critical */ }
      }

      set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });

      // Post-revision: create PR and move back to review
      if (isRevisionMode) {
        updateTaskState(get, set, taskId, {
          status: 'completed', endTime: Date.now(), lastResponse: result.content,
        });
        setTimeout(() => handleTaskCompletion(get, set, taskId, task?.title || taskTitle), 500);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });

      if (isRevisionMode) {
        updateTaskState(get, set, taskId, { status: 'completed' });
        await useTaskStore.getState().moveTask(taskId, 'review');
        await notify('Task Ready for Review ✅', `Task has been moved back to review after revision.`);
      }
    }
  },

  // ── Send Simple Message ─────────────────────────────────────────────

  sendSimpleMessage: async (taskId, prompt, internalPrompt) => {
    const userMessage = {
      id: `msg-${Date.now()}`, taskId, role: 'user' as const, content: prompt, timestamp: Date.now(),
    };
    addMessage(get, set, taskId, userMessage);

    // Save user message to DB
    try {
      await dbService.createChatMessage(taskId, 'user', prompt, 'user');
    } catch { /* non-critical */ }

    const engine = useEngineStore.getState().activeEngine;
    if (!engine) return '';

    // ✅ P2: Query Router - Smart model selection (with context awareness)
    const existingMessages = get().messages[taskId] || [];
    const routing = routeQuery(prompt, existingMessages);
    logRoutingDecision(prompt, routing);
    
    const groqApiKey = useConfigStore.getState().getGroqApiKey();
    
    console.log('[sendSimpleMessage] Query routed:', { 
      tier: routing.tier,
      provider: routing.provider,
      hasGroqKey: !!groqApiKey
    });

    // Show info if routed to Groq but no API key
    if (routing.provider === 'groq' && !groqApiKey) {
      const infoMsg = {
        id: `info-${Date.now()}`,
        taskId,
        role: 'system' as const,
        content: '💡 Hemat token dengan Groq! Buka Settings → Chat API (Groq) untuk mengatur API key (gratis 1M tokens/hari).',
        timestamp: Date.now(),
      };
      addMessage(get, set, taskId, infoMsg);
    }

    // TOKEN SAVER: Use Groq API for instant/fast tiers (FREE!)
    if ((routing.tier === 'instant' || routing.tier === 'fast') && groqApiKey) {
      console.log('[sendSimpleMessage] Small talk detected - using Groq API (FREE)');

      const aiMessageId = `msg-${Date.now()}-ai`;
      addMessage(get, set, taskId, {
        id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
      });
      set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: aiMessageId } });

      try {
        // Use internalPrompt (with tools) if available, otherwise plain prompt
        const systemPrompt = internalPrompt || undefined;
        const groqResult = await sendGroqSmallTalk(groqApiKey, prompt, systemPrompt);

        if (groqResult) {
          const { content, usage, model } = groqResult;
          
          // Log token usage
          console.log(
            `[Groq] ✅ Response: ${usage?.total_tokens || '?'} tokens ` +
            `(prompt: ${usage?.prompt_tokens || '?'}, completion: ${usage?.completion_tokens || '?'}) ` +
            `[Model: ${model}]`
          );

          // Check for tool calls in Groq response and execute them
          const toolResult = await processToolCallsFromResponse(content, taskId);
          
          let finalContent = content;
          if (toolResult.hasToolCalls && toolResult.toolResults) {
            // Add tool results to response
            finalContent = content + '\n\n' + toolResult.toolResults;
            console.log('[Groq] Tool calls executed:', toolResult.hasToolCalls);
          }

          // Build content with token info for display and storage
          const tokenInfo = usage 
            ? ` [${usage.total_tokens} tokens | ${model}]`
            : ` [${model}]`;
          const contentWithTokenInfo = finalContent + tokenInfo;

          // Update message with Groq response (with token info)
          const state = get();
          const taskMessages = state.messages[taskId] || [];
          const updatedMessages = taskMessages.map(m =>
            m.id === aiMessageId ? { ...m, content: contentWithTokenInfo } : m
          );
          set({
            messages: { ...state.messages, [taskId]: updatedMessages },
            streamingMessageId: { ...state.streamingMessageId, [taskId]: null }
          });

          // Save to DB with token metadata
          try {
            await dbService.createChatMessage(
              taskId, 
              'assistant', 
              contentWithTokenInfo, 
              'groq'
            );
          } catch { /* non-critical */ }

          return finalContent;
        }
      } catch (error) {
      console.error('[sendSimpleMessage] Groq failed:', error);
      // Fallback to CLI below
    }

    // Groq failed or not applicable, remove placeholder
    const state = get();
    const taskMessages = state.messages[taskId] || [];
    set({
      messages: {
        ...state.messages,
        [taskId]: taskMessages.filter(m => m.id !== aiMessageId)
      }
    });
  }

  // Fallback to CLI for standard/deep tiers or if Groq failed
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: aiMessageId } });

    const cwd = getWorkspaceCwd();

    try {
      const result = await runCLIWithStreaming({
        taskId,
        engineAlias: engine.alias,
        binaryPath: engine.binary_path,
        engineArgs: engine.args,
        prompt: internalPrompt || prompt,
        cwd,
        mode: (routing.tier === 'instant' || routing.tier === 'fast') ? 'minimal' : 'standard',
        onOutput: (text) => {
          appendToMessage(get, set, taskId, aiMessageId, text + '\n');
        },
      });

      // Check for tool calls in response and execute them
      const toolResult = await processToolCallsFromResponse(result.content, taskId);
      
      if (toolResult.hasToolCalls && toolResult.toolResults) {
        // Add tool results as system message - use display format (no AI instructions)
        addMessage(get, set, taskId, {
          id: `msg-${Date.now()}-tools`,
          taskId,
          role: 'system',
          content: toolResult.toolResultsDisplay || toolResult.toolResults,
          timestamp: Date.now(),
        });
        
        // Save tool results to DB
        try {
          await dbService.createChatMessage(taskId, 'system', toolResult.toolResultsDisplay || toolResult.toolResults, 'tool-execution');
        } catch { /* non-critical */ }
      }

      if (result.content.trim()) {
        try {
          await dbService.createChatMessage(taskId, 'assistant', result.content.trim(), engine.alias);
        } catch { /* non-critical */ }
      }

      set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
      return result.content;
    } catch (error) {
      console.error('Error in sendSimpleMessage:', error);
      set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
      return '';
    }
  },

  // ── Send Direct API (Small Talk Bypass) ──────────────────────────

  sendDirectAPI: async (prompt) => {
    const config = useConfigStore.getState().config;
    const apiKey = config?.google_api_key;
    if (!apiKey) {
      console.log('[DirectAPI] No API key available');
      return '';
    }

    // Try multiple models in order of preference
    const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    
    for (const model of models) {
      try {
        console.log(`[DirectAPI] Trying model: ${model}`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Answer very briefly (max 1 sentence): ${prompt}` }] }],
            generationConfig: { 
              maxOutputTokens: 100,
              temperature: 0.1
            }
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.warn(`[DirectAPI] ${model} failed:`, response.status, errorData.error?.message);
          continue; // Try next model
        }
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
          console.log(`[DirectAPI] Success with ${model}`);
          return text.trim();
        }
      } catch (err) {
        console.warn(`[DirectAPI] ${model} error:`, err);
        continue; // Try next model
      }
    }
    
    console.error('[DirectAPI] All models failed');
    return '';
  },

  // ── Message Management ──────────────────────────────────────────────

  stopMessage: async (taskId) => {
    try {
      await invoke('stop_cli');
      const { messages } = get();
      const taskMessages = messages[taskId] || [];
      if (taskMessages.length > 0) {
        const last = taskMessages[taskMessages.length - 1];
        if (last.role === 'assistant' && last.content === '') {
          set({ messages: { ...messages, [taskId]: taskMessages.slice(0, -1) } });
        }
      }
    } catch (error) {
      console.error('Error stopping CLI:', error);
    }
  },

  clearMessages: (taskId) => {
    const { messages } = get();
    const updated = { ...messages };
    delete updated[taskId];
    set({ messages: updated });
  },

  getMessages: (taskId) => get().messages[taskId] || [],

  setMessages: (taskId, msgs) => {
    set({ messages: { ...get().messages, [taskId]: msgs } });
  },

  getTaskState: (taskId) => get().taskStates[taskId] || defaultTaskState(),

  isStreaming: (taskId) => get().taskStates[taskId]?.status === 'running' || false,

  setUseRouter: (useRouter) => set({ useRouter }),

  setRouterProvider: (provider) => set({ routerProvider: provider }),

  // ── Tool Call Management ──────────────────────────────────────────────

  addToolCall: (taskId, toolCall) => {
    set((state) => {
      const taskState = state.taskStates[taskId] || defaultTaskState();
      return {
        taskStates: {
          ...state.taskStates,
          [taskId]: {
            ...taskState,
            toolCalls: [...taskState.toolCalls, toolCall],
          },
        },
      };
    });
  },

  updateToolCall: (taskId, toolCallId, updates) => {
    set((state) => {
      const taskState = state.taskStates[taskId];
      if (!taskState) return state;

      return {
        taskStates: {
          ...state.taskStates,
          [taskId]: {
            ...taskState,
            toolCalls: taskState.toolCalls.map((tc) =>
              tc.id === toolCallId ? { ...tc, ...updates } : tc
            ),
          },
        },
      };
    });
  },

  getToolCalls: (taskId) => {
    const state = get();
    return state.taskStates[taskId]?.toolCalls || [];
  },

  clearToolCalls: (taskId) => {
    set((state) => {
      const taskState = state.taskStates[taskId];
      if (!taskState) return state;

      return {
        taskStates: {
          ...state.taskStates,
          [taskId]: {
            ...taskState,
            toolCalls: [],
          },
        },
      };
    });
  },

  clearTaskState: (taskId) => {
    set((state) => {
      const { taskStates, messages, invokedSkills } = state;
      const updated = { ...taskStates };
      delete updated[taskId];
      const updatedMessages = { ...messages };
      delete updatedMessages[taskId];
      const updatedSkills = { ...invokedSkills };
      delete updatedSkills[taskId];
      return {
        taskStates: updated,
        messages: updatedMessages,
        invokedSkills: updatedSkills,
      };
    });
  },
}));
