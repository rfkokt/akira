import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, AlertCircle, RotateCcw, Sparkles, X, Brain, Activity } from 'lucide-react';
import { usePiStore } from '@/store/piStore';
import { useTaskStore } from '@/store/taskStore';
import { getTaskCreationContext } from '@/lib/pi/taskCreationContext';
import type { TaskSuggestion, PiChatMessage } from '@/lib/pi/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Constants ──────────────────────────────────────────────────────────

const RESPONSE_TIMEOUT_MS = 30_000;

// ─── Helpers ────────────────────────────────────────────────────────────

function parseTaskSuggestion(content: string): TaskSuggestion | null {
  try {
    // Try to find JSON in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Check if it's an error response
    if (parsed.error) return null;

    if (!parsed.title || typeof parsed.title !== 'string') return null;

    const priority = ['high', 'medium', 'low'].includes(parsed.priority)
      ? (parsed.priority as 'high' | 'medium' | 'low')
      : 'medium';

    return {
      title: String(parsed.title).substring(0, 100),
      description: String(parsed.description || '').substring(0, 2500),
      priority,
    };
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────────

interface TaskCreationDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  onHide?: () => void;
}

export function TaskCreationDialog({ isOpen, onClose, onHide }: TaskCreationDialogProps) {
  // If onHide is provided, render as a panel (not a dialog)
  const isPanelMode = !!onHide;
  const isVisible = isPanelMode ? true : !!isOpen;
  const { createTask } = useTaskStore();
  const {
    taskCreationSession,
    startTaskCreation,
    sendTaskCreationMessage,
    endTaskCreation,
  } = usePiStore();

  // Local state
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<TaskSuggestion | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPriority, setEditedPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = taskCreationSession?.messages ?? [];
  const isStreaming = taskCreationSession?.isStreaming ?? false;

  // ── Initialize session on open ──────────────────────────────────────

  useEffect(() => {
    if (isVisible && !taskCreationSession) {
      startTaskCreation();
    }
  }, [isVisible, taskCreationSession, startTaskCreation]);

  // ── Auto-scroll messages ────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Parse response when streaming ends ──────────────────────────────

  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content) {
        // Clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsTimedOut(false);

        const parsed = parseTaskSuggestion(lastMessage.content);
        if (parsed) {
          // Successfully extracted a task suggestion
          setSuggestion(parsed);
          setEditedTitle(parsed.title);
          setEditedDescription(parsed.description);
          setEditedPriority(parsed.priority);
          setExtractionError(null);
        } else {
          // No task extracted — this is fine, it's just a conversational response
          // Only show error if Pi explicitly returned a JSON error object
          const jsonMatch = lastMessage.content.match(/```json\s*([\s\S]*?)```/) || lastMessage.content.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            try {
              const obj = JSON.parse(jsonMatch[1].trim());
              if (obj.error) {
                // Pi explicitly said it can't extract — but don't show as error banner
                // The message is already displayed in the chat bubble
              }
            } catch {
              // Not valid JSON, just conversational text — totally fine
            }
          }
          // Don't set extractionError for conversational responses
          setExtractionError(null);
          setSuggestion(null);
        }
      }
    }
  }, [isStreaming, messages]);

  // ── Cleanup on close ────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    endTaskCreation();
    setSuggestion(null);
    setEditedTitle('');
    setEditedDescription('');
    setEditedPriority('medium');
    setExtractionError(null);
    setIsTimedOut(false);
    setInput('');
    setIsCreating(false);
    onClose?.();
  }, [endTaskCreation, onClose]);

  // ── Send message ────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    setSuggestion(null);
    setExtractionError(null);
    setIsTimedOut(false);

    // Start timeout
    timeoutRef.current = setTimeout(() => {
      setIsTimedOut(true);
    }, RESPONSE_TIMEOUT_MS);

    await sendTaskCreationMessage(trimmed);
  }, [input, isStreaming, sendTaskCreationMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Retry ───────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    setExtractionError(null);
    setIsTimedOut(false);

    // Use context window to find the last user message for retry
    const contextMessages = getTaskCreationContext(messages);
    const lastUserMsg = [...contextMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      timeoutRef.current = setTimeout(() => {
        setIsTimedOut(true);
      }, RESPONSE_TIMEOUT_MS);
      sendTaskCreationMessage(lastUserMsg.content);
    }
  }, [messages, sendTaskCreationMessage]);

  // ── Confirm task creation ───────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!editedTitle.trim()) return;

    setIsCreating(true);
    try {
      await createTask({
        title: editedTitle.trim().substring(0, 100),
        description: editedDescription.trim().substring(0, 2500) || undefined,
        priority: editedPriority,
        status: 'todo',
      });
      handleClose();
    } catch (error) {
      console.error('[TaskCreationDialog] Failed to create task:', error);
      setIsCreating(false);
    }
  }, [editedTitle, editedDescription, editedPriority, createTask, handleClose]);

  // ── Render ──────────────────────────────────────────────────────────

  const chatContent = (
    <>
      {/* Chat Messages Area */}
      <ScrollArea className="flex-1 min-h-0 border border-app-border/50 rounded-lg p-3">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-app-text-muted text-center py-4">
              Describe what you need done — Pi will extract a structured task for you.
            </p>
          )}

          {messages.map((msg: PiChatMessage) => {
            // For assistant messages, parse and display human-readable content
            let displayContent = msg.content;
            if (msg.role === 'assistant' && msg.content) {
              // Try to extract readable text from JSON response
              try {
                const jsonMatch = msg.content.match(/```json\s*([\s\S]*?)```/) || msg.content.match(/(\{[\s\S]*\})/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[1].trim());
                  if (parsed.error) {
                    displayContent = parsed.error;
                  } else if (parsed.title) {
                    displayContent = `✅ Task extracted: "${parsed.title}"`;
                  }
                }
              } catch {
                // If parsing fails, show as-is
              }
            }

            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-app-accent/20 text-app-text border border-app-accent/30'
                      : 'bg-app-sidebar text-app-text border border-app-border/50'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{displayContent}</p>
                </div>
              </div>
            );
          })}

          {isStreaming && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-app-sidebar border border-app-border/50">
                <Loader2 className="w-3 h-3 animate-spin text-app-accent" />
                <span className="text-xs text-app-text-muted">Pi is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Timeout Indication */}
      {isTimedOut && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm">
          <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="text-yellow-200">Response timed out after 30 seconds.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            className="ml-auto text-yellow-200 hover:text-yellow-100"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Extraction Error */}
      {extractionError && !isTimedOut && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-red-200">{extractionError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            className="ml-auto text-red-200 hover:text-red-100"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Input Field */}
      <div className="flex gap-2 shrink-0">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you need done..."
          disabled={isStreaming}
          className="flex-1 bg-app-sidebar border-app-border focus-visible:ring-1 focus-visible:ring-app-accent placeholder:text-app-text-muted"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          size="icon"
          className="bg-app-accent hover:bg-app-accent-hover shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Suggested Task Form */}
      {suggestion && (
        <div className="space-y-3 border border-app-accent/30 rounded-lg p-3 bg-app-accent/5 shrink-0">
          <h4 className="text-xs font-semibold text-app-accent uppercase tracking-wide">
            Suggested Task
          </h4>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Title</label>
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              maxLength={100}
              className="bg-app-sidebar border-app-border focus-visible:ring-1 focus-visible:ring-app-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Description</label>
            <textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              maxLength={2500}
              rows={3}
              className="w-full rounded-md bg-app-sidebar border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Priority</label>
            <Select
              value={editedPriority}
              onValueChange={(val) => setEditedPriority(val as 'high' | 'medium' | 'low')}
            >
              <SelectTrigger className="w-full bg-app-sidebar border-app-border focus:ring-1 focus:ring-app-accent h-9 rounded-md text-white">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent className="bg-app-panel border-app-border rounded-md shadow-xl text-white">
                <SelectItem value="low" className="focus:bg-white/10 cursor-pointer">Low</SelectItem>
                <SelectItem value="medium" className="focus:bg-white/10 cursor-pointer">Medium</SelectItem>
                <SelectItem value="high" className="focus:bg-white/10 cursor-pointer">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!editedTitle.trim() || isCreating}
              className="bg-app-accent hover:bg-app-accent-hover"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  // ── Panel Mode (sidebar) ────────────────────────────────────────────
  if (isPanelMode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-app-sidebar/40 border-b border-app-border/40 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-app-accent" />
            <h3 className="text-sm font-semibold text-app-text">Create Task with Pi</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onHide}
            className="h-6 w-6 rounded text-app-text-muted hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto min-h-0">
          {chatContent}
        </div>

        {/* Session Stats Footer */}
        <PiSessionFooter messages={messages} isStreaming={isStreaming} />
      </div>
    );
  }

  // ── Dialog Mode (modal) ─────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-app-accent" />
            Create Task with Pi
          </DialogTitle>
          <DialogDescription>
            Describe what you need done and Pi will help structure it into a task.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {chatContent}
        </div>

        {/* Session Stats Footer */}
        <PiSessionFooter messages={messages} isStreaming={isStreaming} />
      </DialogContent>
    </Dialog>
  );
}

