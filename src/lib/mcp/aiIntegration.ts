/**
 * AI Integration with Tools
 * 
 * Integrates the unified tool registry with AI providers for
 * seamless tool calling and execution.
 */

import { useCallback, useEffect, useState } from 'react';
import { getAllTools, parseToolName } from './registry';
import { executeTool } from './router';
import type { UnifiedTool } from './types';

// ============================================================================
// Types
// ============================================================================

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultInfo {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  duration_ms: number;
}

export interface ToolCallingOptions {
  enableInternalTools?: boolean;
  enableExternalTools?: boolean;
  specificTools?: string[];
  maxToolCalls?: number;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ============================================================================
// Tool Schema Generation
// ============================================================================

export function getToolSchemas(options?: ToolCallingOptions): ToolSchema[] {
  const allTools = getAllTools();
  let filteredTools = allTools;
  
  if (options?.enableInternalTools === false) {
    filteredTools = filteredTools.filter(t => t.source !== 'internal');
  }
  
  if (options?.enableExternalTools === false) {
    filteredTools = filteredTools.filter(t => t.source !== 'external');
  }
  
  if (options?.specificTools && options.specificTools.length > 0) {
    const toolSet = new Set(options.specificTools);
    filteredTools = filteredTools.filter(t => toolSet.has(t.name));
  }
  
  return filteredTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

// ============================================================================
// Tool Call Detection (from CLI output)
// ============================================================================

const TOOL_CALL_PATTERNS = [
  /\[Tool:\s*([^\]]+)\]/i,
  /tool_use.*?"name"\s*:\s*"([^"]+)"/,
  /Calling tool:\s*(.+)/i,
  /Using tool:\s*(.+)/i,
];

export function detectToolCallFromOutput(output: string): ToolCallInfo | null {
  for (const pattern of TOOL_CALL_PATTERNS) {
    const match = output.match(pattern);
    if (match) {
      let rawContent = match[1].trim();
      let toolName = rawContent;
      let argsObj: Record<string, unknown> = {};

      const spaceIdx = rawContent.indexOf(' ');
      if (spaceIdx !== -1) {
        toolName = rawContent.substring(0, spaceIdx).trim();
        const jsonPart = rawContent.substring(spaceIdx).trim();
        
        // Sometimes the AI might output backticks, clean them
        const cleanedJsonPart = jsonPart.replace(/^`+|`+$/g, '');
        
        if (cleanedJsonPart.startsWith('{') && cleanedJsonPart.endsWith('}')) {
          try {
            argsObj = JSON.parse(cleanedJsonPart);
          } catch (e) {
            console.warn('[ToolDetection] Failed to parse JSON args:', cleanedJsonPart);
            argsObj = { __parse_error: true, raw: cleanedJsonPart };
          }
        } else if (cleanedJsonPart.length > 0) {
          // It didn't look like JSON at all, maybe they just passed raw string
          argsObj = { __parse_error: true, raw: cleanedJsonPart };
        }
      }
      
      const parsed = parseToolName(toolName);
      
      console.log('[ToolDetection] Found tool call:', {
        rawMatch: match[0],
        toolName: parsed.name,
        arguments: argsObj,
        source: parsed.source,
      });
      
      return {
        id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: parsed.name,
        arguments: argsObj,
      };
    }
  }
  return null;
}

