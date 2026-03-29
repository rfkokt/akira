import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Task, CreateTaskRequest } from '@/types';
import { dbService } from '@/lib/db';
import { useAIChatStore } from './aiChatStore';

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  currentWorkspaceId: string | null;
  
  // Actions
  setCurrentWorkspace: (workspaceId: string | null) => void;
  fetchTasks: (workspaceId?: string) => Promise<void>;
  createTask: (task: CreateTaskRequest) => Promise<void>;
  moveTask: (id: string, status: Task['status']) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>()(
  devtools(
    (set, get) => ({
      tasks: [],
      isLoading: false,
      error: null,
      currentWorkspaceId: null,

      setCurrentWorkspace: (workspaceId: string | null) => {
        set({ currentWorkspaceId: workspaceId });
        if (workspaceId) {
          get().fetchTasks(workspaceId);
        } else {
          set({ tasks: [] });
        }
      },

      fetchTasks: async (workspaceId?: string) => {
        const targetWorkspaceId = workspaceId || get().currentWorkspaceId;
        if (!targetWorkspaceId) {
          set({ tasks: [], isLoading: false });
          return;
        }
        
        set({ isLoading: true, error: null });
        try {
          const tasks = await dbService.getTasksByWorkspace(targetWorkspaceId);
          set({ tasks, isLoading: false });
          
          // Sync PR and merge info to AI chat store
          const aiStore = useAIChatStore.getState();
          tasks.forEach(task => {
            if (task.pr_branch || task.is_merged) {
              const existingState = aiStore.taskStates[task.id];
              if (!existingState?.prBranch && !existingState?.isMerged) {
                useAIChatStore.setState({
                  taskStates: {
                    ...aiStore.taskStates,
                    [task.id]: {
                      status: 'idle',
                      startTime: null,
                      endTime: null,
                      errorMessage: null,
                      lastResponse: null,
                      queuePosition: null,
                      currentFile: null,
                      filesModified: [],
                      prBranch: task.pr_branch || undefined,
                      prUrl: task.pr_url || undefined,
                      prCreatedAt: task.pr_created_at ? new Date(task.pr_created_at).getTime() : undefined,
                      isMerged: task.is_merged,
                      mergeSourceBranch: task.merge_source_branch || undefined,
                    }
                  }
                });
              }
            }
          });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      createTask: async (taskData) => {
        const { currentWorkspaceId } = get();
        if (!currentWorkspaceId) {
          set({ error: 'No workspace selected', isLoading: false });
          return;
        }
        
        set({ isLoading: true, error: null });
        try {
          await dbService.createTask({
            ...taskData,
            workspace_id: currentWorkspaceId,
          });
          await get().fetchTasks();
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      moveTask: async (id, status) => {
        const { currentWorkspaceId } = get();
        if (!currentWorkspaceId) {
          console.error('Cannot move task: no workspace selected');
          return;
        }
        
        try {
          console.log('Moving task:', id, 'to status:', status);
          await dbService.updateTaskStatus(id, status);
          console.log('Task moved, refreshing...');
          await get().fetchTasks(currentWorkspaceId);
          console.log('Tasks refreshed');
        } catch (error) {
          console.error('Move task error:', error);
          set({ error: String(error) });
        }
      },

      deleteTask: async (id) => {
        try {
          await dbService.deleteTask(id);
          await get().fetchTasks();
        } catch (error) {
          set({ error: String(error) });
        }
      },
    }),
    { name: 'task-store' }
  )
);
