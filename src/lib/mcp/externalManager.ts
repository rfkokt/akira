/**
 * External MCP Server Manager
 * 
 * Manages active connections to external MCP servers,
 * registers their tools into the internal tool registry,
 * and provides a bridge between external tools and AI tool calls.
 */

import type { InternalTool } from './types';
import { useToolRegistry } from './registry';
import {
  createExternalMcpClient,
  type ExternalMcpTransport,
  type McpTool,
} from './externalClient';

export interface ActiveExternalServer {
  id: string;
  name: string;
  transport: ExternalMcpTransport;
  tools: McpTool[];
  status: 'connecting' | 'connected' | 'failed' | 'disconnected';
  error?: string;
}

// In-memory map of active connections
const activeServers = new Map<string, {
  meta: ActiveExternalServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
}>();

// ============================================================================
// Connect & Register
// ============================================================================

export async function connectExternalServer(
  id: string,
  name: string,
  transport: ExternalMcpTransport,
): Promise<ActiveExternalServer> {
  // Disconnect existing if any
  if (activeServers.has(id)) {
    await disconnectExternalServer(id);
  }

  const meta: ActiveExternalServer = {
    id,
    name,
    transport,
    tools: [],
    status: 'connecting',
  };

  const client = createExternalMcpClient(transport);
  activeServers.set(id, { meta, client });

  try {
    // Initialize connection and fetch tools
    const tools = await client.listTools();
    meta.tools = tools;
    meta.status = 'connected';

    // Register tools into the Akira tool registry
    registerExternalTools(id, name, tools, client);

    console.log(`[ExternalMCP] Connected to "${name}" — ${tools.length} tools registered`);
    return meta;
  } catch (err) {
    meta.status = 'failed';
    meta.error = err instanceof Error ? err.message : String(err);
    console.error(`[ExternalMCP] Failed to connect to "${name}":`, err);
    throw err;
  }
}

export async function disconnectExternalServer(id: string): Promise<void> {
  const entry = activeServers.get(id);
  if (!entry) return;

  try {
    entry.client.disconnect();
  } catch { /* ignore */ }

  // Unregister tools
  const registry = useToolRegistry.getState();
  for (const tool of entry.meta.tools) {
    const registryName = `ext:${id}:${tool.name}`;
    registry.unregisterInternalTool(registryName);
  }

  entry.meta.status = 'disconnected';
  activeServers.delete(id);
  console.log(`[ExternalMCP] Disconnected from "${entry.meta.name}"`);
}

export function getActiveServers(): ActiveExternalServer[] {
  return Array.from(activeServers.values()).map(e => e.meta);
}

export function getServerStatus(id: string): ActiveExternalServer | undefined {
  return activeServers.get(id)?.meta;
}

// ============================================================================
// Tool Registration Bridge
// ============================================================================

function registerExternalTools(
  serverId: string,
  serverName: string,
  tools: McpTool[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): void {
  const registry = useToolRegistry.getState();

  for (const mcpTool of tools) {
    const registryName = `ext:${serverId}:${mcpTool.name}`;

    const tool: InternalTool = {
      name: registryName,
      description: `[${serverName}] ${mcpTool.description || mcpTool.name}`,
      parameters: (mcpTool.inputSchema as InternalTool['parameters']) || {
        type: 'object',
        properties: {},
        required: [],
      },
      category: 'external',
      handler: async (args) => {
        try {
          const result = await client.callTool(mcpTool.name, args as Record<string, unknown>);
          
          // Extract text content from MCP result
          const textContent = result.content
            ?.filter((c: { type: string }) => c.type === 'text')
            .map((c: { text?: string }) => c.text || '')
            .join('\n') || JSON.stringify(result);

          return {
            success: !result.isError,
            result: textContent,
            server: serverName,
            tool: mcpTool.name,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };

    registry.registerInternalTool(tool);
  }
}
