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

export async function runGit(args: string[], cwd: string, allowFail = false): Promise<ShellResult> {
  try {
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
  } catch (error) {
    if (allowFail) {
      return {
        success: false,
        stdout: '',
        stderr: String(error),
        output: '',
      };
    }
    throw error;
  }
}

// ─── Remote Helpers ─────────────────────────────────────────────────────

export async function getDefaultRemote(cwd: string): Promise<string | null> {
  const res = await runGit(['remote'], cwd);
  const remotes = res.stdout.trim().split('\n').filter(Boolean);
  if (remotes.length === 0) return null;
  
  if (remotes.includes('origin')) return 'origin';
  return remotes[0];
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
export interface AutoCreatePROptions {
  baseBranch?: string; // Optional base branch to create PR from (for revisions after merge)
}

// Global flag to track if PR creation should be cancelled
let cancelPRCreation = false;

export function cancelAutoCreatePR() {
  cancelPRCreation = true;
}

export function resetPRCreationCancel() {
  cancelPRCreation = false;
}

// Helper to check if cancelled
function checkCancelled(): boolean {
  if (cancelPRCreation) {
    console.log('[git] PR creation was cancelled');
    return true;
  }
  return false;
}

// Wrapper for git commands with timeout
async function runGitWithTimeout(
  args: string[], 
  cwd: string, 
  timeoutMs: number = 30000,
  operationName: string = 'git command'
): Promise<ShellResult> {
  console.log(`[git] Starting: ${operationName} (${args.join(' ')})`);
  
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      runGit(args, cwd),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`[git] Completed: ${operationName} in ${duration}ms`);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[git] Failed: ${operationName} after ${duration}ms:`, error);
    throw error;
  }
}

export async function autoCreatePR(
  taskId: string,
  taskTitle: string,
  cwd: string,
  options?: AutoCreatePROptions,
  onProgress?: (stage: string, message: string) => void,
): Promise<PRResult | null> {
  // Reset cancel flag at start
  resetPRCreationCancel();
  
  try {
    onProgress?.('init', 'Preparing branch name...');
    
    const shortId = taskId.slice(0, 8);
    const slugifiedTitle = slugify(taskTitle);
    
    if (checkCancelled()) return null;
    
    // Check if this is a revision (task already has a PR branch)
    onProgress?.('checking', 'Checking existing branches...');
    const existingBranchCheck = await runGitWithTimeout(
      ['branch', '--list', `task/${slugifiedTitle}-${shortId}*`], 
      cwd, 
      10000,
      'check existing branches'
    );
    
    let revision = 0;
    if (existingBranchCheck.success && existingBranchCheck.output.trim()) {
      const existingBranches = existingBranchCheck.output.trim().split('\n').filter(b => b.trim());
      revision = existingBranches.length;
    }
    
    const branchName = revision > 0 
      ? `task/${slugifiedTitle}-${shortId}-v${revision + 1}`
      : `task/${slugifiedTitle}-${shortId}`;

    if (checkCancelled()) return null;

    // Ensure git is initialized for greenfield projects
    onProgress?.('checking', 'Checking git repository...');
    const statusRes = await runGitWithTimeout(['status'], cwd, 10000, 'check git status');
    
    if (!statusRes.success) {
      console.log('[git] Repository not initialized. Auto-initializing...');
      onProgress?.('init', 'Initializing git repository...');
      await runGitWithTimeout(['init', '-b', 'main'], cwd, 15000, 'git init');
      await runGitWithTimeout(['commit', '--allow-empty', '-m', 'Initial commit'], cwd, 15000, 'initial commit');
    }

    if (checkCancelled()) return null;

    // Get current branch or use specified base branch
    onProgress?.('branch', 'Setting up base branch...');
    let currentBranchName: string;
    
    if (options?.baseBranch) {
      currentBranchName = options.baseBranch;
      await runGitWithTimeout(['checkout', currentBranchName], cwd, 15000, 'checkout base branch');
    } else {
      const currentBranch = await runGitWithTimeout(['branch', '--show-current'], cwd, 10000, 'get current branch');
      currentBranchName = currentBranch.success ? currentBranch.output.trim() : 'main';
    }

    if (checkCancelled()) return null;

    // Create feature branch
    onProgress?.('branch', `Creating branch: ${branchName}...`);
    await runGitWithTimeout(['checkout', '-b', branchName], cwd, 15000, 'create feature branch');

    if (checkCancelled()) return null;

    // Stage all changes
    onProgress?.('commit', 'Staging changes...');
    const addResult = await runGitWithTimeout(['add', '.'], cwd, 20000, 'stage changes');
    
    if (!addResult.success) {
      console.error('[git] git add failed:', addResult.output);
      onProgress?.('error', 'Failed to stage changes');
      await runGit(['checkout', currentBranchName], cwd);
      await runGit(['branch', '-d', branchName], cwd);
      return null;
    }

    if (checkCancelled()) return null;

    // Check if there are staged changes
    const stagedCheck = await runGitWithTimeout(['diff', '--cached', '--quiet'], cwd, 10000, 'check staged changes');
    const hasStagedChanges = !stagedCheck.success;
    
    if (!hasStagedChanges) {
      console.log('[git] No staged changes detected. Creating empty commit...');
    }

    if (checkCancelled()) return null;

    // Get the cached diff for AI commit generation
    onProgress?.('commit', 'Generating commit message...');
    const diffResult = await runGitWithTimeout(['diff', '--cached'], cwd, 15000, 'get diff');
    const diff = diffResult.success ? diffResult.output : '';
    
    // Generate commit message dynamically using Groq AI
    const { generateCommitMessage } = await import('./commitMessage');
    const groqApiKey = useConfigStore.getState().config?.groq_api_key ?? undefined;
    const commitMsg = diff.trim() 
      ? await generateCommitMessage({ diff, groqApiKey, language: 'en' })
      : `feat: ${taskTitle}`;

    if (checkCancelled()) return null;

    // Commit
    onProgress?.('commit', 'Committing changes...');
    const commitArgs = hasStagedChanges 
      ? ['commit', '-m', commitMsg]
      : ['commit', '--allow-empty', '-m', commitMsg];
    
    const commitResult = await runGitWithTimeout(commitArgs, cwd, 20000, 'commit changes');
    
    if (!commitResult.success) {
      console.error('[git] git commit failed:', commitResult.output);
      onProgress?.('error', 'Failed to commit');
      await runGit(['checkout', currentBranchName], cwd);
      await runGit(['branch', '-d', branchName], cwd);
      return null;
    }

    if (checkCancelled()) return null;

    // Get remote name
    onProgress?.('push', 'Preparing to push...');
    const remoteResult = await runGitWithTimeout(['remote'], cwd, 10000, 'get remote');
    const remoteName = remoteResult.success ? remoteResult.output.trim().split('\n')[0] : 'origin';

    if (checkCancelled()) return null;

    // Push branch
    onProgress?.('push', `Pushing to ${remoteName}...`);
    const pushResult = await runGitWithTimeout(['push', '-u', remoteName, branchName], cwd, 60000, 'push branch');
    
    if (!pushResult.success) {
      console.error('[git] git push failed:', pushResult.output);
      onProgress?.('error', 'Push failed');
      return { branch: branchName, baseBranch: currentBranchName, error: `Push failed: ${pushResult.output}` };
    }

    if (checkCancelled()) return null;

    // Build PR URL
    onProgress?.('pr', 'Creating pull request...');
    let prUrl: string | undefined;
    
    const remoteUrlResult = await runGitWithTimeout(['remote', 'get-url', remoteName], cwd, 10000, 'get remote URL');
    
    if (remoteUrlResult.success) {
      const remoteInfo = detectGitPlatform(remoteUrlResult.output.trim());
      if (remoteInfo) {
        const gitToken = useConfigStore.getState().config?.git_token;

        if (gitToken && remoteInfo.platform !== 'unknown') {
          try {
            const taskDescription = `Auto-generated PR by Akira AI\n\nBranch: \`${branchName}\`\n\nTask: ${taskTitle}`;
            
            onProgress?.('pr', 'Creating PR via API...');
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
            onProgress?.('complete', 'Pull request created!');
          } catch (apiErr) {
            console.warn('[git] Auto-create PR failed, falling back to compare URL:', apiErr);
            onProgress?.('pr', 'Using compare URL...');
            prUrl = buildPRUrl(remoteInfo, currentBranchName, branchName);
          }
        } else {
          prUrl = buildPRUrl(remoteInfo, currentBranchName, branchName);
          console.log(`[git] Detected platform: ${remoteInfo.platform} → compare URL generated (no API token)`);
        }
      }
    }

    if (checkCancelled()) return null;

    // Save PR info to database
    onProgress?.('save', 'Saving PR information...');
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

