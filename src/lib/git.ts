/**
 * Git Operations & Multi-Platform PR Support
 * 
 * Supports: GitHub, GitLab, Bitbucket, and self-hosted instances.
 * Automatically detects the platform from the git remote URL.
 */

import { invoke } from '@tauri-apps/api/core';

// ─── Types ──────────────────────────────────────────────────────────────

export type GitPlatform = 'github' | 'gitlab' | 'bitbucket' | 'unknown';

export interface GitRemoteInfo {
  platform: GitPlatform;
  owner: string;
  repo: string;
  baseUrl: string; // e.g., 'https://github.com' or 'https://gitlab.mycompany.com'
}

export interface PRResult {
  branch: string;
  prUrl?: string;
  error?: string;
}

interface ShellResult {
  success: boolean;
  output: string;
}

// ─── Git Command Runner ─────────────────────────────────────────────────

export async function runGit(args: string[], cwd: string): Promise<ShellResult> {
  return invoke<ShellResult>('run_shell_command', {
    command: 'git',
    args,
    cwd,
  });
}

// ─── Platform Detection ─────────────────────────────────────────────────

/**
 * Detect the git hosting platform from a remote URL.
 * Supports HTTPS, SSH, and self-hosted instances.
 * 
 * Examples:
 *   https://github.com/user/repo.git      → github
 *   git@github.com:user/repo.git          → github
 *   https://gitlab.com/user/repo.git      → gitlab
 *   git@gitlab.mycompany.com:group/repo   → gitlab (self-hosted)
 *   https://bitbucket.org/user/repo.git   → bitbucket
 */
export function detectGitPlatform(remoteUrl: string): GitRemoteInfo | null {
  // Normalize URL
  const url = remoteUrl.trim();

  // Pattern for SSH: git@host:owner/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    const platform = classifyHost(host);
    return {
      platform,
      owner,
      repo,
      baseUrl: `https://${host}`,
    };
  }

  // Pattern for HTTPS: https://host/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    const platform = classifyHost(host);
    return {
      platform,
      owner,
      repo,
      baseUrl: `https://${host}`,
    };
  }

  // GitLab subgroup pattern: https://host/group/subgroup/repo.git
  const gitlabSubgroupMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)\/([^/.]+?)(?:\.git)?$/);
  if (gitlabSubgroupMatch) {
    const [, host, groupPath, repo] = gitlabSubgroupMatch;
    const platform = classifyHost(host);
    if (platform === 'gitlab') {
      return {
        platform,
        owner: groupPath, // e.g., 'group/subgroup'
        repo,
        baseUrl: `https://${host}`,
      };
    }
  }

  return null;
}

function classifyHost(host: string): GitPlatform {
  const h = host.toLowerCase();
  if (h.includes('github')) return 'github';
  if (h.includes('gitlab')) return 'gitlab';
  if (h.includes('bitbucket')) return 'bitbucket';
  return 'unknown';
}

// ─── PR URL Builder ─────────────────────────────────────────────────────

/**
 * Build a PR/MR creation URL for the detected platform.
 * Returns undefined if the platform is unknown.
 */
export function buildPRUrl(
  remote: GitRemoteInfo,
  baseBranch: string,
  headBranch: string,
): string | undefined {
  const { platform, owner, repo, baseUrl } = remote;

  switch (platform) {
    case 'github':
      return `${baseUrl}/${owner}/${repo}/compare/${baseBranch}...${headBranch}`;

    case 'gitlab':
      return `${baseUrl}/${owner}/${repo}/-/merge_requests/new?merge_request[source_branch]=${headBranch}&merge_request[target_branch]=${baseBranch}`;

    case 'bitbucket':
      return `${baseUrl}/${owner}/${repo}/pull-requests/new?source=${headBranch}&dest=${baseBranch}`;

    case 'unknown':
      // Best-effort: try GitHub-style compare URL
      return `${baseUrl}/${owner}/${repo}/compare/${baseBranch}...${headBranch}`;
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// ─── Auto Create PR ─────────────────────────────────────────────────────

/**
 * Automated branch workflow: create branch → add → commit → push → generate PR URL.
 * Platform-agnostic — works with GitHub, GitLab, Bitbucket, and self-hosted.
 */
export async function autoCreatePR(
  taskId: string,
  taskTitle: string,
  cwd: string,
): Promise<PRResult | null> {
  try {
    const shortId = taskId.slice(0, 8);
    const slugifiedTitle = slugify(taskTitle);
    const branchName = `task/${slugifiedTitle}-${shortId}`;
    const commitMsg = `feat: ${taskTitle}`;

    // Get current branch
    const currentBranch = await runGit(['branch', '--show-current'], cwd);
    const currentBranchName = currentBranch.success ? currentBranch.output.trim() : 'main';

    // Create feature branch
    await runGit(['checkout', '-b', branchName], cwd);

    // Stage all changes
    const addResult = await runGit(['add', '.'], cwd);
    if (!addResult.success) {
      console.error('[git] git add failed:', addResult.output);
      await runGit(['checkout', currentBranchName], cwd);
      await runGit(['branch', '-d', branchName], cwd);
      return null;
    }

    // Commit
    const commitResult = await runGit(['commit', '-m', commitMsg], cwd);
    if (!commitResult.success) {
      console.error('[git] git commit failed:', commitResult.output);
      await runGit(['checkout', currentBranchName], cwd);
      await runGit(['branch', '-d', branchName], cwd);
      return null;
    }

    // Get remote name
    const remoteResult = await runGit(['remote'], cwd);
    const remoteName = remoteResult.success ? remoteResult.output.trim().split('\n')[0] : 'origin';

    // Push
    const pushResult = await runGit(['push', '-u', remoteName, branchName], cwd);
    if (!pushResult.success) {
      console.error('[git] git push failed:', pushResult.output);
      return { branch: branchName, error: `Push failed: ${pushResult.output}` };
    }

    // Build PR URL based on detected platform
    let prUrl: string | undefined;
    const remoteUrlResult = await runGit(['remote', 'get-url', remoteName], cwd);
    if (remoteUrlResult.success) {
      const remoteInfo = detectGitPlatform(remoteUrlResult.output.trim());
      if (remoteInfo) {
        prUrl = buildPRUrl(remoteInfo, currentBranchName, branchName);
        console.log(`[git] Detected platform: ${remoteInfo.platform} → PR URL generated`);
      }
    }

    // Save PR info to database
    try {
      await invoke('update_task_pr_info', {
        id: taskId,
        prBranch: branchName,
        prUrl: prUrl || null,
        remote: remoteName || null,
      });
    } catch (e) {
      console.error('[git] Failed to save PR info to database:', e);
    }

    return { branch: branchName, prUrl };
  } catch (err) {
    console.error('[git] autoCreatePR failed:', err);
    return null;
  }
}
