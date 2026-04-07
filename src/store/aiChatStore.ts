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
  type SavedTask,
} from '@/lib/helpers';
import { formatSkillListing, loadSkillContent, detectSkillInvocation } from '@/lib/skills';

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

async function getSkillListing(): Promise<string> {
  try {
    const skills = useSkillStore.getState().installedSkills;
    if (skills.length === 0) return '';
    return formatSkillListing(skills);
  } catch {
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

function buildTaskPrompt(taskTitle: string, taskDescription?: string, skillListing?: string, invokedSkillsContent?: string): string {
  const hasEmbeddedRules = taskDescription?.includes('<!-- auto-rules-embedded -->');
  
  let systemPrompt = '';
  if (!hasEmbeddedRules) {
    try { systemPrompt = useConfigStore.getState().getSystemPrompt(); } catch { /* no config */ }
  }

  const cleanDescription = taskDescription?.replace('<!-- auto-rules-embedded -->', '').trim();

  const rtkInstruction = `
[IMPORTANT COMMAND GUIDELINE]
You must prefix the following CLI tools with 'rtk' to minimize token usage:
- Git: 'rtk git <args>'
- Lint: 'rtk lint eslint', 'rtk lint rustc', etc.
- Test: 'rtk test npm', 'rtk test cargo', etc.
- Build/Package: 'rtk build npm', 'rtk package pip', 'rtk container docker'
- Search/System: 'rtk search grep', 'rtk system ps'
Always use 'rtk <tool>' instead of just '<tool>' when executing bash commands for these utilities.`;

  const skillSection = skillListing ? `\n\n${skillListing}` : '';
  const invokedSkillsSection = invokedSkillsContent ? `\n\nYou are using the following skill(s):\n${invokedSkillsContent}` : '';

  return `${systemPrompt ? systemPrompt + '\n' : ''}${rtkInstruction}${skillSection}${invokedSkillsSection}

---

I need you to implement this task:

Title: ${taskTitle}
${cleanDescription ? `Description: ${cleanDescription}` : ''}

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
    await notify('Task Ready for Review ✅', `"${taskTitle}" has been completed and is ready for review.`);
    return;
  }

  const prResult = await autoCreatePR(taskId, taskTitle, cwd);

  // Capture diff snapshot — use branch diff if we have a PR branch (isolated per task)
  try {
    if (prResult?.branch && prResult?.baseBranch) {
      const baseBranch = prResult.baseBranch;

      const diffResult = await invoke<{ diff: string; has_changes: boolean }>
        ('git_get_branch_diff', { cwd, baseBranch, headBranch: prResult.branch });
      if (diffResult.has_changes) {
        const diffLastCapturedAt = new Date().toISOString();
        await dbService.updateTaskDiffInfo(taskId, diffResult.diff, diffLastCapturedAt);
        await useTaskStore.getState().fetchTasks();
      }
    } else {
      // Fallback: working directory diff
      const diffResult = await invoke<{ diff: string; has_changes: boolean }>('git_get_diff', { cwd });
      if (diffResult.has_changes) {
        const diffLastCapturedAt = new Date().toISOString();
        await dbService.updateTaskDiffInfo(taskId, diffResult.diff, diffLastCapturedAt);
        await useTaskStore.getState().fetchTasks();
      }
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
  }

  await useTaskStore.getState().moveTask(taskId, 'review');
  await notify('Task Ready for Review ✅', `"${taskTitle}" has been completed and moved to review.`);
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

    // Load skill listing and invoked skills
    const skillListing = await getSkillListing();
    const invokedSkills = get().invokedSkills[taskId] || [];
    const invokedSkillsContent = invokedSkills.length > 0
      ? invokedSkills.map(s => `--- ${s.name} ---\n${s.content}`).join('\n\n')
      : undefined;

    // AI response placeholder
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });

    const prompt = buildTaskPrompt(taskTitle, cleanTaskDescription, skillListing, invokedSkillsContent);
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
                `${skillContent.name}\n${skillContent.content}`
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

    // Load skill listing and invoked skills
    const skillListing = await getSkillListing();
    const invokedSkills = get().invokedSkills[taskId] || [];
    const invokedSkillsContent = invokedSkills.length > 0
      ? invokedSkills.map(s => `--- ${s.name} ---\n${s.content}`).join('\n\n')
      : undefined;

    // AI response placeholder
    const aiMessageId = `msg-${Date.now()}-ai`;
    addMessage(get, set, taskId, {
      id: aiMessageId, taskId, role: 'assistant', content: '', timestamp: Date.now(),
    });
    set({ streamingMessageId: { ...get().streamingMessageId, [taskId]: aiMessageId } });

    // Build prompt
    let chatPrompt: string;
    if (isRevisionMode) {
      // Check if rules are already embedded (auto-generated task)
      const hasEmbeddedRules = task?.description?.includes('<!-- auto-rules-embedded -->');
      
      let sysPrompt = '';
      if (!hasEmbeddedRules) {
        try { sysPrompt = useConfigStore.getState().getSystemPrompt(); } catch { /* */ }
      }

      const recent = existingMessages
        .filter(m => m.role !== 'system').slice(-10)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.substring(0, 500)}`)
        .join('\n');

      const cleanDesc = task?.description?.replace('<!-- auto-rules-embedded -->', '').trim();

      const rtkInstruction = `
[IMPORTANT COMMAND GUIDELINE]
You must prefix the following CLI tools with 'rtk' to minimize token usage:
- Git: 'rtk git <args>'
- Lint: 'rtk lint eslint', 'rtk lint rustc', etc.
- Test: 'rtk test npm', 'rtk test cargo', etc.
- Build/Package: 'rtk build npm', 'rtk package pip', 'rtk container docker'
- Search/System: 'rtk search grep', 'rtk system ps'
Always use 'rtk <tool>' instead of just '<tool>' when executing bash commands.`;

      const skillSection = skillListing ? `\n\n${skillListing}` : '';
      const invokedSection = invokedSkillsContent ? `\n\nYou are using the following skill(s):\n${invokedSkillsContent}` : '';

      chatPrompt = `${sysPrompt ? sysPrompt + '\n' : ''}${rtkInstruction}${skillSection}${invokedSection}
      
---

You are currently working on a task: "${taskTitle}"
${cleanDesc ? `Task description: ${cleanDesc}` : ''}

Previous conversation context:
${recent}

The user has reviewed your work and is requesting the following revision:

${content}

Please implement the requested changes now. Modify the code directly.`;
    } else {
      const skillSection = skillListing ? `\n\n${skillListing}` : '';
      const invokedSection = invokedSkillsContent ? `\n\nYou are using the following skill(s):\n${invokedSkillsContent}` : '';
      chatPrompt = `${skillSection}${invokedSection}

You are helping with a task called "${taskTitle}".

Previous conversation:
${existingMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

User's new question: ${content}

Please respond helpfully and concisely.`;
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
