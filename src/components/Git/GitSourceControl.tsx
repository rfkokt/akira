import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Minus, ChevronDown, ChevronRight, RefreshCw, RotateCcw, GitBranch, Merge, X, Loader2, AlertCircle, Archive, Inbox, Trash2, Sparkles, GitCommit, Rocket, Pencil } from 'lucide-react';
import { useWorkspaceStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getGitBranches, getLatestAlphaTag, mergeTaskToBranch, getDefaultRemote } from '@/lib/git';
import { generateCommitMessage, generateCommitMessageFromFiles } from '@/lib/commitMessage';
import { GitGraph } from './GitGraph';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface GitFileStatus {
  path: string;
  status: string;
  is_staged: boolean;
}

interface GitStatusResult {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
}

interface StashEntry {
  id: string;
  message: string;
  branch: string;
}

interface GitSourceControlProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  onShowDiff?: (commitHash: string, filePath: string) => void;
}

export function GitSourceControl({ onFileSelect, selectedFile, onShowDiff }: GitSourceControlProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const [status, setStatus] = useState<GitStatusResult>({ staged: [], unstaged: [] });
  const [loading, setLoading] = useState(false);

  const [expandedStaged, setExpandedStaged] = useState(true);
  const [expandedChanges, setExpandedChanges] = useState(true);

  // Git merge state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [branches, setBranches] = useState<string[]>([]);
  const [targetBranch, setTargetBranch] = useState<string>('');
  const [createTag, setCreateTag] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [latestTag, setLatestTag] = useState<string | null>(null);
  const [calcNextTag, setCalcNextTag] = useState<string>('');
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [mergeStep, setMergeStep] = useState<'check' | 'commit' | 'merge'>('check');

  // Git stash state
  const [showStashModal, setShowStashModal] = useState(false);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [stashMessage, setStashMessage] = useState('');
  const [isStashing, setIsStashing] = useState(false);

// Commit message state
  const [commitInputMessage, setCommitInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Calculate next tag when createTag or bumpType changes
  useEffect(() => {
    if (!createTag || !latestTag) {
      setCalcNextTag('');
      return;
    }
    
    const match = latestTag.match(/alpha\.(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      setCalcNextTag(`alpha.0.0.1`);
      return;
    }
    
    let [, major, minor, patch] = match;
    let m = parseInt(major), n = parseInt(minor), p = parseInt(patch);
    
    if (bumpType === 'patch') { p += 1; }
    else if (bumpType === 'minor') { n += 1; p = 0; }
    else if (bumpType === 'major') { m += 1; n = 0; p = 0; }
    
    setCalcNextTag(`alpha.${m}.${n}.${p}`);
  }, [createTag, bumpType, latestTag]);

  // Fetch latest tag when merge modal opens
  useEffect(() => {
    if (showMergeModal && activeWorkspace?.folder_path) {
      getLatestAlphaTag(activeWorkspace.folder_path, targetBranch).then(setLatestTag).catch(() => setLatestTag(null));
    }
  }, [showMergeModal, activeWorkspace?.folder_path, targetBranch]);

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

  const loadCurrentBranch = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    try {
      const result = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'git',
        args: ['branch', '--show-current'],
        cwd: activeWorkspace.folder_path
      });
      if (result.success) {
        setCurrentBranch(result.stdout.trim());
      }
    } catch (error) {
      console.error('Failed to load current branch:', error);
    }
  }, [activeWorkspace]);

  const loadBranches = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    try {
      const fetchedBranches = await getGitBranches(activeWorkspace.folder_path);
      setBranches(fetchedBranches);
      
      // Auto-select target branch: prefer main > master > first available
      if (fetchedBranches.includes('main')) {
        setTargetBranch(prev => prev || 'main');
      } else if (fetchedBranches.includes('master')) {
        setTargetBranch(prev => prev || 'master');
      } else if (fetchedBranches.length > 0) {
        setTargetBranch(prev => prev || fetchedBranches[0]);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, [activeWorkspace]);

  const handleMerge = useCallback(async () => {
    if (!activeWorkspace?.folder_path || !currentBranch || !targetBranch) return;
    
    // Check for uncommitted changes
    const hasStaged = status.staged.length > 0;
    const hasUnstaged = status.unstaged.length > 0;
    
    if (hasStaged || hasUnstaged) {
      setHasUncommittedChanges(true);
      setMergeStep('commit');
      const changedFiles = [...status.staged, ...status.unstaged].map(f => f.path);
      setCommitMessage(`Changes: ${changedFiles.slice(0, 3).join(', ')}${changedFiles.length > 3 ? '...' : ''}`);
      return;
    }
    
    setMergeStep('merge');
    await performMerge();
  }, [activeWorkspace, currentBranch, targetBranch, status]);
  
  const handleCommitAndMerge = useCallback(async () => {
    if (!activeWorkspace?.folder_path || !commitMessage.trim()) return;
    
    setIsMerging(true);
    try {
      // Stage all changes
      const allFiles = [...status.staged, ...status.unstaged].map(f => f.path);
      await invoke('git_stage', { cwd: activeWorkspace.folder_path, paths: allFiles });
      
      // Commit
      await invoke('git_commit', { cwd: activeWorkspace.folder_path, message: commitMessage });
      
      // Push current branch
      const remote = await getDefaultRemote(activeWorkspace.folder_path);
      await invoke('git_push', { cwd: activeWorkspace.folder_path, remote, branch: currentBranch });
      
      toast.success(`Committed and pushed ${allFiles.length} file(s)`);
      
      // Now proceed with merge
      setMergeStep('merge');
      await performMerge();
    } catch (error) {
      console.error('Commit failed:', error);
      toast.error(`Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMerging(false);
    }
  }, [activeWorkspace, commitMessage, status, currentBranch]);
  
  const performMerge = useCallback(async () => {
    if (!activeWorkspace?.folder_path || !currentBranch || !targetBranch) return;
    
    setIsMerging(true);
    try {
      const result = await mergeTaskToBranch(
        activeWorkspace.folder_path,
        currentBranch,
        targetBranch,
        { createTag, tagName: createTag ? calcNextTag : '', deleteBranch }
      );
      
      if (result.success) {
        toast.success(`Merged ${currentBranch} into ${targetBranch}`);
        setShowMergeModal(false);
        setMergeStep('check');
        setHasUncommittedChanges(false);
        setCommitMessage('');
        loadCurrentBranch();
        fetchStatus();
      } else {
        toast.error(result.log || 'Merge failed');
      }
    } catch (error) {
      console.error('Merge failed:', error);
      toast.error(`Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMerging(false);
    }
  }, [activeWorkspace, currentBranch, targetBranch, createTag, calcNextTag, deleteBranch, loadCurrentBranch, fetchStatus]);
  
  // Reset merge step when modal closes
  useEffect(() => {
    if (!showMergeModal) {
      setMergeStep('check');
      setHasUncommittedChanges(false);
      setCommitMessage('');
    }
  }, [showMergeModal]);

  useEffect(() => {
    fetchStatus();
    loadCurrentBranch();
    loadBranches();
    const intv = setInterval(fetchStatus, 5000);
    return () => clearInterval(intv);
  }, [fetchStatus, loadCurrentBranch, loadBranches]);

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

  // Stash operations
  const loadStashes = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    try {
      const result = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'git',
        args: ['stash', 'list'],
        cwd: activeWorkspace.folder_path
      });
      if (result.success && result.stdout.trim()) {
        const lines = result.stdout.trim().split('\n');
        const parsed = lines.map(line => {
          const match = line.match(/^stash@\{(\d+)\}:\s*(?:WIP on\s+)?(?:\S+\s+)?(?:\(.*?\)\s*)?(.*)$/);
          if (match) {
            return {
              id: `stash@{${match[1]}}`,
              message: match[2] || 'WIP',
              branch: line.includes('on') ? line.split('on')[1]?.split(':')[0]?.trim() : ''
            };
          }
          return { id: line.split(':')[0], message: line, branch: '' };
        });
        setStashes(parsed);
      } else {
        setStashes([]);
      }
    } catch (error) {
      console.error('Failed to load stashes:', error);
      setStashes([]);
    }
  }, [activeWorkspace]);

  const handleStash = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    if (status.staged.length === 0 && status.unstaged.length === 0) {
      toast.error('No changes to stash');
      return;
    }
    
    setIsStashing(true);
    try {
      const args = ['stash', 'push'];
      if (stashMessage.trim()) {
        args.push('-m', stashMessage.trim());
      }
      
      const result = await invoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
        command: 'git',
        args,
        cwd: activeWorkspace.folder_path
      });
      
      if (result.success) {
        toast.success('Changes stashed');
        setStashMessage('');
        setShowStashModal(false);
        fetchStatus();
        loadStashes();
        loadCurrentBranch();
      } else {
        toast.error(result.stderr || 'Failed to stash');
      }
    } catch (error) {
      console.error('Stash failed:', error);
      toast.error(`Stash failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsStashing(false);
    }
  }, [activeWorkspace, stashMessage, status, fetchStatus, loadStashes, loadCurrentBranch]);

  const handleStashApply = useCallback(async (stashId: string) => {
    if (!activeWorkspace?.folder_path) return;
    try {
      const result = await invoke<{ success: boolean; stderr: string }>('run_shell_command', {
        command: 'git',
        args: ['stash', 'apply', stashId],
        cwd: activeWorkspace.folder_path
      });
      
      if (result.success) {
        toast.success(`Applied ${stashId}`);
        fetchStatus();
      } else {
        toast.error(result.stderr || 'Failed to apply stash');
      }
    } catch (error) {
      console.error('Apply stash failed:', error);
      toast.error(`Apply failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [activeWorkspace, fetchStatus]);

  const handleStashPop = useCallback(async (stashId: string) => {
    if (!activeWorkspace?.folder_path) return;
    try {
      const result = await invoke<{ success: boolean; stderr: string }>('run_shell_command', {
        command: 'git',
        args: ['stash', 'pop', stashId],
        cwd: activeWorkspace.folder_path
      });
      
      if (result.success) {
        toast.success(`Applied and removed ${stashId}`);
        fetchStatus();
        loadStashes();
      } else {
        toast.error(result.stderr || 'Failed to pop stash');
      }
    } catch (error) {
      console.error('Pop stash failed:', error);
      toast.error(`Pop failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [activeWorkspace, fetchStatus, loadStashes]);

const handleStashDrop = useCallback(async (stashId: string) => {
    if (!activeWorkspace?.folder_path) return;
    if (!confirm(`Delete ${stashId}? This cannot be undone.`)) return;
    
    try {
      const result = await invoke<{ success: boolean; stderr: string }>('run_shell_command', {
        command: 'git',
        args: ['stash', 'drop', stashId],
        cwd: activeWorkspace.folder_path
      });
      
      if (result.success) {
        toast.success(`Removed ${stashId}`);
        loadStashes();
      } else {
        toast.error(result.stderr || 'Failed to drop stash');
      }
    } catch (error) {
      console.error('Drop stash failed:', error);
      toast.error(`Drop failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [activeWorkspace, loadStashes]);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    if (status.staged.length === 0) {
      toast.error('No staged changes to generate message for');
      return;
    }
    
    setIsGenerating(true);
    try {
      const result = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'git',
        args: ['diff', '--cached', '--stat'],
        cwd: activeWorkspace.folder_path
      });
      
      if (result.success) {
        const message = await generateCommitMessage({ diff: result.stdout });
        setCommitInputMessage(message);
      } else {
        const fallbackMessage = generateCommitMessageFromFiles(status.staged);
        setCommitInputMessage(fallbackMessage);
      }
    } catch (error) {
      console.error('Failed to generate commit message:', error);
      const fallbackMessage = generateCommitMessageFromFiles(status.staged);
      setCommitInputMessage(fallbackMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [activeWorkspace, status.staged]);

  const handleCommit = useCallback(async (message: string, push: boolean = false, amend: boolean = false) => {
    if (!activeWorkspace?.folder_path) return;
    if (!message.trim()) {
      toast.error('Please enter a commit message');
      return;
    }
    
    if (status.staged.length === 0 && !amend) {
      toast.error('No staged changes to commit');
      return;
    }
    
    setIsCommitting(true);
    try {
      if (amend) {
        await invoke('git_commit_amend', { cwd: activeWorkspace.folder_path, message: message.trim() });
        toast.success('Commit amended');
      } else {
        await invoke('git_commit', { cwd: activeWorkspace.folder_path, message: message.trim() });
        
        if (push) {
          const remote = await getDefaultRemote(activeWorkspace.folder_path);
          const branchResult = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
            command: 'git',
            args: ['branch', '--show-current'],
            cwd: activeWorkspace.folder_path
          });
          const branch = branchResult.success ? branchResult.stdout.trim() : 'main';
          await invoke('git_push', { cwd: activeWorkspace.folder_path, remote, branch });
          toast.success('Committed and pushed');
        } else {
          toast.success('Committed successfully');
        }
      }
      
      setCommitInputMessage('');
      fetchStatus();
      loadCurrentBranch();
    } catch (error) {
      console.error('Commit failed:', error);
      toast.error(`Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCommitting(false);
    }
  }, [activeWorkspace, status.staged, fetchStatus, loadCurrentBranch]);

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
        <div className="flex items-center gap-1">
          <button 
            onClick={() => { loadStashes(); setShowStashModal(true); }} 
            className="text-neutral-500 hover:text-white transition-colors relative"
            title="Stashes"
          >
            <Inbox className="w-3.5 h-3.5" />
            {stashes.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-app-accent rounded-full text-[8px] flex items-center justify-center">
                {stashes.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setShowMergeModal(true)} 
            className="text-neutral-500 hover:text-white transition-colors"
            disabled={!currentBranch}
            title="Merge to branch"
          >
            <Merge className="w-3.5 h-3.5" />
          </button>
          <button onClick={fetchStatus} className="text-neutral-500 hover:text-white transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      {/* Commit Message Input */}
      <div className="px-3 py-2 border-b border-app-border shrink-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <textarea
            value={commitInputMessage}
            onChange={(e) => setCommitInputMessage(e.target.value)}
            placeholder="Message (press Ctrl+Enter to commit)"
            className="flex-1 px-2 py-1.5 bg-app-bg border border-app-border rounded text-xs text-white font-mono resize-none focus:outline-none focus:border-app-accent min-h-[60px]"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleCommit(commitInputMessage, false, false);
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleGenerateCommitMessage}
            disabled={isGenerating || status.staged.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-400 hover:text-app-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            Generate
          </button>
          
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                disabled={isCommitting || (status.staged.length === 0 && !commitInputMessage.trim())}
                className="flex items-center gap-1 px-3 py-1 bg-app-accent/20 hover:bg-app-accent/30 text-app-accent text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Committing...</span>
                  </>
                ) : (
                  <>
                    <GitCommit className="w-3 h-3" />
                    <span>Commit</span>
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleCommit(commitInputMessage, false, false)}>
                <GitCommit className="w-3.5 h-3.5 mr-2" />
                Commit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCommit(commitInputMessage, true, false)}>
                <Rocket className="w-3.5 h-3.5 mr-2" />
                Commit & Push
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleCommit(commitInputMessage, false, true)}>
                <Pencil className="w-3.5 h-3.5 mr-2" />
                Amend Last Commit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
                onClick={(e) => { e.stopPropagation(); setStashMessage(''); setShowStashModal(true); }} 
                className="text-neutral-500 hover:text-app-accent transition-colors" title="Stash Changes"
                disabled={status.unstaged.length === 0}
              >
                <Archive className="w-3.5 h-3.5" />
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

      {/* Merge Modal */}
      {showMergeModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowMergeModal(false)}
        >
          <div 
            className="bg-app-panel rounded-lg border border-app-border w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-app-accent" />
                <h3 className="text-sm font-medium text-white font-geist">Merge Branch</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowMergeModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Uncommitted Changes Warning */}
              {mergeStep === 'commit' && hasUncommittedChanges && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-yellow-200 font-medium font-geist">Uncommitted Changes Detected</p>
                      <p className="text-[10px] text-yellow-400/80 mt-1">
                        {status.staged.length} staged, {status.unstaged.length} unstaged files
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-neutral-400 font-geist">Commit Message</label>
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Enter commit message..."
                      className="w-full px-3 py-2 bg-app-bg border border-app-border rounded text-sm text-white font-mono focus:outline-none focus:border-app-accent"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCommitAndMerge}
                      disabled={!commitMessage.trim() || isMerging}
                      className="bg-yellow-600 hover:bg-yellow-700 flex-1"
                    >
                      {isMerging ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Committing...
                        </>
                      ) : (
                        'Commit & Merge'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMergeStep('merge');
                        setHasUncommittedChanges(false);
                      }}
                      disabled={isMerging}
                    >
                      Skip & Merge
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-400 font-geist">Current Branch (Source)</label>
                <div className="px-3 py-2 bg-app-bg rounded border border-app-border text-sm text-white font-mono">
                  {currentBranch || '...'}
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs text-neutral-400 font-geist">Target Branch</label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-app-bg border border-app-border rounded text-sm text-white font-mono focus:outline-none focus:border-app-accent"
                >
                  {branches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between p-3 bg-app-bg rounded border border-app-border">
                <div>
                  <p className="text-xs text-white font-medium font-geist">Create Version Tag</p>
                  <p className="text-[10px] text-neutral-500 font-geist">Auto-generate alpha tag</p>
                </div>
                <Switch checked={createTag} onCheckedChange={setCreateTag} disabled={isMerging} />
              </div>
              
              {createTag && (
                <div className="p-3 bg-app-bg rounded border border-app-border space-y-3 animate-in fade-in slide-in-from-top-1">
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={`text-xs ${bumpType === 'patch' ? 'bg-app-accent/20 border-app-accent text-app-accent' : 'bg-transparent text-neutral-400 border-app-border'}`}
                      onClick={() => setBumpType('patch')}
                      disabled={isMerging}
                    >
                      Patch (.X)
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={`text-xs ${bumpType === 'minor' ? 'bg-app-accent/20 border-app-accent text-app-accent' : 'bg-transparent text-neutral-400 border-app-border'}`}
                      onClick={() => setBumpType('minor')}
                      disabled={isMerging}
                    >
                      Minor (.X.0)
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={`text-xs ${bumpType === 'major' ? 'bg-app-accent/20 border-app-accent text-app-accent' : 'bg-transparent text-neutral-400 border-app-border'}`}
                      onClick={() => setBumpType('major')}
                      disabled={isMerging}
                    >
                      Major (X.0.0)
                    </Button>
                  </div>
                  {latestTag && calcNextTag && (
                    <div className="bg-black/30 rounded p-2 text-xs font-mono text-center flex items-center justify-center gap-2">
                      <span className="text-neutral-500">{latestTag}</span>
                      <span className="text-neutral-600">→</span>
                      <span className="text-green-400 font-semibold">{calcNextTag}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-app-bg rounded border border-app-border">
                <div>
                  <p className="text-xs text-white font-medium font-geist">Delete Feature Branch</p>
                  <p className="text-[10px] text-neutral-500 font-geist">Clean up after merge</p>
                </div>
                <Switch checked={deleteBranch} onCheckedChange={setDeleteBranch} disabled={isMerging} />
              </div>
            </div>
            
            <div className="px-4 py-3 border-t border-app-border flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMergeModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleMerge}
                disabled={isMerging}
                className="bg-green-600 hover:bg-green-700"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <Merge className="w-3.5 h-3.5 mr-2" />
                    Merge
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stash Modal */}
      {showStashModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowStashModal(false)}
        >
          <div 
            className="bg-app-panel rounded-lg border border-app-border w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-app-accent" />
                <h3 className="text-sm font-medium text-white font-geist">Stash</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowStashModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Stash Form */}
              {(status.staged.length > 0 || status.unstaged.length > 0) && (
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400 font-geist">Stash Message (optional)</label>
                  <input
                    type="text"
                    value={stashMessage}
                    onChange={(e) => setStashMessage(e.target.value)}
                    placeholder="Describe your changes..."
                    className="w-full px-3 py-2 bg-app-bg border border-app-border rounded text-sm text-white font-geist focus:outline-none focus:border-app-accent"
                  />
                  <Button
                    size="sm"
                    onClick={handleStash}
                    disabled={isStashing}
                    className="w-full bg-app-accent hover:bg-app-accent/80"
                  >
                    {isStashing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        Stashing...
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5 mr-2" />
                        Stash Changes ({status.staged.length + status.unstaged.length} files)
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Stash List */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 font-geist">Stashed Changes</label>
                {stashes.length === 0 ? (
                  <div className="text-xs text-neutral-500 text-center py-4 bg-app-bg rounded border border-app-border">
                    No stashed changes
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {stashes.map((stash) => (
                      <div 
                        key={stash.id}
                        className="flex items-center justify-between px-3 py-2 bg-app-bg rounded border border-app-border group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium truncate">{stash.message}</p>
                          <p className="text-[10px] text-neutral-500">{stash.id}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStashApply(stash.id)}
                            className="p-1 text-neutral-500 hover:text-app-accent transition-colors"
                            title="Apply (keep stash)"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleStashPop(stash.id)}
                            className="p-1 text-neutral-500 hover:text-green-400 transition-colors"
                            title="Pop (apply & remove)"
                          >
                            <Inbox className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleStashDrop(stash.id)}
                            className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Git Graph */}
      <GitGraph 
        onFileSelect={(commitHash, filePath) => {
          // Show diff in main content area
          if (onShowDiff) {
            onShowDiff(commitHash, filePath);
          }
        }}
      />
    </div>
  );
}
