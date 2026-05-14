/**
 * Pure event state machine for Pi event processing.
 * Extracts the state machine logic from piStore for testability.
 *
 * State transitions:
 * - idle → streaming: on agent_start
 * - streaming → idle: on agent_end
 *
 * Streaming events (message_update, tool_execution_start/update/end)
 * are only processed when in 'streaming' state. Otherwise they are discarded.
 */

import type { PiEvent } from './types';

export type StateMachineState = 'idle' | 'streaming';

export interface EventStateMachineResult {
  state: StateMachineState;
  messagesModified: boolean;
}

/**
 * Streaming event types that should only be processed during active streaming.
 */
const STREAMING_EVENT_TYPES = new Set([
  'message_update',
  'tool_execution_start',
  'tool_execution_update',
  'tool_execution_end',
]);

/**
 * Process a single PiEvent against the current state machine state.
 * Returns the new state and whether messages were modified.
 */
export function processEvent(
  currentState: StateMachineState,
  event: PiEvent
): EventStateMachineResult {
  switch (event.type) {
    case 'agent_start':
      return { state: 'streaming', messagesModified: true };

    case 'agent_end':
      return { state: 'idle', messagesModified: true };

    default:
      // Streaming events are discarded if not in streaming state
      if (STREAMING_EVENT_TYPES.has(event.type)) {
        if (currentState !== 'streaming') {
          return { state: currentState, messagesModified: false };
        }
        return { state: currentState, messagesModified: true };
      }
      // Non-streaming events (models_response, session_stats, error, etc.)
      // are always processed regardless of state
      return { state: currentState, messagesModified: true };
  }
}

/**
 * Process a sequence of PiEvents, tracking state transitions and
 * which events modified messages.
 */
export function processEventSequence(
  events: PiEvent[]
): { finalState: StateMachineState; modifications: boolean[] } {
  let state: StateMachineState = 'idle';
  const modifications: boolean[] = [];

  for (const event of events) {
    const result = processEvent(state, event);
    state = result.state;
    modifications.push(result.messagesModified);
  }

  return { finalState: state, modifications };
}
