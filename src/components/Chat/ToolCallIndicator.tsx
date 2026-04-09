/**
 * Tool Call Indicator Component
 * 
 * Displays tool usage in chat messages with status indicators
 */

import { useState } from 'react'
import {
Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseToolName } from '@/lib/mcp'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  durationMs?: number;
}

interface ToolCallIndicatorProps {
  toolCalls: ToolCallDisplay[]
  className?: string
}

export function ToolCallIndicator({ toolCalls, className }: ToolCallIndicatorProps) {
  if (toolCalls.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      {toolCalls.map((toolCall) => (
        <ToolCallItem key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  )
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallDisplay }) {
  const [isOpen, setIsOpen] = useState(false)
  const parsed = parseToolName(toolCall.name)
  const isInternal = parsed.source === 'internal'
  
  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400" />,
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  }

  const statusText = {
    pending: 'Pending...',
    running: 'Running...',
    success: `Completed${toolCall.durationMs ? ` (${toolCall.durationMs}ms)` : ''}`,
    error: 'Failed',
  }

  const icon = isInternal ? (
    <Wrench className="w-3.5 h-3.5 text-purple-400" />
  ) : (
    <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
  )

  const hasDetails = toolCall.arguments || toolCall.result || toolCall.error

  return (
    <div className="rounded-lg border border-app-border/50 bg-app-bg/50 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
              'hover:bg-app-panel/50',
              toolCall.status === 'error' && 'bg-red-500/5'
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {statusIcon[toolCall.status]}
              {icon}
              <span className="text-xs font-mono truncate">
                {parsed.name}
              </span>
              {parsed.serverId && (
                <span className="text-xs text-app-text-muted truncate">
                  ({parsed.serverId.substring(0, 8)})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium',
                toolCall.status === 'success' && 'text-green-400',
                toolCall.status === 'error' && 'text-red-400',
                (toolCall.status === 'pending' || toolCall.status === 'running') && 'text-yellow-400'
              )}>
                {statusText[toolCall.status]}
              </span>
              {hasDetails && (
                <ChevronDown className={cn(
                  'w-3 h-3 text-app-text-muted transition-transform',
                  isOpen && 'rotate-180'
                )} />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        
        {hasDetails && (
          <CollapsibleContent>
            <div className="border-t border-app-border/50 px-3 py-2 space-y-2">
              {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">
                    Arguments
                  </span>
                  <pre className="text-[11px] font-mono text-app-text/80 bg-app-panel/50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(toolCall.arguments, null, 2)}
                  </pre>
                </div>
              )}
              
              {toolCall.result && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">
                    Result
                  </span>
                  <pre className="text-[11px] font-mono text-green-400/80 bg-app-panel/50 rounded p-2 overflow-x-auto max-h-40">
                    {String(typeof toolCall.result === 'string' 
                      ? toolCall.result 
                      : JSON.stringify(toolCall.result, null, 2))}
                  </pre>
                </div>
              )}
              
              {toolCall.error && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">
                    Error
                  </span>
                  <pre className="text-[11px] font-mono text-red-400/80 bg-red-500/5 rounded p-2 overflow-x-auto">
                    {toolCall.error}
                  </pre>
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

/**
 * InlineToolCall - Minimal inline display for tool calls in message text
 */
interface InlineToolCallProps {
  name: string
  status?: 'pending' | 'running' | 'success' | 'error'
  className?: string
}

export function InlineToolCall({ name, status = 'success', className }: InlineToolCallProps) {
  const parsed = parseToolName(name)
  const isInternal = parsed.source === 'internal'
  
  const statusColor = {
    pending: 'text-yellow-400',
    running: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400',
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono',
      'bg-app-panel/50 border border-app-border/30',
      isInternal ? 'text-purple-400' : 'text-blue-400',
      className
    )}>
      {isInternal ? (
        <Wrench className="w-3 h-3" />
      ) : (
        <ExternalLink className="w-3 h-3" />
      )}
      <span className={statusColor[status]}>{parsed.name}</span>
    </span>
  )
}

/**
 * ToolCallsSummary - Shows a summary of multiple tool calls
 */
interface ToolCallsSummaryProps {
  toolCalls: ToolCallDisplay[]
  className?: string
}

export function ToolCallsSummary({ toolCalls, className }: ToolCallsSummaryProps) {
  if (toolCalls.length === 0) return null

  const successCount = toolCalls.filter(t => t.status === 'success').length
  const errorCount = toolCalls.filter(t => t.status === 'error').length
  const runningCount = toolCalls.filter(t => t.status === 'running' || t.status === 'pending').length
  const totalDuration = toolCalls.reduce((sum, t) => sum + (t.durationMs || 0), 0)
  const internalCount = toolCalls.filter(t => parseToolName(t.name).source === 'internal').length
  const externalCount = toolCalls.length - internalCount

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-2 text-xs text-app-text-muted',
      className
    )}>
      <span className="font-semibold uppercase tracking-wider">Tools:</span>
      <span className="flex items-center gap-1">
        {successCount > 0 && (
          <span className="flex items-center gap-0.5 text-green-400">
            <CheckCircle2 className="w-3 h-3" />
            {successCount} success
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-0.5 text-red-400">
            <XCircle className="w-3 h-3" />
            {errorCount} failed
          </span>
        )}
        {runningCount > 0 && (
          <span className="flex items-center gap-0.5 text-yellow-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {runningCount} running
          </span>
        )}
      </span>
      {internalCount > 0 && (
        <span className="text-purple-400">
          {internalCount} internal
        </span>
      )}
      {externalCount > 0 && (
        <span className="text-blue-400">
          {externalCount} external
        </span>
      )}
      {totalDuration > 0 && (
        <span className="text-app-text-muted/60">
          {totalDuration < 1000 ? `${totalDuration}ms` : `${(totalDuration / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  )
}