// Cache untuk tags agar tidak fetch berulang kali
let cachedTags: Map<string, { tag: string | null; timestamp: number }> = new Map();
const TAG_CACHE_TTL = 30000; // 30 detik

export async function getLatestAlphaTag(cwd: string, targetBranch?: string): Promise<string | null> {
  const cacheKey = `${cwd}:${targetBranch || 'all'}`;
  const cached = cachedTags.get(cacheKey);
  
  // Return cached result kalau masih fresh
  if (cached && Date.now() - cached.timestamp < TAG_CACHE_TTL) {
    console.log('[git] Using cached tags');
    return cached.tag;
  }
  
  // Get local tags first (fast)
  const localTags = await getLocalAlphaTags(cwd, targetBranch);
  
  // Try to fetch remote tags in background (don't wait)
  const remoteResult = await runGit(['remote'], cwd);
  const remoteName = remoteResult.success ? remoteResult.output.trim().split('\n')[0] : 'origin';
  
  // Fetch tags dengan timeout 3 detik
  const fetchPromise = runGit(['fetch', remoteName, '--tags'], cwd, true);
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3000));
  
  Promise.race([fetchPromise, timeoutPromise]).then(() => {
    // Update cache setelah fetch selesai
    getLocalAlphaTags(cwd, targetBranch).then(updatedTags => {
      cachedTags.set(cacheKey, { tag: updatedTags, timestamp: Date.now() });
    });
  });
  
  // Cache dan return local tags dulu
  cachedTags.set(cacheKey, { tag: localTags, timestamp: Date.now() });
  return localTags;
}

