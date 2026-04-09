/**
 * Task Management MCP Server
 * 
 * Provides internal tools for task management operations.
 * These tools can be called by AI to manage tasks programmatically.
 */

import type { InternalTool } from '../types';

// ============================================================================
// Task Server Tools
// ============================================================================

export function createTaskServerTools(): InternalTool[] {
  return [
    {
      name: 'task_list',
      description: 'List all tasks in a workspace, optionally filtered by status',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to list tasks from',
          },
          status: {
            type: 'string',
            enum: ['backlog', 'todo', 'in-progress', 'review', 'done', 'failed'],
            description: 'Filter by task status',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Filter by priority',
          },
        },
        required: ['workspaceId'],
      },
      category: 'task',
      handler: async (args) => {
        const { workspaceId, status, priority } = args as {
          workspaceId: string;
          status?: string;
          priority?: string;
        };
        
        try {
          const { dbService } = await import('@/lib/db');
          let tasks = await dbService.getTasksByWorkspace(workspaceId);
          
          if (status) {
            tasks = tasks.filter(t => t.status === status);
          }
          if (priority) {
            tasks = tasks.filter(t => t.priority === priority);
          }
          
          return {
            success: true,
            count: tasks.length,
            tasks: tasks.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              created_at: t.created_at,
            })),
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to list tasks',
          };
        }
      },
    },
    {
      name: 'task_get',
      description: 'Get detailed information about a specific task by searching in task list',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to retrieve',
          },
        },
        required: ['taskId'],
      },
      category: 'task',
      handler: async (args) => {
        const { taskId } = args as { taskId: string };
        
        try {
          const { useTaskStore } = await import('@/store/taskStore');
          const tasks = useTaskStore.getState().tasks;
          const task = tasks.find(t => t.id === taskId);
          
          if (!task) {
            return {
              success: false,
              error: `Task not found: ${taskId}`,
            };
          }
          
          return {
            success: true,
            task: {
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              created_at: task.created_at,
              updated_at: task.updated_at,
              pr_branch: task.pr_branch,
              pr_url: task.pr_url,
            },
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to get task',
          };
        }
      },
    },
    {
      name: 'task_create',
      description: 'Create a new task in a workspace',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to create the task in',
          },
          title: {
            type: 'string',
            description: 'The task title',
          },
          description: {
            type: 'string',
            description: 'The task description (optional)',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Task priority (default: medium)',
          },
        },
        required: ['workspaceId', 'title'],
      },
      category: 'task',
      handler: async (args) => {
        const { workspaceId, title, description, priority } = args as {
          workspaceId: string;
          title: string;
          description?: string;
          priority?: string;
        };
        
        try {
          const { useTaskStore } = await import('@/store/taskStore');
          
          // Use the store's createTask which handles column assignment
          await useTaskStore.getState().createTask({
            workspace_id: workspaceId,
            title,
            description: description || undefined,
            priority: (priority as 'low' | 'medium' | 'high') || 'medium',
            status: 'backlog',
          });
          
          // Get the newly created task
          const tasks = useTaskStore.getState().tasks;
          const newTask = tasks.find(t => t.title === title && t.workspace_id === workspaceId);
          
          return {
            success: true,
            task: newTask ? {
              id: newTask.id,
              title: newTask.title,
              status: newTask.status,
              priority: newTask.priority,
            } : { title, status: 'backlog', priority: priority || 'medium' },
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to create task',
          };
        }
      },
    },
    {
      name: 'task_update_status',
      description: 'Update the status of a task (move between columns)',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to update',
          },
          status: {
            type: 'string',
            enum: ['backlog', 'todo', 'in-progress', 'review', 'done', 'failed'],
            description: 'The new status',
          },
        },
        required: ['taskId', 'status'],
      },
      category: 'task',
      handler: async (args) => {
        const { taskId, status } = args as {
          taskId: string;
          status: string;
        };
        
        try {
          const { useTaskStore } = await import('@/store/taskStore');
          await useTaskStore.getState().moveTask(taskId, status as 'backlog' | 'todo' | 'in-progress' | 'review' | 'done' | 'failed');
          
          return {
            success: true,
            taskId,
            newStatus: status,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to update task status',
          };
        }
      },
    },
    {
      name: 'task_update_priority',
      description: 'Update the priority of a task',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to update',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'The new priority',
          },
        },
        required: ['taskId', 'priority'],
      },
      category: 'task',
      handler: async (args) => {
        const { taskId, priority } = args as {
          taskId: string;
          priority: string;
        };
        
        try {
          const { useTaskStore } = await import('@/store/taskStore');
          const tasks = useTaskStore.getState().tasks;
          const task = tasks.find(t => t.id === taskId);
          
          if (!task) {
            return {
              success: false,
              error: `Task not found: ${taskId}`,
            };
          }
          
          await useTaskStore.getState().updateTask(taskId, task.title, task.description, priority);
          
          return {
            success: true,
            taskId,
            newPriority: priority,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to update task priority',
          };
        }
      },
    },
    {
      name: 'task_delete',
      description: 'Delete a task',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to delete',
          },
        },
        required: ['taskId'],
      },
      category: 'task',
      handler: async (args) => {
        const { taskId } = args as { taskId: string };
        
        try {
          const { useTaskStore } = await import('@/store/taskStore');
          await useTaskStore.getState().deleteTask(taskId);
          
          return {
            success: true,
            taskId,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to delete task',
          };
        }
      },
    },
    {
      name: 'task_search',
      description: 'Search tasks by title or description',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to search in',
          },
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['workspaceId', 'query'],
      },
      category: 'task',
      handler: async (args) => {
        const { workspaceId, query } = args as {
          workspaceId: string;
          query: string;
        };
        
        try {
          const { dbService } = await import('@/lib/db');
          const tasks = await dbService.getTasksByWorkspace(workspaceId);
          const queryLower = query.toLowerCase();
          
          const filtered = tasks.filter(t => 
            t.title.toLowerCase().includes(queryLower) ||
            (t.description && t.description.toLowerCase().includes(queryLower))
          );
          
          return {
            success: true,
            query,
            count: filtered.length,
            tasks: filtered.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
            })),
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to search tasks',
          };
        }
      },
    },
  ];
}

// ============================================================================
// Register Task Server Tools
// ============================================================================

export function registerTaskServerTools(
  register: (tool: InternalTool) => void
): void {
  const tools = createTaskServerTools();
  for (const tool of tools) {
    register(tool);
  }
}