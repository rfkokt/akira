/**
 * Dynamic MCP Tools - Testing Utility
 * 
 * Use this file to test Dynamic MCP integration
 */

import { getWorkspaceServer } from './servers/workspaceServer'
import { useToolRegistry } from './registry'

export async function testDynamicMCP(workspaceId: string, workspacePath: string) {
  console.log('[DynamicMCP Test] Testing Dynamic MCP integration...')
  
  try {
    // 1. Initialize workspace server
    console.log('[DynamicMCP Test] Step 1: Initialize workspace server')
    const server = getWorkspaceServer(workspaceId, workspacePath)
    await server.initialize()
    
    // 2. Get tools
    console.log('[DynamicMCP Test] Step 2: Get tools')
    const tools = server.getTools()
    console.log(`[DynamicMCP Test] Found ${tools.length} tools:`)
    
    // 3. Group by category
    const byCategory = tools.reduce((acc, tool) => {
      const cat = tool.category || 'default'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(tool.name)
      return acc
    }, {} as Record<string, string[]>)
    
    console.log('[DynamicMCP Test] Tools by category:')
    Object.entries(byCategory).forEach(([category, names]) => {
      console.log(`  ${category}: ${names.length} tools`)
      names.forEach(name => console.log(`    - ${name}`))
    })
    
    // 4. Get stats
    console.log('[DynamicMCP Test] Step 3: Get stats')
    const stats = server.getStats()
    console.log('[DynamicMCP Test] Stats:', stats)
    
    // 5. Check registry
    console.log('[DynamicMCP Test] Step 4: Check registry')
    const registry = useToolRegistry.getState()
    const workspaceTools = registry.getWorkspaceTools(workspaceId)
    console.log(`[DynamicMCP Test] Registry has ${workspaceTools.length} tools for workspace ${workspaceId}`)
    
    // 6. Test rescan
    console.log('[DynamicMCP Test] Step 5: Test rescan')
    await server.rescan()
    console.log('[DynamicMCP Test] Rescan complete')
    
    console.log('[DynamicMCP Test] ✅ All tests passed!')
    return {
      success: true,
      totalTools: tools.length,
      byCategory,
      stats,
    }
  } catch (error) {
    console.error('[DynamicMCP Test] ❌ Test failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get loaded tools statistics
 */
export function getToolsStats() {
  const registry = useToolRegistry.getState()
  const allInternalTools = registry.getAllInternalTools()
  
  const byCategory = allInternalTools.reduce((acc, tool) => {
    const cat = tool.category || 'default'
    if (!acc[cat]) acc[cat] = 0
    acc[cat]++
    return acc
  }, {} as Record<string, number>)
  
  return {
    total: allInternalTools.length,
    byCategory,
    tools: allInternalTools.map(t => ({
      name: t.name,
      category: t.category,
      description: t.description,
    })),
  }
}

/**
 * List all available tools
 */
export function listAllTools() {
  const stats = getToolsStats()
  console.log('\n[DynamicMCP] Available Tools:')
  console.log(`Total: ${stats.total}`)
  
  Object.entries(stats.byCategory).forEach(([category, count]) => {
    console.log(`\n${category.toUpperCase()} (${count} tools):`)
    const categoryTools = stats.tools.filter(t => t.category === category || (!t.category && category === 'default'))
    categoryTools.forEach(t => {
      console.log(`  - ${t.name}: ${t.description}`)
    })
  })
  
  return stats
}