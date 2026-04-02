import { useState, useEffect } from 'react';
import { GitBranch, ChevronDown, Plus, Check, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showNewBranchInput, setShowNewBranchInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  useEffect(() => {
    if (workspacePath) {
      loadBranches();
    }
  }, [workspacePath]);

  // Listen for branch changes from merge operations
  useEffect(() => {
    if (!workspacePath) return;
    const unlisten = listen<{ branch: string; cwd: string }>('git-branch-changed', (event) => {
      // Only refresh if the event is for our workspace
      if (event.payload.cwd === workspacePath) {
        loadBranches();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [workspacePath]);

  const loadBranches = async (fetchRemote = false) => {
    try {
      setLoadError(null);
      setIsLoading(true);
      
      // Optionally fetch latest branches from remote
      if (fetchRemote) {
        try {
          await invoke('run_shell_command', {
            command: 'git',
            args: ['fetch', '--prune'],
            cwd: workspacePath
          });
          console.log('[GitBranchSelector] Fetched latest branches from remote');
        } catch (fetchErr) {
          console.log('[GitBranchSelector] Fetch failed (may be offline):', fetchErr);
          // Continue anyway, we'll show local branches
        }
      }
      
      const info = await invoke<GitBranchInfo>('git_get_branches', {
        cwd: workspacePath
      });
      setBranchInfo(info);
    } catch (err) {
      console.error('Failed to load git branches:', err);
      setLoadError('Not a git repository');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBranchChange = async (branch: string) => {
    if (branch === branchInfo?.current) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setCheckoutError(null);
    let stashed = false;
    
    try {
      // Check for local changes
      const statusResult = await invoke<{ has_changes: boolean }>('git_get_diff', {
        cwd: workspacePath
      });
      
      // Stash if there are changes
      if (statusResult.has_changes) {
        console.log('[GitBranchSelector] Stashing local changes...');
        const stashResult = await invoke<{ success: boolean }>('run_shell_command', {
          command: 'git',
          args: ['stash', 'push', '-m', 'Auto-stash before branch switch'],
          cwd: workspacePath
        });
        if (stashResult.success) {
          stashed = true;
          console.log('[GitBranchSelector] Changes stashed');
        }
      }
      
      // Checkout branch
      await invoke('git_checkout_branch', {
        cwd: workspacePath,
        branch
      });
      
      // Pop stash if we stashed
      if (stashed) {
        console.log('[GitBranchSelector] Popping stash...');
        await invoke('run_shell_command', {
          command: 'git',
          args: ['stash', 'pop'],
          cwd: workspacePath
        });
      }
      
      await loadBranches();
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to checkout branch:', err);
      setCheckoutError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    setIsLoading(true);
    setCheckoutError(null);
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
      setCheckoutError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (loadError) {
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
        <div className="px-2 py-1.5 border-b border-app-border/40 mb-1 flex items-center justify-between">
          <span className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">Select Branch</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              loadBranches(true) // true = fetch from remote first
            }}
            disabled={isLoading}
            className="text-[10px] text-app-accent hover:text-app-accent-hover disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        
        {/* Checkout Error */}
        {checkoutError && (
          <div className="px-2 py-1.5 mb-2 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-[10px] text-red-400 font-geist truncate" title={checkoutError}>
              ⚠ {checkoutError.length > 50 ? checkoutError.substring(0, 50) + '...' : checkoutError}
            </p>
          </div>
        )}
        
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
          
          {/* Local branches - only show if not exists in remote */}
          {(() => {
            // Get all remote branch names (without prefix)
            const remoteBranchNames = new Set(
              branchInfo?.remote?.map(r => r.replace(/^[^/]+\//, '')) || []
            )
            // Filter local branches that don't exist in remote
            const uniqueLocalBranches = branchInfo?.local?.filter(
              b => !remoteBranchNames.has(b)
            ) || []
            
            return uniqueLocalBranches.length > 0 ? (
              <>
                <div className="px-2 py-1 text-[10px] text-neutral-500 uppercase tracking-wider mt-1">
                  Local
                </div>
                {uniqueLocalBranches.map((branch) => (
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
            ) : null
          })()}
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
