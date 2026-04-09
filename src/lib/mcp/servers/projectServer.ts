/**
 * Project Context MCP Server
 * 
 * Provides internal tools for project context operations.
 * These tools can be called by AI to access project information.
 */

import type { InternalTool } from '../types';

// ============================================================================
// Project Server Tools
// ============================================================================

export function createProjectServerTools(): InternalTool[] {
  return [
    {
      name: 'project_get_info',
      description: 'Get information about the current project/workspace',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID',
          },
        },
        required: ['workspaceId'],
      },
      category: 'project',
      handler: async (args) => {
        const { workspaceId } = args as { workspaceId: string };
        
        try {
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          const workspaces = useWorkspaceStore.getState().workspaces;
          const workspace = workspaces.find(w => w.id === workspaceId);
          
          if (!workspace) {
            // Try active workspace
            const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
            if (activeWorkspace && activeWorkspace.id === workspaceId) {
              return {
                success: true,
                project: {
                  id: activeWorkspace.id,
                  name: activeWorkspace.name,
                  path: activeWorkspace.folder_path,
                  isActive: activeWorkspace.is_active,
                },
              };
            }
            
            return {
              success: false,
              error: `Workspace not found: ${workspaceId}`,
            };
          }
          
          return {
            success: true,
            project: {
              id: workspace.id,
              name: workspace.name,
              path: workspace.folder_path,
              isActive: workspace.is_active,
            },
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get project info',
          };
        }
      },
    },
    {
      name: 'project_get_active',
      description: 'Get the currently active workspace',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      category: 'project',
      handler: async () => {
        try {
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
          
          if (!activeWorkspace) {
            return {
              success: false,
              error: 'No active workspace',
            };
          }
          
          return {
            success: true,
            project: {
              id: activeWorkspace.id,
              name: activeWorkspace.name,
              path: activeWorkspace.folder_path,
            },
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get active workspace',
          };
        }
      },
    },
    {
      name: 'project_list_workspaces',
      description: 'List all available workspaces',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      category: 'project',
      handler: async () => {
        try {
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          const workspaces = useWorkspaceStore.getState().workspaces;
          
          return {
            success: true,
            workspaces: workspaces.map(w => ({
              id: w.id,
              name: w.name,
              path: w.folder_path,
              isActive: w.is_active,
            })),
            count: workspaces.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to list workspaces',
          };
        }
      },
    },
    {
      name: 'project_detect_tech_stack',
      description: 'Detect the technology stack used in the current project',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID (optional, uses active workspace if not specified)',
          },
        },
        required: [],
      },
      category: 'project',
      handler: async (args) => {
        const { workspaceId } = args as { workspaceId?: string };
        
        try {
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          const { invoke } = await import('@tauri-apps/api/core');
          
          let targetWorkspaceId = workspaceId;
          if (!targetWorkspaceId) {
            const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
            if (!activeWorkspace) {
              return {
                success: false,
                error: 'No active workspace',
              };
            }
            targetWorkspaceId = activeWorkspace.id;
          }
          
          const workspaces = useWorkspaceStore.getState().workspaces;
          const workspace = workspaces.find(w => w.id === targetWorkspaceId);
          
          if (!workspace) {
            return {
              success: false,
              error: `Workspace not found: ${targetWorkspaceId}`,
            };
          }
          
          // Check for common config files
          const configFiles = [
            'package.json',
            'Cargo.toml',
            'go.mod',
            'requirements.txt',
            'pyproject.toml',
            'pom.xml',
            'build.gradle',
            'Gemfile',
            'composer.json',
          ];
          
          const entries = await invoke<Array<{ name: string }>>('list_directory', {
            path: workspace.folder_path,
          }).catch(() => []);
          
          const detectedFiles: string[] = (entries || []).map(e => e.name);
          const techStack: string[] = [];
          
          if (detectedFiles.includes('package.json')) {
            techStack.push('Node.js/JavaScript');
          }
          if (detectedFiles.includes('tsconfig.json')) {
            techStack.push('TypeScript');
          }
          if (detectedFiles.includes('Cargo.toml')) {
            techStack.push('Rust');
          }
          if (detectedFiles.includes('go.mod')) {
            techStack.push('Go');
          }
          if (detectedFiles.includes('requirements.txt') || detectedFiles.includes('pyproject.toml')) {
            techStack.push('Python');
          }
          if (detectedFiles.includes('pom.xml') || detectedFiles.includes('build.gradle')) {
            techStack.push('Java');
          }
          if (detectedFiles.includes('Gemfile')) {
            techStack.push('Ruby');
          }
          if (detectedFiles.includes('composer.json')) {
            techStack.push('PHP');
          }
          if (detectedFiles.includes('next.config.js') || detectedFiles.includes('next.config.ts')) {
            techStack.push('Next.js');
          }
          if (detectedFiles.includes('tailwind.config.js') || detectedFiles.includes('tailwind.config.ts')) {
            techStack.push('TailwindCSS');
          }
          if (detectedFiles.includes('tauri.conf.json')) {
            techStack.push('Tauri');
          }
          
          return {
            success: true,
            workspaceId: targetWorkspaceId,
            workspaceName: workspace.name,
            techStack,
            detectedFiles: detectedFiles.filter(f => 
              configFiles.includes(f) ||
              f.includes('.config') ||
              f.includes('tailwind')
            ),
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to detect tech stack',
          };
        }
      },
    },
    {
      name: 'project_get_tasks_summary',
      description: 'Get a summary of tasks in the workspace',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID (optional, uses active workspace if not specified)',
          },
        },
        required: [],
      },
      category: 'project',
      handler: async (args) => {
        const { workspaceId } = args as { workspaceId?: string };
        
        try {
          const { useTaskStore } = await import('@/store/taskStore');
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          
          let targetWorkspaceId = workspaceId;
          if (!targetWorkspaceId) {
            const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
            if (!activeWorkspace) {
              return {
                success: false,
                error: 'No active workspace',
              };
            }
            targetWorkspaceId = activeWorkspace.id;
          }
          
          const tasks = useTaskStore.getState().tasks.filter(t => t.workspace_id === targetWorkspaceId);
          
          const summary = {
            total: tasks.length,
            backlog: tasks.filter(t => t.status === 'backlog').length,
            todo: tasks.filter(t => t.status === 'todo').length,
            inProgress: tasks.filter(t => t.status === 'in-progress').length,
            review: tasks.filter(t => t.status === 'review').length,
            done: tasks.filter(t => t.status === 'done').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            highPriority: tasks.filter(t => t.priority === 'high').length,
            mediumPriority: tasks.filter(t => t.priority === 'medium').length,
            lowPriority: tasks.filter(t => t.priority === 'low').length,
          };
          
          return {
            success: true,
            workspaceId: targetWorkspaceId,
            summary,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get tasks summary',
          };
        }
      },
    },
    {
      name: 'project_get_engines',
      description: 'Get the list of configured AI engines',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      category: 'project',
      handler: async () => {
        try {
          const { useEngineStore } = await import('@/store/engineStore');
          const engines = useEngineStore.getState().engines;
          
          return {
            success: true,
            engines: engines.map(e => ({
              id: e.id,
              alias: e.alias,
              model: e.model,
              enabled: e.enabled,
            })),
            count: engines.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get engines',
          };
        }
      },
    },
    {
      name: 'project_get_skills',
      description: 'Get the list of installed skills for the current workspace',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID (optional, uses active workspace if not specified)',
          },
        },
        required: [],
      },
      category: 'project',
      handler: async (args) => {
        const { workspaceId } = args as { workspaceId?: string };
        
        try {
          const { useSkillStore } = await import('@/store/skillStore');
          const { useWorkspaceStore } = await import('@/store/workspaceStore');
          
          let targetWorkspaceId = workspaceId;
          if (!targetWorkspaceId) {
            const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
            if (!activeWorkspace) {
              return {
                success: false,
                error: 'No active workspace',
              };
            }
            targetWorkspaceId = activeWorkspace.id;
          }
          
          const skills = useSkillStore.getState().installedSkills;
          
          return {
            success: true,
            workspaceId: targetWorkspaceId,
            skills: skills.map(s => ({
              id: s.id,
              name: s.name,
              description: s.description,
              owner: s.owner,
              repo: s.repo,
            })),
            count: skills.length,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get skills',
          };
        }
      },
    },
  ];
}

// ============================================================================
// Register Project Server Tools
// ============================================================================

export function registerProjectServerTools(
  register: (tool: InternalTool) => void
): void {
  const tools = createProjectServerTools();
  for (const tool of tools) {
    register(tool);
  }
}