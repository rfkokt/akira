import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store'

interface GitDiffResult {
  diff: string
  has_changes: boolean
  changed_files: string[]
}

interface GitOperationResult {
  success: boolean
  output: string
  error?: string
}

export function useGitOperations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { activeWorkspace } = useWorkspaceStore()

  const getDiff = useCallback(async (): Promise<GitDiffResult | null> => {
    if (!activeWorkspace?.folder_path) {
      setError('No workspace selected')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result = await invoke<GitDiffResult>('git_get_diff', {
        cwd: activeWorkspace.folder_path,
      })
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      return null
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace])

  const getStagedDiff = useCallback(async (): Promise<GitDiffResult | null> => {
    if (!activeWorkspace?.folder_path) {
      setError('No workspace selected')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result = await invoke<GitDiffResult>('git_get_staged_diff', {
        cwd: activeWorkspace.folder_path,
      })
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      return null
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace])

  const runGitCommand = useCallback(async (
    command: string,
    args: string[]
  ): Promise<GitOperationResult> => {
    if (!activeWorkspace?.folder_path) {
      return { success: false, output: '', error: 'No workspace selected' }
    }

    setLoading(true)
    setError(null)

    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        command,
        args,
        cwd: activeWorkspace.folder_path,
      })
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      return { success: false, output: '', error: errorMsg }
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace])

  const getCurrentBranch = useCallback(async (): Promise<string | null> => {
    const result = await runGitCommand('branch', ['--show-current'])
    return result.success ? result.output.trim() : null
  }, [runGitCommand])

  const checkout = useCallback(async (branch: string): Promise<boolean> => {
    const result = await runGitCommand('checkout', [branch])
    return result.success
  }, [runGitCommand])

  const createBranch = useCallback(async (branchName: string): Promise<boolean> => {
    const result = await runGitCommand('checkout', ['-b', branchName])
    return result.success
  }, [runGitCommand])

  const addAll = useCallback(async (): Promise<boolean> => {
    const result = await runGitCommand('add', ['.'])
    return result.success
  }, [runGitCommand])

  const commit = useCallback(async (message: string): Promise<boolean> => {
    const result = await runGitCommand('commit', ['-m', message])
    return result.success
  }, [runGitCommand])

  const push = useCallback(async (branch: string, remote = 'origin'): Promise<boolean> => {
    const result = await runGitCommand('push', ['-u', remote, branch])
    return result.success
  }, [runGitCommand])

  return {
    loading,
    error,
    getDiff,
    getStagedDiff,
    runGitCommand,
    getCurrentBranch,
    checkout,
    createBranch,
    addAll,
    commit,
    push,
  }
}