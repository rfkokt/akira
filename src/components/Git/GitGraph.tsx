import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight, Loader2, GitBranch, User, Clock, Hash } from 'lucide-react';
import { useWorkspaceStore } from '@/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFile[]>>({});
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
    
    try {
      const files = await invoke<CommitFile[]>('git_show_files', {
        cwd: activeWorkspace.folder_path,
        hash,
      });
      setCommitFiles(prev => ({ ...prev, [hash]: files }));
    } catch (err) {
      console.error('Failed to fetch commit files:', err);
    }
  }, [activeWorkspace, commitFiles]);

  const getBranchColor = (refs: string[], index: number) => {
    if (refs.includes('main') || refs.includes('master')) {
      return BRANCH_COLORS[0]; // Green for main/master
    }
    return BRANCH_COLORS[index % BRANCH_COLORS.length];
  };

  const formatDate = (dateStr: string) => {
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
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-500 w-3.5 flex items-center justify-center">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <span className="text-xs font-bold tracking-widest text-neutral-400 uppercase">Git Graph</span>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />}
      </div>

      {expanded && (
        <div className="pb-2">
          {branches.length > 0 && (
            <div className="px-3 py-1 flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-neutral-500" />
              <Select
                value={selectedBranch || 'all'}
                onValueChange={(val) => setSelectedBranch(val === 'all' ? null : val)}
              >
                <SelectTrigger className="h-6 px-2 text-xs bg-transparent border-app-border focus:ring-1 focus:ring-app-accent rounded w-[140px]">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent className="bg-app-panel border-app-border rounded shadow-xl text-neutral-300 min-w-max">
                  <SelectItem value="all" className="focus:bg-white/10 text-xs py-1">All Branches</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b} value={b} className="focus:bg-white/10 text-xs py-1">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="overflow-auto max-h-80">
            {commits.map((commit, index) => {
              const color = getBranchColor(commit.refs, index);
              
              return (
                <div key={commit.hash}>
                  <div
                    className="relative group/commit"
                    onMouseEnter={() => {
                      setHoveredCommit(commit.hash);
                      fetchCommitFiles(commit.hash);
                    }}
                    onMouseLeave={() => setHoveredCommit(null)}
                  >
                    <div className={`flex items-stretch gap-1.5 px-3 py-1 cursor-default transition-none ${hoveredCommit === commit.hash ? 'bg-white/5' : ''}`}>
                      {/* Graph Column */}
                      <div className="w-5 flex flex-col items-center justify-center relative flex-shrink-0">
                        {/* Upper vertical line */}
                        {index > 0 && (
                          <div className="absolute bottom-1/2 left-1/2 w-[2px] h-full bg-[#3c3c3c] -translate-x-1/2" />
                        )}
                        {/* Lower vertical line */}
                        {index < commits.length - 1 && (
                          <div className="absolute top-1/2 left-1/2 w-[2px] h-full bg-[#3c3c3c] -translate-x-1/2" />
                        )}

                        {/* Commit dot */}
                        <div
                          className="w-2.5 h-2.5 rounded-full relative z-10 box-content"
                          style={{
                            backgroundColor: color,
                            border: `2.5px solid var(--app-bg)`
                          }}
                        />
                      </div>

                      {/* Content Column */}
                      <div className="flex-1 min-w-0 py-0.5 flex flex-col pl-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] text-[#ececec] truncate font-medium tracking-wide">
                            {commit.message.split('\n')[0].slice(0, 60)}
                            {commit.message.length > 60 && '...'}
                          </span>
                          {/* Branch refs */}
                          {commit.refs.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-0.5 mb-0.5 flex-shrink-0">
                              {commit.refs.slice(0, 2).map((ref, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-1.5 py-[1px] rounded-[3px] truncate max-w-28 whitespace-nowrap border"
                                  style={{
                                    borderColor: `${color}80`,
                                    color: color,
                                    backgroundColor: 'transparent'
                                  }}
                                >
                                  {ref}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5">
                          <span className="font-mono text-neutral-400">{shortenHash(commit.hash)}</span>
                          <span className="text-[#3c3c3c]">|</span>
                          <span className="truncate max-w-[120px]">{commit.author}</span>
                          <span className="text-[#3c3c3c]">|</span>
                          <span>{formatDate(commit.date)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Unified Hover Tooltip */}
                    {hoveredCommit === commit.hash && (
                      <div 
                        className="absolute left-10 top-full mt-1 z-50 w-80 bg-app-panel border border-app-border rounded-md shadow-2xl p-3 flex flex-col gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Upper Section: Author & Hash Actions */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-neutral-300 text-xs">
                            <User className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="font-medium">{commit.author}</span>
                            <span className="text-neutral-500">&lt;{commit.email}&gt;</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-neutral-300 text-xs">
                            <Clock className="w-3.5 h-3.5 text-neutral-500" />
                            <span>{commit.date}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 justify-between mt-2 pt-2 border-t border-app-border">
                             <div className="flex items-center gap-1.5 text-neutral-400 font-mono text-[10px] truncate max-w-[160px]">
                              <Hash className="w-3 h-3 text-neutral-500" />
                              <span className="truncate">{commit.full_hash}</span>
                             </div>
                             <div className="flex items-center gap-2">
                                <button
                                  onClick={() => navigator.clipboard.writeText(commit.full_hash)}
                                  className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-neutral-300 transition-colors border border-white/5"
                                >
                                  Copy
                                </button>
                                {onCommitSelect && (
                                  <button
                                    onClick={() => onCommitSelect(commit.full_hash)}
                                    className="text-[10px] bg-app-accent/20 hover:bg-app-accent/30 text-app-accent px-2 py-1 rounded transition-colors"
                                  >
                                    View
                                  </button>
                                )}
                             </div>
                          </div>
                        </div>

                        {/* Lower Section: File Changes */}
                        {commitFiles[commit.hash] && (
                          <div className="border-t border-app-border pt-2">
                            <div className="text-[10px] font-semibold text-neutral-500 mb-1.5 uppercase tracking-wider">File Changes</div>
                            <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
                              {commitFiles[commit.hash].slice(0, 10).map((file, idx) => (
                                <div 
                                  key={idx} 
                                  className="flex items-center justify-between gap-2 py-1 px-1.5 -mx-1.5 rounded hover:bg-white/5 cursor-pointer group"
                                  onClick={() => onFileSelect?.(commit.full_hash, file.path)}
                                >
                                  <span className="text-neutral-300 text-xs truncate flex-1 group-hover:text-white transition-colors">{file.path}</span>
                                  <div className="flex items-center gap-1.5 text-[10px] flex-shrink-0">
                                    {file.additions > 0 && <span className="text-[#89d185]">+{file.additions}</span>}
                                    {file.deletions > 0 && <span className="text-[#f14c4c]">-{file.deletions}</span>}
                                    <span className={`w-3.5 text-center font-bold ${
                                      file.status === 'A' ? 'text-[#89d185]' :
                                      file.status === 'D' ? 'text-[#f14c4c]' : 'text-[#cca700]'
                                    }`}>
                                      {file.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {commitFiles[commit.hash].length > 10 && (
                                <div className="text-neutral-500 text-[10px] pt-1 text-center bg-white/5 rounded py-1 mt-1">
                                  + {commitFiles[commit.hash].length - 10} more files
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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