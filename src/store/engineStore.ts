import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Engine, CreateEngineRequest } from '@/types';
import { dbService } from '@/lib/db';

interface EngineState {
  engines: Engine[];
  activeEngine: Engine | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchEngines: () => Promise<void>;
  createEngine: (engine: CreateEngineRequest) => Promise<void>;
  toggleEngine: (id: number, enabled: boolean) => Promise<void>;
  deleteEngine: (id: number) => Promise<void>;
  setActiveEngine: (engine: Engine | null) => void;
  seedDefaultEngines: () => Promise<void>;
}

export const useEngineStore = create<EngineState>()(
  devtools(
    persist(
      (set, get) => ({
        engines: [],
        activeEngine: null,
        isLoading: false,
        error: null,

        fetchEngines: async () => {
          set({ isLoading: true, error: null });
          try {
            const engines = await dbService.getAllEngines();
            set({ engines, isLoading: false });
            
            // Set first enabled engine as active if none selected
            if (!get().activeEngine && engines.length > 0) {
              const firstEnabled = engines.find(e => e.enabled);
              if (firstEnabled) {
                set({ activeEngine: firstEnabled });
              }
            }
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        createEngine: async (engineData) => {
          set({ isLoading: true, error: null });
          try {
            await dbService.createEngine(engineData);
            await get().fetchEngines();
          } catch (error) {
            set({ error: String(error), isLoading: false });
          }
        },

        toggleEngine: async (id, enabled) => {
          try {
            await dbService.updateEngineEnabled(id, enabled);
            await get().fetchEngines();
          } catch (error) {
            set({ error: String(error) });
          }
        },

        deleteEngine: async (id) => {
          try {
            await dbService.deleteEngine(id);
            await get().fetchEngines();
          } catch (error) {
            set({ error: String(error) });
          }
        },

        setActiveEngine: (engine) => {
          set({ activeEngine: engine });
        },

        seedDefaultEngines: async () => {
          set({ isLoading: true, error: null });
          try {
            await dbService.seedDefaultEngines();
            await get().fetchEngines();
            set({ isLoading: false });
            
            // Set first enabled engine as active if none selected
            const engines = get().engines;
            if (!get().activeEngine && engines.length > 0) {
              const firstEnabled = engines.find(e => e.enabled);
              if (firstEnabled) {
                set({ activeEngine: firstEnabled });
              }
            }
          } catch (error) {
            console.error('Seed engines error:', error);
            set({ error: String(error), isLoading: false });
          }
        },
      }),
      { 
        name: 'engine-store',
        partialize: (state) => ({ activeEngine: state.activeEngine }),
      }
    ),
    { name: 'engine-store' }
  )
);
