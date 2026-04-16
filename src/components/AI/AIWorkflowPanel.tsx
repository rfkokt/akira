import { useState, useMemo } from 'react';
import { Bot, Play, CheckCircle, GitBranch, MessageSquare, FileDiff, X } from 'lucide-react';
import type { Task } from '@/types';
import { useEngineStore } from '@/store/engineStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getGitBranches, getLatestAlphaTag, mergeTaskToBranch } from '@/lib/git';
import { useAIChatStore } from '@/store/aiChatStore';
import { dbService } from '@/lib/db';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { toast } from 'sonner';

interface AIWorkflowPanelProps {
  task: Task;
  onClose: () => void;
  onStartAI: () => void;
  onViewDiff: () => void;
  onOpenChat: () => void;
  onAIReview?: () => void;
  onComplete: () => void;
}

export function AIWorkflowPanel({ 
  task, 
  onClose, 
  onStartAI, 
  onViewDiff, 
  onOpenChat, 
  onAIReview,
  onComplete 
}: AIWorkflowPanelProps) {
  const { activeEngine } = useEngineStore();
  const taskStates = useAIChatStore((state) => state.taskStates);
  const [showGitFlow, setShowGitFlow] = useState(false);

  const getActionsByStatus = () => {
    const taskState = taskStates[task.id];
    const hasBranch = task.merge_source_branch || taskState?.prBranch || task.pr_branch;
    
    switch (task.status) {
      case 'todo':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-app-bg rounded-lg border border-app-border">
              <Bot className="w-8 h-8 text-app-accent" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Start AI Workflow</h4>
                <p className="text-xs text-neutral-500">
                  AI will analyze and implement this task
                </p>
              </div>
              <Button
                onClick={onStartAI}
                disabled={!activeEngine}
                className="bg-app-accent hover:bg-app-accent-hover"
              >
                <Play className="w-4 h-4" />
                Start
              </Button>
            </div>
            {!activeEngine && (
              <p className="text-xs text-yellow-500 text-center">
                Please select an AI engine first
              </p>
            )}
          </div>
        );

      case 'in-progress':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-app-bg rounded-lg border border-app-border">
              <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">AI Working...</h4>
                <p className="text-xs text-neutral-500">
                  AI is implementing changes
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenChat}
            >
              <MessageSquare className="w-4 h-4" />
              Open Chat
            </Button>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-app-bg rounded-lg border border-app-border">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Ready for Review</h4>
                <p className="text-xs text-neutral-500">
                  AI has completed the task
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Button
                variant="outline"
                onClick={onViewDiff}
              >
                <FileDiff className="w-4 h-4 mr-2" />
                View Diff
              </Button>
              <Button
                variant="outline"
                onClick={onOpenChat}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full mb-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 border-purple-500/30"
              onClick={onAIReview}
            >
              <Bot className="w-4 h-4 mr-2" />
              AI Auto-Review
            </Button>

            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => setShowGitFlow(true)}
            >
              <GitBranch className="w-4 h-4" />
              Complete & Push
            </Button>
          </div>
        );

case 'done':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-app-bg rounded-lg border border-app-border">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Task Completed</h4>
                <p className="text-xs text-neutral-500">
                  {task.is_merged 
                    ? `Merged: ${task.merge_source_branch || 'branch'} → ${task.merged_to_branch || 'target'}`
                    : (hasBranch ? 'Ready to merge' : 'Task finished successfully')}
                </p>
              </div>
            </div>

            {hasBranch && !task.is_merged && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={onViewDiff}
                  >
                    <FileDiff className="w-4 h-4" />
                    View Diff
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onOpenChat}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Chat
                  </Button>
                </div>

                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => setShowGitFlow(true)}
                >
                  <GitBranch className="w-4 h-4" />
                  Merge From {task.merge_source_branch || task.pr_branch}
                </Button>
              </>
            )}

            {task.is_merged && task.merged_to_branch && (
              <>
                <div className="text-xs text-neutral-400 p-2 bg-[#1a1a1a] rounded">
                  Current branch: <span className="text-app-accent font-mono">{task.merged_to_branch}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={onViewDiff}
                  >
                    <FileDiff className="w-4 h-4" />
                    View Diff
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onOpenChat}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Chat
                  </Button>
                </div>

                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => setShowGitFlow(true)}
                >
                  <GitBranch className="w-4 h-4" />
                  Merge {task.merged_to_branch} → Target
                </Button>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-app-panel rounded-lg border border-app-border shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
          <h3 className="text-sm font-semibold text-white">
            AI Workflow: {task.title}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4">
          {getActionsByStatus()}
        </div>
      </div>

      {/* Git Push Flow Modal */}
      {showGitFlow && (
        <GitPushFlow 
          task={task}
          onClose={() => setShowGitFlow(false)}
          onComplete={() => {
            setShowGitFlow(false);
            onComplete();
          }}
        />
      )}
    </div>
  );
}

