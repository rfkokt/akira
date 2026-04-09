/**
 * MCP Tools List Component
 * 
 * Display all available workspace tools with categories
 */

import { useState } from 'react'
import { RefreshCw, ChevronDown, ChevronRight, Wrench, Code, FileCode, Cpu, Settings, Zap, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useToolRegistry } from '@/lib/mcp/registry'
import { parseToolName } from '@/lib/mcp'
import { cn } from '@/lib/utils'

interface ToolGroup {
  category: string
  tools: Array<{
    name: string
    description: string
    category?: string
  }>
  count: number
}

export function McpToolsList() {
  const { activeWorkspace, rescanWorkspaceTools } = useWorkspaceStore()
  const { getAllInternalTools, getWorkspaceTools } = useToolRegistry()
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['utils', 'skills']))

  const workspaceTools = activeWorkspace 
    ? getWorkspaceTools(activeWorkspace.id) 
    : []
  const defaultTools = getAllInternalTools().filter(
    t => !t.workspaceId || t.workspaceId === activeWorkspace?.id
  )
  
  const allTools = [...defaultTools, ...workspaceTools]

  // Group tools by category
  const groupedTools: ToolGroup[] = Object.entries(
    allTools.reduce((acc, tool) => {
      const cat = tool.category || 'default'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push({
        name: tool.name,
        description: tool.description,
        category: tool.category,
      })
      return acc
    }, {} as Record<string, ToolGroup['tools']>)
  )
    .map(([category, tools]) => ({
      category,
      tools,
      count: tools.length,
    }))
    .sort((a, b) => {
      // Sort by priority: default > utils > skills > hooks > standards > tech
      const priority = ['default', 'utils', 'skills', 'hooks', 'standards', 'tech']
      const aIndex = priority.indexOf(a.category)
      const bIndex = priority.indexOf(b.category)
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
    })

  // Filter by search
  const filteredGroups = searchQuery
    ? groupedTools.map(group => ({
        ...group,
        tools: group.tools.filter(t => 
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(g => g.tools.length > 0)
    : groupedTools

  const totalTools = allTools.length

  const handleRescan = async () => {
    if (!activeWorkspace || isLoading) return
    
    setIsLoading(true)
    try {
      await rescanWorkspaceTools()
    } catch (error) {
      console.error('[McpToolsList] Rescan failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, React.ReactNode> = {
      default: <Wrench className="w-4 h-4" />,
      utils: <Code className="w-4 h-4" />,
      skills: <Zap className="w-4 h-4" />,
      hooks: <FileCode className="w-4 h-4" />,
      standards: <Settings className="w-4 h-4" />,
      tech: <Cpu className="w-4 h-4" />,
    }
    return icons[category] || <Wrench className="w-4 h-4" />
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      default: 'Default Tools',
      utils: 'Utility Functions',
      skills: 'Installed Skills',
      hooks: 'Custom Hooks',
      standards: 'Coding Standards',
      tech: 'Tech Stack',
    }
    return labels[category] || category.charAt(0).toUpperCase() + category.slice(1)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Available Tools</h3>
          <Badge variant="secondary" className="text-xs">
            {totalTools} tools
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRescan}
          disabled={isLoading || !activeWorkspace}
          className="h-8"
        >
          <RefreshCw className={cn("w-4 h-4 mr-1.5", isLoading && "animate-spin")} />
          {isLoading ? 'Scanning...' : 'Rescan'}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {/* Workspace Info */}
      {activeWorkspace && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          <span className="font-medium">Workspace:</span> {activeWorkspace.name}
        </div>
      )}

      {!activeWorkspace && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No workspace selected. Select a workspace to view available tools.
        </div>
      )}

      {/* Tools List */}
      <div className="space-y-2">
        {filteredGroups.map((group) => (
          <div key={group.category} className="border border-border/40 rounded-lg overflow-hidden">
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(group.category)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {getCategoryIcon(group.category)}
                <span className="text-sm font-medium">{getCategoryLabel(group.category)}</span>
                <Badge variant="outline" className="text-xs h-5">
                  {group.count}
                </Badge>
              </div>
              {expandedCategories.has(group.category) ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {/* Tools */}
            {expandedCategories.has(group.category) && (
              <div className="divide-y divide-border/30">
                {group.tools.map((tool) => {
                  const parsed = parseToolName(tool.name)
                  const displayName = parsed.name || tool.name
                  const isInternal = parsed.source === 'internal'
                  
                  return (
                    <div
                      key={tool.name}
                      className="px-3 py-2 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="text-xs font-mono text-foreground/90 truncate">
                            {displayName}
                          </code>
                          {isInternal && (
                            <Badge variant="outline" className="text-2xs h-4 px-1 text-purple-400 border-purple-400/30">
                              internal
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {parsed.source === 'internal' ? '🔧' : '🔌'}
                        </span>
                      </div>
                      {tool.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredGroups.length === 0 && searchQuery && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No tools found matching "{searchQuery}"
        </div>
      )}
    </div>
  )
}