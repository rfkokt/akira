/**
 * Tool Registry
 * 
 * Unified registry for internal and external MCP tools.
 * Provides a single interface for tool discovery and execution.
 */

import { create } from 'zustand';
import type {
  UnifiedTool,
  InternalTool,
  McpTool,
  ToolSource,
  ToolExecutionResult,
} from './types';
import { useMcpStore } from '@/store/mcpStore';

// ============================================================================
// Types
// ============================================================================

interface ToolRegistryState {
  internalTools: Map<string, InternalTool>;
  isLoading: boolean;
  error: string | null;
  
  registerInternalTool: (tool: InternalTool) => void;
  unregisterInternalTool: (name: string) => void;
  getInternalTool: (name: string) => InternalTool | undefined;
  getAllInternalTools: () => InternalTool[];
  
  executeInternalTool: (name: string, args: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

// ============================================================================
// Tool Namespacing
// ============================================================================

export function namespacedToolName(source: ToolSource, name: string, serverId?: string): string {
  if (source === 'internal') {
    return `internal_${name}`;
  }
  if (source === 'external' && serverId) {
    return `mcp_${serverId}_${name}`;
  }
  return name;
}

export function parseToolName(fullName: string): { source: ToolSource; name: string; serverId?: string } {
  if (fullName.startsWith('internal_')) {
    return {
      source: 'internal',
      name: fullName.replace('internal_', ''),
    };
  }
  if (fullName.startsWith('mcp_')) {
    const parts = fullName.split('_');
    if (parts.length >= 3) {
      return {
        source: 'external',
        serverId: parts[1],
        name: parts.slice(2).join('_'),
      };
    }
  }
  return { source: 'internal', name: fullName };
}

// ============================================================================
// Tool Registry Store
// ============================================================================

export const useToolRegistry = create<ToolRegistryState>((set, get) => ({
  internalTools: new Map(),
  isLoading: false,
  error: null,
  
  registerInternalTool: (tool) => {
    set((state) => ({
      internalTools: new Map(state.internalTools).set(tool.name, tool),
      error: null,
    }));
  },
  
  unregisterInternalTool: (name) => {
    set((state) => {
      const newTools = new Map(state.internalTools);
      newTools.delete(name);
      return { internalTools: newTools };
    });
  },
  
  getInternalTool: (name) => {
    return get().internalTools.get(name);
  },
  
  getAllInternalTools: () => {
    return Array.from(get().internalTools.values());
  },
  
  executeInternalTool: async (name, args) => {
    const tool = get().internalTools.get(name);
    
    if (!tool) {
      return {
        success: false,
        error: `Internal tool not found: ${name}`,
      };
    }
    
    try {
      const result = await tool.handler(args);
      return {
        success: true,
        data: result,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
}));

// ============================================================================
// External Tools Helpers (standalone functions)
// ============================================================================

export function getExternalTools(): McpTool[] {
  const mcpState = useMcpStore.getState();
  const connectedServers = mcpState.servers.filter(s => s.status === 'connected');
  return connectedServers.flatMap(server => 
    (server.tools || []).map(tool => ({
      ...tool,
      serverId: server.id,
    }))
  );
}

export function getConnectedServerTools(): Array<{ serverId: string; serverName: string; tools: McpTool[] }> {
  const mcpState = useMcpStore.getState();
  const connectedServers = mcpState.servers.filter(s => s.status === 'connected');
  return connectedServers.map(server => ({
    serverId: server.id,
    serverName: server.name,
    tools: server.tools || [],
  }));
}

// ============================================================================
// Unified Tools Helpers
// ============================================================================

export function getAllTools(): UnifiedTool[] {
  const { internalTools } = useToolRegistry.getState();
  const externalToolsWithServer = getConnectedServerTools();
  
  const internal: UnifiedTool[] = Array.from(internalTools.values()).map(tool => ({
    name: namespacedToolName('internal', tool.name),
    description: tool.description,
    parameters: tool.parameters,
    source: 'internal' as const,
  }));
  
  const external: UnifiedTool[] = externalToolsWithServer.flatMap(({ serverId, tools }) =>
    tools.map(tool => ({
      name: namespacedToolName('external', tool.name, serverId),
      description: tool.description,
      parameters: tool.inputSchema,
      source: 'external' as const,
      serverId,
    }))
  );
  
  return [...internal, ...external];
}

export function getTool(name: string): UnifiedTool | undefined {
  const allTools = getAllTools();
  return allTools.find(t => t.name === name);
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getToolDisplayName(tool: UnifiedTool): string {
  const parsed = parseToolName(tool.name);
  if (parsed.source === 'internal') {
    return `🔧 ${parsed.name}`;
  }
  return `🔌 ${parsed.serverId?.substring(0, 8)}:${parsed.name}`;
}

export function categorizeTools(tools: UnifiedTool[]): Record<string, UnifiedTool[]> {
  const categories: Record<string, UnifiedTool[]> = {
    internal: [],
    external: [],
  };
  
  for (const tool of tools) {
    if (tool.source === 'internal') {
      categories.internal.push(tool);
    } else {
      categories.external.push(tool);
    }
  }
  
  return categories;
}