async function getLocalAlphaTags(cwd: string, targetBranch?: string): Promise<string | null> {
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
  runBuildTest?: boolean;
}

async function detectBuildCommand(cwd: string): Promise<string | null> {
  // Check for package.json scripts
  try {
    const packageJson = await runGit(['show', 'HEAD:package.json'], cwd);
    if (packageJson.success) {
      const pkg = JSON.parse(packageJson.output);
      if (pkg.scripts?.build) return 'npm run build';
      if (pkg.scripts?.['build:prod']) return 'npm run build:prod';
    }
  } catch {
    // package.json might not exist or be parseable
  }

  // Check for common build files
  const buildFiles = [
    { file: 'Cargo.toml', cmd: 'cargo build --release' },
    { file: 'pom.xml', cmd: 'mvn clean package' },
    { file: 'build.gradle', cmd: './gradlew build' },
    { file: 'Makefile', cmd: 'make' },
    { file: 'CMakeLists.txt', cmd: 'cmake --build build' },
  ];

  for (const { file, cmd } of buildFiles) {
    const check = await runGit(['ls-files', file], cwd);
    if (check.success && check.output.trim()) {
      return cmd;
    }
  }

  return null;
}

export async function mergeTaskToBranch(cwd: string, featureBranch: string, targetBranch: string, options?: MergeOptions): Promise<{ success: boolean; log: string; mergedToBranch?: string }> {
  let fullLog = '';

  // Auto-detect remote name (origin, kaidev, etc.)
  const remote = await getDefaultRemote(cwd);
  if (remote) {
    fullLog += `[Using remote: ${remote}]\n`;
  } else {
    fullLog += `[No remote configured. Performing local merge only.]\n`;
  }

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

  const execShell = async (cmd: string, allowFail = false) => {
    fullLog += `> ${cmd}\n`;
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Parse command and args (e.g., "npm run build" -> command: "npm", args: ["run", "build"])
    const parts = cmd.split(' ');
    const command = parts[0];
    const args = parts.slice(1);
    
    try {
      const result = await invoke<{ success: boolean; stdout: string; stderr: string; exit_code: number }>('run_shell_command', {
        command,
        args,
        cwd
      });
      if (!result.success && !allowFail) {
        fullLog += `${result.stderr || result.stdout}\n[ERROR] Build command failed with exit code ${result.exit_code}.\n`;
        throw new Error(fullLog);
      }
      fullLog += `${result.stdout}\n`;
      if (result.stderr) fullLog += `[stderr]\n${result.stderr}\n`;
      return { success: result.success, output: result.stdout, stderr: result.stderr };
    } catch (e: any) {
      if (!allowFail) {
        fullLog += `${e.message || e}\n[ERROR] Build command failed.\n`;
        throw new Error(fullLog);
      }
      return { success: false, output: '', stderr: e.message || String(e) };
    }
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

    // 1. Fetch remote changes to keep up to date
    if (remote) await exec(['fetch', remote, targetBranch], true);

    // 2. Checkout target branch
    await exec(['checkout', targetBranch]);

    // 3. Pull latest
    if (remote) await exec(['pull', remote, targetBranch], true);

    // 4. Merge feature branch
    await exec(['merge', '--no-ff', featureBranch, '-m', `Merge branch '${featureBranch}' into ${targetBranch}`]);

    // 5. Create tag if requested - auto-increment if already exists
    let createdTagName: string | null = null;
    if (options && options.createTag) {
      let tagName = options.tagName;
      let attempts = 0;
      const maxAttempts = 100; // Safety limit

      while (attempts < maxAttempts) {
        const tagCheck = await exec(['tag', '-l', tagName], true);
        const tagExists = tagCheck.success && tagCheck.output.trim() === tagName;

        if (!tagExists) {
          await exec(['tag', '-a', tagName, '-m', `Version ${tagName}`]);
          createdTagName = tagName;
          fullLog += `[Created tag: ${tagName}]\n`;
          break;
        }

        // Tag exists, increment patch version
        fullLog += `[Tag ${tagName} already exists locally, incrementing...]\n`;
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

    // 6. Run build & test if requested
    if (options?.runBuildTest) {
      const buildCmd = await detectBuildCommand(cwd);
      if (buildCmd) {
        fullLog += `[Running build/test: ${buildCmd}]\n`;
        try {
          const buildResult = await execShell(buildCmd);
          if (buildResult.success) {
            fullLog += `[✅ Build passed]\n`;
          } else {
            fullLog += `[❌ Build failed. Aborting merge.]\n`;
            throw new Error(fullLog);
          }
        } catch (buildError: any) {
          fullLog += `[❌ Build failed: ${buildError.message || buildError}\n`;
          fullLog += `[Merge aborted to prevent broken deployment]\n`;

          // Try to abort merge first (if merge is still in progress)
          const abortResult = await exec(['merge', '--abort'], true);
          if (!abortResult.success) {
            // Merge already committed, need to revert
            fullLog += `[Merge already committed. Reverting...]\n`;
            await exec(['reset', '--hard', 'HEAD~1'], true);
            fullLog += `[Reverted to before merge]\n`;
          }

          return { success: false, log: fullLog };
        }
      } else {
        fullLog += `[No build command detected. Skipping build check.]\n`;
        fullLog += `[To add build check, ensure package.json has "build" script or use Cargo.toml, pom.xml, etc.]\n`;
      }
    }

    // 7. Push target branch
    if (remote) await exec(['push', remote, targetBranch]);

    // 8. Push only the specific tag that was created (not all tags)
    if (remote && createdTagName) {
      fullLog += `[Pushing tag: ${createdTagName}]\n`;
      const pushTagResult = await exec(['push', remote, createdTagName], true);
      if (!pushTagResult.success) {
        fullLog += `[Warning: Failed to push tag ${createdTagName}: ${pushTagResult.stderr}]\n`;
        // Don't fail the entire merge just because tag push failed
      }
    }

    // 9. Delete feature branch if requested
    if (options && options.deleteBranch) {
      await exec(['branch', '-D', featureBranch], true); // Force delete local (it's already pushed/merged)
      if (remote) await exec(['push', remote, '--delete', featureBranch], true); // remote
      
      // Also cleanup old revision branches (v1, v2, etc.) if they exist
      const shortId = featureBranch.match(/-([a-f0-9]{8})(?:-v\d+)?$/)?.[1];
      if (shortId) {
        const baseName = featureBranch.replace(/-v\d+$/, '');
        fullLog += `[Cleaning up old revision branches...]\n`;
        
        // Find all branches matching this task pattern
        const allBranches = await runGit(['branch', '--list', `${baseName}*`], cwd);
        if (allBranches.success && allBranches.output.trim()) {
          const branchesToClean = allBranches.output
            .trim()
            .split('\n')
            .map(b => b.trim().replace(/^\*\s*/, ''))
            .filter(b => b !== featureBranch && b.startsWith(baseName));
          
          for (const oldBranch of branchesToClean) {
            await exec(['branch', '-D', oldBranch], true);
            if (remote) await exec(['push', remote, '--delete', oldBranch], true);
            fullLog += `[Cleaned up old branch: ${oldBranch}]\n`;
          }
        }
      }
    }

    // 10. Restore uncommitted changes
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

