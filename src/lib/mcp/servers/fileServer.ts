/**
 * File Operations MCP Server
 * 
 * Provides internal tools for file system operations.
 * These tools can be called by AI to read, write, edit, and search files.
 */

import type { InternalTool } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface FileEntry {
  path: string;
  name: string;
  is_dir: boolean;
  size: number | null;
}

interface SearchResult {
  path: string;
  name: string;
  relative_path: string;
  line_number: number | null;
  line_content: string | null;
}

// ============================================================================
// File Server Tools
// ============================================================================

export function createFileServerTools(): InternalTool[] {
  return [
    {
      name: 'Read',
      description: 'Read the contents of a file from the local filesystem. Returns the file contents as string.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the file to read',
          },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (args: any) => {
        const path = args.path || args.file || args.uri;
        
        if (!path) {
          return { success: false, error: 'Missing required argument: path' };
        }

        try {
          const resolvedPath = await resolvePath(path);
          const content = await invoke<string>('read_file', { path: resolvedPath });
          
          return {
            success: true,
            content,
            lines: content.split('\n').length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to read file'),
          };
        }
      },
    },
    {
      name: 'Write',
      description: 'Write content to a file. Will create the file if it doesn\'t exist, or overwrite if it does.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the file to write',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
      category: 'file',
      handler: async (args: any) => {
        const path = args.path || args.file || args.uri;
        const content = args.content || args.text || args.data;
        
        if (!path) return { success: false, error: 'Missing required argument: path' };
        if (content === undefined) return { success: false, error: 'Missing required argument: content' };

        try {
          const resolvedPath = await resolvePath(path);
          await invoke('write_file', { path: resolvedPath, content });
          
          return {
            success: true,
            path,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to write file'),
          };
        }
      },
    },
    {
      name: 'Edit',
      description: 'Perform string replacements in a file. Replaces all occurrences of oldString with newString.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the file to edit',
          },
          oldString: {
            type: 'string',
            description: 'The text to search for (must match exactly)',
          },
          newString: {
            type: 'string',
            description: 'The text to replace with',
          },
          replaceAll: {
            type: 'boolean',
            description: 'Whether to replace all occurrences (default: false)',
          },
        },
        required: ['path', 'oldString', 'newString'],
      },
      category: 'file',
      handler: async (args) => {
        const { path, oldString, newString, replaceAll } = args as {
          path: string;
          oldString: string;
          newString: string;
          replaceAll?: boolean;
        };
        
        try {
          const resolvedPath = await resolvePath(path);
          // Read current content
          const content = await invoke<string>('read_file', { path: resolvedPath });
          
          // Perform replacement
          let newContent: string;
          if (replaceAll) {
            newContent = content.split(oldString).join(newString);
          } else {
            // Replace only first occurrence
            const idx = content.indexOf(oldString);
            if (idx === -1) {
              return {
                success: false,
                error: 'String not found in file',
              };
            }
            newContent = content.substring(0, idx) + newString + content.substring(idx + oldString.length);
          }
          
          // Write back
          await invoke('write_file', { path: resolvedPath, content: newContent });
          
          return {
            success: true,
            path,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to edit file'),
          };
        }
      },
    },
    {
      name: 'Glob',
      description: 'Search for files matching a glob pattern. Returns a list of file paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The search query (searches file names)',
          },
          path: {
            type: 'string',
            description: 'The directory to search in (optional, defaults to workspace root)',
          },
        },
        required: ['pattern'],
      },
      category: 'file',
      handler: async (args: any) => {
        const pattern = args.pattern || args.query || args.search;
        const path = args.path || args.dir || args.directory;
        
        if (!pattern) return { success: false, error: 'Missing required argument: pattern' };

        try {
          const workspacePath = path ? await resolvePath(path) : await getWorkspacePath();
          
          const results = await invoke<SearchResult[]>('search_files', {
            rootPath: workspacePath,
            query: pattern,
          });
          
          return {
            success: true,
            files: results.map(r => r.path),
            count: results.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to search files'),
          };
        }
      },
    },
    {
      name: 'List',
      description: 'List the contents of a directory (files and subdirectories).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the directory to list',
          },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (args) => {
        const { path } = args as { path: string };
        
        try {
          const resolvedPath = await resolvePath(path);
          const entries = await invoke<FileEntry[]>('read_directory', { path: resolvedPath });
          
          return {
            success: true,
            entries: entries.map(e => ({
              name: e.name,
              type: e.is_dir ? 'directory' : 'file',
              size: e.size,
            })),
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to list directory'),
          };
        }
      },
    },
    {
      name: 'Grep',
      description: 'Search for content in files using a query string.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text to search for in file contents',
          },
          path: {
            type: 'string',
            description: 'The directory to search in (optional, defaults to workspace root)',
          },
        },
        required: ['query'],
      },
      category: 'file',
      handler: async (args: any) => {
        const query = args.query || args.pattern || args.text || args.search;
        const path = args.path || args.dir || args.directory;
        
        if (!query) return { success: false, error: 'Missing required argument: query' };

        try {
          const workspacePath = path ? await resolvePath(path) : await getWorkspacePath();
          
          const results = await invoke<SearchResult[]>('search_in_files', {
            rootPath: workspacePath,
            query,
          });
          
          return {
            success: true,
            matches: results.map(r => ({
              file: r.path,
              line: r.line_number,
              content: r.line_content,
            })),
            count: results.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to search content'),
          };
        }
      },
    },
    {
      name: 'Mkdir',
      description: 'Create a directory (and parent directories if needed).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the directory to create',
          },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (args) => {
        const { path } = args as { path: string };
        
        try {
          const resolvedPath = await resolvePath(path);
          await invoke('create_directory', { path: resolvedPath });
          
          return {
            success: true,
            path,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to create directory'),
          };
        }
      },
    },
    {
      name: 'Rm',
      description: 'Delete a file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the file to delete',
          },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (args) => {
        const { path } = args as { path: string };
        
        try {
          const resolvedPath = await resolvePath(path);
          await invoke('delete_file', { path: resolvedPath });
          
          return {
            success: true,
            path,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to delete file'),
          };
        }
      },
    },
    {
      name: 'Rmdir',
      description: 'Delete a directory and all its contents.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the directory to delete',
          },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (args) => {
        const { path } = args as { path: string };
        
        try {
          const resolvedPath = await resolvePath(path);
          await invoke('delete_directory', { path: resolvedPath });
          
          return {
            success: true,
            path,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Failed to delete directory'),
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

async function resolvePath(targetPath: string): Promise<string> {
  if (targetPath.startsWith('/')) {
    return targetPath;
  }
  if (/^[a-zA-Z]:\\/.test(targetPath) || /^[a-zA-Z]:\//.test(targetPath)) {
    return targetPath;
  }
  
  const workspacePath = await getWorkspacePath();
  const cleanWorkspace = workspacePath.endsWith('/') || workspacePath.endsWith('\\') 
    ? workspacePath.slice(0, -1) 
    : workspacePath;
    
  const cleanTarget = targetPath.startsWith('/') || targetPath.startsWith('\\')
    ? targetPath.substring(1)
    : targetPath;
    
  return `${cleanWorkspace}/${cleanTarget}`;
}

// ============================================================================
// Register File Server Tools
// ============================================================================

export function registerFileServerTools(
  register: (tool: InternalTool) => void
): void {
  const tools = createFileServerTools();
  for (const tool of tools) {
    register(tool);
  }
}