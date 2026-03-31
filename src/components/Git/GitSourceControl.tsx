import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Minus, ChevronDown, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import { useWorkspaceStore } from '@/store';

interface GitFileStatus {
  path: string;
  status: string;
  is_staged: boolean;
}

interface GitStatusResult {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
}

interface GitSourceControlProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

export function GitSourceControl({ onFileSelect, selectedFile }: GitSourceControlProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const [status, setStatus] = useState<GitStatusResult>({ staged: [], unstaged: [] });
  const [loading, setLoading] = useState(false);

  const [expandedStaged, setExpandedStaged] = useState(true);
  const [expandedChanges, setExpandedChanges] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    setLoading(true);
    try {
      const res = await invoke<GitStatusResult>('git_status', { cwd: activeWorkspace.folder_path });
      setStatus(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchStatus();
    const intv = setInterval(fetchStatus, 5000);
    return () => clearInterval(intv);
  }, [fetchStatus]);

  const handleStageFile = async (path: string) => {
    if (!activeWorkspace?.folder_path) return;
    await invoke('git_stage', { cwd: activeWorkspace.folder_path, paths: [path] });
    fetchStatus();
  }

  const handleStageAll = async () => {
    if (!activeWorkspace?.folder_path) return;
    const paths = status.unstaged.map(f => f.path);
    if(paths.length === 0) return;
    await invoke('git_stage', { cwd: activeWorkspace.folder_path, paths });
    fetchStatus();
  }

  const handleUnstageFile = async (path: string) => {
    if (!activeWorkspace?.folder_path) return;
    await invoke('git_unstage', { cwd: activeWorkspace.folder_path, paths: [path] });
    fetchStatus();
  }

  const handleUnstageAll = async () => {
    if (!activeWorkspace?.folder_path) return;
    const paths = status.staged.map(f => f.path);
    if(paths.length === 0) return;
    await invoke('git_unstage', { cwd: activeWorkspace.folder_path, paths });
    fetchStatus();
  }

  const handleDiscardFile = async (path: string) => {
    if (!activeWorkspace?.folder_path) return;
    if (confirm(`Are you sure you want to discard changes in ${path}? This cannot be undone.`)) {
       try {
         await invoke('git_discard_changes', { cwd: activeWorkspace.folder_path, paths: [path] });
         fetchStatus();
         if (selectedFile === path) {
           onFileSelect('');
         }
       } catch (err) {
         console.error(err);
         alert(err);
       }
    }
  }

  const handleDiscardAll = async () => {
    if (!activeWorkspace?.folder_path) return;
    const paths = status.unstaged.map(f => f.path);
    if(paths.length === 0) return;
    if (confirm(`Are you sure you want to discard ALL ${paths.length} unstaged changes? This cannot be undone.`)) {
       try {
         await invoke('git_discard_changes', { cwd: activeWorkspace.folder_path, paths });
         fetchStatus();
         onFileSelect('');
       } catch (err) {
         console.error(err);
         alert(err);
       }
    }
  }

  const getBadgeColor = (type: string) => {
    switch(type.trim()) {
      case 'M': return 'text-yellow-400';
      case 'A': return 'text-emerald-400';
      case 'U': return 'text-emerald-400';
      case 'D': return 'text-red-400';
      default: return 'text-neutral-500';
    }
  }

  if (!activeWorkspace) {
    return <div className="h-full flex items-center justify-center text-xs text-neutral-500 font-geist">No workspace selected</div>;
  }

  return (
    <div className="h-full w-full flex flex-col bg-transparent overflow-hidden border-app-border">
      {/* Header */}
      <div className="px-3 py-2 border-b border-app-border flex items-center justify-between shadow-sm z-10 bg-transparent shrink-0">
        <span className="text-xs font-medium text-app-text-muted font-geist uppercase tracking-widest">
          Source Control
        </span>
        <button onClick={fetchStatus} className="text-neutral-500 hover:text-white transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {/* Tree */}
      <div className="flex-1 overflow-auto py-2">
        {/* Staged Changes */}
        {status.staged.length > 0 && (
          <div className="mb-4">
            <div 
              className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-white/5 group"
              onClick={() => setExpandedStaged(!expandedStaged)}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 w-3.5 flex items-center justify-center">
                  {expandedStaged ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </span>
                <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">Staged Changes</span>
                <span className="text-[10px] bg-white/10 px-1.5 rounded-full text-neutral-400">{status.staged.length}</span>
              </div>
              <div className="hidden group-hover:flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); handleUnstageAll(); }} className="text-neutral-500 hover:text-white transition-colors" title="Unstage All Changes">
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            {expandedStaged && status.staged.map((file) => (
              <div 
                key={file.path}
                onClick={() => onFileSelect(file.path)}
                className={`flex items-center justify-between px-3 pl-8 py-1 cursor-pointer group h-7 ${selectedFile === file.path ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'}`}
              >
                <div className="flex items-center gap-2 truncate flex-1 pr-2">
                  <span className={`text-xs truncate font-geist flex-shrink-0 ${selectedFile === file.path ? 'font-medium' : ''}`}>{file.path.split('/').pop()}</span>
                  <span className="text-[10px] text-neutral-600 truncate">{file.path.split('/').slice(0,-1).join('/')}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handleUnstageFile(file.path); }} className="text-neutral-500 hover:text-white transition-colors" title="Unstage Changes">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className={`text-[10px] font-bold w-3 text-right ${getBadgeColor(file.status)}`}>{file.status.trim()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unstaged Changes */}
        <div className="mb-2">
          <div 
            className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-white/5 group"
            onClick={() => setExpandedChanges(!expandedChanges)}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 w-3.5 flex items-center justify-center">
                {expandedChanges ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
              <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">Changes</span>
              <span className="text-[10px] bg-white/10 px-1.5 rounded-full text-neutral-400">{status.unstaged.length}</span>
            </div>
            <div className="hidden group-hover:flex items-center gap-1">
              <button 
                onClick={(e) => { e.stopPropagation(); handleDiscardAll(); }} 
                className="text-neutral-500 hover:text-red-400 transition-colors" title="Discard All Changes"
                disabled={status.unstaged.length === 0}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleStageAll(); }} 
                className="text-neutral-500 hover:text-white transition-colors" title="Stage All Changes"
                disabled={status.unstaged.length === 0}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          
          {expandedChanges && status.unstaged.map((file) => (
            <div 
              key={file.path}
              onClick={() => onFileSelect(file.path)}
              className={`flex items-center justify-between px-3 pl-8 py-1 cursor-pointer group h-7 ${selectedFile === file.path ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'}`}
            >
              <div className="flex items-center gap-2 truncate flex-1 pr-2">
                <span className={`text-xs truncate font-geist flex-shrink-0 ${selectedFile === file.path ? 'font-medium' : ''}`}>{file.path.split('/').pop()}</span>
                <span className="text-[10px] text-neutral-600 truncate">{file.path.split('/').slice(0,-1).join('/')}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); handleDiscardFile(file.path); }} className="text-neutral-500 hover:text-red-400 transition-colors" title="Discard Changes">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleStageFile(file.path); }} className="text-neutral-500 hover:text-white transition-colors" title="Stage Changes">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className={`text-[10px] font-bold w-3 text-right ${getBadgeColor(file.status)}`}>{file.status.trim()}</span>
              </div>
            </div>
          ))}
          {expandedChanges && status.unstaged.length === 0 && (
            <div className="px-8 py-2 text-[10px] text-neutral-600 font-geist">No changes to display.</div>
          )}
        </div>
      </div>
    </div>
  );
}
