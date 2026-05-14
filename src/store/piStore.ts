import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  PiChatMessage,
  PiEvent,
  PiEventPayload,
  PiModel,
  PiSessionState,
  SessionStats,
  TaskSuggestion,
  ToolExecution,
} from '@/lib/pi/types';

// ─── Constants ──────────────────────────────────────────────────────────

const LOCAL_STORAGE_MODEL_KEY = 'pi_selected_model';

// ─── Store Interface ────────────────────────────────────────────────────

interface PiStoreState {
  // Global state
  piStatus: 'disconnected' | 'verifying' | 'connected' | 'auth_error' | 'error';
  piError: string | null;
  availableModels: PiModel[];
  activeModel: string | null;
  persistedModel: string | null;

  // Per-task state
  taskSessions: Record<string, PiSessionState>;

  // Task creation session
  taskCreationSession: {
    messages: PiChatMessage[];
    isStreaming: boolean;
    sessionId: string;
  } | null;

  // Actions
  checkAuth: () => Promise<void>;
  fetchModels: () => Promise<void>;
  setModel: (modelId: string) => Promise<void>;

  sendMessage: (taskId: string, content: string) => Promise<void>;
  sendSteer: (taskId: string, content: string) => Promise<void>;
  abort: (taskId: string) => Promise<void>;
  getSessionStats: (taskId: string) => Promise<void>;

  // Task creation
  startTaskCreation: () => void;
  sendTaskCreationMessage: (content: string) => Promise<void>;
  confirmTaskCreation: (task: TaskSuggestion) => Promise<void>;
  endTaskCreation: () => void;

