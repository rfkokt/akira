import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ProjectConfig {
  id?: number;
  project_id: string;
  project_name: string;
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
  activeTab: 'persona' | 'tech-stack' | 'rules' | 'tone';
  
  // Actions
  setActiveTab: (tab: 'persona' | 'tech-stack' | 'rules' | 'tone') => void;
  loadConfig: (projectId: string) => Promise<void>;
  saveConfig: (config: Partial<ProjectConfig>) => Promise<void>;
  updateField: (field: keyof ProjectConfig, value: string) => void;
  getSystemPrompt: () => string;
}

const defaultConfig: ProjectConfig = {
  project_id: '',
  project_name: '',
  md_persona: `# Persona\n\nKamu adalah senior software engineer yang berpengalaman.\nSelalu berikan solusi yang clean, maintainable, dan mengikuti best practices.`,
  md_tech_stack: `# Tech Stack\n\n- Framework: \n- Language: \n- Database: \n- Tools: `,
  md_rules: `# Rules\n\n## DO\n- \n\n## DON'T\n- `,
  md_tone: `# Tone\n\nJawab singkat dan langsung ke poin.\nBerikan penjelasan yang jelas dan terstruktur.`,
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,
  activeTab: 'persona',

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadConfig: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<ProjectConfig | null>('get_project_config', { projectId });
      if (result) {
        set({ config: result, isLoading: false });
      } else {
        // Create default config if not exists
        set({ 
          config: { 
            ...defaultConfig, 
            project_id: projectId,
            project_name: projectId.split('/').pop() || projectId
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
      config.md_persona,
      config.md_tech_stack,
      config.md_rules,
      config.md_tone,
    ].filter(Boolean);

    return sections.join('\n\n---\n\n');
  },
}));
