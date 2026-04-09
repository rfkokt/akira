/**
 * Internal Server Registry
 * 
 * Manages registration of all internal MCP servers to the tool registry.
 */

import { useToolRegistry } from '../registry';
import { registerTaskServerTools } from './taskServer';
import { registerProjectServerTools } from './projectServer';
import { registerFileServerTools } from './fileServer';
import { registerBashServerTools } from './bashServer';
import type { InternalTool } from '../types';

// ============================================================================
// Server Registry
// ============================================================================

class InternalServerRegistry {
  private initialized: boolean = false;
  
  /**
   * Initialize all internal servers by registering their tools
   */
  initialize(): void {
    const registry = useToolRegistry.getState();

    // Unregister existing internal tools first (supports HMR re-init without duplicates)
    const existingTools = registry.getAllInternalTools();
    for (const tool of existingTools) {
      registry.unregisterInternalTool(tool.name);
    }
    
    const register = (tool: InternalTool) => {
      registry.registerInternalTool(tool);
    };
    
    // Register all servers
    registerTaskServerTools(register);
    registerProjectServerTools(register);
    registerFileServerTools(register);
    registerBashServerTools(register);
    
    this.initialized = true;
    
    console.log('[InternalServers] Initialized. Tools:', this.getTools().length);
  }
  
  /**
   * Get all registered internal tools
   */
  getTools(): InternalTool[] {
    return useToolRegistry.getState().getAllInternalTools();
  }
  
  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get tool by name
   */
  getTool(name: string): InternalTool | undefined {
    return useToolRegistry.getState().getInternalTool(name);
  }
  
  /**
   * Get all tools in a category
   */
  getToolsByCategory(category: string): InternalTool[] {
    const tools = this.getTools();
    return tools.filter(t => t.category === category);
  }
}

// Singleton instance
export const internalServerRegistry = new InternalServerRegistry();

// ============================================================================
// Auto-initialize on import (when ready)
// ============================================================================

// Note: We don't auto-initialize here because the stores might not be ready yet.
// Call initializeInternalServers() from app initialization instead.

export function initializeInternalServers(): void {
  internalServerRegistry.initialize();
}

// ============================================================================
// Export Types
// ============================================================================

export type { InternalTool } from '../types';