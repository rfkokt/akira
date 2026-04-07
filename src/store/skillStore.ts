import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  owner: string;
  repo: string;
  version: string | null;
  skill_path: string;
  installed_at: string;
}

interface SkillState {
  installedSkills: Skill[];
  isLoading: boolean;
  isInstalling: string | null;
  error: string | null;
  
  loadInstalledSkills: (workspaceId: string) => Promise<void>;
  installSkill: (workspaceId: string, workspacePath: string, owner: string, repo: string, skillPath?: string) => Promise<Skill>;
  uninstallSkill: (skillId: string) => Promise<void>;
  readSkillContent: (skillPath: string) => Promise<string>;
}

export const useSkillStore = create<SkillState>((set) => ({
  installedSkills: [],
  isLoading: false,
  isInstalling: null,
  error: null,

  loadInstalledSkills: async (workspaceId: string) => {
    set({ isLoading: true, error: null });
    try {
      const skills = await invoke<Skill[]>('get_installed_skills', { workspaceId });
      set({ installedSkills: skills, isLoading: false });
    } catch (error) {
      console.error('Failed to load skills:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  installSkill: async (workspaceId, workspacePath, owner, repo, skillPath) => {
    set({ isInstalling: 'installing', error: null });
    try {
      const skill = await invoke<Skill>('install_skill', {
        workspaceId,
        workspacePath,
        owner,
        repo,
        skillPath: skillPath || null,
      });
      set((state) => ({
        installedSkills: [skill, ...state.installedSkills.filter(s => s.id !== skill.id)],
        isInstalling: null,
      }));
      return skill;
    } catch (error) {
      console.error('Failed to install skill:', error);
      set({ error: String(error), isInstalling: null });
      throw error;
    }
  },

  uninstallSkill: async (skillId) => {
    try {
      await invoke('uninstall_skill', { skillId });
      set((state) => ({
        installedSkills: state.installedSkills.filter(s => s.id !== skillId),
      }));
    } catch (error) {
      console.error('Failed to uninstall skill:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  readSkillContent: async (skillPath) => {
    try {
      const content = await invoke<string>('read_skill_content', { skillPath });
      return content;
    } catch (error) {
      console.error('Failed to read skill:', error);
      throw error;
    }
  },
}));