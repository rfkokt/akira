/**
 * ToolSuggestions Component
 * 
 * Display tool suggestions based on task context
 */

import { useState, useEffect } from 'react'
import { Wrench, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useToolRegistry } from '@/lib/mcp/registry'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { parseToolName } from '@/lib/mcp'

interface ToolSuggestionsProps {
  context: string
  onSelectTool?: (toolName: string) => void
  maxSuggestions?: number
  className?: string
}

export function ToolSuggestions({
  context,
  onSelectTool,
  maxSuggestions = 5,
  className,
}: ToolSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const { getAllInternalTools, getWorkspaceTools } = useToolRegistry()
  const { activeWorkspace } = useWorkspaceStore()

  useEffect(() => {
    if (!context) {
      setSuggestions([])
      return
    }

    // Get all tools
    const defaultTools = getAllInternalTools()
    const workspaceTools = activeWorkspace
      ? getWorkspaceTools(activeWorkspace.id)
      : []
    const allTools = [...defaultTools, ...workspaceTools]

    // Extract keywords from context
    const keywords = extractKeywords(context.toLowerCase())

    // Score tools by relevance
    const scored = allTools.map(tool => {
      let score = 0
      const toolLower = tool.name.toLowerCase()
      const descLower = tool.description.toLowerCase()

      for (const keyword of keywords) {
        if (toolLower.includes(keyword)) score += 10
        if (descLower.includes(keyword)) score += 5
      }

      return { name: tool.name, score }
    })

    // Get top suggestions
    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSuggestions)
      .filter(s => s.score > 0)
      .map(s => {
        const parsed = parseToolName(s.name)
        return parsed.name
      })

    setSuggestions(top)
  }, [context, maxSuggestions, getAllInternalTools, getWorkspaceTools, activeWorkspace])

  if (suggestions.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wrench className="w-3.5 h-3.5" />
        <span>Suggested tools</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((toolName: string) => {
          const parsed = parseToolName(toolName)
          return (
            <button
              key={toolName}
              onClick={() => onSelectTool?.(toolName)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-muted/50 hover:bg-muted border border-border/50 rounded transition-colors"
            >
              <span className="text-foreground/80">{parsed.name}</span>
              {onSelectTool && (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Extract keywords from context
 */
function extractKeywords(context: string): string[] {
  const keywords: string[] = []

  // Task/project keywords
  if (context.includes('task')) keywords.push('task', 'todo')
  if (context.includes('project')) keywords.push('project')
  if (context.includes('workspace')) keywords.push('workspace', 'project')

  // File keywords
  if (context.includes('file')) keywords.push('file', 'read', 'write')
  if (context.includes('code')) keywords.push('code', 'format', 'check')

  // Skill keywords
  if (context.includes('skill')) keywords.push('skill', 'load')

  // Tech keywords
  if (context.includes('react') || context.includes('component')) keywords.push('react', 'component')
  if (context.includes('next')) keywords.push('next', 'route')
  if (context.includes('tauri')) keywords.push('tauri')

  // Utility keywords
  if (context.includes('format')) keywords.push('format', 'date')
  if (context.includes('valid') || context.includes('check')) keywords.push('valid', 'check')
  if (context.includes('list')) keywords.push('list', 'get')

  // Standards keywords
  if (context.includes('standard') || context.includes('lint')) keywords.push('standard', 'lint', 'check')

  return keywords
}

/**
 * Tool Stats Component
 * 
 * Display tool usage statistics
 */

interface ToolStatsProps {
  limit?: number
  className?: string
}

export function ToolStats({ limit = 10, className }: ToolStatsProps) {
  const [stats, setStats] = useState<Array<{
    toolName: string
    totalCalls: number
    successRate: number
    avgDurationMs: number
  }>>([])

  useEffect(() => {
    const { getMostUsedTools } = require('@/lib/mcp/analytics')
    const data = getMostUsedTools(limit)
    setStats(data)
  }, [limit])

  if (stats.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No tool usage data yet. Tools will appear here after use.
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Most Used Tools</h4>
        <Badge variant="secondary" className="text-xs">
          {stats.length} tools
        </Badge>
      </div>
      <div className="space-y-1.5">
        {stats.map((stat, i) => {
          const parsed = parseToolName(stat.toolName)
          return (
            <div
              key={stat.toolName}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-4">{i + 1}.</span>
                <span className="font-mono">{parsed.name}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{stat.totalCalls} calls</span>
                <span className={cn(
                  'font-medium',
                  stat.successRate >= 90 ? 'text-green-400' :
                  stat.successRate >= 70 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {stat.successRate.toFixed(0)}%
                </span>
                <span>{stat.avgDurationMs.toFixed(0)}ms</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Tool Usage Summary Component
 */

interface ToolUsageSummaryProps {
  className?: string
}

export function ToolUsageSummary({ className }: ToolUsageSummaryProps) {
  const [summary, setSummary] = useState({
    totalCalls: 0,
    uniqueTools: 0,
    avgSuccessRate: 0,
    avgDurationMs: 0,
    topTools: [] as Array<{ name: string; calls: number }>,
    recentErrors: [] as Array<{ tool: string; error: string; timestamp: number }>,
  })

  useEffect(() => {
    const { getToolUsageSummary } = require('@/lib/mcp/analytics')
    const data = getToolUsageSummary()
    setSummary(data)
  }, [])

  if (summary.totalCalls === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No tool usage data yet. Start using tools to see analytics.
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/30 rounded px-3 py-2">
          <div className="text-2xl font-bold">{summary.totalCalls}</div>
          <div className="text-xs text-muted-foreground">Total Calls</div>
        </div>
        <div className="bg-muted/30 rounded px-3 py-2">
          <div className="text-2xl font-bold">{summary.uniqueTools}</div>
          <div className="text-xs text-muted-foreground">Unique Tools</div>
        </div>
        <div className="bg-muted/30 rounded px-3 py-2">
          <div className="text-2xl font-bold">{summary.avgSuccessRate.toFixed(0)}%</div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
        <div className="bg-muted/30 rounded px-3 py-2">
          <div className="text-2xl font-bold">{summary.avgDurationMs.toFixed(0)}ms</div>
          <div className="text-xs text-muted-foreground">Avg Duration</div>
        </div>
      </div>

      {summary.topTools.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-xs font-medium text-muted-foreground">Top Tools</h5>
          <div className="flex flex-wrap gap-1.5">
            {summary.topTools.map(tool => (
              <Badge key={tool.name} variant="outline" className="text-xs">
                {tool.name} ({tool.calls})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {summary.recentErrors.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-xs font-medium text-muted-foreground">Recent Errors</h5>
          <div className="space-y-1">
            {summary.recentErrors.slice(0, 3).map((err, i) => (
              <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
                <span className="font-mono font-medium">{err.tool}</span>
                <span className="text-muted-foreground">: {err.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}