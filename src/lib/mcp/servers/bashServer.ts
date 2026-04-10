/**
 * Shell/Bash MCP Server
 * 
 * Provides internal tools for running shell commands.
 * These tools can be called by AI to execute terminal commands.
 */

import type { InternalTool } from '../types';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

interface ShellResult {
  stdout: string;
  stderr: string;
  success: boolean;
  exit_code: number;
}

// ============================================================================
// Bash Server Tools
// ============================================================================

export function createBashServerTools(): InternalTool[] {
  return [
    {
      name: 'Bash',
      description: 'Execute a shell command in the workspace directory. Use for git, npm, docker, or other CLI operations.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute (e.g., "git", "npm")',
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments (e.g., ["status"], ["install"])',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (optional, defaults to workspace root)',
          },
        },
        required: ['command'],
      },
      category: 'bash',
      handler: async (args: any) => {
        const command = args.command || args.cmd || args.run;
        const cmdArgs = args.args || args.arguments || [];
        const cwd = args.cwd || args.dir || args.directory;
        
        if (!command) {
          return { success: false, error: 'Missing required argument: command' };
        }
        
        try {
          const workspaceCwd = cwd || await getWorkspacePath();
          
          const result = await invoke<ShellResult>('run_shell_command', {
            command,
            args: Array.isArray(cmdArgs) ? cmdArgs : [cmdArgs],
            cwd: workspaceCwd,
          });
          
          // Combine stdout and stderr for the output
          const output = result.stdout + (result.stderr ? '\n' + result.stderr : '');
          
          return {
            success: result.success,
            output: output.trim(),
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exit_code,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to execute command'),
          };
        }
      },
    },
    {
      name: 'GitStatus',
      description: 'Get git status for the workspace. Shows modified, staged, and untracked files.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (optional, defaults to workspace root)',
          },
        },
        required: [],
      },
      category: 'bash',
      handler: async (args) => {
        const { cwd } = args as { cwd?: string };
        
        try {
          const workspaceCwd = cwd || await getWorkspacePath();
          
          const result = await invoke<ShellResult>('run_shell_command', {
            command: 'git',
            args: ['status', '--porcelain'],
            cwd: workspaceCwd,
          });
          
          if (!result.success) {
            return {
              success: false,
              error: result.stderr || 'Failed to get git status',
            };
          }
          
          const lines = result.stdout.trim().split('\n').filter(Boolean);
          const files = lines.map(line => {
            const status = line.substring(0, 2).trim();
            const file = line.substring(3);
            let statusType = 'modified';
            
            if (status === '??') statusType = 'untracked';
            else if (status.includes('A')) statusType = 'added';
            else if (status.includes('D')) statusType = 'deleted';
            else if (status.includes('R')) statusType = 'renamed';
            else if (status.includes('M')) statusType = 'modified';
            
            return { file, status: statusType, code: status };
          });
          
          return {
            success: true,
            files,
            count: files.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get git status',
          };
        }
      },
    },
    {
      name: 'GitDiff',
      description: 'Get git diff for the workspace. Shows changes in tracked files.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (optional, defaults to workspace root)',
          },
          staged: {
            type: 'boolean',
            description: 'Show staged changes (default: false)',
          },
        },
        required: [],
      },
      category: 'bash',
      handler: async (args) => {
        const { cwd, staged } = args as { cwd?: string; staged?: boolean };
        
        try {
          const workspaceCwd = cwd || await getWorkspacePath();
          
          const gitArgs = staged 
            ? ['diff', '--cached']
            : ['diff'];
          
          const result = await invoke<ShellResult>('run_shell_command', {
            command: 'git',
            args: gitArgs,
            cwd: workspaceCwd,
          });
          
          return {
            success: result.success,
            diff: result.stdout,
            error: result.stderr || undefined,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get git diff',
          };
        }
      },
    },
    {
      name: 'GitLog',
      description: 'Get recent git commit history.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (optional, defaults to workspace root)',
          },
          limit: {
            type: 'number',
            description: 'Number of commits to show (default: 10)',
          },
        },
        required: [],
      },
      category: 'bash',
      handler: async (args) => {
        const { cwd, limit } = args as { cwd?: string; limit?: number };
        
        try {
          const workspaceCwd = cwd || await getWorkspacePath();
          const numCommits = limit || 10;
          
          const result = await invoke<ShellResult>('run_shell_command', {
            command: 'git',
            args: ['log', `-${numCommits}`, '--oneline', '--decorate'],
            cwd: workspaceCwd,
          });
          
          if (!result.success) {
            return {
              success: false,
              error: result.stderr || 'Failed to get git log',
            };
          }
          
          const commits = result.stdout.trim().split('\n').filter(Boolean).map(line => {
            const parts = line.split(' ');
            const hash = parts[0];
            const message = parts.slice(1).join(' ');
            return { hash, message };
          });
          
          return {
            success: true,
            commits,
            count: commits.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get git log',
          };
        }
      },
    },
    {
      name: 'NpmRun',
      description: 'Run an npm/pnpm/yarn script in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'The script name to run (e.g., "dev", "build", "test")',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (optional, defaults to workspace root)',
          },
        },
        required: ['script'],
      },
      category: 'bash',
      handler: async (args) => {
        const { script, cwd } = args as {
          script: string;
          cwd?: string;
        };
        
        try {
          const workspaceCwd = cwd || await getWorkspacePath();
          
          // Try different package managers
          const packageManagers = ['pnpm', 'yarn', 'npm'];
          let lastError: string | undefined;
          
          for (const pm of packageManagers) {
            const cmdArgs = pm === 'yarn' ? [script] : ['run', script];
            
            const result = await invoke<ShellResult>('run_shell_command', {
              command: pm,
              args: cmdArgs,
              cwd: workspaceCwd,
            });
            
            if (result.success) {
              return {
                success: true,
                output: result.stdout,
                packageManager: pm,
              };
            }
            
            // If command not found, try next package manager
            if (result.stderr.includes('not found') || result.stderr.includes('not recognized')) {
              continue;
            }
            
            lastError = result.stderr || result.stdout;
          }
          
          return {
            success: false,
            error: lastError || 'Failed to run npm script with any package manager',
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to run npm script',
          };
        }
      },
    },
    {
      name: 'NpmInstall',
      description: 'Install dependencies for the project using detected package manager.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (optional, defaults to workspace root)',
          },
        },
        required: [],
      },
      category: 'bash',
      handler: async (args) => {
        const { cwd } = args as { cwd?: string };
        
        try {
          const workspaceCwd = cwd || await getWorkspacePath();
          
          // Try different package managers
          const commands = [
            { pm: 'pnpm', args: ['install'] },
            { pm: 'yarn', args: [] },
            { pm: 'npm', args: ['install'] },
          ];
          
          for (const { pm, args: cmdArgs } of commands) {
            const result = await invoke<ShellResult>('run_shell_command', {
              command: pm,
              args: cmdArgs,
              cwd: workspaceCwd,
            });
            
            if (result.success) {
              return {
                success: true,
                output: result.stdout,
                packageManager: pm,
              };
            }
            
            // If command not found, try next package manager
            if (result.stderr.includes('not found') || result.stderr.includes('not recognized')) {
              continue;
            }
            
            // If there was an actual error (command exists but failed), return it
            return {
              success: false,
              error: result.stderr || result.stdout || `Failed to install with ${pm}`,
            };
          }
          
          return {
            success: false,
            error: 'No package manager found (tried pnpm, yarn, npm)',
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to install dependencies',
          };
        }
      },
    },
  ];
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getWorkspacePath(): Promise<string> {
  const { useWorkspaceStore } = await import('@/store/workspaceStore');
  const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
  
  if (!activeWorkspace) {
    throw new Error('No active workspace');
  }
  
  return activeWorkspace.folder_path;
}

// ============================================================================
// Register Bash Server Tools
// ============================================================================

export function registerBashServerTools(
  register: (tool: InternalTool) => void
): void {
  const tools = createBashServerTools();
  for (const tool of tools) {
    register(tool);
  }
}