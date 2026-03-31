import { useState, useEffect } from 'react';
import { GitBranch, ChevronDown, Plus, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface GitBranchInfo {
  current: string;
  local: string[];
  remote: string[];
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
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        disabled={isLoading}
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 hover:bg-app-panel/50 hover:text-app-text h-7 py-1 px-2 border border-transparent focus-visible:ring-0 data-[state=open]:bg-app-panel data-[state=open]:border-app-border"
      >
        <GitBranch className="w-3 h-3 text-app-accent" />
        <span className="max-w-[150px] truncate ml-1.5 mr-1.5">{branchInfo?.current || 'Loading...'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180 text-app-accent' : 'text-app-text-muted'}`} />
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="start" className="w-[240px] p-2 bg-app-panel/95 backdrop-blur-2xl">
        <div className="px-2 py-1.5 border-b border-app-border/40 mb-1">
          <span className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">Select Branch</span>
        </div>
        
        <div className="max-h-[200px] overflow-y-auto mb-1 custom-scrollbar">
          {/* Remote branches first */}
          {branchInfo?.remote?.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] text-neutral-500 uppercase tracking-wider">
                Remote
              </div>
              {branchInfo.remote.map((branch) => {
                const branchName = branch.replace(/^[^/]+\//, '')
                return (
                  <DropdownMenuItem
                    key={branch}
                    onClick={() => handleBranchChange(branchName)}
                    className={branchName === branchInfo?.current ? 'bg-app-accent/10 focus:bg-app-accent/20 text-app-accent focus:text-app-accent' : ''}
                  >
                    <span className="truncate flex-1">{branchName}</span>
                    {branchName === branchInfo?.current && (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </DropdownMenuItem>
                )
              })}
            </>
          )}
          
          {/* Local branches */}
          {branchInfo?.local?.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] text-neutral-500 uppercase tracking-wider mt-1">
                Local
              </div>
              {branchInfo.local
                .filter(b => !branchInfo.remote.some(r => r.endsWith('/' + b)))
                .map((branch) => (
                  <DropdownMenuItem
                    key={branch}
                    onClick={() => handleBranchChange(branch)}
                    className={branch === branchInfo?.current ? 'bg-app-accent/10 focus:bg-app-accent/20 text-app-accent focus:text-app-accent' : ''}
                  >
                    <span className="truncate flex-1">{branch}</span>
                    {branch === branchInfo?.current && (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
            </>
          )}
        </div>

        <div className="pt-2 border-t border-app-border/40 mt-1">
          {showNewBranchInput ? (
            <div className="flex items-center gap-1.5 flex-1 px-1">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Branch name..."
                className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-app-bg text-app-text border border-app-border focus:outline-none focus:border-app-accent/50 focus:ring-1 focus:ring-app-accent/30 font-geist transition-all"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleCreateBranch();
                  if (e.key === 'Escape') {
                    setShowNewBranchInput(false);
                    setNewBranchName('');
                  }
                }}
                autoFocus
              />
              <Button
                size="icon"
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || isLoading}
                className="w-7 h-7 shrink-0 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
              >
                <Plus className="w-3 h-3 text-white" />
              </Button>
            </div>
          ) : (
            <DropdownMenuItem
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                setShowNewBranchInput(true);
              }}
              className="text-app-text-muted hover:text-white justify-center py-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create branch
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
