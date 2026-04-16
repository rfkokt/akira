import { useState } from 'react';
import { Wrench, ChevronDown, ChevronUp, CheckCircle, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolUseEvent, ToolOutputEvent } from '@/lib/streaming';

interface ToolCallCardProps {
  toolUse: ToolUseEvent;
  toolOutput?: ToolOutputEvent;
  isStreaming?: boolean;
  className?: string;
}

export function ToolCallCard({ toolUse, toolOutput, isStreaming = false, className }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Format tool input for display
  const formatToolInput = (input: Record<string, unknown>): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };
  
  // Get icon based on tool name
  const getToolIcon = (toolName: string) => {
    if (toolName.toLowerCase().includes('bash') || toolName.toLowerCase().includes('shell')) {
      return <Terminal className="w-4 h-4" />;
    }
    return <Wrench className="w-4 h-4" />;
  };
  
  // Get status color
  const getStatusColor = () => {
    if (isStreaming) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    if (toolOutput) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    return 'text-neutral-400 border-neutral-500/30 bg-neutral-500/10';
  };
  
  const statusColor = getStatusColor();
  
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      statusColor,
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {getToolIcon(toolUse.tool_name)}
          <span className="text-xs font-medium">
            {toolUse.tool_name}
          </span>
          {isStreaming && !toolOutput && (
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
          {toolOutput && (
            <CheckCircle className="w-3 h-3 text-emerald-400" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {isExpanded ? (
            <ChevronUp className="w-3 h-3 opacity-60" />
          ) : (
            <ChevronDown className="w-3 h-3 opacity-60" />
          )}
        </div>
      </button>
      
      {/* Content */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-2 border-t border-current/10">
          {/* Tool Input */}
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Input</div>
            <pre className="text-[11px] font-mono bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {formatToolInput(toolUse.tool_input)}
            </pre>
          </div>
          
          {/* Tool Output (if available) */}
          {toolOutput && (
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Output</div>
              <pre className="text-[11px] font-mono bg-emerald-500/10 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                {toolOutput.tool_output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolCallGroupProps {
  tools: Array<{
    use: ToolUseEvent;
    output?: ToolOutputEvent;
  }>;
  isStreaming?: boolean;
  className?: string;
}

export function ToolCallGroup({ tools, isStreaming, className }: ToolCallGroupProps) {
  if (tools.length === 0) return null;
  
  return (
    <div className={cn("space-y-2", className)}>
      {tools.map((tool, index) => (
        <ToolCallCard
          key={index}
          toolUse={tool.use}
          toolOutput={tool.output}
          isStreaming={isStreaming && index === tools.length - 1}
        />
      ))}
    </div>
  );
}
