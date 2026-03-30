import { create } from 'zustand';

interface ZoomState {
  scale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (scale: number) => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.5;
const ZOOM_STEP = 0.1;

export const useZoomStore = create<ZoomState>((set, get) => ({
  scale: 1,

  zoomIn: () => {
    const { scale } = get();
    const newScale = Math.min(scale + ZOOM_STEP, MAX_SCALE);
    set({ scale: Math.round(newScale * 10) / 10 });
  },

  zoomOut: () => {
    const { scale } = get();
    const newScale = Math.max(scale - ZOOM_STEP, MIN_SCALE);
    set({ scale: Math.round(newScale * 10) / 10 });
  },

  resetZoom: () => {
    set({ scale: 1 });
  },

  setZoom: (scale: number) => {
    const clampedScale = Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));
    set({ scale: Math.round(clampedScale * 10) / 10 });
  },
}));
