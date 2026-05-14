/**
 * TaskChat Component
 *
 * Per-task chat UI powered by Pi (pi.dev). Displays streaming messages,
 * tool executions, thinking sections, and supports steer/abort during generation.
 *
 * Requirements: 4.1-4.10, 7.1-7.10, 13.1-13.5
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  Send,
  Square,
  Loader2,
  Bot,
  User,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Wrench,
  AlertCircle,
  Brain,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import { usePiStore } from '@/store/piStore';
import { isValidInput } from '@/lib/pi/validation';
import { sortMessagesByTimestamp } from '@/lib/pi/messages';
import type { PiChatMessage, ToolExecution } from '@/lib/pi/types';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CompactionNotification } from './CompactionNotification';

// ─── Props ──────────────────────────────────────────────────────────────

interface TaskChatProps {
  taskId: string;
  workspacePath: string;
}

// ─── Sub-components ─────────────────────────────────────────────────────

/**
 * ThinkingSection — Collapsible thinking content, collapsed by default.
 * Requirement 4.2
 */
const ThinkingSection = memo(function ThinkingSection({
  thinking,
}: {
  thinking: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!thinking) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-purple-400/80 hover:text-purple-300 transition-colors mt-2 mb-1">
          <Brain className="w-3 h-3" />
          <span className="font-medium">Thinking</span>
          <ChevronDown
            className={cn(
              'w-3 h-3 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-xs text-app-text-muted/70 bg-purple-500/5 border border-purple-500/20 rounded-lg px-3 py-2 mt-1 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">
          {thinking}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

/**
 * ToolExecutionCard — Shows tool name, status indicator, collapsible result.
 * Requirements 4.5, 4.6, 4.7
 */
const ToolExecutionCard = memo(function ToolExecutionCard({
  tool,
}: {
  tool: ToolExecution;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const statusIcon = {
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  };

  const statusLabel = {
    running: tool.statusText || 'Running...',
    success: 'Completed',
    error: 'Failed',
  };

  return (
    <div className="rounded-lg border border-app-border/50 bg-app-bg/40 overflow-hidden my-1.5">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-app-panel/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {statusIcon[tool.status]}
              <Wrench className="w-3 h-3 text-app-text-muted" />
              <span className="text-xs font-mono truncate text-app-text">
                {tool.toolName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-xs font-medium',
                  tool.status === 'success' && 'text-green-400',
                  tool.status === 'error' && 'text-red-400',
                  tool.status === 'running' && 'text-blue-400'
                )}
              >
                {statusLabel[tool.status]}
              </span>
              {tool.result && (
                <ChevronDown
                  className={cn(
                    'w-3 h-3 text-app-text-muted transition-transform',
                    isOpen && 'rotate-180'
                  )}
                />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        {tool.result && (
          <CollapsibleContent>
            <div className="border-t border-app-border/50 px-3 py-2">
              <pre className="text-[11px] font-mono text-app-text/70 bg-app-panel/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                {tool.result}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
});

/**
 * StreamingMessage — Renders in-progress assistant message with animated cursor.
 * Requirement 4.1, 4.3
 */
const StreamingMessage = memo(function StreamingMessage({
  content,
}: {
  content: string;
}) {
  return (
    <span>
      {content}
      <span className="inline-block w-1.5 h-4 bg-app-accent animate-pulse ml-0.5 align-middle rounded-sm" />
    </span>
  );
});

/**
 * AutoRetryNotification — Displayed when Pi is retrying.
 * Requirements 7.7, 7.8
 */
const AutoRetryNotification = memo(function AutoRetryNotification() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400 mx-4 my-2">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      <span>Pi is retrying the operation...</span>
    </div>
  );
});

/**
 * MessageItem — Renders a single chat message (user, assistant, steer, system).
 */
const MessageItem = memo(function MessageItem({
  message,
  isStreaming,
}: {
  message: PiChatMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === 'user';
  const isSteer = message.role === 'steer';
  const isAssistant = message.role === 'assistant';
  const isLastAssistant = isAssistant && isStreaming;

  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        isUser || isSteer ? 'items-end' : 'items-start'
      )}
    >
      {/* Role label */}
      <div
        className={cn(
          'flex items-center gap-1.5 opacity-70',
          isUser || isSteer ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {isUser && <User className="w-3 h-3 text-app-accent" />}
        {isSteer && <Navigation className="w-3 h-3 text-orange-400" />}
        {isAssistant && <Bot className="w-3 h-3 text-app-accent" />}
        <span
          className={cn(
            'text-xs font-semibold tracking-wider uppercase',
            isSteer ? 'text-orange-400' : 'text-app-text-muted'
          )}
        >
          {isSteer ? 'Steer' : message.role}
        </span>
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          'px-4 py-2.5 rounded-2xl max-w-[90%] shadow-sm border text-[13px] leading-relaxed',
          isUser &&
            'bg-app-accent/15 border-app-accent/20 text-blue-50 rounded-tr-sm',
          isSteer &&
            'bg-orange-500/10 border-orange-500/25 text-orange-100 rounded-tr-sm',
          isAssistant &&
            'bg-app-bg/50 border-app-border text-app-text rounded-tl-sm'
        )}
      >
        {/* Thinking section for assistant messages */}
        {isAssistant && message.thinking && (
          <ThinkingSection thinking={message.thinking} />
        )}

        {/* Message content */}
        <div className="whitespace-pre-wrap break-words">
          {isLastAssistant ? (
            message.content ? (
              <StreamingMessage content={message.content} />
            ) : (
              <span className="inline-flex items-center gap-1 h-4">
                <span
                  className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
            )
          ) : (
            message.content
          )}
        </div>

        {/* Tool executions */}
        {isAssistant &&
          message.toolExecutions &&
          message.toolExecutions.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.toolExecutions.map((tool) => (
                <ToolExecutionCard key={tool.id} tool={tool} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
});

/**
 * MessageList — Renders chronological messages with auto-scroll.
 * Requirements 7.1, 4.8
 */
function MessageList({
  messages,
  isStreaming,
  error,
  isRetrying,
  isCompacting,
}: {
  messages: PiChatMessage[];
  isStreaming: boolean;
  error: string | null;
  isRetrying: boolean;
  isCompacting: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track whether user is scrolled to bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 40;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll when new content arrives and user was at bottom
  useEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const sortedMessages = sortMessagesByTimestamp(messages);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0"
    >
      {sortedMessages.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center h-full text-center mt-10">
          <div className="w-14 h-14 bg-app-accent/10 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_var(--app-accent-glow)]">
            <Bot className="w-7 h-7 text-app-accent opacity-60" />
          </div>
          <p className="text-sm font-medium text-app-text mb-1">
            Start a conversation with Pi
          </p>
          <p className="text-xs text-app-text-muted/70 max-w-[220px] leading-relaxed">
            Send a message to begin working on this task with Pi
          </p>
        </div>
      ) : (
        sortedMessages.map((msg, idx) => {
          const isLastAssistant =
            isStreaming &&
            msg.role === 'assistant' &&
            idx === sortedMessages.length - 1;
          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isStreaming={isLastAssistant}
            />
          );
        })
      )}

      {/* Compaction notification */}
      {isCompacting && (
        <CompactionNotification isCompacting={isCompacting} />
      )}

      {/* Auto-retry notification */}
      {isRetrying && <AutoRetryNotification />}

      {/* Inline error display */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div ref={bottomRef} className="h-2" />
    </div>
  );
}

/**
 * ChatInput — Text input with send/steer/abort buttons.
 * Requirements 7.2, 7.3, 7.4, 7.10, 13.1, 13.2
 */
const ChatInput = memo(function ChatInput({
  taskId,
  isStreaming,
  sendMessageFn,
}: {
  taskId: string;
  isStreaming: boolean;
  sendMessageFn: (taskId: string, content: string) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendSteer, abort } = usePiStore();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSubmit = useCallback(() => {
    if (!isValidInput(message)) return;

    const content = message.trim();
    setMessage('');

    if (isStreaming) {
      // During streaming, submit as steer command (Requirement 13.1, 13.2)
      sendSteer(taskId, content);
    } else {
      // Normal prompt submission (Requirement 7.2)
      sendMessageFn(taskId, content);
    }
  }, [message, isStreaming, taskId, sendMessageFn, sendSteer]);

  const handleAbort = useCallback(() => {
    abort(taskId);
  }, [taskId, abort]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const canSubmit = isValidInput(message);

  return (
    <div className="shrink-0 p-3 bg-app-sidebar/80 backdrop-blur-md border-t border-app-border/60">
      {/* Streaming status indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <Loader2 className="w-3 h-3 animate-spin text-app-accent" />
          <span className="text-xs text-app-text-muted">
            Pi is generating... You can steer or abort.
          </span>
        </div>
      )}

      <div className="flex items-end gap-2.5">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Send a steer message...'
              : 'Send a message to Pi...'
          }
          className="flex-1 px-4 py-3 rounded-xl text-sm bg-[#1e1e1e] text-white placeholder-neutral-500 border border-app-border focus:outline-none focus:border-app-accent/70 focus:ring-1 focus:ring-app-accent/30 resize-none transition-all shadow-inner custom-scrollbar"
          rows={1}
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Abort button — visible during streaming */}
          {isStreaming && (
            <Button
              size="icon"
              onClick={handleAbort}
              className="w-10 h-10 rounded-xl bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 transition-all"
              title="Abort generation"
            >
              <Square className="w-4 h-4 text-red-400 fill-red-400" />
            </Button>
          )}

          {/* Send / Steer button */}
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'w-10 h-10 rounded-xl transition-all disabled:opacity-50 disabled:shadow-none',
              isStreaming
                ? 'bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                : 'bg-app-accent hover:bg-app-accent-hover shadow-[0_0_15px_var(--app-accent-glow)]'
            )}
            title={isStreaming ? 'Send steer message' : 'Send message'}
          >
            {isStreaming ? (
              <Navigation className="w-4 h-4 text-orange-400" />
            ) : (
              <Send className="w-4 h-4 text-white ml-0.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────

export function TaskChat({ taskId, workspacePath }: TaskChatProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const rulesLoadedRef = useRef(false);
  const rulesContentRef = useRef<string | null>(null);

  // Subscribe to the task session from piStore
  const session = usePiStore(
    useCallback((state) => state.taskSessions[taskId], [taskId])
  );
  const sendMessage = usePiStore((state) => state.sendMessage);

  const messages = session?.messages ?? [];
  const isStreaming = session?.isStreaming ?? false;
  const isCompacting = session?.isCompacting ?? false;
  const error = session?.error ?? null;

  // Initialize Pi session on mount: check for existing session or spawn new one
  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      try {
        // Check for existing session for this task
        const existingSessionId = await invoke<string | null>('pi_get_task_session', { taskId });

        if (cancelled) return;

        // Spawn Pi process (with session_id for resume if one exists)
        await invoke('pi_spawn', {
          taskId,
          workspacePath,
          sessionId: existingSessionId ?? undefined,
        });

        if (cancelled) return;
        setSessionReady(true);
        setInitError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[TaskChat] Failed to initialize Pi session:', err);
        setInitError(String(err));
      }
    };

    initSession();

    return () => {
      cancelled = true;
    };
  }, [taskId, workspacePath]);

  // Load rules content on mount (for injection into first prompt)
  useEffect(() => {
    if (rulesLoadedRef.current) return;
    rulesLoadedRef.current = true;

    const loadRules = async () => {
      try {
        const rules = await invoke<string | null>('pi_get_rules', { workspacePath });
        rulesContentRef.current = rules;
      } catch (err) {
        console.warn('[TaskChat] Failed to load rules:', err);
        rulesContentRef.current = null;
      }
    };

    loadRules();
  }, [workspacePath]);

  // Wrap sendMessage to inject rules on first prompt in a new session
  const handleSendMessage = useCallback(
    async (taskId: string, content: string) => {
      const currentMessages = usePiStore.getState().taskSessions[taskId]?.messages ?? [];
      const hasUserMessages = currentMessages.some((m) => m.role === 'user');

      // If this is the first user message and we have rules, prepend them
      if (!hasUserMessages && rulesContentRef.current) {
        const rulesPrefix = `<rules>\n${rulesContentRef.current}\n</rules>\n\n`;
        await sendMessage(taskId, rulesPrefix + content);
      } else {
        await sendMessage(taskId, content);
      }
    },
    [sendMessage]
  );

  // Handle auto_retry events by listening to the session's tool executions
  // and streaming state. We track retrying via piStore events.
  // The piStore handlePiEvent dispatches auto_retry_start/end but doesn't
  // currently set a flag — we'll track it locally via a listener.
  useEffect(() => {
    // We subscribe to the raw Tauri event for auto_retry_start/end
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlistenFn = await listen<{ taskId: string; event: { type: string } }>(
        'pi-event',
        (event) => {
          if (event.payload.taskId !== taskId) return;
          const piEvent = event.payload.event;
          if (piEvent.type === 'auto_retry_start') {
            setIsRetrying(true);
          } else if (piEvent.type === 'auto_retry_end') {
            setIsRetrying(false);
          }
        }
      );
      unlisten = unlistenFn;
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [taskId]);

  // Show initialization error if session failed to start
  if (initError) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4">
        <div className="flex items-start gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 max-w-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Failed to initialize Pi session</p>
            <p className="text-xs text-red-400/80">{initError}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while session is being initialized
  if (!sessionReady) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-app-accent mb-2" />
        <p className="text-xs text-app-text-muted">Initializing Pi session...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        error={error}
        isRetrying={isRetrying}
        isCompacting={isCompacting}
      />
      <ChatInput taskId={taskId} isStreaming={isStreaming} sendMessageFn={handleSendMessage} />
    </div>
  );
}
