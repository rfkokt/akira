import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Loader2, RefreshCw } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Task } from '@/types'

interface GitBranchInfo {
  current: string
  local: string[]
  remote: string[]
}

interface BranchSelectionDialogProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (taskId: string, branchName: string) => void
  workspacePath: string
}

/**
 * Dialog shown when a task transitions to "in-progress" status.
 * - If the task already has a task_branch stored, it calls pi_checkout_task_branch (re-entering in-progress).
 * - Otherwise, it shows a dropdown of local branches for the user to select a base branch,
 *   then calls pi_create_task_branch to create and checkout the new task branch.
 */
export function BranchSelectionDialog({
  task,
  isOpen,
  onClose,
  onConfirm,
  workspacePath,
}: BranchSelectionDialogProps) {
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBranches = useCallback(async () => {
    if (!workspacePath) return
    setIsFetching(true)
    setError(null)
    try {
      const info = await invoke<GitBranchInfo>('git_get_branches', {
        cwd: workspacePath,
      })
      // Combine local branches, prioritize main/master/development at top
      const allBranches = [...info.local].sort((a, b) => {
        const priority = ['main', 'master', 'development', 'develop']
        const aIdx = priority.indexOf(a)
        const bIdx = priority.indexOf(b)
        if (aIdx !== -1 && bIdx === -1) return -1
        if (aIdx === -1 && bIdx !== -1) return 1
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
        return a.localeCompare(b)
      })
      setBranches(allBranches)

      // Default selection: current branch or first priority branch
      if (allBranches.length > 0) {
        const defaultBranch =
          allBranches.find((b) => b === 'main') ||
          allBranches.find((b) => b === 'master') ||
          allBranches.find((b) => b === 'development') ||
          allBranches[0]
        setSelectedBranch(defaultBranch)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsFetching(false)
    }
  }, [workspacePath])

  useEffect(() => {
    if (isOpen && task) {
      fetchBranches()
    }
  }, [isOpen, task, fetchBranches])

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setIsLoading(false)
      setBranches([])
      setSelectedBranch('')
    }
  }, [isOpen])

  const handleConfirm = async () => {
    if (!task || !selectedBranch) return
    setIsLoading(true)
    setError(null)

    try {
      // Create the task branch from the selected base branch
      const branchName = await invoke<string>('pi_create_task_branch', {
        taskId: task.id,
        baseBranch: selectedBranch,
        taskTitle: task.title,
        cwd: workspacePath,
      })
      onConfirm(task.id, branchName)
    } catch (err) {
      setError(String(err))
      setIsLoading(false)
    }
  }

  if (!task) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-app-accent" />
            Select Base Branch
          </DialogTitle>
          <DialogDescription>
            Choose the branch to create a task branch from for "{task.title}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isFetching ? (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-app-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading branches...
            </div>
          ) : branches.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-app-text-muted">
                  Base Branch
                </label>
                <button
                  onClick={() => fetchBranches()}
                  disabled={isFetching}
                  className="text-xs text-app-accent hover:text-app-accent-hover flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              <Select value={selectedBranch} onValueChange={(val) => setSelectedBranch(val ?? '')}>
                <SelectTrigger className="w-full bg-app-sidebar border-app-border focus:ring-1 focus:ring-app-accent">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent className="bg-app-panel border-app-border max-h-60">
                  {branches.map((branch) => (
                    <SelectItem
                      key={branch}
                      value={branch}
                      className="text-sm focus:bg-white/10 cursor-pointer"
                    >
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-app-text-muted text-center py-4">
              No branches found. Make sure this is a git repository.
            </p>
          )}

          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !selectedBranch || branches.length === 0}
            className="bg-app-accent hover:bg-app-accent-hover"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Creating branch...
              </>
            ) : (
              <>
                <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                Create & Checkout
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
