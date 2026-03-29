import { invoke } from '@tauri-apps/api/core';
import type { Task, CreateTaskRequest, Engine, CreateEngineRequest, ChatMessage } from '@/types';

export const dbService = {
  // Tasks
  createTask: (task: CreateTaskRequest) => 
    invoke<Task>('create_task', { task }),
  
  getAllTasks: () => 
    invoke<Task[]>('get_all_tasks'),
  
  getTasksByStatus: (status: string) => 
    invoke<Task[]>('get_tasks_by_status', { status }),
  
  getTasksByWorkspace: (workspaceId: string) =>
    invoke<Task[]>('get_tasks_by_workspace', { workspaceId }),
  
  updateTaskStatus: (id: string, status: string) => 
    invoke<void>('update_task_status', { id, status }),
  
  updateTaskPRInfo: (id: string, prBranch: string, prUrl: string | null, remote: string | null) => 
    invoke<void>('update_task_pr_info', { id, prBranch, prUrl, remote }),
  
  updateTaskMergeInfo: (id: string, isMerged: boolean, mergeSourceBranch: string | null) =>
    invoke<void>('update_task_merge_info', { id, isMerged, mergeSourceBranch }),
  
  deleteTask: (id: string) => 
    invoke<void>('delete_task', { id }),

  // Engines
  createEngine: (engine: CreateEngineRequest) => 
    invoke<Engine>('create_engine', { engine }),
  
  getAllEngines: () => 
    invoke<Engine[]>('get_all_engines'),
  
  updateEngineEnabled: (id: number, enabled: boolean) => 
    invoke<void>('update_engine_enabled', { id, enabled }),
  
  deleteEngine: (id: number) => 
    invoke<void>('delete_engine', { id }),

  // Chat History
  createChatMessage: (taskId: string, role: string, content: string, engineAlias: string) =>
    invoke<number>('create_chat_message', { taskId, role, content, engineAlias }),
  
  getChatHistory: (taskId: string) =>
    invoke<ChatMessage[]>('get_chat_history', { taskId }),
  
  clearChatHistory: (taskId: string) =>
    invoke<void>('clear_chat_history', { taskId }),

  // CLI Runner
  runCli: (binary: string, args: string[], prompt: string, cwd?: string) =>
    invoke<void>('run_cli', { binary, args, prompt, cwd }),

  stopCli: () =>
    invoke<void>('stop_cli'),

  // Seed default engines
  seedDefaultEngines: () =>
    invoke<Engine[]>('seed_default_engines'),

  // Task Import
  importTasksJson: (content: string) =>
    invoke<{ tasks: Task[] }>('import_tasks_json', { content }),

  importTasksMarkdown: (content: string) =>
    invoke<{ tasks: Task[] }>('import_tasks_markdown', { content }),
};
