import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Task, CreateTaskRequest } from '@/types';
import { dbService } from '@/lib/db';

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchTasks: () => Promise<void>;
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

      fetchTasks: async () => {
        set({ isLoading: true, error: null });
        try {
          const tasks = await dbService.getAllTasks();
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
