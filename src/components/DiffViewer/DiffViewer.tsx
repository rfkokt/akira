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
  onDiscard?: () => void;
  diffContent?: string;
  workspacePath?: string;
  showStaged?: boolean;
}

export function DiffViewer({ task, isOpen, onClose, onDiscard, diffContent, workspacePath }: DiffViewerProps) {
  const [parsedDiff, setParsedDiff] = useState<DiffLine[]>([]);
  const [copied, setCopied] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_diffType, setDiffType] = useState<'uncommitted' | 'staged'>('uncommitted');
  const [discarding, setDiscarding] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleDiscard = async () => {
    setShowDiscardConfirm(false)
    if (!workspacePath) return

    setDiscarding(true)
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        command: 'git',
        args: ['checkout', '--', '.'],
        cwd: workspacePath,
      })
      
      if (result.success) {
        onDiscard?.()
        onClose()
      } else {
        setError('Failed to discard changes: ' + result.output)
      }
    } catch (err) {
      setError('Failed to discard changes: ' + String(err))
    } finally {
      setDiscarding(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !task) return;
    
    const fetchDiff = async () => {
      if (diffContent) {
        parseDiff(diffContent);
        return;
      }
      
      if (!workspacePath) {
        console.log('[DiffViewer] No workspace path provided');
        setError('No workspace selected');
        setParsedDiff([]);
        return;
      }
      
      console.log('[DiffViewer] Fetching diff from:', workspacePath);
      setLoading(true);
      setError(null);
      
      try {
        // First check unstaged changes
        const unstagedResult = await invoke<GitDiffResult>('git_get_diff', { cwd: workspacePath });
        console.log('[DiffViewer] Unstaged result:', unstagedResult);
        
        if (unstagedResult.has_changes) {
          setDiffType('uncommitted');
          parseDiff(unstagedResult.diff);
        } else {
          // Check staged changes
          const stagedResult = await invoke<GitDiffResult>('git_get_staged_diff', { cwd: workspacePath });
          console.log('[DiffViewer] Staged result:', stagedResult);
          
          if (stagedResult.has_changes) {
            setDiffType('staged');
            parseDiff(stagedResult.diff);
          } else {
            setParsedDiff([]);
            setError('No uncommitted or staged changes found');
          }
        }
      } catch (err) {
        setError(`Failed to get diff: ${err}`);
        console.error('Git diff error:', err);
      } finally {
        setLoading(false);
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
            <div className="flex gap-2">
              <button
                onClick={() => setShowDiscardConfirm(true)}
                disabled={discarding}
                className="px-3 py-1.5 rounded text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 font-geist transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {discarding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Discard
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded text-xs font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80">
          <div className="bg-[#1e1e1e] rounded-lg border border-red-500/30 shadow-2xl w-full max-w-sm">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-red-400 font-geist mb-2">Discard Changes?</h3>
              <p className="text-xs text-neutral-400 font-geist">
                This will revert all uncommitted changes. This action cannot be undone.
              </p>
            </div>
            <div className="px-4 py-3 border-t border-white/5 flex justify-end gap-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 rounded text-xs font-medium text-neutral-400 hover:text-white font-geist transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscard}
                disabled={discarding}
                className="px-4 py-2 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 font-geist transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {discarding && <Loader2 className="w-3 h-3 animate-spin" />}
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
