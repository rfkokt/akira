import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Workspace {
  id: string;
  name: string;
  folder_path: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  showWelcome: boolean;
  
  // Actions
  loadWorkspaces: () => Promise<void>;
  loadActiveWorkspace: () => Promise<void>;
  createWorkspace: (name: string, folderPath: string) => Promise<Workspace>;
  setActiveWorkspace: (id: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  getWorkspaceById: (id: string) => Workspace | undefined;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  isLoading: false,
  error: null,
  showWelcome: true,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await invoke<Workspace[]>('get_all_workspaces');
      set({ workspaces, isLoading: false });
      
      // If no workspaces, show welcome
      if (workspaces.length === 0) {
        set({ showWelcome: true });
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      set({ error: 'Failed to load workspaces', isLoading: false });
    }
  },

  loadActiveWorkspace: async () => {
    try {
      const workspace = await invoke<Workspace | null>('get_active_workspace');
      set({ 
        activeWorkspace: workspace,
        showWelcome: !workspace
      });
    } catch (error) {
      console.error('Failed to load active workspace:', error);
    }
  },

  createWorkspace: async (name: string, folderPath: string) => {
    set({ isLoading: true, error: null });
    try {
      // Generate UUID
      const id = crypto.randomUUID();
      
      const workspace = await invoke<Workspace>('create_workspace', {
        id,
        name,
        folderPath,
      });
      
      set((state) => ({
        workspaces: [workspace, ...state.workspaces.filter(w => w.id !== workspace.id)],
        activeWorkspace: workspace,
        showWelcome: false,
        isLoading: false,
      }));
      
      return workspace;
    } catch (error) {
      console.error('Failed to create workspace:', error);
      set({ error: 'Failed to create workspace', isLoading: false });
      throw error;
    }
  },

  setActiveWorkspace: async (id: string) => {
    try {
      await invoke('set_active_workspace', { id });
      
      set((state) => ({
        workspaces: state.workspaces.map(w => ({
          ...w,
          is_active: w.id === id
        })),
        activeWorkspace: state.workspaces.find(w => w.id === id) || null,
      }));
    } catch (error) {
      console.error('Failed to set active workspace:', error);
    }
  },

  deleteWorkspace: async (id: string) => {
    try {
      await invoke('delete_workspace', { id });
      
      set((state) => {
        const newWorkspaces = state.workspaces.filter(w => w.id !== id);
        const wasActive = state.activeWorkspace?.id === id;
        
        return {
          workspaces: newWorkspaces,
          activeWorkspace: wasActive ? (newWorkspaces[0] || null) : state.activeWorkspace,
          showWelcome: newWorkspaces.length === 0,
        };
      });
    } catch (error) {
      console.error('Failed to delete workspace:', error);
    }
  },

  getWorkspaceById: (id: string) => {
    return get().workspaces.find(w => w.id === id);
  },
}));
