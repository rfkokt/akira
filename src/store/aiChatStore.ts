import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useEngineStore } from './engineStore';
import { useTaskStore } from './taskStore';
import { useWorkspaceStore } from './workspaceStore';
import { useConfigStore } from './configStore';
import { dbService } from '@/lib/db';
import { runCLIWithStreaming } from '@/lib/cli';
import { autoCreatePR } from '@/lib/git';
import {
  extractFileInfo,
  saveRunningTask,
  clearRunningTask,
  getSavedRunningTask as getSavedTask,
  type SavedTask,
} from '@/lib/helpers';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export type AITaskStatus = 'idle' | 'queued' | 'running' | 'completed' | 'error';

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
}

interface TaskQueueItem {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
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
  stopStreaming: (taskId: string) => void;

  // Actions
  enqueueTask: (taskId: string, taskTitle: string, taskDescription?: string) => Promise<void>;
  processQueue: () => Promise<void>;
  runAITask: (taskId: string, taskTitle: string, taskDescription?: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  sendMessage: (taskId: string, content: string) => Promise<void>;
  sendSimpleMessage: (taskId: string, prompt: string) => Promise<string>;
  stopMessage: (taskId: string) => Promise<void>;
  clearMessages: (taskId: string) => void;
  getMessages: (taskId: string) => ChatMessage[];
  setMessages: (taskId: string, msgs: ChatMessage[]) => void;
  getTaskState: (taskId: string) => AITaskState;
  isStreaming: (taskId: string) => boolean;
  setUseRouter: (useRouter: boolean) => void;
  setRouterProvider: (provider: string | null) => void;
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

/** Build system prompt with task context */
function buildTaskPrompt(taskTitle: string, taskDescription?: string): string {
  const { getSystemPrompt } = useConfigStore.getState();
  let systemPrompt = '';
  try { systemPrompt = getSystemPrompt(); } catch { /* no config */ }

  return `${systemPrompt ? systemPrompt + '\n\n---\n\n' : ''}I need you to implement this task:

Title: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}

Please:
1. Analyze what needs to be done
2. Implement the necessary code changes
3. Explain what you did

Start working on this now.`;
}

/** Post-task completion: capture diff, create PR, move to review */
async function handleTaskCompletion(
  get: () => AIChatState,
  set: (s: Partial<AIChatState>) => void,
  taskId: string,
  taskTitle: string,
) {
  const cwd = getWorkspaceCwd();
  if (!cwd) {
    await useTaskStore.getState().moveTask(taskId, 'review');
    return;
  }

  const prResult = await autoCreatePR(taskId, taskTitle, cwd);

  // Capture diff snapshot
  try {
    const diffResult = await invoke<{ diff: string; has_changes: boolean }>('git_get_diff', { cwd });
    if (diffResult.has_changes) {
      await dbService.updateTaskDiffInfo(taskId, diffResult.diff, new Date().toISOString());
    }
  } catch (e) {
    console.error('[AI] Failed to capture diff:', e);
  }

  // Add result message
  const resultContent = prResult
    ? prResult.prUrl
      ? `✅ **Task completed and branch pushed!**\n\nBranch: \`${prResult.branch}\`\n\n[Click here to create PR](${prResult.prUrl})\n\nOr run: git checkout ${prResult.branch}`
      : `✅ **Task completed and branch pushed!**\n\nBranch: \`${prResult.branch}\`\n\nCreate PR manually from your git provider.`
    : `⚠️ **Task completed but PR automation failed**\n\nAI finished the task but could not automatically push to remote.\n\n${get().taskStates[taskId]?.prError ? `**Error:** ${get().taskStates[taskId]?.prError}\n\n` : ''}You can:\n1. Check git configuration\n2. Create branch and PR manually\n3. Or use "View Diff" to see changes\n\nTask moved to **Review** for manual handling.`;

  addMessage(get, set, taskId, {
    id: crypto.randomUUID(),
    taskId,
    role: 'system',
    content: resultContent,
    timestamp: Date.now(),
  });

  if (prResult) {
    updateTaskState(get, set, taskId, {
      prBranch: prResult.branch,
      prUrl: prResult.prUrl,
      prCreatedAt: Date.now(),
    });
  }

  await useTaskStore.getState().moveTask(taskId, 'review');
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

  stopStreaming: (taskId) => {
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
  },

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

    // System message
    addMessage(get, set, taskId, {
      id: `msg-${startTime}-system`, taskId, role: 'system',
      content: `🚀 Starting AI workflow for: "${taskTitle}"`,
      timestamp: startTime,
    });
    updateTaskState(get, set, taskId, { status: 'running', startTime });

    // AI response placeholder
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });

    const prompt = buildTaskPrompt(taskTitle, taskDescription);
    const cwd = getWorkspaceCwd();
    let responseContent = '';

    try {
      const result = await runCLIWithStreaming({
        engineAlias: engine.alias,
        binaryPath: engine.binary_path,
        engineArgs: engine.args,
        prompt,
        cwd,
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

    // Detect revision mode
    const task = useTaskStore.getState().tasks.find(t => t.id === taskId);
    const isRevisionMode = task?.status === 'review' || task?.status === 'in-progress';

    // Add user message
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}`, taskId, role: 'user', content, timestamp: Date.now(),
    });

    // Move to in-progress if revision
    if (isRevisionMode) {
      await useTaskStore.getState().moveTask(taskId, 'in-progress');
      updateTaskState(get, set, taskId, { status: 'running', startTime: Date.now() });
    }

    const engine = useEngineStore.getState().activeEngine;
    if (!engine) return;

    // AI response placeholder
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: aiMessageId } });

    // Build prompt
    let chatPrompt: string;
    if (isRevisionMode) {
      const { getSystemPrompt } = useConfigStore.getState();
      let sysPrompt = '';
      try { sysPrompt = getSystemPrompt(); } catch { /* */ }

      const recent = existingMessages
        .filter(m => m.role !== 'system').slice(-10)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.substring(0, 500)}`)
        .join('\n');

      chatPrompt = `${sysPrompt ? sysPrompt + '\n\n---\n\n' : ''}You are currently working on a task: "${taskTitle}"
${task?.description ? `Task description: ${task.description}` : ''}

Previous conversation context:
${recent}

The user has reviewed your work and is requesting the following revision:

${content}

Please implement the requested changes now. Modify the code directly.`;
    } else {
      chatPrompt = `You are helping with a task called "${taskTitle}".

Previous conversation:
${existingMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

User's new question: ${content}

Please respond helpfully and concisely.`;
    }

    const cwd = getWorkspaceCwd();

    try {
      const result = await runCLIWithStreaming({
        engineAlias: engine.alias,
        binaryPath: engine.binary_path,
        engineArgs: engine.args,
        prompt: chatPrompt,
        cwd,
        onOutput: (text) => {
          appendToMessage(get, set, taskId, aiMessageId, text + '\n');
        },
      });

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
      }
    }
  },

  // ── Send Simple Message ─────────────────────────────────────────────

  sendSimpleMessage: async (taskId, prompt) => {
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}`, taskId, role: 'user', content: prompt, timestamp: Date.now(),
    });

    const engine = useEngineStore.getState().activeEngine;
    if (!engine) return '';

    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: aiMessageId } });

    const cwd = getWorkspaceCwd();

    try {
      const result = await runCLIWithStreaming({
        engineAlias: engine.alias,
        binaryPath: engine.binary_path,
        engineArgs: engine.args,
        prompt,
        cwd,
        onOutput: (text) => {
          appendToMessage(get, set, taskId, aiMessageId, text + '\n');
        },
      });

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
}));
