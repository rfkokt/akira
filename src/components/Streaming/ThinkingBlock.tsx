import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export function ThinkingBlock({ content, isStreaming = false, className }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Don't render if no content and not streaming
  if (!content && !isStreaming) return null;
  
  // Truncate content for preview
  const previewLength = 100;
  const hasMore = content.length > previewLength;
  const preview = hasMore ? content.slice(0, previewLength) + '...' : content;
  
  return (
    <div className={cn(
      "rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden",
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className={cn(
            "w-4 h-4 text-amber-400",
            isStreaming && "animate-pulse"
          )} />
          <span className="text-xs font-medium text-amber-300">
            {isStreaming ? 'Thinking...' : 'Thought Process'}
          </span>
          {isStreaming && (
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-amber-400/60">
            {content.length} chars
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3 h-3 text-amber-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-amber-400" />
          )}
        </div>
      </button>
      
      {/* Content */}
      <div className={cn(
        "px-3 py-2 text-xs text-amber-100/80 font-mono leading-relaxed whitespace-pre-wrap",
        !isExpanded && "max-h-0 py-0 overflow-hidden"
      )}>
        {isExpanded ? content : preview}
        {hasMore && !isExpanded && (
          <span className="text-amber-400/60 italic"> Click to expand</span>
        )}
      </div>
    </div>
  );
}
