/**
 * MCP Client
 * 
 * Frontend client for interacting with MCP servers via Tauri commands
 */

import { invoke } from '@tauri-apps/api/core';
import {
  McpServerDto,
    AddMcpServerRequest,
  UpdateMcpServerRequest,
  McpTool,
  McpToolCallRequest,
  McpToolCallResult,
  McpResourceReadRequest,
  McpResourceContent,
  McpToolCallHistory,
    TestConnectionResult,
  McpTransport,
  McpAuth,
} from './types';

/**
 * Add a new MCP server
 */
export async function addMcpServer(request: AddMcpServerRequest): Promise<string> {
  try {
    const serverId = await invoke<string>('mcp_add_server', { request });
    return serverId;
  } catch (error) {
    console.error('Failed to add MCP server:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to add MCP server');
  }
}

/**
 * List all MCP servers for a workspace
 */
export async function listMcpServers(workspaceId: string): Promise<McpServerDto[]> {
  try {
    const servers = await invoke<McpServerDto[]>('mcp_list_servers', { workspaceId });
    return servers;
  } catch (error) {
    console.error('Failed to list MCP servers:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to list MCP servers');
  }
}

/**
 * Get a single MCP server by ID
 */
export async function getMcpServer(serverId: string): Promise<McpServerDto> {
  try {
    const server = await invoke<McpServerDto>('mcp_get_server', { serverId });
    return server;
  } catch (error) {
    console.error('Failed to get MCP server:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get MCP server');
  }
}

/**
 * Update an MCP server configuration
 */
export async function updateMcpServer(request: UpdateMcpServerRequest): Promise<void> {
  try {
    await invoke('mcp_update_server', { request });
  } catch (error) {
    console.error('Failed to update MCP server:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update MCP server');
  }
}

/**
 * Delete an MCP server
 */
export async function deleteMcpServer(serverId: string): Promise<void> {
  try {
    await invoke('mcp_delete_server', { serverId });
  } catch (error) {
    console.error('Failed to delete MCP server:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete MCP server');
  }
}

/**
 * Connect to an MCP server
 */
export async function connectMcpServer(serverId: string): Promise<McpTool[]> {
  try {
    const tools = await invoke<McpTool[]>('mcp_connect_server', { serverId });
    return tools;
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to connect to MCP server');
  }
}

/**
 * Disconnect from an MCP server
 */
export async function disconnectMcpServer(serverId: string): Promise<void> {
  try {
    await invoke('mcp_disconnect_server', { serverId });
  } catch (error) {
    console.error('Failed to disconnect from MCP server:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to disconnect from MCP server');
  }
}

/**
 * Test connection to an MCP server (without saving)
 */
export async function testMcpConnection(
  transport: McpTransport,
  auth?: McpAuth
): Promise<TestConnectionResult> {
  try {
    const result = await invoke<TestConnectionResult>('mcp_test_connection', {
      transport,
      auth,
    });
    return result;
  } catch (error) {
    console.error('Failed to test MCP connection:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to test MCP connection');
  }
}

/**
 * Call a tool on an MCP server
 */
export async function callMcpTool(request: McpToolCallRequest): Promise<McpToolCallResult> {
  try {
    const result = await invoke<McpToolCallResult>('mcp_call_tool', { request });
    return result;
  } catch (error) {
    console.error('Failed to call MCP tool:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to call MCP tool');
  }
}

/**
 * Read a resource from an MCP server
 */
export async function readMcpResource(
  request: McpResourceReadRequest
): Promise<McpResourceContent> {
  try {
    const result = await invoke<string>('mcp_read_resource', { request });
    // The result is currently a string, we might need to parse it
    return { uri: request.uri, text: result };
  } catch (error) {
    console.error('Failed to read MCP resource:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to read MCP resource');
  }
}

/**
 * Get recent tool calls for a server
 */
export async function getMcpToolCalls(
  serverId: string,
  limit: number = 50
): Promise<McpToolCallHistory[]> {
  try {
    const calls = await invoke<McpToolCallHistory[]>('mcp_get_tool_calls', {
      serverId,
      limit,
    });
    return calls;
  } catch (error) {
    console.error('Failed to get MCP tool calls:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get MCP tool calls');
  }
}

/**
 * Clear runtime state for all servers
 */
export async function clearAllMcpRuntime(): Promise<void> {
  try {
    await invoke('mcp_clear_all_runtime');
  } catch (error) {
    console.error('Failed to clear MCP runtime:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to clear MCP runtime');
  }
}
