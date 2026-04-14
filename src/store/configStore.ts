import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from './workspaceStore';

export interface ProjectConfig {
  id?: number;
  workspace_id: string;
  md_persona: string;
  md_tech_stack: string;
  md_rules: string;
  md_tone: string;
  git_token?: string | null;
  google_api_key?: string | null;
  groq_api_key?: string | null;  // For small talk/chat (free tier)
  created_at?: string;
  updated_at?: string;
}

interface ConfigState {
  config: ProjectConfig | null;
  isLoading: boolean;
  error: string | null;
  activeTab: 'rules';

  // Cache for system prompt
  cachedSystemPrompt: string | null;
  cachedAt: number;

  // Actions
  setActiveTab: (tab: 'rules') => void;
  loadConfig: (workspaceId: string) => Promise<void>;
  saveConfig: (config: Partial<ProjectConfig>) => Promise<void>;
  updateField: (field: keyof ProjectConfig, value: string | null | undefined) => void;
  getSystemPrompt: () => string;
  getGroqApiKey: () => string | null;
}

const defaultConfig: ProjectConfig = {
  workspace_id: '',
  md_persona: `# Persona

You are an expert software engineer. Analyze requirements carefully, then implement clean, maintainable solutions following best practices.`,
  md_tech_stack: `# Tech Stack

- Framework: (analyze from package.json)
- Language: (analyze from source files)
- Database: (if applicable)
- Tools: (build tools, linters, etc.)`,
  md_rules: `# Coding Standards

## DO
- Write clean, self-documenting code with clear variable names
- Follow existing project patterns and conventions
- Add error handling for edge cases
- Use TypeScript types strictly (no 'any')
- Keep functions small and focused (single responsibility)
- Add comments only for complex logic, not obvious code

## DON'T
- Don't break existing functionality
- Don't add unnecessary dependencies
- Don't leave console.log in production code
- Don't ignore TypeScript errors
- Don't duplicate code - refactor into reusable functions

## Output Format
When implementing:
1. First analyze the requirements
2. List files that need changes
3. Show the implementation with clear comments
4. Verify the solution handles edge cases`,
  md_tone: `# Communication Style

Be concise but thorough. Focus on actionable solutions.`,
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,
  activeTab: 'rules',

  // Cache fields
  cachedSystemPrompt: null,
  cachedAt: 0,

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadConfig: async (workspaceId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<ProjectConfig | null>('get_project_config', { workspaceId });
      
      // Check if .akira/rules.md exists in workspace folder
      const folderPath = useWorkspaceStore.getState().activeWorkspace?.folder_path;
      let akiraImport: { md_rules: string } | null = null;
      if (folderPath) {
        try {
          akiraImport = await invoke<{ md_rules: string } | null>('import_akira_config', { folderPath });
        } catch { /* .akira/ might not exist yet */ }
      }

      if (result) {
        // If .akira/ has different rules, prefer .akira/ (newer from another device)
        const mergedConfig: ProjectConfig = {
          ...result,
          md_rules: akiraImport?.md_rules || result.md_rules,
        };
        set({ config: mergedConfig, isLoading: false });
      } else {
        const defaultWithAkira: ProjectConfig = {
          ...defaultConfig,
          workspace_id: workspaceId,
          md_rules: akiraImport?.md_rules || defaultConfig.md_rules,
        };
        set({ config: defaultWithAkira, isLoading: false });
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
      
      // ✅ CACHE INVALIDATION: Clear cache if rules changed
      const shouldInvalidateCache = configUpdate.md_rules !== undefined && 
        configUpdate.md_rules !== config.md_rules;
      
      set({ 
        config: updatedConfig,
        ...(shouldInvalidateCache ? { cachedSystemPrompt: null, cachedAt: 0 } : {})
      });
      
      if (shouldInvalidateCache) {
        console.log('[ConfigStore] Cache invalidated due to rules change');
      }

      // Also export to .akira/ for portability
      const folderPath = useWorkspaceStore.getState().activeWorkspace?.folder_path;
      if (folderPath) {
        try {
          await invoke('export_akira_config', {
            folderPath,
            config: { md_rules: updatedConfig.md_rules },
          });
        } catch (e) {
          console.warn('Failed to export to .akira/:', e);
        }
      }
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
    const { config, cachedSystemPrompt, cachedAt } = get();

    // ✅ CACHE: Return cached value if valid (< 5 minutes)
    if (cachedSystemPrompt && Date.now() - cachedAt < 5 * 60 * 1000) {
      console.log('[ConfigStore] Using cached system prompt');
      return cachedSystemPrompt;
    }

    if (!config) return '';

    const sections = [
      config.md_rules,
    ].filter(Boolean);

    const prompt = sections.join('\n\n---\n\n');

    // ✅ CACHE: Save to cache
    set({ cachedSystemPrompt: prompt, cachedAt: Date.now() });
    console.log('[ConfigStore] System prompt cached');

    return prompt;
  },

  getGroqApiKey: () => {
    const { config } = get();
    return config?.groq_api_key || null;
  },
}));
