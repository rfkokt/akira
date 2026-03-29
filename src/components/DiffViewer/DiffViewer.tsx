import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, FileCode, Copy, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { Task } from '@/types';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface GitDiffResult {
  diff: string;
  has_changes: boolean;
  changed_files: string[];
}

interface DiffViewerProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  diffContent?: string;
  workspacePath?: string;
}

export function DiffViewer({ task, isOpen, onClose, diffContent, workspacePath }: DiffViewerProps) {
  const [parsedDiff, setParsedDiff] = useState<DiffLine[]>([]);
  const [copied, setCopied] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !task) return;
    
    const fetchDiff = async () => {
      if (diffContent) {
        parseDiff(diffContent);
        return;
      }
      
      if (workspacePath) {
        setLoading(true);
        setError(null);
        try {
          const result = await invoke<GitDiffResult>('git_get_diff', { cwd: workspacePath });
          if (result.has_changes) {
            parseDiff(result.diff);
          } else {
            setParsedDiff([]);
            setError('No uncommitted changes found');
          }
        } catch (err) {
          setError(`Failed to get diff: ${err}`);
          console.error('Git diff error:', err);
        } finally {
          setLoading(false);
        }
      }
    };
    
    fetchDiff();
  }, [isOpen, task, diffContent, workspacePath]);

  const parseDiff = (content: string) => {
    const lines: DiffLine[] = [];
    const contentLines = content.split('\n');
    let oldLineNum = 0;
    let newLineNum = 0;

    contentLines.forEach((line) => {
      if (line.startsWith('diff --git')) {
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNum = parseInt(match[1]) - 1;
          newLineNum = parseInt(match[2]) - 1;
        }
        lines.push({ type: 'header', content: line });
      } else if (line.startsWith('+')) {
        newLineNum++;
        lines.push({
          type: 'added',
          content: line.substring(1),
          oldLineNum: undefined,
          newLineNum,
        });
      } else if (line.startsWith('-')) {
        oldLineNum++;
        lines.push({
          type: 'removed',
          content: line.substring(1),
          oldLineNum,
          newLineNum: undefined,
        });
      } else if (line.startsWith('\\')) {
        lines.push({ type: 'header', content: line });
      } else {
        oldLineNum++;
        newLineNum++;
        lines.push({
          type: 'unchanged',
          content: line,
          oldLineNum,
          newLineNum,
        });
      }
    });

    setParsedDiff(lines);
  };

  const handleCopy = () => {
    const text = parsedDiff.map(line => {
      if (line.type === 'added') return '+' + line.content;
      if (line.type === 'removed') return '-' + line.content;
      return line.content;
    }).join('\n');
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLineCount = () => {
    const added = parsedDiff.filter(l => l.type === 'added').length;
    const removed = parsedDiff.filter(l => l.type === 'removed').length;
    return { added, removed };
  };

  if (!isOpen || !task) return null;

  const { added, removed } = getLineCount();
  const visibleLines = showUnchanged 
    ? parsedDiff 
    : parsedDiff.filter(l => l.type !== 'unchanged');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <FileCode className="w-5 h-5 text-[#0e639c]" />
            <div>
              <h3 className="text-sm font-semibold text-white font-geist">
                Changes for: {task.title}
              </h3>
              {loading ? (
                <p className="text-[10px] text-neutral-500 font-geist flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading diff...
                </p>
              ) : error ? (
                <p className="text-[10px] text-yellow-500 font-geist">{error}</p>
              ) : parsedDiff.length > 0 ? (
                <p className="text-[10px] text-neutral-500 font-geist">
                  {added} additions, {removed} deletions
                </p>
              ) : (
                <p className="text-[10px] text-neutral-500 font-geist">
                  No changes to display
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {parsedDiff.length > 0 && (
              <button
                onClick={() => setShowUnchanged(!showUnchanged)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-geist"
              >
                {showUnchanged ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {showUnchanged ? 'Hide' : 'Show'} unchanged
              </button>
            )}
            <button
              onClick={handleCopy}
              disabled={parsedDiff.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-geist disabled:opacity-50"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto font-mono text-xs">
          {loading ? (
            <div className="flex items-center justify-center h-full text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading changes...
            </div>
          ) : parsedDiff.length > 0 ? (
            <table className="w-full">
              <tbody>
                {visibleLines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={`
                      ${line.type === 'added' ? 'bg-green-500/10' : ''}
                      ${line.type === 'removed' ? 'bg-red-500/10' : ''}
                      ${line.type === 'header' ? 'bg-[#252526]' : ''}
                      hover:bg-white/5 transition-colors
                    `}
                  >
                    <td className="w-12 text-right pr-3 py-0.5 text-neutral-600 select-none border-r border-white/5">
                      {line.oldLineNum !== undefined ? line.oldLineNum : ''}
                    </td>
                    <td className="w-12 text-right pr-3 py-0.5 text-neutral-600 select-none border-r border-white/5">
                      {line.newLineNum !== undefined ? line.newLineNum : ''}
                    </td>
                    <td className="w-6 text-center py-0.5 select-none">
                      {line.type === 'added' && <span className="text-green-500">+</span>}
                      {line.type === 'removed' && <span className="text-red-500">-</span>}
                      {line.type === 'unchanged' && <span className="text-neutral-600"> </span>}
                      {line.type === 'header' && <span className="text-[#0e639c]">@</span>}
                    </td>
                    <td 
                      className={`
                        px-3 py-0.5 whitespace-pre
                        ${line.type === 'added' ? 'text-green-300' : ''}
                        ${line.type === 'removed' ? 'text-red-300' : ''}
                        ${line.type === 'header' ? 'text-[#0e639c]' : ''}
                        ${line.type === 'unchanged' ? 'text-neutral-300' : ''}
                      `}
                    >
                      {line.content || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              {error ? (
                <>
                  <FileCode className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">{error}</p>
                </>
              ) : (
                <>
                  <FileCode className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">No uncommitted changes</p>
                  <p className="text-xs mt-1">Make some edits to see them here</p>
                </>
              )}
            </div>
          )}
        </div>

        {parsedDiff.length > 0 && (
          <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px] text-neutral-500 font-geist">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500/50" />
                {added} additions
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500/50" />
                {removed} deletions
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
