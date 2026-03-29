import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useEngineStore } from './engineStore';
import { useTaskStore } from './taskStore';

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
  
  // Actions
  enqueueTask: (taskId: string, taskTitle: string, taskDescription?: string) => Promise<void>;
  processQueue: () => Promise<void>;
  runAITask: (taskId: string, taskTitle: string, taskDescription?: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  sendMessage: (taskId: string, content: string) => Promise<void>;
  clearMessages: (taskId: string) => void;
  getMessages: (taskId: string) => ChatMessage[];
  getTaskState: (taskId: string) => AITaskState;
  isStreaming: (taskId: string) => boolean;
}

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

// Helper function to extract file information from AI output
function extractFileInfo(content: string): { currentFile: string | null; filesModified: string[] } {
  const filesModified: string[] = [];
  let currentFile: string | null = null;
  
  // Look for file path patterns like "src/components/Foo.tsx", "path/to/file.js", etc.
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
        if (fileMatch && !filesModified.includes(fileMatch[1])) {
          filesModified.push(fileMatch[1]);
        }
      }
    }
  }
  
  // Get the most recent/current file (last one mentioned)
  if (filesModified.length > 0) {
    currentFile = filesModified[filesModified.length - 1];
  }
  
  return { currentFile, filesModified };
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: {},
  taskStates: {},
  taskQueue: [],
  currentRunningTask: null,
  isProcessingQueue: false,

  enqueueTask: async (taskId: string, taskTitle: string, taskDescription?: string) => {
    const { taskQueue, taskStates } = get();
    
    // Check if task already in queue or running
    if (taskQueue.find(t => t.taskId === taskId) || get().currentRunningTask === taskId) {
      console.log(`Task ${taskId} already in queue or running`);
      return;
    }

    // Add to queue
    const newQueue = [...taskQueue, { taskId, taskTitle, taskDescription }];
    
    set({
      taskQueue: newQueue,
      taskStates: {
        ...taskStates,
        [taskId]: {
          ...defaultTaskState(),
          status: 'queued',
          queuePosition: newQueue.length,
        }
      }
    });

    // Start processing queue if not already processing
    if (!get().isProcessingQueue) {
      get().processQueue();
    }
  },

  processQueue: async () => {
    const { taskQueue, isProcessingQueue, currentRunningTask } = get();
    
    if (isProcessingQueue) return;
    if (taskQueue.length === 0) {
      set({ isProcessingQueue: false });
      return;
    }
    if (currentRunningTask) {
      // Another task is running, wait
      return;
    }

    set({ isProcessingQueue: true });

    // Get next task from queue
    const [nextTask, ...remainingQueue] = taskQueue;
    
    set({ 
      taskQueue: remainingQueue,
      currentRunningTask: nextTask.taskId,
    });

    // Update queue positions
    const { taskStates } = get();
    const updatedStates = { ...taskStates };
    remainingQueue.forEach((item, index) => {
      if (updatedStates[item.taskId]) {
        updatedStates[item.taskId] = {
          ...updatedStates[item.taskId],
          queuePosition: index + 1,
        };
      }
    });
    set({ taskStates: updatedStates });

    // Run the task
    try {
      await get().runAITask(nextTask.taskId, nextTask.taskTitle, nextTask.taskDescription);
    } catch (error) {
      console.error('Error running AI task:', error);
    }

    // Mark as done and process next
    set({ 
      currentRunningTask: null,
      isProcessingQueue: false,
    });

    // Process next task in queue
    setTimeout(() => {
      get().processQueue();
    }, 100);
  },

  runAITask: async (taskId: string, taskTitle: string, taskDescription?: string) => {
    const { messages, taskStates } = get();
    const engine = useEngineStore.getState().activeEngine;
    
    if (!engine) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        taskId,
        role: 'system',
        content: '❌ Error: No AI engine selected. Please configure an engine in Settings.',
        timestamp: Date.now(),
      };
      
      set({
        messages: {
          ...messages,
          [taskId]: [...(messages[taskId] || []), errorMsg],
        },
        taskStates: {
          ...taskStates,
          [taskId]: {
            ...defaultTaskState(),
            status: 'error',
            errorMessage: 'No AI engine selected',
          }
        }
      });
      return;
    }

    const startTime = Date.now();
    
    // Add system message
    const systemMessage: ChatMessage = {
      id: `msg-${startTime}-system`,
      taskId,
      role: 'system',
      content: `🚀 Starting AI workflow for: "${taskTitle}"`,
      timestamp: startTime,
    };

    set({
      messages: {
        ...messages,
        [taskId]: [...(messages[taskId] || []), systemMessage],
      },
      taskStates: {
        ...taskStates,
        [taskId]: {
          ...defaultTaskState(),
          status: 'running',
          startTime,
        }
      }
    });

    // Build prompt
    const prompt = `I need you to implement this task:

Title: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}

Please:
1. Analyze what needs to be done
2. Implement the necessary code changes
3. Explain what you did

Start working on this now.`;

    // Create placeholder for AI response
    const aiMessageId = `msg-${Date.now()}-ai`;
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      taskId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    set({
      messages: {
        ...get().messages,
        [taskId]: [...(get().messages[taskId] || []), aiMessage],
      },
    });

    let responseContent = '';
    let unlistenOutput: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;

    try {
      // Setup listeners
      const { listen } = await import('@tauri-apps/api/event');
      
      // Listen for output
      unlistenOutput = await listen('cli-output', (event: { payload: { line: string; is_error: boolean } }) => {
        const { messages, taskStates } = get();
        const taskMessages = messages[taskId] || [];
        const aiMsgIndex = taskMessages.findIndex((m) => m.id === aiMessageId);
        responseContent += event.payload.line + '\n';

        if (aiMsgIndex >= 0) {
          const updatedMessages = [...taskMessages];
          updatedMessages[aiMsgIndex] = {
            ...updatedMessages[aiMsgIndex],
            content: updatedMessages[aiMsgIndex].content + event.payload.line + '\n',
          };

          set({
            messages: {
              ...messages,
              [taskId]: updatedMessages,
            },
          });
        }

        // Extract file information from the output
        const { currentFile, filesModified } = extractFileInfo(responseContent);
        if (currentFile || filesModified.length > 0) {
          const currentTaskState = taskStates[taskId];
          if (currentTaskState) {
            set({
              taskStates: {
                ...taskStates,
                [taskId]: {
                  ...currentTaskState,
                  currentFile,
                  filesModified: [...new Set([...currentTaskState.filesModified, ...filesModified])],
                }
              }
            });
          }
        }
      });

      // Listen for completion
      unlistenComplete = await listen('cli-complete', (_event: { payload: { success: boolean; error_message?: string } }) => {
        // This will be handled after await
      });
      
      // Create a promise to wait for completion
      const completionPromise = new Promise<{ success: boolean; error_message?: string }>((resolve) => {
        const unlisten = listen('cli-complete', (event: { payload: { success: boolean; error_message?: string } }) => {
          resolve(event.payload);
          unlisten.then(fn => fn());
        });
      });

      // Run CLI
      await invoke('run_cli', {
        binary: engine.binary_path,
        args: engine.args.split(' ').filter(Boolean),
        prompt: prompt,
      });

      // Wait for completion
      const result = await completionPromise;

      // Handle result
      const endTime = Date.now();
      const { taskStates } = get();

      if (result.success) {
        // Success - update state to completed
        set({
          taskStates: {
            ...taskStates,
            [taskId]: {
              ...taskStates[taskId],
              status: 'completed',
              endTime,
              lastResponse: responseContent,
            }
          }
        });

        // Auto-move to review via taskStore
        setTimeout(() => {
          useTaskStore.getState().moveTask(taskId, 'review');
        }, 500);
      } else {
        // Failed - move to failed column
        const errorMsg = result.error_message || 'AI process failed';
        
        // Add error message to chat
        const { messages } = get();
        const taskMessages = messages[taskId] || [];
        const aiMsgIndex = taskMessages.findIndex((m) => m.id === aiMessageId);

        if (aiMsgIndex >= 0) {
          const updatedMessages = [...taskMessages];
          updatedMessages[aiMsgIndex] = {
            ...updatedMessages[aiMsgIndex],
            content: updatedMessages[aiMsgIndex].content + `\n\n❌ Error: ${errorMsg}`,
          };

          set({
            messages: {
              ...messages,
              [taskId]: updatedMessages,
            },
          });
        }

        set({
          taskStates: {
            ...taskStates,
            [taskId]: {
              ...taskStates[taskId],
              status: 'error',
              endTime,
              errorMessage: errorMsg,
            }
          }
        });

        // Auto-move to failed column
        setTimeout(() => {
          useTaskStore.getState().moveTask(taskId, 'failed');
        }, 500);
      }

    } catch (error) {
      console.error('AI streaming error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to get AI response';
      const { messages, taskStates } = get();
      const taskMessages = messages[taskId] || [];
      const aiMsgIndex = taskMessages.findIndex((m) => m.id === aiMessageId);
      const endTime = Date.now();

      if (aiMsgIndex >= 0) {
        const updatedMessages = [...taskMessages];
        updatedMessages[aiMsgIndex] = {
          ...updatedMessages[aiMsgIndex],
          content: updatedMessages[aiMsgIndex].content + `\n\n❌ Error: ${errorMessage}`,
        };

        set({
          messages: {
            ...messages,
            [taskId]: updatedMessages,
          },
        });
      }

      set({
        taskStates: {
          ...taskStates,
          [taskId]: {
            ...taskStates[taskId],
            status: 'error',
            endTime,
            errorMessage: errorMessage,
          }
        }
      });

      // Auto-move to failed column
      setTimeout(() => {
        useTaskStore.getState().moveTask(taskId, 'failed');
      }, 500);
    } finally {
      // Cleanup listeners
      if (typeof unlistenOutput === 'function') {
        unlistenOutput();
      }
      if (typeof unlistenComplete === 'function') {
        unlistenComplete();
      }
    }
  },

  retryTask: async (taskId: string) => {
    const { messages } = get();
    const taskMessages = messages[taskId] || [];
    
    // Find the last system message to get task info
    const systemMsg = taskMessages.find(m => m.role === 'system' && m.content.includes('Starting AI workflow'));
    
    if (systemMsg) {
      // Extract task title from message
      const match = systemMsg.content.match(/"([^"]+)"/);
      const taskTitle = match ? match[1] : 'Unknown Task';
      
      // Reset state and re-queue
      const { taskStates } = get();
      set({
        taskStates: {
          ...taskStates,
          [taskId]: defaultTaskState(),
        }
      });

      await get().enqueueTask(taskId, taskTitle);
    }
  },

  sendMessage: async (taskId: string, content: string) => {
    const { messages } = get();
    const timestamp = Date.now();
    
    const userMessage: ChatMessage = {
      id: `msg-${timestamp}`,
      taskId,
      role: 'user',
      content,
      timestamp,
    };
    
    set({
      messages: {
        ...messages,
        [taskId]: [...(messages[taskId] || []), userMessage],
      },
    });

    // Get AI response
    const engine = useEngineStore.getState().activeEngine;
    if (!engine) return;

    const aiMessageId = `msg-${Date.now()}-ai`;
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      taskId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    set({
      messages: {
        ...get().messages,
        [taskId]: [...(get().messages[taskId] || []), aiMessage],
      },
    });

    try {
      const { listen } = await import('@tauri-apps/api/event');
      
      const unlisten = await listen('cli-output', (event: { payload: { line: string } }) => {
        const { messages } = get();
        const taskMessages = messages[taskId] || [];
        const aiMsgIndex = taskMessages.findIndex((m) => m.id === aiMessageId);

        if (aiMsgIndex >= 0) {
          const updatedMessages = [...taskMessages];
          updatedMessages[aiMsgIndex] = {
            ...updatedMessages[aiMsgIndex],
            content: updatedMessages[aiMsgIndex].content + event.payload.line + '\n',
          };

          set({
            messages: {
              ...messages,
              [taskId]: updatedMessages,
            },
          });
        }
      });

      await invoke('run_cli', {
        binary: engine.binary_path,
        args: engine.args.split(' ').filter(Boolean),
        prompt: content,
      });

      setTimeout(() => {
        unlisten();
      }, 100);

    } catch (error) {
      console.error('Error sending message:', error);
    }
  },

  clearMessages: (taskId: string) => {
    const { messages } = get();
    const newMessages = { ...messages };
    delete newMessages[taskId];
    set({ messages: newMessages });
  },

  getMessages: (taskId: string) => {
    return get().messages[taskId] || [];
  },

  getTaskState: (taskId: string) => {
    return get().taskStates[taskId] || defaultTaskState();
  },

  isStreaming: (taskId: string) => {
    const state = get().taskStates[taskId];
    return state?.status === 'running' || false;
  },
}));