// Git Push Flow Component
// Git Merge & Push Flow Component
export interface GitPushFlowProps {
  task: Task;
  onClose: () => void;
  onComplete: (taskId?: string) => void;
  workspacePath?: string;
}

export function GitPushFlow({ task, onClose, onComplete, workspacePath }: GitPushFlowProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [targetBranch, setTargetBranch] = useState('main');
  const [createTag, setCreateTag] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [runBuildTest, setRunBuildTest] = useState(true);
  const [latestTag, setLatestTag] = useState<string | null>(null);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [calcNextTag, setCalcNextTag] = useState('alpha.0.0.1');

  const [isExecuting, setIsExecuting] = useState(false);
  const [execLog, setExecLog] = useState('');
  const [isAIFixing, setIsAIFixing] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);

  const taskStates = useAIChatStore((state) => state.taskStates);
  const taskState = taskStates[task.id];
  const aiChatStore = useAIChatStore();

  // Compute source branch for merge
  const sourceBranch = useMemo(() => {
    if (task.is_merged && task.merged_to_branch) {
      return task.merged_to_branch;
    }
    return task.merge_source_branch || taskState?.prBranch || task.pr_branch || null;
  }, [task.is_merged, task.merged_to_branch, task.merge_source_branch, task.pr_branch, taskState?.prBranch]);

  useEffect(() => {
    if (!workspacePath) return;

    // Load available branches
    getGitBranches(workspacePath).then(res => {
      // Filter out task branches (PR branches) to keep only main branches
      const filteredBranches = res.filter(branch => !branch.startsWith('task/'));
      setBranches(filteredBranches);
      
      // Determine default target branch
      let defaultTarget = 'main';
      if (filteredBranches.includes('main')) {
        defaultTarget = 'main';
      } else if (filteredBranches.includes('master')) {
        defaultTarget = 'master';
      } else if (filteredBranches.length > 0) {
        defaultTarget = filteredBranches[0];
      }
      
      // If task has been merged before, suggest next logical target
      // e.g., if merged to development, next target should be main/master
      if (task.is_merged && task.merged_to_branch) {
        const mergedTo = task.merged_to_branch;
        if (mergedTo === 'development' && filteredBranches.includes('main')) {
          defaultTarget = 'main';
        } else if (mergedTo === 'development' && filteredBranches.includes('master')) {
          defaultTarget = 'master';
        } else if (mergedTo !== defaultTarget && filteredBranches.includes(defaultTarget)) {
          // If already merged to something other than default, stay with default
          defaultTarget = defaultTarget;
        }
      }
      
      setTargetBranch(defaultTarget);
    });
  }, [workspacePath, task.id, task.is_merged, task.merged_to_branch]);

  const [isLoadingTags, setIsLoadingTags] = useState(false);

  useEffect(() => {
    if (!workspacePath || !targetBranch) return;

    // Load tags dengan loading state
    setIsLoadingTags(true);
    getLatestAlphaTag(workspacePath, targetBranch).then(tag => {
      setLatestTag(tag);
      if (!tag) {
        setCalcNextTag('alpha.0.0.1');
      }
      setIsLoadingTags(false);
    }).catch(() => {
      // Fallback ke local tags kalau fetch gagal
      setIsLoadingTags(false);
    });
  }, [workspacePath, targetBranch]);

  useEffect(() => {
    let major = 0, minor = 0, patch = 0;
    
    if (latestTag) {
      const parts = latestTag.replace('alpha.', '').split('.').map(Number);
      if (parts.length === 3 && parts.every(n => !isNaN(n))) {
        [major, minor, patch] = parts;
      }
    }
    
    if (bumpType === 'patch') patch += 1;
    else if (bumpType === 'minor') { minor += 1; patch = 0; }
    else if (bumpType === 'major') { major += 1; minor = 0; patch = 0; }
    
    setCalcNextTag(`alpha.${major}.${minor}.${patch}`);
  }, [latestTag, bumpType]);

  const handleMerge = async () => {
    if (!workspacePath) {
      toast.error("Workspace path is missing");
      return;
    }
    
    if (!sourceBranch) {
      toast.error("Branch information not found for this task. The task may not have been run by AI, or the branch info was not saved.");
      return;
    }
    
    const featureBranch = sourceBranch;

    setIsExecuting(true);
    setBuildFailed(false);
    setExecLog('Starting Git Merge Workflow...\n');

    const result = await mergeTaskToBranch(workspacePath, featureBranch, targetBranch, { 
      createTag, 
      tagName: calcNextTag,
      deleteBranch,
      runBuildTest
    });

    if (result.success) {
      setExecLog(prev => prev + '\n' + result.log + '\n\n✅ Merge and Push completed successfully!');
      toast.success(`Successfully merged ${featureBranch} → ${result.mergedToBranch || targetBranch}`);
      
      // Save merge info to database
      try {
        await dbService.updateTaskMergeInfo(task.id, true, featureBranch, result.mergedToBranch || targetBranch);
        console.log('[GitPushFlow] Saved merge info:', { featureBranch, targetBranch: result.mergedToBranch || targetBranch });
      } catch (err) {
        console.error('[GitPushFlow] Failed to save merge info:', err);
      }
      
      // Notify GitBranchSelector to refresh — branch is now targetBranch
      try {
        await emit('git-branch-changed', { branch: targetBranch, cwd: workspacePath });
      } catch (e) {
        console.warn('[GitPushFlow] Failed to emit branch-changed event:', e);
      }
      setTimeout(() => {
        onComplete(task.id);
      }, 1500);
    } else {
      setExecLog(prev => prev + '\n❌ ERROR: ' + result.log);
      
      // Check if this is a build failure - trigger AI auto-fix
      if (result.log.includes('Build failed') || result.log.includes('❌ Build')) {
        setBuildFailed(true);
        setIsExecuting(false);
        
        toast.error(
          <div className="space-y-2">
            <div className="font-semibold">Merge Aborted: Build Failed</div>
            <div className="text-sm text-neutral-300">
              Build check failed. Click "Let AI Fix" to automatically fix build errors.
            </div>
          </div>,
          { duration: 10000 }
        );
      } else {
        toast.error(`Merge failed: ${result.log}`);
        setIsExecuting(false); // allow them to cancel or copy log
      }
    }
  };

  const handleAIFixBuildErrors = async () => {
    if (!workspacePath || !sourceBranch) return;
    
    setIsAIFixing(true);
    setExecLog(prev => prev + '\n\n[🤖 AI is analyzing build errors...]\n');
    
    try {
      // Trigger AI to analyze and fix build errors
      await aiChatStore.enqueueTask(task.id, `Fix build errors for merge to ${targetBranch}`, 
        `The build failed when trying to merge branch to ${targetBranch}. 

Please:
1. Run the build command and analyze the errors
2. Fix all build errors in the code
3. Ensure the build passes before completing

Build errors from previous attempt:
${execLog}

Focus on fixing TypeScript errors, import issues, missing dependencies, or syntax errors that prevent the build from succeeding.`);
      
      // Move task back to in-progress so AI can work on it
      await dbService.updateTaskStatus(task.id, 'in-progress');
      
      toast.success('AI is now fixing build errors. Task moved to In Progress.');
      
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error('[GitPushFlow] AI fix failed:', error);
      toast.error('Failed to trigger AI fix. Please fix manually.');
      setIsAIFixing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-app-bg rounded-lg border border-app-border shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-app-border flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-app-accent" />
            Merge Task: {task.title}
          </h3>
          {!isExecuting && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="p-4 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Target Branch Dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-300">Target Branch (Merge Into)</label>
            <div className="flex bg-app-sidebar border border-app-border rounded-md">
              <Select value={targetBranch} onValueChange={(val) => val && setTargetBranch(val)} disabled={isExecuting}>
                <SelectTrigger className="w-full border-none h-9 bg-transparent focus:ring-0">
                  <SelectValue placeholder="Select target branch" />
                </SelectTrigger>
                <SelectContent className="bg-app-sidebar border-app-border text-white">
                  {branches.map(b => (
                    <SelectItem key={b} value={b} className="hover:bg-white/5">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-neutral-500">
              Source: <span className="text-app-accent font-mono">{sourceBranch || 'Unknown'}</span> → Target: <span className="text-app-accent font-mono">{targetBranch}</span>
            </p>
          </div>

          {/* Version Tagging Toggle */}
          <div className="p-3 bg-app-panel border border-app-border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-white">Create Version Tag</h4>
                <p className="text-[11px] text-neutral-500 mt-0.5">Generate a new alpha tag natively</p>
              </div>
              <Switch checked={createTag} onCheckedChange={setCreateTag} disabled={isExecuting} />
            </div>

            {createTag && (
              <div className="pt-3 border-t border-app-border space-y-3 animate-in fade-in slide-in-from-top-1">
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={`text-xs ${bumpType === 'patch' ? 'bg-app-accent/20 border-app-accent text-app-accent' : 'bg-transparent text-neutral-400 border-app-border'}`}
                    onClick={() => setBumpType('patch')}
                    disabled={isExecuting}
                  >
                    Patch (.X)
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={`text-xs ${bumpType === 'minor' ? 'bg-app-accent/20 border-app-accent text-app-accent' : 'bg-transparent text-neutral-400 border-app-border'}`}
                    onClick={() => setBumpType('minor')}
                    disabled={isExecuting}
                  >
                    Minor (.X.0)
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={`text-xs ${bumpType === 'major' ? 'bg-app-accent/20 border-app-accent text-app-accent' : 'bg-transparent text-neutral-400 border-app-border'}`}
                    onClick={() => setBumpType('major')}
                    disabled={isExecuting}
                  >
                    Major (X.0.0)
                  </Button>
                </div>
                <div className="bg-black/30 rounded p-2 text-xs font-mono text-center flex items-center justify-center gap-2">
                  {isLoadingTags ? (
                    <span className="text-neutral-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading tags...
                    </span>
                  ) : (
                    <>
                      <span className="text-neutral-500">{latestTag || 'None'}</span>
                      <span className="text-neutral-600">→</span>
                      <span className="text-green-400 font-semibold">{calcNextTag}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-app-panel border border-app-border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-white">Run Build & Test</h4>
                <p className="text-[11px] text-neutral-500 mt-0.5">Verify build passes before merging (prevents broken deployments)</p>
              </div>
              <Switch checked={runBuildTest} onCheckedChange={setRunBuildTest} disabled={isExecuting} />
            </div>
            {runBuildTest && (
              <div className="pt-2 border-t border-app-border/50">
                <p className="text-[10px] text-neutral-400 leading-relaxed">
                  <span className="text-yellow-500">⚠️</span> If build fails, merge will be automatically aborted and reverted. No changes will be pushed to remote.
                </p>
              </div>
            )}
          </div>

          <div className="p-3 bg-app-panel border border-app-border rounded-lg flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-white">Delete Feature Branch</h4>
              <p className="text-[11px] text-neutral-500 mt-0.5">Automatically clean up local & remote branch</p>
            </div>
            <Switch checked={deleteBranch} onCheckedChange={setDeleteBranch} disabled={isExecuting} />
          </div>

          {/* Terminal Logs (If executing or failed) */}
          {(isExecuting || execLog) && (
            <div className="space-y-1.5 animate-in fade-in">
              <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Git Output</label>
              <div className="bg-black rounded-md p-2.5 h-32 overflow-y-auto font-mono text-[11px] text-neutral-300 leading-relaxed border border-app-border whitespace-pre">
                {execLog}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-app-border flex gap-2 justify-end shrink-0 bg-app-bg">
          {buildFailed ? (
            <>
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isAIFixing}
                className="text-xs"
              >
                Close
              </Button>
              <Button
                onClick={handleAIFixBuildErrors}
                disabled={isAIFixing}
                className="bg-purple-600 hover:bg-purple-700 text-xs font-medium min-w-[140px]"
              >
                {isAIFixing ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> AI Fixing...</>
                ) : (
                  <><Bot className="w-3.5 h-3.5 mr-2" /> Let AI Fix</>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isExecuting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleMerge}
                disabled={isExecuting || !sourceBranch}
                className="bg-app-accent hover:bg-app-accent-hover text-xs font-medium min-w-[120px]"
              >
                {isExecuting ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Working...</>
                ) : (
                  'Complete Merge'
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
