import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight, Loader2, GitBranch, User, Clock, Hash, FileText } from 'lucide-react';
import { useWorkspaceStore } from '@/store';

interface GitLogEntry {
  hash: string;
  full_hash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  date_iso: string;
  parents: string[];
  refs: string[];
  is_merge: boolean;
}

interface CommitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface GitGraphProps {
  onCommitSelect?: (hash: string) => void;
  onFileSelect?: (hash: string, filePath: string) => void;
  maxEntries?: number;
}

const BRANCH_COLORS = [
  '#4ade80', // green
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#f472b6', // pink
  '#a78bfa', // purple
  '#fb923c', // orange
  '#60a5fa', // blue
  '#34d399', // emerald
];

export function GitGraph({ onCommitSelect, onFileSelect, maxEntries = 30 }: GitGraphProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchCommits = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<GitLogEntry[]>('git_log', {
        cwd: activeWorkspace.folder_path,
        count: maxEntries,
        branch: selectedBranch || undefined,
      });
      setCommits(result);
    } catch (err) {
      console.error('Failed to fetch git log:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch git history');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, maxEntries, selectedBranch]);

  const fetchBranches = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    
    try {
      const result = await invoke<{ current: string; local: string[]; remote: string[] }>('git_get_branches', {
        cwd: activeWorkspace.folder_path,
      });
      const allBranches = [...new Set([result.current, ...result.local])];
      setBranches(allBranches.filter(Boolean));
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (expanded) {
      fetchCommits();
      fetchBranches();
    }
  }, [expanded, fetchCommits, fetchBranches]);

  const fetchCommitFiles = useCallback(async (hash: string) => {
    if (!activeWorkspace?.folder_path || commitFiles[hash]) return;
    
    setLoadingFiles(hash);
    try {
      const files = await invoke<CommitFile[]>('git_show_files', {
        cwd: activeWorkspace.folder_path,
        hash,
      });
      setCommitFiles(prev => ({ ...prev, [hash]: files }));
    } catch (err) {
      console.error('Failed to fetch commit files:', err);
    } finally {
      setLoadingFiles(null);
    }
  }, [activeWorkspace, commitFiles]);

  const handleExpandCommit = useCallback((hash: string) => {
    setExpandedCommit(prev => prev === hash ? null : hash);
    if (hash !== expandedCommit) {
      fetchCommitFiles(hash);
    }
  }, [expandedCommit, fetchCommitFiles]);

  const getBranchColor = (refs: string[], index: number) => {
    if (refs.includes('main') || refs.includes('master')) {
      return BRANCH_COLORS[0]; // Green for main/master
    }
    return BRANCH_COLORS[index % BRANCH_COLORS.length];
  };

  const formatDate = (dateStr: string) => {
    // If it's already a relative date like "2 hours ago", return it
    if (dateStr.includes('ago') || dateStr.includes('yesterday') || dateStr.includes('days')) {
      return dateStr;
    }
    
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      if (hours < 1) return 'just now';
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const shortenHash = (hash: string) => hash.slice(0, 7);

  if (!activeWorkspace) {
    return null;
  }

  return (
    <div className="border-t border-app-border">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-500 w-3.5 flex items-center justify-center">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">Git Graph</span>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />}
      </div>

      {/* Content */}
      {expanded && (
        <div className="pb-2">
          {/* Branch Filter */}
          {branches.length > 0 && (
            <div className="px-3 py-1 flex items-center gap-2">
              <GitBranch className="w-3 h-3 text-neutral-500" />
              <select
                value={selectedBranch || ''}
                onChange={(e) => setSelectedBranch(e.target.value || null)}
                className="text-xs bg-transparent border border-app-border rounded px-2 py-0.5 text-neutral-300 focus:outline-none focus:border-app-accent"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Commits */}
          <div className="overflow-auto max-h-80">
            {commits.map((commit, index) => {
              const isExpanded = expandedCommit === commit.hash;
              const color = getBranchColor(commit.refs, index);
              
              return (
                <div key={commit.hash}>
                  {/* Commit Row */}
                  <div
                    className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 ${isExpanded ? 'bg-white/5' : ''}`}
                    onClick={() => handleExpandCommit(commit.hash)}
                    onMouseEnter={() => {
                      setHoveredCommit(commit.hash);
                      fetchCommitFiles(commit.hash);
                    }}
                    onMouseLeave={() => setHoveredCommit(null)}
                  >
                    {/* Graph Column */}
                    <div className="w-4 flex-shrink-0 flex flex-col items-center relative">
                      {/* Vertical line */}
                      {index < commits.length - 1 && (
                        <div className="absolute top-3 left-1/2 w-0.5 h-full bg-neutral-700" />
                      )}
                      {/* Commit dot */}
                      <div
                        className="w-3 h-3 rounded-full border-2 flex-shrink-0 relative z-10"
                        style={{
                          borderColor: color,
                          backgroundColor: commit.refs.length > 0 ? color : 'transparent',
                          boxShadow: commit.refs.length > 0 ? `0 0 6px ${color}40` : 'none',
                        }}
                      />
                      {/* Merge indicator */}
                      {commit.is_merge && (
                        <div className="absolute top-3 left-3 w-2 h-0.5 bg-purple-500" />
                      )}
                    </div>

                    {/* Content Column */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white truncate font-medium">
                          {commit.message.split('\n')[0].slice(0, 50)}
                          {commit.message.length > 50 && '...'}
                        </span>
                        {/* Branch refs */}
                        {commit.refs.length > 0 && (
                          <div className="flex items-center gap-1">
                            {commit.refs.slice(0, 2).map((ref, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-20"
                                style={{
                                  backgroundColor: `${color}20`,
                                  color: color,
                                  border: `1px solid ${color}40`,
                                }}
                              >
                                {ref}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500">
                        <span className="font-mono">{shortenHash(commit.hash)}</span>
                        <span>•</span>
                        <span className="truncate">{commit.author}</span>
                        <span>•</span>
                        <span>{formatDate(commit.date)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Commit Detail */}
                  {isExpanded && (
                    <div className="ml-8 mr-3 mb-1 p-2 bg-app-bg border border-app-border rounded text-xs">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-neutral-400">
                          <User className="w-3 h-3" />
                          <span>{commit.author} &lt;{commit.email}&gt;</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-neutral-400">
                          <Clock className="w-3 h-3" />
                          <span>{commit.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-neutral-400 font-mono">
                          <Hash className="w-3 h-3" />
                          <span>{commit.full_hash}</span>
                        </div>
                        
                        {/* Commit Message (full) */}
                        {commit.message.includes('\n') && (
                          <div className="mt-2 pt-2 border-t border-app-border">
                            <p className="text-neutral-300 whitespace-pre-wrap text-[11px]">
                              {commit.message}
                            </p>
                          </div>
                        )}
                        
                        {/* Files Changed - Show on hover */}
                        {hoveredCommit === commit.hash && (
                          <div className="mt-2 pt-2 border-t border-app-border">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <FileText className="w-3 h-3 text-neutral-500" />
                              <span className="text-neutral-500">Files changed</span>
                            </div>
                            {loadingFiles === commit.hash ? (
                              <div className="flex items-center gap-1 text-neutral-500">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Loading...</span>
                              </div>
                            ) : commitFiles[commit.hash] ? (
                              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                {commitFiles[commit.hash].map((file, idx) => (
                                  <div 
                                    key={idx} 
                                    className="flex items-center justify-between gap-2 py-0.5 px-1 -mx-1 rounded hover:bg-white/5 cursor-pointer group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onFileSelect?.(commit.full_hash, file.path);
                                    }}
                                  >
                                    <span className="text-neutral-300 truncate flex-1 group-hover:text-white transition-colors">{file.path}</span>
                                    <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
                                      {file.additions > 0 && (
                                        <span className="text-green-400">+{file.additions}</span>
                                      )}
                                      {file.deletions > 0 && (
                                        <span className="text-red-400">-{file.deletions}</span>
                                      )}
                                      <span className={`w-4 text-center ${
                                        file.status === 'A' ? 'text-green-400' :
                                        file.status === 'D' ? 'text-red-400' :
                                        file.status === 'R' ? 'text-yellow-400' :
                                        'text-yellow-400'
                                      }`}>
                                        {file.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-neutral-600">No files</span>
                            )}
                          </div>
                        )}
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-app-border">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(commit.full_hash);
                            }}
                            className="text-neutral-500 hover:text-white transition-colors text-[10px]"
                          >
                            Copy Hash
                          </button>
                          {onCommitSelect && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCommitSelect(commit.full_hash);
                              }}
                              className="text-neutral-500 hover:text-white transition-colors text-[10px]"
                            >
                              View Diff
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {commits.length === maxEntries && (
            <div className="px-3 py-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Increase max entries would require parent state management
                }}
                className="text-xs text-neutral-500 hover:text-white transition-colors"
              >
                Load more...
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}