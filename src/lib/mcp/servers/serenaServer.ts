/**
 * Serena MCP Server — Built-in Integration
 *
 * Serena (oraios/serena) provides semantic code retrieval, editing, and
 * refactoring tools via the Language Server Protocol. It is auto-provisioned
 * as a built-in stdio MCP server for every workspace.
 *
 * @see https://github.com/oraios/serena
 */

import { invoke } from '@tauri-apps/api/core';
import { useMcpStore } from '@/store/mcpStore';
import type { McpStdioTransport } from '../types';

// ============================================================================
// Constants
// ============================================================================

export const SERENA_SERVER_NAME = 'serena';
const SERENA_DESCRIPTION =
  'Semantic code retrieval, editing & refactoring — the IDE for your coding agent';
const SERENA_REPO = 'git+https://github.com/oraios/serena';
const SERENA_PYTHON = '3.13';

// ============================================================================
// Config Builder
// ============================================================================

/**
 * Build the Serena stdio transport config for a given workspace path.
 */
export function getSerenaTransport(workspacePath: string): McpStdioTransport {
  return {
    type: 'stdio',
    command: 'uvx',
    args: [
      '-p', SERENA_PYTHON,
      '--from', SERENA_REPO,
      'serena',
      'start-mcp-server',
      '--context', 'ide',
      '--project', workspacePath,
    ],
    env: {},
  };
}

// ============================================================================
// Prerequisite Check & Install
// ============================================================================

interface ShellResult {
  stdout: string;
  stderr: string;
  success: boolean;
  exit_code: number;
}

/**
 * Check whether `uvx` (from uv) is available on the system.
 * Returns the version string on success, null on failure.
 */
export async function checkUvInstalled(): Promise<string | null> {
  try {
    const result = await invoke<ShellResult>('run_shell_command', {
      command: 'uvx',
      args: ['--version'],
      cwd: '.',
    });
    if (result.success) return result.stdout.trim() || 'installed';
  } catch { /* ignore */ }

  // Fallback: try uv directly
  try {
    const result = await invoke<ShellResult>('run_shell_command', {
      command: 'uv',
      args: ['--version'],
      cwd: '.',
    });
    if (result.success) return result.stdout.trim() || 'installed';
  } catch { /* ignore */ }

  return null;
}

/**
 * Attempt to install `uv` automatically using the official shell script.
 * Returns true if successful.
 */
export async function installUv(): Promise<boolean> {
  try {
    const result = await invoke<ShellResult>('run_shell_command', {
      command: 'sh',
      args: ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'],
      cwd: '.',
    });
    return result.success;
  } catch (err) {
    console.error('[Serena] Failed to install uv:', err);
    return false;
  }
}

// ============================================================================
// Auto-Provisioning
// ============================================================================

/** Track provisioning state to avoid duplicate concurrent calls */
const _provisioningWorkspaces = new Set<string>();

/**
 * Ensure a Serena MCP server exists and is connected for the given workspace.
 *
 * Flow:
 *   1. Check if a server named "serena" already exists for the workspace
 *   2. If not, create one via mcpStore.createServer()
 *   3. If disconnected, auto-connect
 *
 * This is idempotent — safe to call multiple times for the same workspace.
 *
 * @returns Object with status info
 */
export async function ensureSerenaServer(
  workspaceId: string,
  workspacePath: string,
): Promise<{ status: 'connected' | 'created' | 'error' | 'already_connecting'; error?: string }> {
  // Guard against concurrent provisioning for same workspace
  if (_provisioningWorkspaces.has(workspaceId)) {
    return { status: 'already_connecting' };
  }

  _provisioningWorkspaces.add(workspaceId);

  try {
    const mcpStore = useMcpStore.getState();
    const existing = mcpStore.servers.find(
      (s) => s.name === SERENA_SERVER_NAME && s.workspaceId === workspaceId,
    );

    if (existing) {
      // Server exists — connect if not already connected
      if (existing.status === 'connected') {
        return { status: 'connected' };
      }
      if (existing.status !== 'connecting') {
        try {
          await mcpStore.connectServer(existing.id);
          console.log('[Serena] Reconnected to existing server:', existing.id);
          return { status: 'connected' };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[Serena] Failed to reconnect:', errorMsg);
          return { status: 'error', error: errorMsg };
        }
      }
      return { status: 'already_connecting' };
    }

    // Server doesn't exist — create and connect
    const transport = getSerenaTransport(workspacePath);

    try {
      const serverId = await mcpStore.createServer({
        workspaceId,
        name: SERENA_SERVER_NAME,
        description: SERENA_DESCRIPTION,
        transport,
      });

      console.log('[Serena] Created server:', serverId);

      // createServer already calls loadServers which auto-connects enabled servers
      // But let's ensure it's connected
      const updatedStore = useMcpStore.getState();
      const newServer = updatedStore.servers.find((s) => s.id === serverId);
      if (newServer && newServer.status !== 'connected' && newServer.status !== 'connecting') {
        await updatedStore.connectServer(serverId);
      }

      return { status: 'created' };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Serena] Failed to create server:', errorMsg);
      return { status: 'error', error: errorMsg };
    }
  } finally {
    _provisioningWorkspaces.delete(workspaceId);
  }
}

// ============================================================================
// Status Helpers
// ============================================================================

/**
 * Get the current Serena server status for a workspace.
 */
export function getSerenaStatus(workspaceId: string): {
  exists: boolean;
  status: string;
  toolCount: number;
  error?: string;
} {
  const mcpStore = useMcpStore.getState();
  const server = mcpStore.servers.find(
    (s) => s.name === SERENA_SERVER_NAME && s.workspaceId === workspaceId,
  );

  if (!server) {
    return { exists: false, status: 'not_provisioned', toolCount: 0 };
  }

  return {
    exists: true,
    status: server.status,
    toolCount: server.tools.length,
    error: server.error,
  };
}

/**
 * Check if Serena is enabled for the current workspace.
 * (Can be extended with a user preference toggle in the future.)
 */
export function isSerenaEnabled(): boolean {
  // Always enabled for now — can add a config toggle later
  return true;
}
