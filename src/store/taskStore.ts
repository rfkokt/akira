import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Task, CreateTaskRequest } from '@/types';
import { dbService } from '@/lib/db';

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
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      createTask: async (taskData) => {
        set({ isLoading: true, error: null });
        try {
          await dbService.createTask(taskData);
          await get().fetchTasks();
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      moveTask: async (id, status) => {
        try {
          await dbService.updateTaskStatus(id, status);
          await get().fetchTasks();
        } catch (error) {
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
