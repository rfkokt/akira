import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useEngineStore } from './engineStore';
import { useTaskStore } from './taskStore';
import { useWorkspaceStore } from './workspaceStore';

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
  autoCreatePR: (taskId: string, taskTitle: string) => Promise<{ branch: string; prUrl?: string } | null>;
}

// Get saved running task from localStorage
export const getSavedRunningTask = (): SavedTask | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as SavedTask;
    }
  } catch (e) {
    console.error('Failed to get saved task:', e);
  }
  return null;
};

// Clear saved running task
export const clearSavedRunningTask = () => {
  clearRunningTask();
};

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

// LocalStorage keys
const STORAGE_KEY = 'akira_running_task';

interface SavedTask {
  taskId: string;
  taskTitle: string;
  startedAt: number;
}

// Save running task to localStorage
const saveRunningTask = (taskId: string, taskTitle: string) => {
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
};

// Clear running task from localStorage
const clearRunningTask = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear running task:', e);
  }
};

// Helper function to extract file information from AI output
function extractFileInfo(content: string): { currentFile: string | null; filesModified: string[] } {
  const filesModified: string[] = [];
  let currentFile: string | null = null;
  
  // Strip workspace prefix pattern (e.g., "a/resources/js/app/" from paths)
  const stripPrefix = (path: string): string => {
    // Match patterns like "a/resources/js/app/" anywhere in the path
    // Also handles paths that start with workspace root + "a/resources/js/app/"
    if (path.includes('/a/resources/js/app/')) {
      const parts = path.split('/a/resources/js/app/');
      return parts[parts.length - 1] || path;
    }
    // Fallback: strip if it starts with single letter prefix
    return path.replace(/^[a-z]\/resources\/js\/app\//i, '');
  };
  
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
        if (fileMatch) {
          const cleanPath = stripPrefix(fileMatch[1]);
          if (!filesModified.includes(cleanPath)) {
            filesModified.push(cleanPath);
          }
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

    // Save to localStorage for recovery
    saveRunningTask(nextTask.taskId, nextTask.taskTitle);

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

    // Clear from localStorage
    clearRunningTask();

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

    // Debug: log engine selection
    console.log('[AI] Selected engine:', engine.alias, engine.binary_path, engine.model, engine.args);

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
      
      console.log('[AI] Setting up listeners for task:', taskId);
      console.log('[AI] Engine:', engine.binary_path, engine.args);

      let completionResolve: ((result: { success: boolean; error_message?: string }) => void) | undefined;

      // Listen for completion - register BEFORE invoking CLI to avoid race condition
      unlistenComplete = await listen('cli-complete', (event: { payload: { success: boolean; error_message?: string } }) => {
        console.log('[AI] Received cli-complete event');
        if (completionResolve) {
          completionResolve(event.payload);
        }
      });

      // Listen for output
      unlistenOutput = await listen('cli-output', (event: { payload: { line: string; is_error: boolean } }) => {
        console.log('[AI] Received output:', event.payload.line.substring(0, 100));
        // Always get fresh state inside callback
        const { messages: currentMessages, taskStates: currentTaskStates } = get();
        const taskMessages = currentMessages[taskId] || [];
        const aiMsgIndex = taskMessages.findIndex((m) => m.id === aiMessageId);
        
        // For opencode with --format json, parse JSON lines
        let displayLine = event.payload.line;
        if (engine.alias === 'opencode') {
          try {
            const json = JSON.parse(event.payload.line);
            // Extract text from different event types
            if (json.type === 'text' && json.part?.text) {
              displayLine = json.part.text;
            } else if (json.type === 'step_start') {
              displayLine = `[${json.part?.type || 'step'}]`;
            } else if (json.type === 'tool') {
              displayLine = `[Tool: ${json.part?.tool || 'unknown'}] ${json.part?.state?.description || ''}`;
            } else if (json.type === 'step_finish') {
              displayLine = `\n--- Completed in ${json.tokens?.total || 0} tokens ---`;
            } else {
              displayLine = ''; // Skip other events
            }
          } catch {
            // Not JSON, use as-is
          }
        }
        
        if (displayLine) {
          responseContent += displayLine + '\n';
        }

        if (aiMsgIndex >= 0 && displayLine) {
          const updatedMessages = [...taskMessages];
          updatedMessages[aiMsgIndex] = {
            ...updatedMessages[aiMsgIndex],
            content: updatedMessages[aiMsgIndex].content + displayLine + '\n',
          };

          set({
            messages: {
              ...currentMessages,
              [taskId]: updatedMessages,
            },
          });
        }

        // Extract file information from the output - use fresh state
        const { currentFile, filesModified } = extractFileInfo(responseContent);
        if (currentFile || filesModified.length > 0) {
          const currentTaskState = currentTaskStates[taskId];
          if (currentTaskState) {
            set({
              taskStates: {
                ...currentTaskStates,
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

      // Create a promise to wait for completion with timeout (5 minutes)
      const completionPromise = new Promise<{ success: boolean; error_message?: string }>((resolve) => {
        completionResolve = resolve;
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI process timed out after 5 minutes')), 5 * 60 * 1000);
      });

      // Race between completion and timeout
      const waitForCompletion = Promise.race([completionPromise, timeoutPromise]);

      // Get workspace path
      const workspace = useWorkspaceStore.getState().activeWorkspace;
      const cwd = workspace?.folder_path || null;

      console.log('[AI] Invoking run_cli with binary:', engine.binary_path);
      console.log('[AI] Engine alias:', engine.alias);
      console.log('[AI] Base args:', engine.args.split(' ').filter(Boolean));
      console.log('[AI] CWD:', cwd);

      // Special handling for opencode - needs prompt as argument, not stdin
      let args: string[];
      let actualPrompt: string;
      
      if (engine.alias === 'opencode') {
        // For opencode: command structure is `opencode run [options] "message"`
        // Use --dir to explicitly set working directory
        const workingDir = cwd || process.cwd?.() || '.';
        args = ['run', '--format', 'json', '--dir', workingDir, prompt];
        actualPrompt = ''; // Don't write to stdin
        console.log('[AI] Opencode mode');
        console.log('[AI] Args:', args);
      } else {
        // For other engines: write prompt to stdin
        args = engine.args.split(' ').filter(Boolean);
        actualPrompt = prompt;
        console.log('[AI] StdIn mode - prompt as stdin');
      }

      // Run CLI with workspace as working directory
      try {
        await invoke('run_cli', {
          binary: engine.binary_path,
          args: args,
          prompt: actualPrompt,
          cwd: cwd,
        });
      } catch (err) {
        console.error('[AI] run_cli error:', err);
        throw err;
      }

      console.log('[AI] run_cli completed, waiting for completion event...');
      // Wait for completion (with timeout)
      const result = await waitForCompletion;
      console.log('[AI] Completion result:', result);

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

        // Auto-move to review and create PR
        setTimeout(async () => {
          await useTaskStore.getState().moveTask(taskId, 'review');
          
          // Auto-create PR after moving to review
          const prResult = await get().autoCreatePR(taskId, taskTitle);
          if (prResult) {
            console.log(`✓ PR created: ${prResult.branch}`, prResult.prUrl || 'No gh CLI');
          }
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
      if (unlistenOutput) {
        unlistenOutput();
      }
      if (unlistenComplete) {
        unlistenComplete();
      }
    }
  },

  retryTask: async (taskId: string) => {
    // Get fresh state
    const currentMessages = get().messages[taskId] || [];
    
    // Find the last system message to get task info
    const systemMsg = currentMessages.find(m => m.role === 'system' && m.content.includes('Starting AI workflow'));
    
    if (!systemMsg) {
      console.error('retryTask: No system message found for task', taskId);
      return;
    }
    
    // Extract task title from message
    const match = systemMsg.content.match(/"([^"]+)"/);
    const taskTitle = match ? match[1] : 'Unknown Task';
    console.log('Retrying task directly:', taskId, taskTitle);
    
    // Reset state to running
    const currentTaskStates = get().taskStates;
    set({
      taskStates: {
        ...currentTaskStates,
        [taskId]: {
          ...defaultTaskState(),
          status: 'running',
          startTime: Date.now(),
        },
      },
      currentRunningTask: taskId,
    });

    // Run the task directly (bypass queue to avoid race conditions)
    get().runAITask(taskId, taskTitle);
  },

  sendMessage: async (taskId: string, content: string) => {
    const { messages } = get();
    const timestamp = Date.now();
    
    // Get task info for context
    const existingMessages = messages[taskId] || [];
    
    // Extract task info from existing system message
    let taskTitle = 'Unknown Task';
    const systemMsg = existingMessages.find(m => m.role === 'system' && m.content.includes('Starting AI workflow'));
    if (systemMsg) {
      const titleMatch = systemMsg.content.match(/"([^"]+)"/);
      if (titleMatch) taskTitle = titleMatch[1];
    }
    
    const userMessage: ChatMessage = {
      id: `msg-${timestamp}`,
      taskId,
      role: 'user',
      content,
      timestamp,
    };
    
    // Add user message but don't change task state (keep as is)
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

    let responseContent = '';

    // Build context-aware prompt
    const chatPrompt = `You are helping with a task called "${taskTitle}".
    
Previous conversation:
${existingMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

User's new question: ${content}

Please respond helpfully and concisely.`;

    try {
      const { listen } = await import('@tauri-apps/api/event');
      
      const unlisten = await listen('cli-output', (event: { payload: { line: string } }) => {
        const { messages } = get();
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
      });

      const workspace = useWorkspaceStore.getState().activeWorkspace;
      const cwd = workspace?.folder_path || null;

      await invoke('run_cli', {
        binary: engine.binary_path,
        args: engine.args.split(' ').filter(Boolean),
        prompt: chatPrompt,
        cwd: cwd,
      });

      // Wait a bit then cleanup
      setTimeout(() => {
        unlisten();
      }, 500);

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

  autoCreatePR: async (taskId: string, taskTitle: string) => {
    const workspace = useWorkspaceStore.getState().activeWorkspace;
    if (!workspace?.folder_path) return null;

    const runGit = async (args: string[]): Promise<{ success: boolean; output: string }> => {
      return invoke<{ success: boolean; output: string }>('run_shell_command', {
        command: 'git',
        args,
        cwd: workspace.folder_path,
      });
    };

    try {
      const timestamp = Date.now();
      const branchName = `task-${taskId.slice(0, 8)}-${timestamp}`;
      const commitMsg = `feat: ${taskTitle}`;

      const currentBranch = await runGit(['branch', '--show-current']);
      const currentBranchName = currentBranch.success ? currentBranch.output.trim() : 'main';

      await runGit(['checkout', '-b', branchName]);

      const addResult = await runGit(['add', '.']);
      if (!addResult.success) {
        await runGit(['checkout', currentBranchName]);
        await runGit(['branch', '-D', branchName]);
        return null;
      }

      const commitResult = await runGit(['commit', '-m', commitMsg]);
      if (!commitResult.success) {
        await runGit(['checkout', currentBranchName]);
        await runGit(['branch', '-D', branchName]);
        return null;
      }

      const remoteResult = await runGit(['remote']);
      const remoteName = remoteResult.success ? remoteResult.output.trim().split('\n')[0] : 'origin';

      const pushResult = await runGit(['push', '-u', remoteName, branchName]);
      if (!pushResult.success) {
        await runGit(['checkout', currentBranchName]);
        await runGit(['branch', '-D', branchName]);
        return null;
      }

      let prUrl: string | undefined;
      const ghAuth = await runGit(['config', '--global', 'gh.prompt', 'false']);
      if (ghAuth.success) {
        const prResult = await runGit([
          'pr', 'create',
          '--base', currentBranchName,
          '--title', commitMsg,
          '--body', `Task: ${taskTitle}\n\nAutomated PR from Akira`
        ]);
        if (prResult.success) {
          prUrl = prResult.output.trim();
        }
      }

      await runGit(['checkout', currentBranchName]);

      set({
        taskStates: {
          ...get().taskStates,
          [taskId]: {
            ...get().taskStates[taskId],
            prBranch: branchName,
            prUrl,
            prCreatedAt: timestamp,
          }
        }
      });

      return { branch: branchName, prUrl };
    } catch (err) {
      console.error('Failed to auto-create PR:', err);
      return null;
    }
  },
}));
