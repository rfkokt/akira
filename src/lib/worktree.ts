import { invoke } from '@tauri-apps/api/core'

export interface WorktreeInfo {
  path: string
  branch: string
  base_branch: string
}

/**
 * Get the default base branch (rdev, develop, dev, main, master)
 */
export async function getDefaultBaseBranch(repoPath: string): Promise<string> {
  return invoke('get_default_base_branch', { repoPath })
}

/**
 * Get available base branches from remote
 */
export async function getAvailableBaseBranches(repoPath: string): Promise<string[]> {
  return invoke('get_available_base_branches', { repoPath })
}

/**
 * Create a git worktree for a task
 */
export async function createTaskWorktree(
  repoPath: string,
  taskId: string,
  baseBranch: string,
  appDataDir: string
): Promise<WorktreeInfo> {
  return invoke('create_task_worktree', {
    repoPath,
    taskId,
    baseBranch,
    appDataDir,
  })
}

/**
 * Remove a git worktree for a task
 */
export async function removeTaskWorktree(
  repoPath: string,
  taskId: string,
  appDataDir: string
): Promise<void> {
  return invoke('remove_task_worktree', {
    repoPath,
    taskId,
    appDataDir,
  })
}

/**
 * Get diff between worktree and base branch
 */
export async function getWorktreeDiff(
  worktreePath: string,
  baseBranch: string
): Promise<string> {
  return invoke('get_worktree_diff', {
    worktreePath,
    baseBranch,
  })
}

/**
 * Check if worktree exists for a task
 */
export async function worktreeExists(
  taskId: string,
  appDataDir: string
): Promise<boolean> {
  return invoke('worktree_exists', {
    taskId,
    appDataDir,
  })
}

/**
 * Update task worktree info in database
 */
export async function updateTaskWorktree(
  taskId: string,
  worktreePath: string,
  taskBranch: string,
  baseBranch: string
): Promise<void> {
  return invoke('update_task_worktree', {
    id: taskId,
    worktreePath,
    taskBranch,
    baseBranch,
  })
}
