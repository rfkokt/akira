/**
 * SessionStatsBar Component
 *
 * Displays session statistics in a compact bar similar to pi's terminal UI:
 * - Token usage (e.g., "14.8k")
 * - Context window percentage (e.g., "1.9%/128k")
 * - Thinking mode indicator (e.g., "(auto)")
 * - Active model name (e.g., "ocg/qwen3.6-plus")
 *
 * Shows warning state when context usage > 80%, stale indicator when stats
 * fetch fails, and empty state when no session exists.
 */

import { useEffect, useRef } from 'react';
import { Activity, AlertTriangle, Clock, Brain, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shouldShowContextWarning } from '@/lib/pi/sessionStats';
import { usePiStore } from '@/store/piStore';

interface SessionStatsBarProps {
  taskId: string;
}

/**
 * Formats token count to a compact display string.
 * e.g., 14800 → "14.8k", 1200 → "1.2k", 500 → "500"
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return String(tokens);
}

/**
 * Estimates the total context window size from the percentage used and tokens consumed.
 * Returns a formatted string like "128k".
 */
function estimateContextWindow(tokensUsed: number, pct: number): string {
  if (pct <= 0 || tokensUsed <= 0) return '?';
  const total = tokensUsed / pct;
  const totalK = total / 1000;
  if (totalK >= 1000) {
    return `${Math.round(totalK / 1000 * 10) / 10}M`;
  }
  return `${Math.round(totalK)}k`;
}

export function SessionStatsBar({ taskId }: SessionStatsBarProps) {
  const session = usePiStore((state) => state.taskSessions[taskId]);
  const getSessionStats = usePiStore((state) => state.getSessionStats);
  const activeModel = usePiStore((state) => state.activeModel);
  const availableModels = usePiStore((state) => state.availableModels);
  const prevStreamingRef = useRef(false);

  // Request updated stats after each agent_end event (streaming transitions from true → false)
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    const isStreaming = session?.isStreaming ?? false;

    if (wasStreaming && !isStreaming) {
      getSessionStats(taskId);
    }

    prevStreamingRef.current = isStreaming;
  }, [session?.isStreaming, taskId, getSessionStats]);

  // Resolve model display name
  const modelInfo = availableModels.find((m) => m.id === activeModel);
  const modelDisplay = modelInfo?.name || activeModel || null;

  // Determine if thinking is active (session has thinking content in latest message)
  const hasThinking = session?.messages?.some((m) => m.thinking && m.thinking.length > 0) ?? false;
  const isCurrentlyThinking = (session?.currentThinking?.length ?? 0) > 0;

  // Empty state: no session exists for this task
  if (!session || !session.sessionStats) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-app-sidebar/50 border-t border-app-border/40 text-xs text-app-text-muted font-mono">
        <span className="opacity-60">No active session</span>
        {modelDisplay && (
          <div className="flex items-center gap-1.5 text-app-text-muted/70">
            <Cpu className="w-3 h-3" />
            <span className="truncate max-w-[140px]">{modelDisplay}</span>
          </div>
        )}
      </div>
    );
  }

  const { tokensUsed, contextWindowPct, isStale } = session.sessionStats;
  const showWarning = shouldShowContextWarning(contextWindowPct);
  const pctDisplay = (contextWindowPct * 100).toFixed(1);
  const contextWindowSize = estimateContextWindow(tokensUsed, contextWindowPct);
  const tokenDisplay = formatTokenCount(tokensUsed);

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-1.5 border-t text-xs font-mono transition-colors',
        showWarning
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : 'bg-app-sidebar/50 border-app-border/40'
      )}
    >
      {/* Left side: stats */}
      <div className="flex items-center gap-2.5">
        {/* Token usage */}
        <div
          className={cn(
            'flex items-center gap-1',
            showWarning ? 'text-yellow-400' : 'text-app-text-muted'
          )}
        >
          <Activity className="w-3 h-3" />
          <span>{tokenDisplay}</span>
        </div>

        {/* Context window percentage */}
        <div
          className={cn(
            'flex items-center gap-1',
            showWarning ? 'text-yellow-400' : 'text-app-text-muted'
          )}
        >
          {showWarning && <AlertTriangle className="w-3 h-3" />}
          <span>
            {pctDisplay}%/{contextWindowSize}
          </span>
        </div>

        {/* Thinking mode indicator */}
        <div
          className={cn(
            'flex items-center gap-1',
            isCurrentlyThinking
              ? 'text-purple-400'
              : hasThinking
                ? 'text-purple-400/70'
                : 'text-app-text-muted/60'
          )}
        >
          <Brain className="w-3 h-3" />
          <span>
            {isCurrentlyThinking ? '(thinking)' : hasThinking ? '(auto)' : '(auto)'}
          </span>
        </div>

        {/* Stale indicator */}
        {isStale && (
          <div className="flex items-center gap-1 text-orange-400/80">
            <Clock className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wider">stale</span>
          </div>
        )}
      </div>

      {/* Right side: model name */}
      {modelDisplay && (
        <div className="flex items-center gap-1.5 text-app-text-muted/80 truncate max-w-[180px]">
          <span className="truncate">{modelDisplay}</span>
        </div>
      )}
    </div>
  );
}
