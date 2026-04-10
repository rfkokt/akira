/**
 * analyzeStore — Global analysis progress state
 *
 * Persists analysis status, logs, and token info across Settings page navigation.
 * Without this, the state resets each time the user switches tabs.
 */

import { create } from 'zustand';

interface AnalyzeState {
  isAnalyzing: boolean;
  analysisStatus: string | null;
  analysisLogs: string[];
  analysisTokens: string | null;

  // Actions
  setAnalyzing: (v: boolean) => void;
  setStatus: (s: string | null) => void;
  addLog: (log: string) => void;
  setTokens: (t: string | null) => void;
  reset: () => void;
}

export const useAnalyzeStore = create<AnalyzeState>((set) => ({
  isAnalyzing: false,
  analysisStatus: null,
  analysisLogs: [],
  analysisTokens: null,

  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setStatus: (s) => set({ analysisStatus: s }),
  addLog: (log) =>
    set((state) => ({
      analysisLogs: state.analysisLogs.includes(log)
        ? state.analysisLogs
        : [...state.analysisLogs, log],
    })),
  reset: () =>
    set({ isAnalyzing: false, analysisStatus: null, analysisLogs: [], analysisTokens: null }),
  setTokens: (t) => set({ analysisTokens: t }),
}));
