/**
 * MCP Store
 * 
 * Zustand store for managing MCP server state
 */

import { create } from 'zustand';
import {
  McpServerDto,
  McpTool,
  McpConnectionStatus,
  McpTransport,
  McpAuth,
} from '@/lib/mcp/types';
import * as mcpClient from '@/lib/mcp/client';

// Cache for external server URLs (not stored in McpServerDto)
const externalUrlCache = new Map<string, string>();
export function setExternalServerUrl(serverId: string, url: string) {
  externalUrlCache.set(serverId, url);
}

// ============================================================================
// Types
// ============================================================================

interface McpState {
  // State
  servers: McpServerDto[];
  isLoading: boolean;
  error: string | null;
  currentWorkspaceId: string | null;
  
  // Connection states (derived from servers but kept for quick access)
  connectionStatus: Record<string, McpConnectionStatus>;
  
  // Actions
  setServers: (servers: McpServerDto[]) => void;
  setCurrentWorkspace: (workspaceId: string) => void;
  addServer: (server: McpServerDto) => void;
  updateServer: (serverId: string, updates: Partial<McpServerDto>) => void;
  removeServer: (serverId: string) => void;
  updateServerStatus: (serverId: string, status: McpConnectionStatus, error?: string) => void;
  setServerTools: (serverId: string, tools: McpTool[]) => void;
  clearError: () => void;
  
  // Async actions
  loadServers: (workspaceId: string) => Promise<void>;
  createServer: (params: CreateServerParams) => Promise<string>;
  deleteServer: (serverId: string) => Promise<void>;
  connectServer: (serverId: string) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  testConnection: (transport: McpTransport, auth?: McpAuth) => Promise<boolean>;
}

interface CreateServerParams {
  workspaceId: string;
  name: string;
  description?: string;
  transport: McpTransport;
  auth?: McpAuth;
}

// ============================================================================
// Store
// ============================================================================

