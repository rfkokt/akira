import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, FileText, X } from 'lucide-react';
import { useWorkspaceStore } from '@/store';

interface DiffViewerProps {
  commitHash: string;
  filePath: string;
  onClose?: () => void;
  showHeader?: boolean;
}

interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header' | 'hunk';
  content: string;
  oldNum?: number;
  newNum?: number;
}

export function DiffViewer({ commitHash, filePath, onClose, showHeader = true }: DiffViewerProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDiff = async () => {
      if (!activeWorkspace?.folder_path) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const result = await invoke<string>('git_show_file_diff_patch', {
          cwd: activeWorkspace.folder_path,
          commit: commitHash,
          filePath: filePath,
        });
        setDiff(result);
      } catch (err) {
        console.error('Failed to fetch diff:', err);
        setError(err instanceof Error ? err.message : 'Failed to load diff');
      } finally {
        setLoading(false);
      }
    };

    fetchDiff();
  }, [activeWorkspace, commitHash, filePath]);

  const parseDiff = (diffText: string): DiffLine[] => {
    const lines: DiffLine[] = [];
    const diffLines = diffText.split('\n');
    
    let oldNum = 0;
    let newNum = 0;
    
    for (const line of diffLines) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldNum = parseInt(match[1]);
          newNum = parseInt(match[2]);
        }
        lines.push({ type: 'hunk', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        lines.push({ type: 'add', content: line.substring(1), newNum: newNum++ });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        lines.push({ type: 'delete', content: line.substring(1), oldNum: oldNum++ });
      } else if (line.startsWith(' ')) {
        lines.push({ type: 'context', content: line.substring(1), oldNum: oldNum++, newNum: newNum++ });
      } else if (line === '') {
        lines.push({ type: 'context', content: '', oldNum: oldNum++, newNum: newNum++ });
      } else {
        lines.push({ type: 'context', content: line, oldNum: oldNum++, newNum: newNum++ });
      }
    }
    
    return lines;
  };

  const diffLines = parseDiff(diff);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-transparent">
      {showHeader && (
        <div className="px-4 py-2 border-b border-app-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-app-accent" />
            <span className="text-sm font-medium text-white font-geist truncate">
              {filePath}
            </span>
            <span className="text-xs text-neutral-500 font-mono bg-neutral-800 px-1.5 py-0.5 rounded">
              {commitHash.slice(0, 7)}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      
      <div className="flex-1 overflow-auto">
        <div className="font-mono text-xs">
          {diffLines.map((line, i) => {
            let bgColor = 'transparent';
            let textColor = 'text-neutral-300';
            
            if (line.type === 'header') {
              bgColor = 'bg-neutral-800/50';
              textColor = 'text-neutral-500';
            } else if (line.type === 'hunk') {
              bgColor = 'bg-app-accent/10';
              textColor = 'text-app-accent';
            } else if (line.type === 'add') {
              bgColor = 'bg-green-500/10';
              textColor = 'text-green-400';
            } else if (line.type === 'delete') {
              bgColor = 'bg-red-500/10';
              textColor = 'text-red-400';
            }

            return (
              <div
                key={i}
                className={`flex hover:bg-white/5 ${bgColor}`}
              >
                {/* Line numbers */}
                <div className="w-10 shrink-0 text-right pr-2 text-neutral-600 select-none border-r border-neutral-800">
                  {line.type === 'add' && line.newNum !== undefined && (
                    <span>{line.newNum}</span>
                  )}
                  {line.type === 'delete' && line.oldNum !== undefined && (
                    <span>{line.oldNum}</span>
                  )}
                  {line.type === 'context' && line.oldNum !== undefined && (
                    <span>{line.oldNum}</span>
                  )}
                </div>
                
                {/* Diff prefix */}
                <div className={`w-4 shrink-0 text-center select-none ${textColor}`}>
                  {line.type === 'add' && '+'}
                  {line.type === 'delete' && '-'}
                </div>
                
                {/* Content */}
                <div className={`pl-2 whitespace-pre ${textColor}`}>
                  {line.content || ' '}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}