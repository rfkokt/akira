/**
 * Tool Usage Analytics
 * 
 * Track and analyze tool usage patterns
 */

interface ToolUsageRecord {
  id: string
  toolName: string
  category?: string
  workspaceId?: string
  success: boolean
  durationMs: number
  timestamp: number
  error?: string
}

interface ToolUsageStats {
  toolName: string
  category?: string
  totalCalls: number
  successCalls: number
  failedCalls: number
  successRate: number
  avgDurationMs: number
  lastUsed: number
}

interface DailyUsage {
  date: string
  totalCalls: number
  uniqueTools: number
  topTools: Array<{ name: string; count: number }>
}

class ToolUsageAnalytics {
  private usageHistory: ToolUsageRecord[] = []
  private maxHistorySize: number = 1000

  /**
   * Track a tool call
   */
  trackCall(
    toolName: string,
    success: boolean,
    durationMs: number,
    options?: {
      category?: string
      workspaceId?: string
      error?: string
    }
  ): void {
    const record: ToolUsageRecord = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolName,
      category: options?.category,
      workspaceId: options?.workspaceId,
      success,
      durationMs,
      timestamp: Date.now(),
      error: options?.error,
    }

    this.usageHistory.push(record)

    // Limit history size
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory = this.usageHistory.slice(-this.maxHistorySize)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[ToolAnalytics]', {
        tool: toolName,
        success,
        duration: `${durationMs}ms`,
      })
    }
  }

  /**
   * Get usage statistics for a tool
   */
  getToolStats(toolName: string): ToolUsageStats | null {
    const calls = this.usageHistory.filter(r => r.toolName === toolName)
    
    if (calls.length === 0) {
      return null
    }

    const successCalls = calls.filter(r => r.success)
    const failedCalls = calls.filter(r => !r.success)
    const totalDuration = calls.reduce((sum, r) => sum + r.durationMs, 0)
    const lastUsed = Math.max(...calls.map(r => r.timestamp))

    return {
      toolName,
      category: calls[0]?.category,
      totalCalls: calls.length,
      successCalls: successCalls.length,
      failedCalls: failedCalls.length,
      successRate: (successCalls.length / calls.length) * 100,
      avgDurationMs: totalDuration / calls.length,
      lastUsed,
    }
  }

  /**
   * Get all tool statistics
   */
  getAllStats(): ToolUsageStats[] {
    const toolNames = [...new Set(this.usageHistory.map(r => r.toolName))]
    return toolNames
      .map(name => this.getToolStats(name))
      .filter((stat): stat is ToolUsageStats => stat !== null)
      .sort((a, b) => b.totalCalls - a.totalCalls)
  }

  /**
   * Get most used tools
   */
  getMostUsedTools(limit: number = 10): ToolUsageStats[] {
    return this.getAllStats().slice(0, limit)
  }

  /**
   * Get least successful tools
   */
  getLeastSuccessfulTools(limit: number = 10): ToolUsageStats[] {
    return this.getAllStats()
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, limit)
  }

  /**
   * Get slowest tools
   */
  getSlowestTools(limit: number = 10): ToolUsageStats[] {
    return this.getAllStats()
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, limit)
  }

  /**
   * Get daily usage
   */
  getDailyUsage(days: number = 7): DailyUsage[] {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const daily: DailyUsage[] = []

    for (let i = 0; i < days; i++) {
      const startOfDay = now - (i + 1) * dayMs
      const endOfDay = now - i * dayMs
      const date = new Date(startOfDay).toISOString().split('T')[0]

      const dayCalls = this.usageHistory.filter(
        r => r.timestamp >= startOfDay && r.timestamp < endOfDay
      )

      const toolCounts: Record<string, number> = {}
      for (const call of dayCalls) {
        toolCounts[call.toolName] = (toolCounts[call.toolName] || 0) + 1
      }

      const topTools = Object.entries(toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      daily.push({
        date,
        totalCalls: dayCalls.length,
        uniqueTools: Object.keys(toolCounts).length,
        topTools,
      })
    }

    return daily.reverse()
  }

  /**
   * Get usage by category
   */
  getUsageByCategory(): Record<string, number> {
    const categoryCounts: Record<string, number> = {}

    for (const record of this.usageHistory) {
      const category = record.category || 'default'
      categoryCounts[category] = (categoryCounts[category] || 0) + 1
    }

    return categoryCounts
  }

  /**
   * Get recent calls
   */
  getRecentCalls(limit: number = 50): ToolUsageRecord[] {
    return this.usageHistory.slice(-limit)
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.usageHistory = []
  }

  /**
   * Export history
   */
  exportHistory(): ToolUsageRecord[] {
    return [...this.usageHistory]
  }

  /**
   * Import history
   */
  importHistory(records: ToolUsageRecord[]): void {
    this.usageHistory = records
  }

  /**
   * Get summary for display
   */
  getSummary(): {
    totalCalls: number
    uniqueTools: number
    avgSuccessRate: number
    avgDurationMs: number
    topTools: Array<{ name: string; calls: number }>
    recentErrors: Array<{ tool: string; error: string; timestamp: number }>
  } {
    const stats = this.getAllStats()
    const recentErrors = this.usageHistory
      .filter(r => !r.success)
      .slice(-10)
      .map(r => ({
        tool: r.toolName,
        error: r.error || 'Unknown error',
        timestamp: r.timestamp,
      }))

    return {
      totalCalls: this.usageHistory.length,
      uniqueTools: stats.length,
      avgSuccessRate: stats.length > 0
        ? stats.reduce((sum, s) => sum + s.successRate, 0) / stats.length
        : 0,
      avgDurationMs: stats.length > 0
        ? stats.reduce((sum, s) => sum + s.avgDurationMs, 0) / stats.length
        : 0,
      topTools: stats.slice(0, 5).map(s => ({
        name: s.toolName,
        calls: s.totalCalls,
      })),
      recentErrors,
    }
  }
}

// Singleton instance
export const toolUsageAnalytics = new ToolUsageAnalytics()

// Export convenience functions
export function trackToolCall(
  toolName: string,
  success: boolean,
  durationMs: number,
  options?: {
    category?: string
    workspaceId?: string
    error?: string
  }
): void {
  toolUsageAnalytics.trackCall(toolName, success, durationMs, options)
}

export function getToolUsageStats(toolName: string): ToolUsageStats | null {
  return toolUsageAnalytics.getToolStats(toolName)
}

export function getMostUsedTools(limit?: number): ToolUsageStats[] {
  return toolUsageAnalytics.getMostUsedTools(limit)
}

export function getToolUsageSummary() {
  return toolUsageAnalytics.getSummary()
}

export function clearToolUsageHistory(): void {
  toolUsageAnalytics.clearHistory()
}