export const useMcpStore = create<McpState>((set, get) => ({
  // Initial state
  servers: [],
  isLoading: false,
  error: null,
  currentWorkspaceId: null,
  connectionStatus: {},
  
  // ==========================================================================
  // Sync Actions
  // ==========================================================================
  
  setServers: (servers) => {
    const connectionStatus: Record<string, McpConnectionStatus> = {};
    servers.forEach((server) => {
      connectionStatus[server.id] = server.status;
    });
    
    set({ 
      servers,
      connectionStatus,
      error: null,
    });
  },
  
  setCurrentWorkspace: (workspaceId) => {
    set({ 
      currentWorkspaceId: workspaceId,
      servers: [],
      connectionStatus: {},
      error: null,
    });
  },
  
  addServer: (server) => {
    set((state) => ({
      servers: [...state.servers, server],
      connectionStatus: {
        ...state.connectionStatus,
        [server.id]: server.status,
      },
      error: null,
    }));
  },
  
  updateServer: (serverId, updates) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, ...updates } : server
      ),
      error: null,
    }));
  },
  
  removeServer: (serverId) => {
    set((state) => {
      const newStatus = { ...state.connectionStatus };
      delete newStatus[serverId];
      
      return {
        servers: state.servers.filter((s) => s.id !== serverId),
        connectionStatus: newStatus,
        error: null,
      };
    });
  },
  
  updateServerStatus: (serverId, status, error) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId
          ? { ...server, status, error }
          : server
      ),
      connectionStatus: {
        ...state.connectionStatus,
        [serverId]: status,
      },
      error: null,
    }));
  },
  
  setServerTools: (serverId, tools) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, tools } : server
      ),
      error: null,
    }));
  },
  
  clearError: () => set({ error: null }),
  
  // ==========================================================================
  // Async Actions
  // ==========================================================================
  
  loadServers: async (workspaceId) => {
    set({ isLoading: true, error: null });
    
    try {
      const servers = await mcpClient.listMcpServers(workspaceId);
      get().setServers(servers);
      set({ currentWorkspaceId: workspaceId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load MCP servers';
      set({ error: errorMessage });
      console.error('Failed to load MCP servers:', err);
    } finally {
      set({ isLoading: false });
    }
  },
  
  createServer: async (params) => {
    set({ isLoading: true, error: null });
    
    try {
      const serverId = await mcpClient.addMcpServer({
        workspaceId: params.workspaceId,
        name: params.name,
        description: params.description,
        transport: params.transport,
        auth: params.auth,
      });
      
      // Reload servers to get the new one
      await get().loadServers(params.workspaceId);
      
      return serverId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create MCP server';
      set({ error: errorMessage });
      console.error('Failed to create MCP server:', err);
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
  
  deleteServer: async (serverId) => {
    set({ isLoading: true, error: null });
    
    try {
      await mcpClient.deleteMcpServer(serverId);
      get().removeServer(serverId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete MCP server';
      set({ error: errorMessage });
      console.error('Failed to delete MCP server:', err);
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
  
  connectServer: async (serverId) => {
    const { updateServerStatus, setServerTools, servers } = get();
    const server = servers.find(s => s.id === serverId);
    if (!server) { throw new Error('Server not found'); }

    // Optimistically update status
    updateServerStatus(serverId, 'connecting');

    try {
      // Use frontend externalManager for SSE/HTTP transports (Context7, etc.)
      if (server.transportType === 'sse' || server.transportType === 'http') {
        const { connectExternalServer } = await import('@/lib/mcp/externalManager');
        
        // Get URL from externalUrlCache (set when server was created)
        const url = externalUrlCache.get(serverId) || '';

        const transport = {
          type: server.transportType as 'sse' | 'http',
          url,
          headers: {} as Record<string, string>,
        };

        const result = await connectExternalServer(serverId, server.name, transport);
        
        setServerTools(serverId, result.tools.map(t => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || {},
        })));
        updateServerStatus(serverId, 'connected');
        return;
      }

      // Fallback to Rust backend (stdio or legacy)
      const tools = await mcpClient.connectMcpServer(serverId);
      setServerTools(serverId, tools);
      updateServerStatus(serverId, 'connected');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      updateServerStatus(serverId, 'failed', errorMessage);
      console.error('Failed to connect to MCP server:', err);
      throw err;
    }
  },

  disconnectServer: async (serverId) => {
    try {
      // Disconnect from externalManager if active
      const { disconnectExternalServer } = await import('@/lib/mcp/externalManager');
      await disconnectExternalServer(serverId).catch(() => {/* ignore if not connected */});
      
      await mcpClient.disconnectMcpServer(serverId).catch(() => {/* ignore rust errors */});
      get().updateServerStatus(serverId, 'disabled');
    } catch (err) {
      console.error('Failed to disconnect from MCP server:', err);
      throw err;
    }
  },

  testConnection: async (transport, auth) => {
    // For SSE/HTTP, test directly from frontend
    if (transport.type === 'sse' || transport.type === 'http') {
      try {
        const { createExternalMcpClient } = await import('@/lib/mcp/externalClient');
        const client = createExternalMcpClient({
          type: transport.type,
          url: (transport as { url?: string }).url || '',
        });
        await client.listTools();
        client.disconnect();
        return true;
      } catch {
        return false;
      }
    }

    try {
      const result = await mcpClient.testMcpConnection(transport, auth);
      return result.success;
    } catch (err) {
      console.error('Connection test failed:', err);
      return false;
    }
  },
}));

// ============================================================================
// Selectors
// ============================================================================

export const useMcpServers = () => useMcpStore((state) => state.servers);
export const useMcpServer = (serverId: string) =>
  useMcpStore((state) => state.servers.find((s) => s.id === serverId));
export const useMcpLoading = () => useMcpStore((state) => state.isLoading);
export const useMcpError = () => useMcpStore((state) => state.error);
export const useConnectedServers = () =>
  useMcpStore((state) => state.servers.filter((s) => s.status === 'connected'));
export const useServerTools = (serverId: string) =>
  useMcpStore((state) => state.servers.find((s) => s.id === serverId)?.tools ?? []);

// ============================================================================
// Utility Functions
// ============================================================================

export function getServerStatusColor(status: McpConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'text-green-500';
    case 'connecting':
      return 'text-yellow-500';
    case 'failed':
      return 'text-red-500';
    case 'needs_auth':
      return 'text-orange-500';
    case 'disabled':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}

export function getServerStatusLabel(status: McpConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'failed':
      return 'Failed';
    case 'needs_auth':
      return 'Needs Auth';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Unknown';
  }
}