// ─── Pi Session Footer ──────────────────────────────────────────────────

/**
 * Compact stats footer showing model name, thinking mode, and token count.
 * Mimics the pi terminal status bar layout.
 */
function PiSessionFooter({
  messages,
  isStreaming,
}: {
  messages: PiChatMessage[];
  isStreaming: boolean;
}) {
  const activeModel = usePiStore((s) => s.activeModel);
  const persistedModel = usePiStore((s) => s.persistedModel);
  const availableModels = usePiStore((s) => s.availableModels);
  const fetchModels = usePiStore((s) => s.fetchModels);

  // Fetch models if not loaded yet
  useEffect(() => {
    if (availableModels.length === 0) {
      fetchModels();
    }
  }, [availableModels.length, fetchModels]);

  // Resolve model display name — use activeModel, fallback to persistedModel from localStorage
  const modelId = activeModel || persistedModel;
  const modelInfo = availableModels.find((m) => m.id === modelId);
  const modelDisplay = modelInfo?.name || modelId || '—';

  // Count approximate tokens (rough: 1 token ≈ 4 chars)
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const approxTokens = Math.round(totalChars / 4);
  const tokenDisplay = approxTokens >= 1000
    ? `${(approxTokens / 1000).toFixed(1)}k`
    : String(approxTokens);

  // Thinking mode: check if any message has thinking content
  const hasThinking = messages.some((m) => m.thinking && m.thinking.length > 0);

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-app-sidebar/50 border-t border-app-border/40 text-[11px] font-mono text-app-text-muted shrink-0">
      {/* Left: stats */}
      <div className="flex items-center gap-2.5">
        {/* Token count */}
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          <span>{tokenDisplay}</span>
        </div>

        {/* Thinking mode */}
        <div className={`flex items-center gap-1 ${
          isStreaming && hasThinking ? 'text-purple-400' : ''
        }`}>
          <Brain className="w-3 h-3" />
          <span>{hasThinking ? '(thinking)' : '(auto)'}</span>
        </div>
      </div>

      {/* Right: model name */}
      <div className="truncate max-w-[160px] text-app-text-muted/80">
        {modelDisplay}
      </div>
    </div>
  );
}
