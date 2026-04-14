import { useState } from 'react';
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
  const [latestTag, setLatestTag] = useState<string | null>(null);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [calcNextTag, setCalcNextTag] = useState('alpha.0.0.1');

  const [isExecuting, setIsExecuting] = useState(false);
  const [execLog, setExecLog] = useState('');

  const taskStates = useAIChatStore((state) => state.taskStates);
  const taskState = taskStates[task.id];

  useEffect(() => {
    if (!workspacePath) return;

    // Load available branches
    getGitBranches(workspacePath).then(res => {
      setBranches(res);
      // Try to determine default branch
      if (res.includes('main')) {
        setTargetBranch('main');
      } else if (res.includes('master')) {
        setTargetBranch('master');
      } else if (res.length > 0) {
        setTargetBranch(res[0]);
      }
    });
  }, [workspacePath, task.id]);

  useEffect(() => {
    if (!workspacePath || !targetBranch) return;
    
    // Load latest alpha tag explicitly belonging to the targetBranch
    getLatestAlphaTag(workspacePath, targetBranch).then(tag => {
      setLatestTag(tag);
      if (!tag) {
        setCalcNextTag('alpha.0.0.1');
      }
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
    
    // For tasks already merged once, use merged_to_branch as source (e.g., development)
    // Otherwise use pr_branch or merge_source_branch from first merge attempt
    const featureBranch = task.is_merged 
      ? (task.merged_to_branch || task.merge_source_branch || task.pr_branch)
      : (task.merge_source_branch || taskState?.prBranch || task.pr_branch);
    if (!featureBranch) {
      toast.error("AI feature branch PR could not be found for this task. The task may not have been run by AI, or the branch info was not saved.");
      return;
    }

    setIsExecuting(true);
    setExecLog('Starting Git Merge Workflow...\n');

    const result = await mergeTaskToBranch(workspacePath, featureBranch, targetBranch, { 
      createTag, 
      tagName: calcNextTag,
      deleteBranch 
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
      toast.error(`Merge failed: ${result.log}`);
      setIsExecuting(false); // allow them to cancel or copy log
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
              Source branch: <span className="text-app-accent">{task.is_merged ? (task.merged_to_branch || 'Unknown') : (taskState?.prBranch || task.pr_branch || task.merge_source_branch || 'Unknown')}</span>
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
                  <span className="text-neutral-500">{latestTag || 'None'}</span>
                  <span className="text-neutral-600">→</span>
                  <span className="text-green-400 font-semibold">{calcNextTag}</span>
                </div>
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
            disabled={isExecuting || (!taskState?.prBranch && !task.pr_branch)}
            className="bg-app-accent hover:bg-app-accent-hover text-xs font-medium min-w-[120px]"
          >
            {isExecuting ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Working...</>
            ) : (
              'Complete Merge'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
