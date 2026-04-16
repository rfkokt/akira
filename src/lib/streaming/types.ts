/**
 * Structured Streaming Types for Agent Output
 * Matches the Rust AgentEvent enum
 */

export type AgentEventType = 
  | 'thinking'
  | 'text'
  | 'tool_use'
  | 'tool_output'
  | 'usage'
  | 'done'
  | 'error';

export interface AgentEvent {
  type: AgentEventType;
}

export interface ThinkingEvent extends AgentEvent {
  type: 'thinking';
  thinking: string;
}

export interface TextEvent extends AgentEvent {
  type: 'text';
  text: string;
}

export interface ToolUseEvent extends AgentEvent {
  type: 'tool_use';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ToolOutputEvent extends AgentEvent {
  type: 'tool_output';
  tool_output: string;
}

export interface UsageEvent extends AgentEvent {
  type: 'usage';
  input_tokens: number;
  output_tokens: number;
}

export interface DoneEvent extends AgentEvent {
  type: 'done';
}

export interface ErrorEvent extends AgentEvent {
  type: 'error';
  error: string;
}

export type AnyAgentEvent = 
  | ThinkingEvent 
  | TextEvent 
  | ToolUseEvent 
  | ToolOutputEvent 
  | UsageEvent 
  | DoneEvent 
  | ErrorEvent;

/**
 * Accumulated stream data
 */
export interface StreamAccumulator {
  events: AnyAgentEvent[];
  textBuffer: string;
  thinkingBuffer: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  isComplete: boolean;
  error: string | null;
}

/**
 * Parse NDJSON line into AgentEvent
 */
export function parseAgentEvent(line: string): AnyAgentEvent | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;
    
    const parsed = JSON.parse(trimmed) as AnyAgentEvent;
    
    // Validate event type
    const validTypes: AgentEventType[] = ['thinking', 'text', 'tool_use', 'tool_output', 'usage', 'done', 'error'];
    if (!validTypes.includes(parsed.type)) {
      console.warn('[AgentEvent] Unknown event type:', parsed.type);
      return null;
    }
    
    return parsed;
  } catch (e) {
    // Not valid JSON, treat as plain text
    return {
      type: 'text',
      text: line,
    };
  }
}

/**
 * Parse multiple NDJSON lines
 */
export function parseNdjsonLines(lines: string): AnyAgentEvent[] {
  return lines
    .split('\n')
    .map(parseAgentEvent)
    .filter((e): e is AnyAgentEvent => e !== null);
}

/**
 * Accumulate events and extract content
 */
export function accumulateEvents(events: AnyAgentEvent[]): StreamAccumulator {
  const accumulator: StreamAccumulator = {
    events,
    textBuffer: '',
    thinkingBuffer: '',
    totalInputTokens: 0,
    totalOutputTokens: 0,
    isComplete: false,
    error: null,
  };
  
  for (const event of events) {
    switch (event.type) {
      case 'thinking':
        accumulator.thinkingBuffer += event.thinking;
        break;
      case 'text':
        accumulator.textBuffer += event.text;
        break;
      case 'usage':
        accumulator.totalInputTokens = event.input_tokens;
        accumulator.totalOutputTokens = event.output_tokens;
        break;
      case 'done':
        accumulator.isComplete = true;
        break;
      case 'error':
        accumulator.error = event.error;
        break;
    }
  }
  
  return accumulator;
}

/**
 * Get human-readable description of event
 */
export function getEventDescription(event: AnyAgentEvent): string {
  switch (event.type) {
    case 'thinking':
      return 'Thinking';
    case 'text':
      return 'Text';
    case 'tool_use':
      return `Tool: ${event.tool_name}`;
    case 'tool_output':
      return 'Tool Output';
    case 'usage':
      return `Usage: ${event.input_tokens} in / ${event.output_tokens} out`;
    case 'done':
      return 'Complete';
    case 'error':
      return `Error: ${event.error}`;
    default:
      return 'Unknown';
  }
}

/**
 * Extract tool uses from events
 */
export function extractToolUses(events: AnyAgentEvent[]): ToolUseEvent[] {
  return events.filter((e): e is ToolUseEvent => e.type === 'tool_use');
}

/**
 * Check if event is a terminal event (done or error)
 */
export function isTerminalEvent(event: AnyAgentEvent): boolean {
  return event.type === 'done' || event.type === 'error';
}

/**
 * Format token count for display
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