  // Internal event handler
  handlePiEvent: (taskId: string, event: PiEvent) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function defaultSessionState(): PiSessionState {
  return {
    sessionId: null,
    isStreaming: false,
    isCompacting: false,
    messages: [],
    currentThinking: '',
    toolExecutions: [],
    sessionStats: null,
    error: null,
  };
}

function getOrCreateSession(
  taskSessions: Record<string, PiSessionState>,
  taskId: string
): PiSessionState {
  return taskSessions[taskId] || defaultSessionState();
}

// ─── Store ──────────────────────────────────────────────────────────────

export const usePiStore = create<PiStoreState>()(
  devtools(
    (set, get) => ({
      // Initial state
      piStatus: 'disconnected',
      piError: null,
      availableModels: [],
      activeModel: null,
      persistedModel: localStorage.getItem(LOCAL_STORAGE_MODEL_KEY),
      taskSessions: {},
      taskCreationSession: null,

      // ── Auth ────────────────────────────────────────────────────────

      checkAuth: async () => {
        set({ piStatus: 'verifying', piError: null });
        try {
          await invoke('pi_check_auth');
          set({ piStatus: 'connected' });
        } catch (error) {
          const errorMsg = String(error);
          if (errorMsg.toLowerCase().includes('auth')) {
            set({ piStatus: 'auth_error', piError: errorMsg });
          } else {
            set({ piStatus: 'error', piError: errorMsg });
          }
        }
      },

      // ── Models ──────────────────────────────────────────────────────

      fetchModels: async () => {
        try {
          await invoke('pi_get_models', { taskId: '__global__' });
          // Response comes via pi-event as models_response
        } catch (error) {
          set({ piError: String(error) });
        }
      },

      setModel: async (modelId: string) => {
        const previousModel = get().activeModel;
        set({ activeModel: modelId });

        try {
          await invoke('pi_set_model', { taskId: '__global__', model: modelId });
          // Persist to localStorage on success
          localStorage.setItem(LOCAL_STORAGE_MODEL_KEY, modelId);
          set({ persistedModel: modelId });
        } catch (error) {
          // Revert on failure
          set({ activeModel: previousModel, piError: String(error) });
        }
      },

      // ── Messaging ───────────────────────────────────────────────────

      sendMessage: async (taskId: string, content: string) => {
        const { taskSessions } = get();
        const session = getOrCreateSession(taskSessions, taskId);

        // Create user message
        const userMessage: PiChatMessage = {
          id: crypto.randomUUID(),
          taskId,
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        // Add user message to session
        set({
          taskSessions: {
            ...taskSessions,
            [taskId]: {
              ...session,
              messages: [...session.messages, userMessage],
              error: null,
            },
          },
        });

        try {
          await invoke('pi_send_prompt', { taskId, message: content });
        } catch (error) {
          const updatedSessions = get().taskSessions;
          const updatedSession = getOrCreateSession(updatedSessions, taskId);
          set({
            taskSessions: {
              ...updatedSessions,
              [taskId]: {
                ...updatedSession,
                error: String(error),
              },
            },
          });
        }
      },

      sendSteer: async (taskId: string, content: string) => {
        const { taskSessions } = get();
        const session = getOrCreateSession(taskSessions, taskId);

        // Create steer message
        const steerMessage: PiChatMessage = {
          id: crypto.randomUUID(),
          taskId,
          role: 'steer',
          content,
          timestamp: Date.now(),
        };

        // Add steer message to session
        set({
          taskSessions: {
            ...taskSessions,
            [taskId]: {
              ...session,
              messages: [...session.messages, steerMessage],
              error: null,
            },
          },
        });

        try {
          await invoke('pi_send_steer', { taskId, message: content });
        } catch (error) {
          const updatedSessions = get().taskSessions;
          const updatedSession = getOrCreateSession(updatedSessions, taskId);
          set({
            taskSessions: {
              ...updatedSessions,
              [taskId]: {
                ...updatedSession,
                error: String(error),
              },
            },
          });
        }
      },

      abort: async (taskId: string) => {
        try {
          await invoke('pi_abort', { taskId });
          // Mark streaming as ended
          const { taskSessions } = get();
          const session = getOrCreateSession(taskSessions, taskId);
          set({
            taskSessions: {
              ...taskSessions,
              [taskId]: {
                ...session,
                isStreaming: false,
              },
            },
          });
        } catch (error) {
          const { taskSessions } = get();
          const session = getOrCreateSession(taskSessions, taskId);
          set({
            taskSessions: {
              ...taskSessions,
              [taskId]: {
                ...session,
                error: String(error),
              },
            },
          });
        }
      },

      getSessionStats: async (taskId: string) => {
        try {
          await invoke('pi_get_session_stats', { taskId });
          // Response comes via pi-event as session_stats
        } catch (error) {
          // Mark stats as stale on failure
          const { taskSessions } = get();
          const session = getOrCreateSession(taskSessions, taskId);
          if (session.sessionStats) {
            set({
              taskSessions: {
                ...taskSessions,
                [taskId]: {
                  ...session,
                  sessionStats: { ...session.sessionStats, isStale: true },
                },
              },
            });
          }
        }
      },

      // ── Task Creation ───────────────────────────────────────────────

      startTaskCreation: () => {
        set({
          taskCreationSession: {
            messages: [],
            isStreaming: false,
            sessionId: crypto.randomUUID(),
          },
        });
      },

      sendTaskCreationMessage: async (content: string) => {
        const { taskCreationSession } = get();
        if (!taskCreationSession) return;

        const userMessage: PiChatMessage = {
          id: crypto.randomUUID(),
          taskId: taskCreationSession.sessionId,
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        const isFirstMessage = taskCreationSession.messages.filter(m => m.role === 'user').length === 0;

        set({
          taskCreationSession: {
            ...taskCreationSession,
            messages: [...taskCreationSession.messages, userMessage],
            isStreaming: true,
          },
        });

        try {
          // Ensure Pi subprocess is spawned for this task creation session
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
          const workspacePath = activeWorkspace?.folder_path || '.';

          // Try to spawn — if already running, this will be handled gracefully
          try {
            await invoke('pi_spawn', {
              taskId: taskCreationSession.sessionId,
              workspacePath,
              sessionId: null,
            });
          } catch (spawnErr) {
            const errStr = String(spawnErr);
            if (!errStr.includes('already') && !errStr.includes('running')) {
              throw spawnErr;
            }
          }

          // Only inject system prompt on the first message — Pi session persists context
          let message = content;
          if (isFirstMessage) {
            const systemPrompt = `You are a friendly task creation assistant in a project management app called Akira. Help the user describe their task clearly. When you have enough information to create a structured task, respond with ONLY a JSON block in this format:
\`\`\`json
{"title": "<concise title, max 100 chars>", "description": "<detailed description, max 2500 chars>", "priority": "<high|medium|low>"}
\`\`\`

If the user's message is just a greeting or unclear, respond conversationally in their language — ask what they need help with. Do NOT output JSON unless you can extract a clear task. Keep responses short and helpful.

User's message: ${content}`;
            message = systemPrompt;
          }

          await invoke('pi_send_prompt', {
            taskId: taskCreationSession.sessionId,
            message,
          });
        } catch (error) {
          const session = get().taskCreationSession;
          if (session) {
            set({
              taskCreationSession: {
                ...session,
                isStreaming: false,
              },
            });
          }
        }
      },

      confirmTaskCreation: async (_task: TaskSuggestion) => {
        // Task creation is handled by the caller (e.g., creating the task in the task store)
        // This action just signals confirmation and ends the session
        get().endTaskCreation();
      },

      endTaskCreation: () => {
        const session = get().taskCreationSession;
        if (session) {
          // Terminate the Pi subprocess for this session
          invoke('pi_terminate', { taskId: session.sessionId }).catch(() => {});
        }
        set({ taskCreationSession: null });
      },

      // ── Event Handler ───────────────────────────────────────────────

      handlePiEvent: (taskId: string, event: PiEvent) => {
        const { taskSessions, taskCreationSession } = get();

        // Check if this event is for the task creation session
        if (taskCreationSession && taskId === taskCreationSession.sessionId) {
          handleTaskCreationEvent(get, set, event);
          return;
        }

        const session = getOrCreateSession(taskSessions, taskId);

        switch (event.type) {
          case 'agent_start': {
            // Create a new assistant message placeholder
            const assistantMessage: PiChatMessage = {
              id: crypto.randomUUID(),
              taskId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolExecutions: [],
            };

            set({
              taskSessions: {
                ...taskSessions,
                [taskId]: {
                  ...session,
                  isStreaming: true,
                  error: null,
                  messages: [...session.messages, assistantMessage],
                  currentThinking: '',
                  toolExecutions: [],
                },
              },
            });
            break;
          }

          case 'agent_end': {
            set({
              taskSessions: {
                ...get().taskSessions,
                [taskId]: {
                  ...getOrCreateSession(get().taskSessions, taskId),
                  isStreaming: false,
                },
              },
            });
            break;
          }

          case 'message_update': {
            // Property 6: Discard streaming events if not in streaming state
            if (!session.isStreaming) {
              console.warn(`[piStore] Discarding message_update for task ${taskId}: not in streaming state`);
              return;
            }

            const currentSession = getOrCreateSession(get().taskSessions, taskId);
            const messages = [...currentSession.messages];
            const lastMsg = messages[messages.length - 1];

            if (lastMsg && lastMsg.role === 'assistant') {
              const updatedMsg = { ...lastMsg };
              let newThinking = currentSession.currentThinking;

              // Extract delta from the nested assistantMessageEvent (comes as raw JSON object)
              const ame = event.assistantMessageEvent as { type?: string; delta?: string } | null | undefined;
              if (ame) {
                if (ame.type === 'text_delta' && ame.delta) {
                  updatedMsg.content = (updatedMsg.content || '') + ame.delta;
                } else if (ame.type === 'thinking_delta' && ame.delta) {
                  newThinking = newThinking + ame.delta;
                  updatedMsg.thinking = newThinking;
                }
              }

              messages[messages.length - 1] = updatedMsg;

              set({
                taskSessions: {
                  ...get().taskSessions,
                  [taskId]: {
                    ...currentSession,
                    messages,
                    currentThinking: newThinking,
                  },
                },
              });
            }
            break;
          }

          case 'tool_execution_start': {
            // Property 6: Discard streaming events if not in streaming state
            if (!session.isStreaming) {
              console.warn(`[piStore] Discarding tool_execution_start for task ${taskId}: not in streaming state`);
              return;
            }

            const newTool: ToolExecution = {
              id: event.tool_call_id || crypto.randomUUID(),
              toolName: event.tool_name || 'unknown',
              status: 'running',
            };

            const currentSession2 = getOrCreateSession(get().taskSessions, taskId);
            set({
              taskSessions: {
                ...get().taskSessions,
                [taskId]: {
                  ...currentSession2,
                  toolExecutions: [...currentSession2.toolExecutions, newTool],
                },
              },
            });
            break;
          }

          case 'tool_execution_update': {
            // Property 6: Discard streaming events if not in streaming state
            if (!session.isStreaming) {
              console.warn(`[piStore] Discarding tool_execution_update for task ${taskId}: not in streaming state`);
              return;
            }

            const currentSession3 = getOrCreateSession(get().taskSessions, taskId);
            const tools = [...currentSession3.toolExecutions];
            if (tools.length > 0) {
              const lastTool = { ...tools[tools.length - 1] };
              lastTool.statusText = event.partial_result ? JSON.stringify(event.partial_result).substring(0, 200) : undefined;
              tools[tools.length - 1] = lastTool;
            }

            set({
              taskSessions: {
                ...get().taskSessions,
                [taskId]: {
                  ...currentSession3,
                  toolExecutions: tools,
                },
              },
            });
            break;
          }

          case 'tool_execution_end': {
            // Property 6: Discard streaming events if not in streaming state
            if (!session.isStreaming) {
              console.warn(`[piStore] Discarding tool_execution_end for task ${taskId}: not in streaming state`);
              return;
            }

            const currentSession4 = getOrCreateSession(get().taskSessions, taskId);
            const toolExecs = [...currentSession4.toolExecutions];
            if (toolExecs.length > 0) {
              const lastTool = { ...toolExecs[toolExecs.length - 1] };
              lastTool.status = event.is_error ? 'error' : 'success';
              lastTool.result = event.result ? JSON.stringify(event.result).substring(0, 2000) : undefined;
              toolExecs[toolExecs.length - 1] = lastTool;
            }

            // Also attach tool executions to the current assistant message
            const msgs = [...currentSession4.messages];
            const lastAssistantMsg = msgs[msgs.length - 1];
            if (lastAssistantMsg && lastAssistantMsg.role === 'assistant') {
              msgs[msgs.length - 1] = {
                ...lastAssistantMsg,
                toolExecutions: [...toolExecs],
              };
            }

            set({
              taskSessions: {
                ...get().taskSessions,
                [taskId]: {
                  ...currentSession4,
                  toolExecutions: toolExecs,
                  messages: msgs,
                },
              },
            });
            break;
          }

          case 'response': {
            // Handle command responses (get_available_models, get_session_stats, etc.)
            if (event.command === 'get_available_models' && event.success && event.data) {
              const data = event.data as { models?: PiModel[]; };
              if (data.models) {
                const { persistedModel } = get();
                const models = data.models;
                let activeModel = models.length > 0 ? models[0].id : null;

                if (persistedModel && models.find((m: PiModel) => m.id === persistedModel)) {
                  activeModel = persistedModel;
                }

                set({
                  availableModels: models,
                  activeModel,
                  persistedModel: activeModel,
                  piStatus: 'connected',
                });
              }
            } else if (event.command === 'get_session_stats' && event.success && event.data) {
              const data = event.data as { tokens?: { total?: number }; contextUsage?: { percent?: number } };
              const stats: SessionStats = {
                tokensUsed: data.tokens?.total || 0,
                contextWindowPct: (data.contextUsage?.percent || 0) / 100,
                isStale: false,
              };

              const currentSession5 = getOrCreateSession(get().taskSessions, taskId);
              set({
                taskSessions: {
                  ...get().taskSessions,
                  [taskId]: {
                    ...currentSession5,
                    sessionStats: stats,
                  },
                },
              });
            } else if (!event.success && event.error) {
              // Command failed
              const currentSession6 = getOrCreateSession(get().taskSessions, taskId);
              set({
                taskSessions: {
                  ...get().taskSessions,
                  [taskId]: {
                    ...currentSession6,
                    error: event.error,
                  },
                },
              });
            }
            break;
          }

          case 'compaction_start': {
            const currentSession7 = getOrCreateSession(get().taskSessions, taskId);
            set({
              taskSessions: {
                ...get().taskSessions,
                [taskId]: {
                  ...currentSession7,
                  isCompacting: true,
                },
              },
            });
            break;
          }

          case 'compaction_end': {
            const currentSession8 = getOrCreateSession(get().taskSessions, taskId);
            set({
              taskSessions: {
                ...get().taskSessions,
                [taskId]: {
                  ...currentSession8,
                  isCompacting: false,
                },
              },
            });
            // Request updated session stats after compaction
            get().getSessionStats(taskId);
            break;
          }

          case 'auto_retry_start': {
            // Could set a retrying flag if needed by UI
            break;
          }

          case 'auto_retry_end': {
            // Could clear a retrying flag if needed by UI
            break;
          }
        }
      },
    }),
    { name: 'pi-store' }
  )
);

// ─── Task Creation Event Handler ────────────────────────────────────────

function handleTaskCreationEvent(
  get: () => PiStoreState,
  set: (state: Partial<PiStoreState>) => void,
  event: PiEvent
) {
  const session = get().taskCreationSession;
  if (!session) return;

  switch (event.type) {
    case 'agent_start': {
      const assistantMessage: PiChatMessage = {
        id: crypto.randomUUID(),
        taskId: session.sessionId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      set({
        taskCreationSession: {
          ...session,
          isStreaming: true,
          messages: [...session.messages, assistantMessage],
        },
      });
      break;
    }

    case 'agent_end': {
      const currentSession = get().taskCreationSession;
      if (currentSession) {
        set({
          taskCreationSession: {
            ...currentSession,
            isStreaming: false,
          },
        });
      }
      break;
    }

    case 'message_update': {
      const currentSession = get().taskCreationSession;
      if (!currentSession || !currentSession.isStreaming) return;

      const messages = [...currentSession.messages];
      const lastMsg = messages[messages.length - 1];

      // Extract delta from nested assistantMessageEvent (raw JSON object)
      const ame = event.assistantMessageEvent as { type?: string; delta?: string } | null | undefined;
      if (lastMsg && lastMsg.role === 'assistant' && ame && ame.type === 'text_delta' && ame.delta) {
        messages[messages.length - 1] = {
          ...lastMsg,
          content: (lastMsg.content || '') + ame.delta,
        };

        set({
          taskCreationSession: {
            ...currentSession,
            messages,
          },
        });
      }
      break;
    }

    case 'response': {
      // Handle error responses for task creation
      if (!event.success && event.error) {
        const currentSession = get().taskCreationSession;
        if (currentSession) {
          set({
            taskCreationSession: {
              ...currentSession,
              isStreaming: false,
            },
          });
        }
      }
      break;
    }

    default:
      break;
  }
}

// ─── Tauri Event Subscription ───────────────────────────────────────────

// Subscribe to pi-event on module load
listen<PiEventPayload>('pi-event', (event) => {
  const { taskId, event: piEvent } = event.payload;
  console.log('[piStore] pi-event received:', taskId, piEvent.type, piEvent);
  usePiStore.getState().handlePiEvent(taskId, piEvent);
}).catch((err) => {
  console.error('[piStore] Failed to subscribe to pi-event:', err);
});

// DEBUG: Subscribe to pi-debug to see raw Pi stdout output
listen<{ taskId: string; line: number; raw: string }>('pi-debug', (event) => {
  console.log('[Pi DEBUG]', `line ${event.payload.line}:`, event.payload.raw);
}).catch((err) => {
  console.error('[piStore] Failed to subscribe to pi-debug:', err);
});
