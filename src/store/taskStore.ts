import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Task, CreateTaskRequest } from '@/types';
import { dbService } from '@/lib/db';
import { useAIChatStore } from './aiChatStore';
import { getSavedRunningTask } from '@/lib/helpers';

// Track tasks recently moved to in-progress to prevent stuck detection race condition
const recentlyMovedToInProgress = new Map<string, number>();
const GRACE_PERIOD_MS = 30_000; // 30 seconds grace period before considering a task "stuck"

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  currentWorkspaceId: string | null;
  
  // Actions
  setCurrentWorkspace: (workspaceId: string | null) => void;
  fetchTasks: (workspaceId?: string) => Promise<void>;
  createTask: (task: CreateTaskRequest) => Promise<void>;
  updateTask: (id: string, title: string, description: string | null, priority: string) => Promise<void>;
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
          
          // Clean up expired entries from the grace period map
          const now = Date.now();
          for (const [taskId, movedAt] of recentlyMovedToInProgress.entries()) {
            if (now - movedAt > GRACE_PERIOD_MS) {
              recentlyMovedToInProgress.delete(taskId);
            }
          }
          
          // Check for stuck tasks (in-progress but no running AI process)
          const aiStore = useAIChatStore.getState();
          const savedTask = getSavedRunningTask();
          const stuckTasks = tasks.filter(task => {
            if (task.status !== 'in-progress') return false;
            // Skip tasks within grace period (just recently moved to in-progress)
            if (recentlyMovedToInProgress.has(task.id)) return false;
            // Check if AI is actually running this task
            const taskState = aiStore.taskStates[task.id];
            // Skip tasks that are currently creating a PR (can take a while)
            if (taskState?.creatingPR) return false;
            const isRunning = taskState?.status === 'running' || taskState?.status === 'queued';
            const isCurrentTask = aiStore.currentRunningTask === task.id;
            const isSavedTask = savedTask?.taskId === task.id;
            // Task is stuck if not running in memory AND not saved in localStorage
            return !isRunning && !isCurrentTask && !isSavedTask;
          });
          
          // Reset stuck tasks to 'todo'
          if (stuckTasks.length > 0) {
            console.log(`[TaskStore] Found ${stuckTasks.length} stuck task(s), resetting to todo:`, stuckTasks.map(t => t.title));
            for (const stuckTask of stuckTasks) {
              await dbService.updateTaskStatus(stuckTask.id, 'todo');
            }
            // Re-fetch tasks after reset
            const updatedTasks = await dbService.getTasksByWorkspace(targetWorkspaceId);
            set({ tasks: updatedTasks, isLoading: false });
          } else {
            set({ tasks, isLoading: false });
          }
          
          // Sync PR and merge info to AI chat store
          tasks.forEach(task => {
            if (task.pr_branch || task.is_merged) {
              const existingState = aiStore.taskStates[task.id];
              // Always sync from DB if DB has pr_branch and memory either doesn't have it
              // or has a different value (ensures consistency after app restart)
              const needsSync = task.pr_branch && existingState?.prBranch !== task.pr_branch;
              const needsMergeSync = task.is_merged && existingState?.isMerged !== task.is_merged;
              if (needsSync || needsMergeSync || !existingState) {
                useAIChatStore.setState({
                  taskStates: {
                    ...useAIChatStore.getState().taskStates,
                    [task.id]: {
                      ...(existingState || {
                        status: 'idle',
                        startTime: null,
                        endTime: null,
                        errorMessage: null,
                        lastResponse: null,
                        queuePosition: null,
                        currentFile: null,
                        filesModified: [],
                      }),
                      prBranch: task.pr_branch || existingState?.prBranch,
                      prUrl: task.pr_url || existingState?.prUrl,
                      prCreatedAt: task.pr_created_at ? new Date(task.pr_created_at).getTime() : existingState?.prCreatedAt,
                      isMerged: task.is_merged,
                      mergeSourceBranch: task.merge_source_branch || existingState?.mergeSourceBranch,
                    }
                  }
                });
              }
            }
          });
        } catch (error) {
          console.error('[TaskStore] fetchTasks error:', error);
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

      updateTask: async (id, title, description, priority) => {
        try {
          await dbService.updateTask(id, title, description, priority);
          await get().fetchTasks();
        } catch (error) {
          set({ error: String(error) });
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
          
          // Track grace period for in-progress moves to prevent stuck detection race condition
          if (status === 'in-progress') {
            recentlyMovedToInProgress.set(id, Date.now());
          } else {
            // Remove from grace period if moving away from in-progress
            recentlyMovedToInProgress.delete(id);
          }
          
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
