import { useState, useEffect } from 'react'
import { GitMerge, Loader2, AlertTriangle } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Task } from '@/types'

interface MergePromptDialogProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onMergeComplete: (taskId: string) => void
  onSkip: (taskId: string) => void
  workspacePath: string
}

/**
 * Dialog shown when a task transitions to "done" status.
 * Offers the user the option to merge the task_branch back into the base_branch,
 * or skip the merge and just mark the task as done.
 */
export function MergePromptDialog({
  task,
  isOpen,
  onClose,
  onMergeComplete,
  onSkip,
  workspacePath,
}: MergePromptDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taskBranch, setTaskBranch] = useState<string | null>(null)
  const [baseBranch, setBaseBranch] = useState<string | null>(null)

  // Fetch branch info when dialog opens
  useEffect(() => {
    if (!isOpen || !task) return
    setError(null)
    setIsLoading(false)
    setTaskBranch(null)
    setBaseBranch(null)

    const fetchBranchInfo = async () => {
      try {
        const result = await invoke<{ base_branch: string; task_branch: string } | null>(
          'pi_get_task_branches',
          { taskId: task.id }
        )
        if (result) {
          setTaskBranch(result.task_branch)
          setBaseBranch(result.base_branch)
        }
      } catch (err) {
        console.warn('Could not fetch branch info:', err)
      }
    }

    fetchBranchInfo()
  }, [isOpen, task])

  const handleMerge = async () => {
    if (!task || !taskBranch || !baseBranch) return
    setIsLoading(true)
    setError(null)

    try {
      // Checkout base branch
      await invoke('run_shell_command', {
        command: 'git',
        args: ['checkout', baseBranch],
        cwd: workspacePath,
      })

      // Merge task branch into base branch
      const mergeResult = await invoke<{ success: boolean; stdout: string; stderr: string }>(
        'run_shell_command',
        {
          command: 'git',
          args: ['merge', taskBranch, '--no-ff', '-m', `Merge task branch '${taskBranch}' into ${baseBranch}`],
          cwd: workspacePath,
        }
      )

      if (!mergeResult.success) {
        setError(`Merge failed. You may need to resolve conflicts manually.\n${mergeResult.stderr || mergeResult.stdout}`)
        // Abort the merge to leave the tree clean
        await invoke('run_shell_command', {
          command: 'git',
          args: ['merge', '--abort'],
          cwd: workspacePath,
        }).catch(() => {})
        setIsLoading(false)
        return
      }

      onMergeComplete(task.id)
    } catch (err) {
      setError(String(err))
      setIsLoading(false)
    }
  }

  const handleSkip = () => {
    if (!task) return
    onSkip(task.id)
  }

  if (!task) return null

  const hasBranchInfo = taskBranch && baseBranch

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-green-400" />
            Merge Task Branch
          </DialogTitle>
          <DialogDescription>
            Task "{task.title}" is complete. Would you like to merge the task branch back into the base branch?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {hasBranchInfo ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-app-sidebar rounded-lg border border-app-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-app-text-muted">
                    <span>From:</span>
                    <code className="px-1.5 py-0.5 bg-app-bg rounded text-app-accent font-mono text-xs">
                      {taskBranch}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-app-text-muted">
                    <span>Into:</span>
                    <code className="px-1.5 py-0.5 bg-app-bg rounded text-green-400 font-mono text-xs">
                      {baseBranch}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>No branch information found for this task. The task may not have been started with branch tracking.</span>
            </div>
          )}

          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip} disabled={isLoading}>
            Skip Merge
          </Button>
          <Button
            onClick={handleMerge}
            disabled={isLoading || !hasBranchInfo}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="w-3.5 h-3.5 mr-1.5" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
