import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight, Loader2, GitBranch, Copy, ExternalLink, FileText } from 'lucide-react';
import { useWorkspaceStore } from '@/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getGitBranches } from '@/lib/git';

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
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFile[]>>({});

  const [graphHeight, setGraphHeight] = useState(320);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      setGraphHeight((prev) => Math.max(150, Math.min(800, prev - e.movementY)));
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
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

  const loadCurrentBranch = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return null;
    try {
      const result = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
        command: 'git',
        args: ['branch', '--show-current'],
        cwd: activeWorkspace.folder_path
      });
      if (result.success) {
        return result.stdout.trim();
      }
    } catch {
       return null;
    }
    return null;
  }, [activeWorkspace]);

  const fetchBranches = useCallback(async () => {
    if (!activeWorkspace?.folder_path) return;
    try {
      const fetchedBranches = await getGitBranches(activeWorkspace.folder_path);
      setBranches(fetchedBranches);
      
      if (!selectedBranch) {
        const current = await loadCurrentBranch();
        if (current) {
           setSelectedBranch(current);
        } else if (fetchedBranches.includes('main')) {
           setSelectedBranch('main');
        } else if (fetchedBranches.includes('master')) {
           setSelectedBranch('master');
        }
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    }
  }, [activeWorkspace, loadCurrentBranch, selectedBranch]);

  useEffect(() => {
    if (expanded) {
      fetchBranches().then(() => fetchCommits());
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
    <div className="border-t border-app-border flex flex-col relative shrink-0">
      {/* Resizer Handle */}
      {expanded && (
        <div 
          className="absolute top-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-app-accent/50 active:bg-app-accent z-10 transition-colors pointer-events-auto"
          onMouseDown={(e) => {
            e.preventDefault();
            isResizingRef.current = true;
            document.body.style.cursor = 'row-resize';
          }}
        />
      )}
      
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

          <div className="overflow-auto custom-scrollbar flex-1" style={{ height: `${graphHeight}px` }}>
            {commits.map((commit, index) => {
              const color = getBranchColor(commit.refs, index);
              
              return (
                <div key={commit.hash}>
                  <div className="relative group/commit flex flex-col">
                    <div
                      className={`flex items-stretch gap-1.5 px-3 py-1 cursor-pointer transition-colors ${expandedCommit === commit.hash ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
                      onClick={() => {
                        if (expandedCommit === commit.hash) {
                           setExpandedCommit(null);
                        } else {
                           setExpandedCommit(commit.hash);
                           fetchCommitFiles(commit.hash);
                        }
                      }}
                    >
                      {/* Graph Column */}
                      <div className="w-5 flex flex-col items-center justify-center relative flex-shrink-0">
                        {/* Upper vertical line */}
                        {index > 0 && (
                          <div className="absolute bottom-1/2 left-1/2 w-[1.5px] h-full bg-[#404040] -translate-x-1/2" />
                        )}
                        {/* Lower vertical line */}
                        {index < commits.length - 1 && (
                          <div className="absolute top-1/2 left-1/2 w-[1.5px] h-full bg-[#404040] -translate-x-1/2" />
                        )}

                        {/* Commit dot */}
                        <div
                          className="w-2 h-2 rounded-full relative z-10 box-content"
                          style={{
                            backgroundColor: color,
                            border: `2px solid var(--app-bg)`
                          }}
                        />
                      </div>

                      {/* Content Column */}
                      <div className="flex-1 min-w-0 flex flex-col pl-2 pr-1 py-1 justify-center">
                        {/* Title Row */}
                        <div className="text-[13px] text-[#ececec] truncate font-medium tracking-wide">
                          {commit.message.split('\n')[0]}
                        </div>
                        
                        {/* Tags Row */}
                        {commit.refs.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {commit.refs.slice(0, 3).map((ref, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-[1px] rounded-[3px] truncate max-w-32 whitespace-nowrap border"
                                style={{
                                  borderColor: `${color}80`,
                                  color: color,
                                  backgroundColor: `${color}15`
                                }}
                              >
                                {ref}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Meta Row */}
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mt-1 mr-1">
                          <span className="font-mono text-neutral-400 shrink-0">{shortenHash(commit.hash)}</span>
                          <span className="text-[#3c3c3c] shrink-0">|</span>
                          <span className="truncate min-w-0">{commit.author}</span>
                          <span className="text-[#3c3c3c] shrink-0">|</span>
                          <span className="shrink-0">{formatDate(commit.date)}</span>
                        </div>

                        {/* EXPANSION PANEL (Inside Content Column) */}
                        {expandedCommit === commit.hash && (
                          <div 
                            className="mt-2 flex flex-col gap-2 cursor-default pb-2 w-full"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* File Changes List */}
                            {commitFiles[commit.hash] && (
                              <div className="mt-1">
                                <div className="space-y-0 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                                  {commitFiles[commit.hash].map((file, idx) => {
                                    const pathParts = file.path.split('/');
                                    const fileName = pathParts.pop();
                                    const dirPath = pathParts.join('/');
                                    
                                    return (
                                      <div 
                                        key={idx} 
                                        className="flex items-center justify-between gap-3 py-[3px] px-1.5 -mx-1.5 rounded-[3px] hover:bg-white/10 cursor-pointer group/file transition-colors"
                                        onClick={() => onFileSelect?.(commit.full_hash, file.path)}
                                      >
                                        <div className="flex items-center min-w-0 flex-1 text-[12px]">
                                          <FileText className="w-3.5 h-3.5 mr-1.5 shrink-0 text-neutral-400 group-hover/file:text-neutral-300" />
                                          <span className="text-neutral-300 group-hover/file:text-white font-medium truncate">
                                            {fileName}
                                          </span>
                                          {dirPath && (
                                            <span className="text-neutral-500/80 truncate ml-2 text-[11px]">
                                              {dirPath}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] flex-shrink-0 font-mono">
                                          {file.additions > 0 && <span className="text-[#89d185]">+{file.additions}</span>}
                                          {file.deletions > 0 && <span className="text-[#f14c4c]">-{file.deletions}</span>}
                                          <span className={`w-4 text-center font-bold ${
                                            file.status === 'A' ? 'text-[#89d185]' :
                                            file.status === 'D' ? 'text-[#f14c4c]' : 'text-[#cca700]'
                                          }`}>
                                            {file.status}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Hover Actions (Copy / View) */}
                      <div className="absolute top-1 right-2 opacity-0 group-hover/commit:opacity-100 flex items-center gap-1 z-20 bg-app-panel/90 backdrop-blur-sm p-0.5 rounded border border-white/10 shadow-md transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(commit.full_hash) }}
                          className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-[3px] transition-colors"
                          title="Copy Hash"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {onCommitSelect && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onCommitSelect(commit.full_hash) }}
                            className="w-6 h-6 flex items-center justify-center text-app-accent hover:text-white bg-app-accent/10 hover:bg-app-accent/20 rounded-[3px] transition-colors"
                            title="View Diff"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
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