export function extractToolCallsFromResponse(response: string): ToolCallInfo[] {
  const toolCalls: ToolCallInfo[] = [];
  
  // Use regex to find all tool calls in the entire multi-line response
  // We use [\s\S]*? to match across newlines lazily
  const pattern = /\[Tool:\s*([\s\S]*?)\]/gi;
  let match;
  
  while ((match = pattern.exec(response)) !== null) {
    const rawContent = match[1].trim();
    let toolName = rawContent;
    let argsObj: Record<string, unknown> = {};

    const wsMatch = rawContent.match(/\s/);
    const spaceIdx = wsMatch && wsMatch.index !== undefined ? wsMatch.index : -1;
    
    if (spaceIdx !== -1) {
      toolName = rawContent.substring(0, spaceIdx).trim();
      let jsonPart = rawContent.substring(spaceIdx).trim();
      
      // Clean leading and trailing backticks that AI sometimes adds
      jsonPart = jsonPart.replace(/^`+|`+$/g, '').trim();
      if (jsonPart.startsWith("```json")) {
         jsonPart = jsonPart.substring(7);
      }
      jsonPart = jsonPart.replace(/```$/, '').trim();
      
      if (jsonPart.startsWith('{') && jsonPart.endsWith('}')) {
        try {
          argsObj = JSON.parse(jsonPart);
        } catch (e) {
          argsObj = { __parse_error: true, raw: jsonPart };
        }
      } else if (jsonPart.length > 0) {
        argsObj = { __parse_error: true, raw: jsonPart };
      }
    }
    
    const parsed = parseToolName(toolName);
    toolCalls.push({
      id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: parsed.name,
      arguments: argsObj,
    });
  }
  
  return toolCalls;
}

// ============================================================================
// Tool Execution
// ============================================================================

export async function executeToolCalls(
  toolCalls: ToolCallInfo[],
  options?: { timeout?: number }
): Promise<ToolResultInfo[]> {
  const results: ToolResultInfo[] = [];
  const timeout = options?.timeout || 30000;
  
  console.log('[ToolExecution] Executing', toolCalls.length, 'tool calls:', 
    toolCalls.map(c => ({ name: c.name, id: c.id }))
  );
  
  for (const call of toolCalls) {
    console.log('[ToolExecution] Calling tool:', call.name, 'with args:', call.arguments);
    
    if (call.arguments.__parse_error) {
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        success: false,
        error: `Syntax Error: Invalid JSON arguments provided for tool. Ensure your tool call uses strict double-quoted JSON. You provided: ${call.arguments.raw}`,
        duration_ms: 0,
      });
      continue;
    }

    try {
      const result = await Promise.race([
        executeTool(call.name, call.arguments),
        new Promise<{ success: boolean; result?: string; error?: string; duration_ms: number }>((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
        ),
      ]);
      
      console.log('[ToolExecution] Tool result:', call.name, result.success ? 'SUCCESS' : 'FAILED', 
        result.error || '');
      
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        success: result.success,
        result: result.result !== undefined 
          ? (typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : String(result.result)) 
          : undefined,
        error: result.error,
        duration_ms: result.duration_ms,
      });
    } catch (err) {
      console.error('[ToolExecution] Tool error:', call.name, err);
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        duration_ms: 0,
      });
    }
  }
  
  return results;
}

// ============================================================================
// Tool Result Formatting
// ============================================================================

export function formatToolResultsForPrompt(results: ToolResultInfo[]): string {
  const lines: string[] = ['\n[TOOL RESULTS]'];
  
  for (const result of results) {
    const parsed = parseToolName(result.toolName);
    const icon = parsed.source === 'internal' ? '🔧' : '🔌';
    
    if (result.success) {
      lines.push(`${result.toolName}: Success`);
      if (result.result) {
        const resultStr = String(result.result);
        const MAX_LEN = 15000;
        lines.push(`  Result: ${resultStr.substring(0, MAX_LEN)}${resultStr.length > MAX_LEN ? '...[truncated]' : ''}`);
      }
    } else {
      lines.push(`${result.toolName}: Error - ${result.error}`);
    }
  }
  
  lines.push('[/TOOL RESULTS]');
  return lines.join('\n');
}

// Display-only version shown in chat UI (no AI instructions leaking through)
export function formatToolResultsForChat(results: ToolResultInfo[]): string {
  const lines: string[] = ['[TOOL RESULTS]'];
  
  for (const result of results) {
    const parsed = parseToolName(result.toolName);
    const icon = parsed.source === 'internal' ? '🔧' : '🔌';
    
    if (result.success) {
      lines.push(`${result.toolName}: Success`);
      if (result.result) {
        const resultStr = String(result.result);
        const MAX_LEN = 15000;
        lines.push(`  Result: ${resultStr.substring(0, MAX_LEN)}${resultStr.length > MAX_LEN ? '...[truncated]' : ''}`);
      }
    } else {
      lines.push(`${result.toolName}: Error - ${result.error}`);
    }
  }
  
  lines.push('[/TOOL RESULTS]');
  return lines.join('\n');
}

export function formatToolResultsForDisplay(results: ToolResultInfo[]): string {
  const lines: string[] = [];
  
  for (const result of results) {
    const parsed = parseToolName(result.toolName);
    const icon = parsed.source === 'internal' ? '🔧' : '🔌';
    const status = result.success ? '✅' : '❌';
    
    lines.push(`${status} ${icon} ${result.toolName} (${result.duration_ms}ms)`);
    
    if (result.success && result.result) {
      const resultStr = String(result.result);
      const truncated = resultStr.substring(0, 200);
      lines.push(`   Result: ${truncated}${resultStr.length > 200 ? '...' : ''}`);
    } else if (!result.success && result.error) {
      lines.push(`   Error: ${result.error}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// Tool Prompt Injection
// ============================================================================

export function injectToolsIntoPrompt(
  basePrompt: string,
  options?: ToolCallingOptions
): string {
  const schemas = getToolSchemas(options);
  
  if (schemas.length === 0) {
    return basePrompt;
  }
  
  const toolSection = [
    '\n[AVAILABLE TOOLS]',
    'You have access to the following tools. Use them when needed:',
    '',
    ...schemas.map(schema => {
      const params = JSON.stringify(schema.input_schema, null, 2);
      return `- ${schema.name}: ${schema.description}\n  Parameters: ${params}`;
    }),
    '',
    'To use a tool, mention it in your response with EXACTLY this format: [Tool: tool_name {"param1": "value"}]',
    'Include the JSON arguments snippet inside the brackets if parameters are required.',
    'The tool will be executed and results will be provided.',
    '[/AVAILABLE TOOLS]',
    '',
  ].join('\n');
  
  return toolSection + basePrompt;
}

// ============================================================================
// Tool Prompt Builder for Chat Integration
// ============================================================================

/**
 * Build a concise tool definition prompt for AI models
 */
export function buildToolPromptForChat(
  tools: UnifiedTool[],
  options?: { maxTools?: number; includeDescriptions?: boolean }
): string {
  if (tools.length === 0) return '';
  
  const maxTools = options?.maxTools || 20;
  const includeDescriptions = options?.includeDescriptions ?? true;
  const limitedTools = tools.slice(0, maxTools);
  
  const toolDefs = limitedTools.map(tool => {
    const parsed = parseToolName(tool.name);
    const categoryLabel = parsed.source === 'internal' ? '[INTERNAL]' : '[MCP]';
    const toolName = parsed.name;
    const desc = includeDescriptions && tool.description ? `: ${tool.description}` : '';
    
    let paramsStr = '';
    if (tool.parameters && typeof tool.parameters === 'object') {
      const params = tool.parameters as { properties?: Record<string, unknown> };
      if (params.properties) {
        const paramList = Object.keys(params.properties).join(', ');
        paramsStr = paramList ? `(${paramList})` : '()';
      }
    }
    
    return `  - ${categoryLabel} ${toolName}${paramsStr}${desc}`;
  }).join('\n');
  
  return `
[AVAILABLE TOOLS]
You have access to these tools. Use them by mentioning the tool name in your response:

${toolDefs}

To use a tool, include exactly: [Tool: tool_name {"arg": "value"}]
After getting tool results, respond CONVERSATIONALLY in plain language. Never dump raw JSON to the user. Summarize and explain results naturally.
[/AVAILABLE TOOLS]
`;
}

/**
 * Check if prompt mentions internal tools
 */
export function shouldInjectTools(prompt: string): boolean {
  const promptLower = prompt.toLowerCase();
  const keywords = [
    'task', 'project', 'skill',
    'create task', 'list task', 'update task',
    'get project', 'workspace',
  ];
  
  return keywords.some(kw => promptLower.includes(kw));
}

// ============================================================================
// Hook for React Components
// ============================================================================

export interface UseToolsResult {
  tools: UnifiedTool[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAvailableTools(options?: ToolCallingOptions): UseToolsResult {
  const [tools, setTools] = useState<UnifiedTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    try {
      const allTools = getAllTools();
      let filtered = allTools;
      
      if (options?.enableInternalTools === false) {
        filtered = filtered.filter(t => t.source !== 'internal');
      }
      
      if (options?.enableExternalTools === false) {
        filtered = filtered.filter(t => t.source !== 'external');
      }
      
      if (options?.specificTools && options.specificTools.length > 0) {
        const toolSet = new Set(options.specificTools);
        filtered = filtered.filter(t => toolSet.has(t.name));
      }
      
      setTools(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setIsLoading(false);
    }
  }, [options?.enableInternalTools, options?.enableExternalTools, options?.specificTools]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  return { tools, isLoading, error, refresh };
}