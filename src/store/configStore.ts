import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ProjectConfig {
  id?: number;
  workspace_id: string;
  md_persona: string;
  md_tech_stack: string;
  md_rules: string;
  md_tone: string;
  created_at?: string;
  updated_at?: string;
}

interface ConfigState {
  config: ProjectConfig | null;
  isLoading: boolean;
  error: string | null;
  activeTab: 'rules';
  
  // Actions
  setActiveTab: (tab: 'rules') => void;
  loadConfig: (workspaceId: string) => Promise<void>;
  saveConfig: (config: Partial<ProjectConfig>) => Promise<void>;
  updateField: (field: keyof ProjectConfig, value: string) => void;
  getSystemPrompt: () => string;
}

const defaultConfig: ProjectConfig = {
  workspace_id: '',
  md_persona: `# Persona

Kamu adalah senior software engineer yang berpengalaman.
Selalu berikan solusi yang clean, maintainable, dan mengikuti best practices.`,
  md_tech_stack: `# Tech Stack

- Framework: 
- Language: 
- Database: 
- Tools: `,
  md_rules: `# Rules

## DO
- 

## DON'T
- `,
  md_tone: `# Tone

Jawab singkat dan langsung ke poin.
Berikan penjelasan yang jelas dan terstruktur.`,
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,
  activeTab: 'rules',

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadConfig: async (workspaceId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<ProjectConfig | null>('get_project_config', { workspaceId });
      if (result) {
        set({ config: result, isLoading: false });
      } else {
        // Create default config if not exists
        set({ 
          config: { 
            ...defaultConfig, 
            workspace_id: workspaceId
          }, 
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load config',
        isLoading: false 
      });
    }
  },

  saveConfig: async (configUpdate: Partial<ProjectConfig>) => {
    const { config } = get();
    if (!config) return;

    const updatedConfig = { ...config, ...configUpdate };
    
    try {
      await invoke('save_project_config', { config: updatedConfig });
      set({ config: updatedConfig });
    } catch (error) {
      console.error('Failed to save config:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to save config' });
    }
  },

  updateField: (field, value) => {
    const { config } = get();
    if (!config) return;
    
    set({ 
      config: { 
        ...config, 
        [field]: value 
      } 
    });
  },

  getSystemPrompt: () => {
    const { config } = get();
    if (!config) return '';

    const sections = [
      config.md_rules,
    ].filter(Boolean);

    return sections.join('\n\n---\n\n');
  },
}));
