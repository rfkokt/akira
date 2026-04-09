/**
 * Workspace MCP Server
 * 
 * Manage dynamic tools per workspace
 */

import type { InternalTool } from '../types'
import { WorkspaceScanner, type ScanResult } from '../scanners'
import { useToolRegistry } from '../registry'

class WorkspaceMCPServer {
  private workspaceId: string
  private scanner: WorkspaceScanner
  private scanCache: Map<string, ScanResult> = new Map()

  constructor(workspaceId: string, workspacePath: string) {
    this.workspaceId = workspaceId
    this.scanner = new WorkspaceScanner(workspaceId, workspacePath)
  }

  /**
   * Initialize workspace by scanning and registering tools
   */
  async initialize(): Promise<void> {
    console.log(`[WorkspaceMCPServer] Initializing workspace ${this.workspaceId}`)
    
    try {
      // Check cache first
      const cached = this.scanCache.get(this.workspaceId)
      if (cached && !this.scanner.needsRescan()) {
        console.log(`[WorkspaceMCPServer] Using cached scan for workspace ${this.workspaceId}`)
        this.registerTools(cached.tools)
        return
      }

      // Perform scan
      const scanResult = await this.scanner.scan()
      
      // Cache result
      this.scanCache.set(this.workspaceId, scanResult)
      
      // Register tools
      this.registerTools(scanResult.tools)
      
      console.log(`[WorkspaceMCPServer] Workspace ${this.workspaceId} initialized with ${this.countTools(scanResult.tools)} tools`)
    } catch (error) {
      console.error(`[WorkspaceMCPServer] Failed to initialize workspace ${this.workspaceId}:`, error)
      throw error
    }
  }

  /**
   * Register all tools to the global registry
   */
  private registerTools(tools: ScanResult['tools']): void {
    const registry = useToolRegistry.getState()
    
    // Clear previous workspace tools
    registry.clearWorkspaceTools(this.workspaceId)
    
    // Register new tools
    const allTools: InternalTool[] = [
      ...tools.defaultTools,
      ...tools.skillsTools,
      ...tools.standardsTools,
      ...tools.utilsTools,
      ...tools.hooksTools,
      ...tools.techTools,
    ]
    
    // Add workspace ID to each tool
    const workspaceTools = allTools.map(tool => ({
      ...tool,
      workspaceId: this.workspaceId,
    }))
    
    registry.registerWorkspaceTools(this.workspaceId, workspaceTools)
    
    console.log(`[WorkspaceMCPServer] Registered ${workspaceTools.length} tools for workspace ${this.workspaceId}`)
  }

  /**
   * Get all tools for this workspace
   */
  getTools(): InternalTool[] {
    const registry = useToolRegistry.getState()
    const allTools = registry.getAllInternalTools()
    
    return allTools.filter(tool => {
      if ('workspaceId' in tool) {
        return (tool as any).workspaceId === this.workspaceId
      }
      return true
    })
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): InternalTool[] {
    return this.getTools().filter(tool => tool.category === category)
  }

  /**
   * Force rescan workspace
   */
  async rescan(): Promise<void> {
    console.log(`[WorkspaceMCPServer] Rescanning workspace ${this.workspaceId}`)
    
    // Clear cache
    this.scanner.clearCache()
    this.scanCache.delete(this.workspaceId)
    
    // Re-initialize
    await this.initialize()
  }

  /**
   * Clear cache and unregister tools
   */
  clearCache(): void {
    this.scanner.clearCache()
    this.scanCache.clear()
    
    const registry = useToolRegistry.getState()
    registry.clearWorkspaceTools(this.workspaceId)
    
    console.log(`[WorkspaceMCPServer] Cleared cache for workspace ${this.workspaceId}`)
  }

  /**
   * Check if rescan is needed
   */
  needsRescan(): boolean {
    return this.scanner.needsRescan()
  }

  /**
   * Count total tools
   */
  private countTools(tools: ScanResult['tools']): number {
    return (
      tools.defaultTools.length +
      tools.skillsTools.length +
      tools.standardsTools.length +
      tools.utilsTools.length +
      tools.hooksTools.length +
      tools.techTools.length
    )
  }

  /**
   * Get scan statistics
   */
  getStats(): {
    totalTools: number
    byCategory: Record<string, number>
    lastScanned: number | null
    scanDuration: number | null
  } {
    const cached = this.scanCache.get(this.workspaceId)
    const tools = cached?.tools
    
    if (!tools) {
      return {
        totalTools: 0,
        byCategory: {},
        lastScanned: null,
        scanDuration: null,
      }
    }

    const byCategory: Record<string, number> = {
      default: tools.defaultTools.length,
      skills: tools.skillsTools.length,
      standards: tools.standardsTools.length,
      utils: tools.utilsTools.length,
      hooks: tools.hooksTools.length,
      tech: tools.techTools.length,
    }

    return {
      totalTools: this.countTools(tools),
      byCategory,
      lastScanned: cached.timestamp,
      scanDuration: cached.duration,
    }
  }
}

// Singleton map - one server per workspace
const workspaceServers = new Map<string, WorkspaceMCPServer>()

/**
 * Get or create workspace MCP server
 */
export function getWorkspaceServer(
  workspaceId: string,
  workspacePath: string
): WorkspaceMCPServer {
  if (!workspaceServers.has(workspaceId)) {
    workspaceServers.set(workspaceId, new WorkspaceMCPServer(workspaceId, workspacePath))
  }
  return workspaceServers.get(workspaceId)!
}

/**
 * Initialize workspace MCP server
 */
export async function initializeWorkspaceServer(
  workspaceId: string,
  workspacePath: string
): Promise<void> {
  const server = getWorkspaceServer(workspaceId, workspacePath)
  await server.initialize()
}

/**
 * Clear all workspace servers
 */
export function clearAllWorkspaceServers(): void {
  for (const [_workspaceId, server] of workspaceServers) {
    server.clearCache()
  }
  workspaceServers.clear()
}

/**
 * Get all workspace servers
 */
export function getAllWorkspaceServers(): Map<string, WorkspaceMCPServer> {
  return workspaceServers
}

export { WorkspaceMCPServer }