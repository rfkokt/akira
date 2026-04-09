/**
 * Tool Router
 * 
 * Routes tool execution requests to the appropriate handler
 * (internal or external MCP server).
 */

import type { ToolExecutionResult } from './types';
import { useToolRegistry, parseToolName } from './registry';
import * as mcpClient from './client';

// ============================================================================
// Types
// ============================================================================

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration_ms: number;
}

// ============================================================================
// Tool Router
// ============================================================================

export class ToolRouter {
  private static instance: ToolRouter;
  
  static getInstance(): ToolRouter {
    if (!ToolRouter.instance) {
      ToolRouter.instance = new ToolRouter();
    }
    return ToolRouter.instance;
  }
  
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const startTime = Date.now();
    const parsed = parseToolName(name);
    
    console.log('[ToolRouter] Executing tool:', { 
      rawName: name, 
      parsedName: parsed.name, 
      source: parsed.source, 
      serverId: parsed.serverId 
    });
    
    let result: ToolExecutionResult;
    
    if (parsed.source === 'internal') {
      result = await this.executeInternal(parsed.name, args);
    } else if (parsed.source === 'external' && parsed.serverId) {
      result = await this.executeExternal(parsed.serverId, parsed.name, args);
    } else {
      result = {
        success: false,
        error: `Unknown tool source: ${name}`,
      };
    }
    
    const duration_ms = Date.now() - startTime;
    
    return {
      toolName: name,
      success: result.success,
      result: result.data,
      error: result.error,
      duration_ms,
    };
  }
  
  async executeTools(tools: ToolCallRequest[]): Promise<ToolCallResult[]> {
    return Promise.all(
      tools.map(async (tool) => ({
        ...await this.executeTool(tool.name, tool.arguments),
        toolName: tool.name,
      }))
    );
  }
  
  private async executeInternal(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const registry = useToolRegistry.getState();
    return registry.executeInternalTool(name, args);
  }
  
  private async executeExternal(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    try {
      const result = await mcpClient.callMcpTool({
        serverId,
        toolName,
        arguments: args,
      });
      
      if (result.isError) {
        const errorContent = result.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        return {
          success: false,
          error: errorContent || 'Tool execution failed',
        };
      }
      
      const dataContent = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      
      return {
        success: true,
        data: dataContent,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const router = ToolRouter.getInstance();
  return router.executeTool(name, args);
}

export async function executeTools(
  tools: ToolCallRequest[]
): Promise<ToolCallResult[]> {
  const router = ToolRouter.getInstance();
  return router.executeTools(tools);
}