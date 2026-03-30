import { invoke } from '@tauri-apps/api/core';
import type { Task, CreateTaskRequest, Engine, CreateEngineRequest, ChatMessage, RtkInstallResult, RtkGainStats, GitDiffResult, ShellCommandResult, RouterProviderInfo, RouterConfig, RouterSession, ContextMessage, ProviderCostSummary, SwitchHistory, RunAgentRequest, RunAgentResponse, RouterAgentStatus } from '@/types';

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

  // RTK Commands
  checkRtkStatus: () =>
    invoke<RtkInstallResult>('check_rtk_status'),

  installRtk: () =>
    invoke<RtkInstallResult>('install_rtk'),

  initRtk: () =>
    invoke<{ success: boolean; message: string }>('init_rtk'),

  getRtkGainStats: (days?: number) =>
    invoke<RtkGainStats>('get_rtk_gain_stats', { days }),

  // Git Commands with RTK
  gitGetDiff: (cwd: string) =>
    invoke<GitDiffResult>('git_get_diff', { cwd }),

  gitGetStagedDiff: (cwd: string) =>
    invoke<GitDiffResult>('git_get_staged_diff', { cwd }),

  // Shell Commands
  runShellCommand: (command: string, args: string[], cwd: string, useRtk?: boolean) =>
    invoke<ShellCommandResult>('run_shell_command', { command, args, cwd, useRtk }),

  // CLI Router - Providers
  getRouterProviders: () =>
    invoke<RouterProviderInfo[]>('get_router_providers'),

  syncEnginesToRouter: () =>
    invoke<void>('sync_engines_to_router'),

  // CLI Router - Config
  getRouterConfig: () =>
    invoke<RouterConfig>('get_router_config'),

  saveRouterConfig: (autoSwitchEnabled: boolean, tokenLimitThreshold: number, fallbackOrder: string[]) =>
    invoke<void>('save_router_config_cmd', { autoSwitchEnabled, tokenLimitThreshold, fallbackOrder }),

  // CLI Router - Sessions
  createRouterSession: (taskId: string, providerAlias: string) =>
    invoke<RouterSession>('create_router_session', { taskId, providerAlias }),

  getRouterSession: (sessionId: string) =>
    invoke<RouterSession | null>('get_router_session', { sessionId }),

  getTaskRouterSessions: (taskId: string) =>
    invoke<RouterSession[]>('get_task_router_sessions', { taskId }),

  // CLI Router - Messages
  addRouterMessage: (sessionId: string, role: string, content: string, tokenCount?: number) =>
    invoke<void>('add_router_message', { sessionId, role, content, tokenCount }),

  getRouterMessages: (sessionId: string) =>
    invoke<ContextMessage[]>('get_router_messages', { sessionId }),

  // CLI Router - Context Transfer
  transferRouterContext: (fromSessionId: string, toProviderAlias: string) =>
    invoke<string>('transfer_router_context', { fromSessionId, toProviderAlias }),

  // CLI Router - Provider Switching
  switchProviderInSession: (sessionId: string, fromProvider: string, toProvider: string, reason: string) =>
    invoke<void>('switch_provider_in_session', { sessionId, fromProvider, toProvider, reason }),

  getNextAvailableProvider: (currentProviderAlias: string) =>
    invoke<RouterProviderInfo | null>('get_next_available_provider', { currentProviderAlias }),

  // CLI Router - Cost Tracking
  recordCliCost: (providerAlias: string, inputTokens: number, outputTokens: number, cost: number) =>
    invoke<void>('record_cli_cost', { providerAlias, inputTokens, outputTokens, cost }),

  getProviderCosts: () =>
    invoke<ProviderCostSummary[]>('get_provider_costs'),

  getTaskSwitchHistory: (taskId: string) =>
    invoke<SwitchHistory[]>('get_task_switch_history', { taskId }),

  // CLI Router - Agent Execution
  runAgent: (request: RunAgentRequest) =>
    invoke<RunAgentResponse>('run_agent', { request }),

  stopAgent: () =>
    invoke<void>('stop_agent'),

  getAgentStatus: () =>
    invoke<RouterAgentStatus>('get_agent_status'),
};
