import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useTaskStore } from './taskStore';
import { useConfigStore } from './configStore';
import { dbService } from '@/lib/db';
import {
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

function addMessage(get: () => AIChatState, set: (s: Partial<AIChatState>) => void, taskId: string, msg: ChatMessage) {
  const { messages } = get();
  set({ messages: { ...messages, [taskId]: [...(messages[taskId] || []), msg] } });
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

// ─── Store ──────────────────────────────────────────────────────────────

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: {},
  taskStates: {},
  taskQueue: [],
  currentRunningTask: null,
  isProcessingQueue: false,
  useRouter: false,
  routerProvider: null,
  currentSessionId: null,
  streamingMessageId: {},
  invokedSkills: {},

  stopStreaming: (taskId) => {
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
  },

  // ── Queue Management ──────────────────────────────────────────────────

  enqueueTask: async (taskId, taskTitle, taskDescription) => {
    const { taskQueue } = get();
    
    if (taskQueue.some(item => item.taskId === taskId)) return;
    
    const newQueue = [...taskQueue, { taskId, taskTitle, taskDescription }];
    set({ taskQueue: newQueue });
    
    updateTaskState(get, set, taskId, { 
      status: 'queued', 
      queuePosition: newQueue.length 
    });

    await useTaskStore.getState().moveTask(taskId, 'in-progress');
    
    if (!get().isProcessingQueue) {
      get().processQueue();
    }
  },

  processQueue: async () => {
    const { taskQueue, isProcessingQueue } = get();
    if (isProcessingQueue || taskQueue.length === 0) return;

    set({ isProcessingQueue: true });
    const nextItem = taskQueue[0];
    const remainingQueue = taskQueue.slice(1);
    set({ taskQueue: remainingQueue, currentRunningTask: nextItem.taskId });

    // Update queue positions
    remainingQueue.forEach((item, idx) => {
      updateTaskState(get, set, item.taskId, { queuePosition: idx + 1 });
    });

    saveRunningTask(nextItem.taskId, nextItem.taskTitle);

    try {
      await get().runAITask(nextItem.taskId, nextItem.taskTitle, nextItem.taskDescription);
    } catch (error) {
      console.error('[AIChat] Task execution failed:', error);
      updateTaskState(get, set, nextItem.taskId, { 
        status: 'error', 
        errorMessage: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    set({ currentRunningTask: null, isProcessingQueue: false });
    clearRunningTask();
    setTimeout(() => get().processQueue(), 100);
  },

  // ── Run AI Task (Legacy - now handled by Pi) ──────────────────────────

  runAITask: async (taskId, taskTitle, _taskDescription) => {
    // Legacy CLI-based AI execution removed.
    // Task execution is now handled by the Pi backend via piStore.
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}-system`, taskId, role: 'system',
      content: `🚀 Task "${taskTitle}" queued. Use the Pi chat panel to execute tasks.`,
      timestamp: Date.now(),
    });
    updateTaskState(get, set, taskId, { status: 'completed', endTime: Date.now() });
  },

  retryTask: async (taskId) => {
    const taskState = get().taskStates[taskId];
    if (!taskState) return;

    updateTaskState(get, set, taskId, { 
      status: 'idle', 
      errorMessage: null, 
      endTime: null 
    });

    const task = useTaskStore.getState().tasks.find(t => t.id === taskId);
    if (task) {
      await get().enqueueTask(taskId, task.title, task.description || undefined);
    }
  },

  // ── Send Message (Legacy - kept for compatibility) ────────────────────

  sendMessage: async (taskId, content) => {
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}`, taskId, role: 'user', content, timestamp: Date.now(),
    });

    try {
      await dbService.createChatMessage(taskId, 'user', content, 'user');
    } catch { /* non-critical */ }

    // Legacy engine-based messaging removed.
    // Messages are now handled by Pi via piStore.sendMessage()
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}-system`, taskId, role: 'system',
      content: 'Use the Pi chat panel for AI interactions.',
      timestamp: Date.now(),
    });
  },

  // ── Send Simple Message (Legacy - kept for analyze project) ───────────

  sendSimpleMessage: async (taskId, prompt, _internalPrompt) => {
    addMessage(get, set, taskId, {
      id: `msg-${Date.now()}`, taskId, role: 'user', content: prompt, timestamp: Date.now(),
    });

    try {
      await dbService.createChatMessage(taskId, 'user', prompt, 'user');
    } catch { /* non-critical */ }

    // Try direct API (Google Gemini) for simple messages
    const directResponse = await get().sendDirectAPI(prompt);
    if (directResponse) {
      addMessage(get, set, taskId, {
        id: `msg-${Date.now()}-ai`, taskId, role: 'assistant', content: directResponse, timestamp: Date.now(),
      });
      try {
        await dbService.createChatMessage(taskId, 'assistant', directResponse, 'direct-api');
      } catch { /* non-critical */ }
      return directResponse;
    }

    return '';
  },

  // ── Send Direct API (Google Gemini) ───────────────────────────────────

  sendDirectAPI: async (prompt) => {
    const config = useConfigStore.getState().config;
    const apiKey = config?.google_api_key;
    if (!apiKey) {
      console.log('[DirectAPI] No API key available');
      return '';
    }

    const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    
    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              maxOutputTokens: 4096,
              temperature: 0.3
            }
          })
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) return text.trim();
      } catch {
        continue;
      }
    }
    
    return '';
  },

  // ── Message Management ──────────────────────────────────────────────

  stopMessage: async (taskId) => {
    try {
      await invoke('stop_cli');
      set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: null } });
    } catch (error) {
      console.error('Failed to stop message:', error);
    }
  },

  clearMessages: (taskId) => {
    const { messages } = get();
    set({ messages: { ...messages, [taskId]: [] } });
  },

  getMessages: (taskId) => get().messages[taskId] || [],

  setMessages: (taskId, msgs) => {
    const { messages } = get();
    set({ messages: { ...messages, [taskId]: msgs } });
  },

  getTaskState: (taskId) => get().taskStates[taskId] || defaultTaskState(),

  isStreaming: (taskId) => get().streamingMessageId[taskId] != null,

  setUseRouter: (useRouter) => set({ useRouter }),

  setRouterProvider: (provider) => set({ routerProvider: provider }),

  addInvokedSkill: (taskId, skill) => {
    const { invokedSkills } = get();
    const existing = invokedSkills[taskId] || [];
    if (existing.some(s => s.name === skill.name)) return;
    set({ invokedSkills: { ...invokedSkills, [taskId]: [...existing, skill] } });
  },

  getInvokedSkills: (taskId) => get().invokedSkills[taskId] || [],

  // ── Tool Call Actions ─────────────────────────────────────────────────

  addToolCall: (taskId, toolCall) => {
    const { taskStates } = get();
    const state = taskStates[taskId] || defaultTaskState();
    updateTaskState(get, set, taskId, {
      toolCalls: [...state.toolCalls, toolCall],
    });
  },

  updateToolCall: (taskId, toolCallId, updates) => {
    const { taskStates } = get();
    const state = taskStates[taskId] || defaultTaskState();
    const updatedCalls = state.toolCalls.map(tc =>
      tc.id === toolCallId ? { ...tc, ...updates } : tc
    );
    updateTaskState(get, set, taskId, { toolCalls: updatedCalls });
  },

  getToolCalls: (taskId) => (get().taskStates[taskId] || defaultTaskState()).toolCalls,

  clearToolCalls: (taskId) => {
    updateTaskState(get, set, taskId, { toolCalls: [] });
  },

  clearTaskState: (taskId) => {
    const { taskStates } = get();
    const newStates = { ...taskStates };
    delete newStates[taskId];
    set({ taskStates: newStates });
  },
}));
