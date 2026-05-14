/**
 * Property 6: Event state machine rejects out-of-sequence events
 *
 * For any sequence of Pi events, streaming events (message_update,
 * tool_execution_start/update/end) received when the session is not in
 * an active streaming state (no preceding agent_start without a matching
 * agent_end) SHALL be discarded and not modify the message state.
 *
 * **Validates: Requirements 4.9**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PiEvent } from './types';
import { processEvent, processEventSequence, type StateMachineState } from './eventStateMachine';

// ─── Generators ─────────────────────────────────────────────────────────

/** Generate a message_update event */
const messageUpdateArb: fc.Arbitrary<PiEvent> = fc.record({
  type: fc.constant('message_update' as const),
  message: fc.constant(undefined),
  assistant_message_event: fc.constant(undefined),
});

/** Generate a tool_execution_start event */
const toolExecutionStartArb: fc.Arbitrary<PiEvent> = fc.record({
  type: fc.constant('tool_execution_start' as const),
  tool_call_id: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  tool_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  args: fc.constant(undefined),
});

/** Generate a tool_execution_update event */
const toolExecutionUpdateArb: fc.Arbitrary<PiEvent> = fc.record({
  type: fc.constant('tool_execution_update' as const),
  tool_call_id: fc.option(fc.string(), { nil: undefined }),
  tool_name: fc.option(fc.string(), { nil: undefined }),
  partial_result: fc.constant(undefined),
});

/** Generate a tool_execution_end event */
const toolExecutionEndArb: fc.Arbitrary<PiEvent> = fc.record({
  type: fc.constant('tool_execution_end' as const),
  tool_call_id: fc.option(fc.string(), { nil: undefined }),
  tool_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  result: fc.constant(undefined),
  is_error: fc.option(fc.boolean(), { nil: undefined }),
});

/** Generate any streaming event (events that require active streaming state) */
const streamingEventArb: fc.Arbitrary<PiEvent> = fc.oneof(
  messageUpdateArb,
  toolExecutionStartArb,
  toolExecutionUpdateArb,
  toolExecutionEndArb
);

/** Generate agent_start event */
const agentStartArb: fc.Arbitrary<PiEvent> = fc.constant({ type: 'agent_start' as const });

/** Generate agent_end event */
const agentEndArb: fc.Arbitrary<PiEvent> = fc.constant({ type: 'agent_end' as const });

/** Generate any PiEvent */
const piEventArb: fc.Arbitrary<PiEvent> = fc.oneof(
  agentStartArb,
  agentEndArb,
  messageUpdateArb,
  toolExecutionStartArb,
  toolExecutionUpdateArb,
  toolExecutionEndArb,
  fc.constant({ type: 'compaction_start' as const }),
  fc.constant({ type: 'compaction_end' as const }),
  fc.constant({ type: 'auto_retry_start' as const }),
  fc.constant({ type: 'auto_retry_end' as const }),
  fc.constant({ type: 'turn_start' as const }),
  fc.constant({ type: 'turn_end' as const }),
  fc.constant({ type: 'message_start' as const }),
  fc.constant({ type: 'message_end' as const }),
  fc.record({
    type: fc.constant('response' as const),
    command: fc.string({ minLength: 1 }),
    success: fc.boolean(),
    data: fc.constant(undefined),
    error: fc.option(fc.string(), { nil: undefined }),
  }),
  fc.record({
    type: fc.constant('extension_error' as const),
    error: fc.option(fc.string(), { nil: undefined }),
  })
);

/** Generate an arbitrary sequence of PiEvents */
const piEventSequenceArb: fc.Arbitrary<PiEvent[]> = fc.array(piEventArb, {
  minLength: 1,
  maxLength: 50,
});

// ─── Property Tests ─────────────────────────────────────────────────────

describe('Property 6: Event state machine rejects out-of-sequence events', () => {
  it('streaming events in idle state (no preceding agent_start) are discarded', () => {
    fc.assert(
      fc.property(streamingEventArb, (event) => {
        // When in idle state, streaming events should not modify messages
        const result = processEvent('idle', event);
        expect(result.state).toBe('idle');
        expect(result.messagesModified).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('streaming events in streaming state (after agent_start) are processed', () => {
    fc.assert(
      fc.property(streamingEventArb, (event) => {
        // When in streaming state, streaming events should modify messages
        const result = processEvent('streaming', event);
        expect(result.state).toBe('streaming');
        expect(result.messagesModified).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('arbitrary event sequences: streaming events without preceding agent_start are always discarded', () => {
    fc.assert(
      fc.property(piEventSequenceArb, (events) => {
        // Track state manually and verify the state machine behavior
        let state: StateMachineState = 'idle';

        for (const event of events) {
          const isStreamingEvent = [
            'message_update',
            'tool_execution_start',
            'tool_execution_update',
            'tool_execution_end',
          ].includes(event.type);

          const result = processEvent(state, event);

          if (isStreamingEvent && state !== 'streaming') {
            // Property: streaming events in non-streaming state are discarded
            expect(result.messagesModified).toBe(false);
            expect(result.state).toBe(state); // State unchanged
          }

          if (isStreamingEvent && state === 'streaming') {
            // Streaming events in streaming state are processed
            expect(result.messagesModified).toBe(true);
          }

          // Update state for next iteration
          state = result.state;
        }
      }),
      { numRuns: 200 }
    );
  });

  it('agent_start transitions from idle to streaming', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = processEvent('idle', { type: 'agent_start' });
        expect(result.state).toBe('streaming');
        expect(result.messagesModified).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('agent_end transitions from streaming to idle', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = processEvent('streaming', { type: 'agent_end' });
        expect(result.state).toBe('idle');
        expect(result.messagesModified).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('processEventSequence correctly tracks state across arbitrary sequences', () => {
    fc.assert(
      fc.property(piEventSequenceArb, (events) => {
        const { finalState, modifications } = processEventSequence(events);

        // Verify by replaying manually
        let expectedState: StateMachineState = 'idle';
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          const isStreamingEvent = [
            'message_update',
            'tool_execution_start',
            'tool_execution_update',
            'tool_execution_end',
          ].includes(event.type);

          if (isStreamingEvent && expectedState !== 'streaming') {
            // Should be discarded
            expect(modifications[i]).toBe(false);
          }

          // Update expected state
          if (event.type === 'agent_start') {
            expectedState = 'streaming';
          } else if (event.type === 'agent_end') {
            expectedState = 'idle';
          }
        }

        expect(finalState).toBe(expectedState);
      }),
      { numRuns: 200 }
    );
  });

  it('interleaved agent_start/agent_end with streaming events: only events between start/end are processed', () => {
    // Generate sequences that have a mix of agent_start, agent_end, and streaming events
    const interleavedArb = fc.array(
      fc.oneof(
        agentStartArb,
        agentEndArb,
        streamingEventArb
      ),
      { minLength: 2, maxLength: 30 }
    );

    fc.assert(
      fc.property(interleavedArb, (events) => {
        let state: StateMachineState = 'idle';

        for (const event of events) {
          const wasStreaming = state === 'streaming';
          const result = processEvent(state, event);

          const isStreamingEvent = [
            'message_update',
            'tool_execution_start',
            'tool_execution_update',
            'tool_execution_end',
          ].includes(event.type);

          if (isStreamingEvent) {
            if (wasStreaming) {
              // Should be processed
              expect(result.messagesModified).toBe(true);
            } else {
              // Should be discarded
              expect(result.messagesModified).toBe(false);
            }
          }

          state = result.state;
        }
      }),
      { numRuns: 200 }
    );
  });
});
