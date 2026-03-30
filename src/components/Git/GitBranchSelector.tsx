import { useState, useEffect } from 'react';
import { GitBranch, ChevronDown, Plus, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface GitBranchInfo {
  current: string;
  branches: string[];
}

interface GitBranchSelectorProps {
  workspacePath: string;
}

export function GitBranchSelector({ workspacePath }: GitBranchSelectorProps) {
  const [branchInfo, setBranchInfo] = useState<GitBranchInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewBranchInput, setShowNewBranchInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  useEffect(() => {
    if (workspacePath) {
      loadBranches();
    }
  }, [workspacePath]);

  const loadBranches = async () => {
    try {
      setError(null);
      const info = await invoke<GitBranchInfo>('git_get_branches', {
        cwd: workspacePath
      });
      setBranchInfo(info);
    } catch (err) {
      console.error('Failed to load git branches:', err);
      setError('Not a git repository');
    }
  };

  const handleBranchChange = async (branch: string) => {
    if (branch === branchInfo?.current) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      await invoke('git_checkout_branch', {
        cwd: workspacePath,
        branch
      });
      await loadBranches();
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to checkout branch:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    setIsLoading(true);
    try {
      await invoke('git_create_branch', {
        cwd: workspacePath,
        branch: newBranchName.trim()
      });
      await loadBranches();
      setShowNewBranchInput(false);
      setNewBranchName('');
    } catch (err) {
      console.error('Failed to create branch:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-geist">
        <GitBranch className="w-3 h-3" />
        <span>No git repo</span>
      </div>
    );
  }

  if (!branchInfo) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-geist">
        <GitBranch className="w-3 h-3 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors font-geist"
      >
        <GitBranch className="w-3 h-3 text-[#0e639c]" />
        <span className="max-w-[100px] truncate">{branchInfo.current}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-56 bg-[#252526] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5">
              <span className="text-xs text-neutral-500 font-geist">Select Branch</span>
            </div>
            
            <div className="max-h-48 overflow-y-auto">
              {branchInfo.branches.map((branch) => (
                <button
                  key={branch}
                  onClick={() => handleBranchChange(branch)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-geist transition-colors ${
                    branch === branchInfo.current
                      ? 'bg-[#0e639c]/20 text-white'
                      : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{branch}</span>
                  {branch === branchInfo.current && (
                    <Check className="w-3 h-3 text-[#0e639c]" />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-white/5 p-2">
              {showNewBranchInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="Branch name"
                    className="flex-1 px-2 py-1 rounded text-xs bg-[#1e1e1e] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateBranch();
                      if (e.key === 'Escape') {
                        setShowNewBranchInput(false);
                        setNewBranchName('');
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleCreateBranch}
                    disabled={!newBranchName.trim() || isLoading}
                    className="p-1 rounded bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 text-white"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewBranchInput(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-geist"
                >
                  <Plus className="w-3 h-3" />
                  Create new branch
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
