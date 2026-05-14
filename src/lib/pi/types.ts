export interface PiChatMessage {
  id: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system' | 'steer';
  content: string;
  thinking?: string;
  toolExecutions?: ToolExecution[];
  timestamp: number;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  status: 'running' | 'success' | 'error';
  statusText?: string;
  result?: string;
}

export interface SessionStats {
  tokensUsed: number;
  contextWindowPct: number;
  isStale: boolean;
}

export interface PiModel {
  id: string;
  name: string;
  provider: string;
}

export interface PiAuthStatus {
  authenticated: boolean;
  error?: string;
}

export interface TaskSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PiEventPayload {
  taskId: string;
  event: PiEvent;
}

// Matches the actual Pi RPC event format
export type AssistantMessageEvent =
  | { type: 'start' }
  | { type: 'text_start'; contentIndex?: number }
  | { type: 'text_delta'; contentIndex?: number; delta?: string }
  | { type: 'text_end'; contentIndex?: number; content?: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta?: string }
  | { type: 'thinking_end' }
  | { type: 'toolcall_start'; id?: string; name?: string }
  | { type: 'toolcall_delta'; delta?: string }
  | { type: 'toolcall_end'; toolCall?: unknown }
  | { type: 'done'; reason?: string }
  | { type: 'error'; reason?: string };

export type PiEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages?: unknown }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message?: unknown }
  | { type: 'message_start'; message?: unknown }
  | { type: 'message_end'; message?: unknown }
  | { type: 'message_update'; message?: unknown; assistantMessageEvent?: AssistantMessageEvent | null }
  | { type: 'tool_execution_start'; tool_call_id?: string; tool_name?: string; args?: unknown }
  | { type: 'tool_execution_update'; tool_call_id?: string; tool_name?: string; partial_result?: unknown }
  | { type: 'tool_execution_end'; tool_call_id?: string; tool_name?: string; result?: unknown; is_error?: boolean }
  | { type: 'compaction_start'; reason?: string }
  | { type: 'compaction_end'; reason?: string; result?: unknown }
  | { type: 'auto_retry_start'; attempt?: number; max_attempts?: number }
  | { type: 'auto_retry_end'; success?: boolean }
  | { type: 'queue_update'; steering?: string[]; follow_up?: string[] }
  | { type: 'response'; command: string; success: boolean; data?: unknown; error?: string }
  | { type: 'extension_error'; error?: string };

export interface PiSessionState {
  sessionId: string | null;
  isStreaming: boolean;
  isCompacting: boolean;
  messages: PiChatMessage[];
  currentThinking: string;
  toolExecutions: ToolExecution[];
  sessionStats: SessionStats | null;
  error: string | null;
}
