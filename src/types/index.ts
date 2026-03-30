// Task types
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'failed';
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
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'failed';
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
