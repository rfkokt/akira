// Task types
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'failed' | 'backlog';
  priority: 'low' | 'medium' | 'high';
  file_path: string | null;
  workspace_id: string | null;
  pr_branch: string | null;
  pr_url: string | null;
  pr_created_at: string | null;
  remote: string | null;
  is_merged: boolean;
  merge_source_branch: string | null;
  merged_at: string | null;
  diff_content: string | null; // Snapshot diff saat task selesai
  diff_captured_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'failed' | 'backlog';
  priority: 'low' | 'medium' | 'high';
  file_path?: string;
  workspace_id?: string;
}

// Engine types
export interface Engine {
  id: number;
  alias: string;
  binary_path: string;
  model: string;
  args: string;
  enabled: boolean;
  created_at: string;
}

export interface CreateEngineRequest {
  alias: string;
  binary_path: string;
  model: string;
  args: string;
}

// Chat types
export interface ChatMessage {
  id: number;
  task_id: string;
  role: 'user' | 'assistant';
  content: string;
  engine_alias: string;
  created_at: string;
}

// CLI types
export interface CliOutputEvent {
  line: string;
  is_error: boolean;
}

export interface CliCompleteEvent {
  success: boolean;
  exit_code: number | null;
  error_message: string | null;
}

// Assessment types - re-exported from assessment.ts
export * from './assessment';

// RTK types
export interface RtkStats {
  input_tokens: number;
  output_tokens: number;
  savings_pct: number;
}

export interface GitDiffResult {
  diff: string;
  has_changes: boolean;
  changed_files: string[];
  rtk_stats?: RtkStats | null;
}

export interface PRDiffResult {
  diff: string;
  has_changes: boolean;
  changed_files: string[];
  rtk_stats?: RtkStats | null;
}

export interface ShellCommandResult {
  success: boolean;
  output: string;
  rtk_stats?: RtkStats | null;
}

export interface RtkInstallResult {
  installed: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

export interface RtkCommandResult {
  success: boolean;
  output: string;
  input_tokens: number;
  output_tokens: number;
  savings_pct: number;
  raw_output?: string | null;
}

export interface RtkCommandStats {
  cmd: string;
  count: number;
  avg_savings: number;
}

export interface RtkGainStats {
  total_commands: number;
  total_saved: number;
  avg_savings: number;
  top_commands: RtkCommandStats[];
}

// CLI Router types
export interface RouterProviderInfo {
  alias: string;
  binary_path: string;
  model: string;
  args: string[];
  status: 'idle' | 'running' | 'error' | 'token_limit_reached';
  current_task_id: string | null;
  enabled: boolean;
}

export interface RouterConfig {
  auto_switch_enabled: boolean;
  confirm_before_switch: boolean;
  token_limit_threshold: number;
  fallback_order: string;
  budget_limit: number;
  budget_alert_threshold: number;
}

export interface RouterSession {
  id: string;
  task_id: string;
  provider_alias: string;
  created_at: string;
  updated_at: string;
}

export interface ContextMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_count: number | null;
  timestamp: string;
}

export interface ProviderCostSummary {
  provider_alias: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  last_used: string | null;
}

export interface SwitchHistory {
  id: number;
  task_id: string;
  from_provider: string;
  to_provider: string;
  reason: string;
  switched_at: string;
}

export interface RunAgentRequest {
  task_id: string;
  provider_alias: string;
  prompt: string;
  cwd: string;
  session_id?: string;
}

export interface RunAgentResponse {
  session_id: string;
  provider_alias: string;
  output: string;
  switched: boolean;
  new_provider: string | null;
}

export interface RouterAgentStatus {
  is_running: boolean;
  task_id: string | null;
  provider_alias: string | null;
}

export interface PtyRequest {
  session_id: string;
  binary: string;
  args: string[];
  cwd: string;
}

export interface PtyWriteRequest {
  session_id: string;
  data: string;
}

export interface PtyResizeRequest {
  session_id: string;
  rows: number;
  cols: number;
}
