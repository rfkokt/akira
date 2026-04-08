/**
 * MCP React Hooks
 *
 * React hooks for interacting with MCP servers
 */

import { useState, useCallback } from 'react';
import {
  McpTool,
    McpToolCallResult,
  McpToolCallHistory,
} from './types';
import * as mcpClient from './client';

/**
 * Hook untuk menggunakan tools dari MCP servers
 */
export function useMcpTools(serverId?: string) {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callTool = useCallback(
    async (toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> => {
      if (!serverId) {
        throw new Error('Server ID is required');
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await mcpClient.callMcpTool({
          serverId,
          toolName,
          arguments: args,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to call tool';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [serverId]
  );

  const getToolCalls = useCallback(
    async (limit: number = 50): Promise<McpToolCallHistory[]> => {
      if (!serverId) {
        return [];
      }

      try {
        return await mcpClient.getMcpToolCalls(serverId, limit);
      } catch (err) {
        console.error('Failed to get tool calls:', err);
        return [];
      }
    },
    [serverId]
  );

  return {
    tools,
    isLoading,
    error,
    callTool,
    getToolCalls,
    setTools,
  };
}

/**
 * Hook untuk connection status
 */
export function useMcpConnection(serverId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await mcpClient.connectMcpServer(serverId);
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      setIsConnected(false);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [serverId]);

  const disconnect = useCallback(async () => {
    try {
      await mcpClient.disconnectMcpServer(serverId);
      setIsConnected(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }, [serverId]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}

/**
 * Hook untuk test connection
 */
export function useMcpConnectionTest() {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const testConnection = useCallback(
    async (transport: unknown, auth?: unknown) => {
      setIsTesting(true);
      setTestResult(null);

      try {
        const result = await mcpClient.testMcpConnection(
          transport as any,
          auth as any
        );
        setTestResult({
          success: result.success,
          message: result.message,
        });
        return result.success;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection test failed';
        setTestResult({
          success: false,
          message,
        });
        return false;
      } finally {
        setIsTesting(false);
      }
    },
    []
  );

  return {
    isTesting,
    testResult,
    testConnection,
    resetTest: () => setTestResult(null),
  };
}
