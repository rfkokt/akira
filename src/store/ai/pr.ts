import { invoke } from '@tauri-apps/api/core'
import type { AITaskState } from './types'

interface GitResult {
  success: boolean
  output: string
}

interface PRResult {
  branch: string
  prUrl?: string
  error?: string
}

async function runGit(args: string[], cwd: string): Promise<GitResult> {
  return invoke<GitResult>('run_shell_command', {
    command: 'git',
    args,
    cwd,
  })
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export interface AutoCreatePROptions {
  taskId: string
  taskTitle: string
  workspacePath: string
  setTaskState: (taskId: string, state: Partial<AITaskState>) => void
}

export async function autoCreatePR(options: AutoCreatePROptions): Promise<PRResult | null> {
  const { taskId, taskTitle, workspacePath, setTaskState } = options

  if (!workspacePath) {
    setTaskState(taskId, { prError: 'No workspace folder path available' })
    return null
  }

  try {
    const shortId = taskId.slice(0, 8)
    const slugifiedTitle = slugify(taskTitle)
    const branchName = `task/${slugifiedTitle}-${shortId}`
    const commitMsg = `feat: ${taskTitle}`

    const currentBranch = await runGit(['branch', '--show-current'], workspacePath)
    const currentBranchName = currentBranch.success ? currentBranch.output.trim() : 'main'

    await runGit(['checkout', '-b', branchName], workspacePath)

    const addResult = await runGit(['add', '.'], workspacePath)
    if (!addResult.success) {
      setTaskState(taskId, { prError: `Git add failed: ${addResult.output}` })
      await runGit(['checkout', currentBranchName], workspacePath)
      await runGit(['branch', '-D', branchName], workspacePath)
      return null
    }

    const commitResult = await runGit(['commit', '-m', commitMsg], workspacePath)
    if (!commitResult.success) {
      setTaskState(taskId, { prError: `Git commit failed: ${commitResult.output}` })
      await runGit(['checkout', currentBranchName], workspacePath)
      await runGit(['branch', '-D', branchName], workspacePath)
      return null
    }

    const remoteResult = await runGit(['remote'], workspacePath)
    const remoteName = remoteResult.success ? remoteResult.output.trim().split('\n')[0] : 'origin'

    const pushResult = await runGit(['push', '-u', remoteName, branchName], workspacePath)
    if (!pushResult.success) {
      setTaskState(taskId, { prError: `Git push failed: ${pushResult.output}` })
      await runGit(['checkout', currentBranchName], workspacePath)
      await runGit(['branch', '-D', branchName], workspacePath)
      return null
    }

    let prUrl: string | undefined
    const remoteUrlResult = await runGit(['remote', 'get-url', remoteName], workspacePath)
    if (remoteUrlResult.success) {
      const remoteUrl = remoteUrlResult.output.trim()
      const repoMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
      if (repoMatch) {
        const [, owner, repo] = repoMatch
        prUrl = `https://github.com/${owner}/${repo}/compare/${currentBranchName}...${branchName}`
      }
    }

    await runGit(['checkout', currentBranchName], workspacePath)

    try {
      await invoke('update_task_pr_info', {
        id: taskId,
        prBranch: branchName,
        prUrl: prUrl || null,
        remote: remoteName || null,
      })
    } catch (e) {
      console.error('Failed to save PR info to database:', e)
    }

    return { branch: branchName, prUrl }
  } catch (err) {
    console.error('Failed to auto-create PR:', err)
    return null
  }
}