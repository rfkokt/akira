/**
 * Git Operations & Multi-Platform PR Support
 * 
 * Supports: GitHub, GitLab, Bitbucket, and self-hosted instances.
 * Automatically detects the platform from the git remote URL.
 */

import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '@/store/configStore';

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
  baseBranch: string;
  prUrl?: string;
  error?: string;
}

interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  /** Alias kept for backward compat — same as stdout */
  output: string;
}

// ─── Git Command Runner ─────────────────────────────────────────────────

export async function runGit(args: string[], cwd: string): Promise<ShellResult> {
  const raw = await invoke<{ success: boolean; stdout: string; stderr: string; exit_code: number }>(
    'run_shell_command', { command: 'git', args, cwd }
  );
  return {
    success: raw.success,
    stdout: raw.stdout,
    stderr: raw.stderr,
    // 'output' was previously used throughout git.ts — mirror stdout for compat
    output: raw.stdout,
  };
}

// ─── Remote Helpers ─────────────────────────────────────────────────────

export async function getDefaultRemote(cwd: string): Promise<string> {
  const res = await runGit(['remote'], cwd);
  if (!res.success || !res.stdout.trim()) return 'origin';
  
  const remotes = res.stdout.trim().split('\n');
  // Prefer 'origin', otherwise use first remote
  if (remotes.includes('origin')) return 'origin';
  return remotes[0] || 'origin';
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

    // Ensure git is initialized for greenfield projects
    const statusRes = await runGit(['status'], cwd);
    if (!statusRes.success) {
      console.log('[git] Repository not initialized. Auto-initializing...');
      await runGit(['init', '-b', 'main'], cwd);
      await runGit(['commit', '--allow-empty', '-m', 'Initial commit'], cwd);
    }

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

    // Get the cached diff for AI commit generation
    const diffResult = await runGit(['diff', '--cached'], cwd);
    const diff = diffResult.success ? diffResult.output : '';
    
    // Generate commit message dynamically using Groq AI
    const { generateCommitMessage } = await import('./commitMessage');
    const groqApiKey = useConfigStore.getState().config?.groq_api_key ?? undefined;
    const commitMsg = diff.trim() 
      ? await generateCommitMessage({ diff, groqApiKey, language: 'en' })
      : `feat: ${taskTitle}`;

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

    const pushResult = await runGit(['push', '-u', remoteName, branchName], cwd);
    if (!pushResult.success) {
      console.error('[git] git push failed:', pushResult.output);
      return { branch: branchName, baseBranch: currentBranchName, error: `Push failed: ${pushResult.output}` };
    }

    // Build PR URL — try auto-create via API if token is configured
    let prUrl: string | undefined;
    const remoteUrlResult = await runGit(['remote', 'get-url', remoteName], cwd);
    if (remoteUrlResult.success) {
      const remoteInfo = detectGitPlatform(remoteUrlResult.output.trim());
      if (remoteInfo) {
        const gitToken = useConfigStore.getState().config?.git_token;

        if (gitToken && remoteInfo.platform !== 'unknown') {
          // Auto-create PR via platform API
          try {
            const taskDescription = `Auto-generated PR by Akira AI\n\nBranch: \`${branchName}\`\n\nTask: ${taskTitle}`;
            const created = await invoke<{ pr_url: string; pr_number: number | null }>('create_pull_request', {
              token: gitToken,
              platform: remoteInfo.platform,
              baseUrl: remoteInfo.platform === 'github'
                ? 'https://api.github.com'
                : remoteInfo.baseUrl,
              owner: remoteInfo.owner,
              repo: remoteInfo.repo,
              title: taskTitle,
              headBranch: branchName,
              baseBranch: currentBranchName,
              body: taskDescription,
            });
            prUrl = created.pr_url;
            console.log(`[git] PR auto-created: ${prUrl}`);
          } catch (apiErr) {
            console.warn('[git] Auto-create PR failed, falling back to compare URL:', apiErr);
            prUrl = buildPRUrl(remoteInfo, currentBranchName, branchName);
          }
        } else {
          // No token → generate compare URL for user to open manually
          prUrl = buildPRUrl(remoteInfo, currentBranchName, branchName);
          console.log(`[git] Detected platform: ${remoteInfo.platform} → compare URL generated (no API token)`);
        }
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

    return { branch: branchName, baseBranch: currentBranchName, prUrl };
  } catch (err) {
    console.error('[git] autoCreatePR failed:', err);
    return null;
  }
}

// ─── Git Verification & Merge Workflow ──────────────────────────────────

export async function getGitBranches(cwd: string): Promise<string[]> {
  const result = await runGit(['branch', '--format=%(refname:short)'], cwd);
  if (!result.success) return ['main', 'master']; // Safe fallback
  return result.output
    .split('\n')
    .map(b => b.trim())
    .filter(b => b && b.length > 0);
}

export async function getLatestAlphaTag(cwd: string, targetBranch?: string): Promise<string | null> {
  const args = ['tag', '-l', 'alpha.*'];
  if (targetBranch) {
    args.push('--merged');
    args.push(targetBranch);
  }
  const result = await runGit(args, cwd);
  if (!result.success || !result.output.trim()) return null;

  const tags = result.output
    .split('\n')
    .map(t => t.trim())
    .filter(t => t.startsWith('alpha.'));

  if (tags.length === 0) return null;

  // Sort tags by parsed version numbers
  tags.sort((a, b) => {
    const partsA = a.replace('alpha.', '').split('.').map(Number);
    const partsB = b.replace('alpha.', '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const numA = isNaN(partsA[i]) ? 0 : partsA[i];
      const numB = isNaN(partsB[i]) ? 0 : partsB[i];
      if (numA !== numB) return numA - numB;
    }
    return 0;
  });

  return tags[tags.length - 1]; // Return highest
}

export interface MergeOptions {
  createTag: boolean;
  tagName: string;
  deleteBranch?: boolean;
}

export async function mergeTaskToBranch(cwd: string, featureBranch: string, targetBranch: string, options?: MergeOptions): Promise<{ success: boolean; log: string; mergedToBranch?: string }> {
  let fullLog = '';
  
  // Auto-detect remote name (origin, kaidev, etc.)
  const remote = await getDefaultRemote(cwd);
  fullLog += `[Using remote: ${remote}]\n`;

  const exec = async (args: string[], allowFail = false) => {
    fullLog += `> git ${args.join(' ')}\n`;
    const res = await runGit(args, cwd);
    if (!res.success && !allowFail) {
      fullLog += `${res.stderr}\n[ERROR] Command failed.\n`;
      throw new Error(fullLog);
    }
    fullLog += `${res.output}\n`;
    if (res.stderr && res.success) fullLog += `[stderr payload]\n${res.stderr}\n`;
    return res;
  };

  try {
    // 0. Check for uncommitted changes and auto-stash
    const statusRes = await runGit(['status', '--porcelain'], cwd);
    const hasUncommittedChanges = statusRes.success && statusRes.output.trim().length > 0;
    let stashed = false;
    
    if (hasUncommittedChanges) {
      fullLog += `[Uncommitted changes detected. Auto-stashing...]\n`;
      // -u includes untracked files
      const stashRes = await exec(['stash', 'push', '-u', '-m', `Auto-stash before AI merge of ${featureBranch}`], true);
      if (stashRes.success) {
        stashed = true;
      } else {
        fullLog += `[Warning] Failed to stash changes, continuing might fail...\n`;
      }
    }

    // 1. Fetch remote changes to keep up to date (optional, may fail if no remote)
    await exec(['fetch', remote, targetBranch], true);

    // 2. Checkout target branch
    await exec(['checkout', targetBranch]);

    // 3. Pull latest (might fail if branch has no upstream, which is fine)
    await exec(['pull', remote, targetBranch], true);

    // 4. Merge feature branch
    await exec(['merge', '--no-ff', featureBranch, '-m', `Merge branch '${featureBranch}' into ${targetBranch}`]);

    // 5. Create tag if requested - auto-increment if already exists
    if (options && options.createTag) {
      let tagName = options.tagName;
      let attempts = 0;
      const maxAttempts = 100; // Safety limit
      
      while (attempts < maxAttempts) {
        const tagCheck = await exec(['tag', '-l', tagName], true);
        const tagExists = tagCheck.success && tagCheck.output.trim() === tagName;
        
        if (!tagExists) {
          await exec(['tag', '-a', tagName, '-m', `Version ${tagName}`]);
          break;
        }
        
        // Tag exists, increment patch version
        fullLog += `[Tag ${tagName} already exists, incrementing...]\n`;
        const match = tagName.match(/^(alpha\.\d+\.\d+\.)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const patch = parseInt(match[2], 10) + 1;
          tagName = `${prefix}${patch}`;
        } else {
          // Fallback: append incrementing number
          tagName = `${options.tagName}-${attempts + 2}`;
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        fullLog += `[Warning: Could not find available tag after ${maxAttempts} attempts]\n`;
      }
    }

    // 6. Push target branch
    await exec(['push', remote, targetBranch]);

    // 7. Push tags if applied
    if (options && options.createTag) {
      await exec(['push', remote, '--tags']);
    }

    // 8. Delete feature branch if requested
    if (options && options.deleteBranch) {
      await exec(['branch', '-D', featureBranch], true); // Force delete local (it's already pushed/merged)
      await exec(['push', remote, '--delete', featureBranch], true); // remote
    }

    // 9. Restore uncommitted changes
    if (stashed) {
      fullLog += `\n[Restoring uncommitted changes...]\n`;
      await exec(['stash', 'pop'], true);
    }

    return { success: true, log: fullLog, mergedToBranch: targetBranch };
  } catch (error: any) {
    let errMessage = error.message || String(error);
    if (errMessage.includes('Auto-stashing')) {
      errMessage += `\n[ACTION REQUIRED] Your uncommitted changes were safely stashed to prevent data loss. You can retrieve them later by running 'git stash pop' once any conflicts are resolved.\n`;
    }
    return { success: false, log: errMessage };
  }
}

