import { useEffect, useState, useCallback, useRef } from 'react';
import { Cpu, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { usePiStore } from '@/store/piStore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MODEL_FETCH_TIMEOUT_MS = 10_000;

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export function ModelSelector() {
  const availableModels = usePiStore((s) => s.availableModels);
  const activeModel = usePiStore((s) => s.activeModel);
  const piError = usePiStore((s) => s.piError);
  const fetchModels = usePiStore((s) => s.fetchModels);
  const setModel = usePiStore((s) => s.setModel);

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadModels = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);

    // Set a 10s timeout
    timeoutRef.current = setTimeout(() => {
      setLoadState('error');
      setErrorMessage('Models could not be loaded — request timed out after 10 seconds.');
    }, MODEL_FETCH_TIMEOUT_MS);

    try {
      await fetchModels();
    } catch (err) {
      clearTimeout(timeoutRef.current!);
      timeoutRef.current = null;
      setLoadState('error');
      setErrorMessage(String(err));
    }
  }, [fetchModels]);

  // When models arrive from the store, clear timeout and mark loaded
  useEffect(() => {
    if (availableModels.length > 0 && loadState === 'loading') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLoadState('loaded');
      setErrorMessage(null);
    }
  }, [availableModels, loadState]);

  // If piError is set while loading, treat as error
  useEffect(() => {
    if (piError && loadState === 'loading') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLoadState('error');
      setErrorMessage(piError);
    }
  }, [piError, loadState]);

  // Fetch models on mount
  useEffect(() => {
    loadModels();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModelChange = useCallback(
    (modelId: string | null) => {
      if (modelId) {
        setModel(modelId);
      }
    },
    [setModel]
  );

  const handleRetry = useCallback(() => {
    loadModels();
  }, [loadModels]);

  // ── Loading State ─────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="space-y-4">
        <SectionHeader />
        <div className="bg-app-panel rounded-lg border border-app-border p-5">
          <div className="flex items-center gap-3 text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin text-app-accent" />
            <span className="text-sm">Loading available models...</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────────
  if (loadState === 'error') {
    return (
      <div className="space-y-4">
        <SectionHeader />
        <div className="bg-app-panel rounded-lg border border-red-500/30 p-5 space-y-3">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm">
              {errorMessage || 'Failed to load models.'}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 transition-all text-xs h-8"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Loaded State ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <SectionHeader />
      <div className="bg-app-panel rounded-lg border border-app-border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Cpu className="w-4 h-4 text-app-accent mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs font-medium text-white">Active Model</label>
              <p className="text-xs text-neutral-500 mt-0.5">
                Select which AI model Pi should use for task execution.
              </p>
            </div>

            {availableModels.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">
                No models available. Ensure Pi is authenticated.
              </p>
            ) : (
              <Select
                value={activeModel ?? undefined}
                onValueChange={handleModelChange}
              >
                <SelectTrigger className="w-full bg-black/30 border-app-border h-9 focus:ring-1 focus:ring-app-accent text-sm">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span className="text-sm text-white">{model.name}</span>
                      <span className="text-xs text-neutral-500 ml-2">
                        ({model.provider})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader() {
  return (
    <div>
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <Cpu className="w-4 h-4 text-app-accent" />
        Model Selection
      </h3>
      <p className="text-xs text-neutral-500 mt-1">
        Choose which AI model Pi uses for task execution and chat.
      </p>
    </div>
  );
}
