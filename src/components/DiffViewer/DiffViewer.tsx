import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Copy, Check, ChevronDown, ChevronRight, Loader2, Plus, Minus, FileText, GitBranch, AlertCircle, Eye, EyeOff, RefreshCw, Clock } from 'lucide-react';
import type { Task } from '@/types';
import type { AITaskState } from '@/store/aiChatStore';
import { Button } from '@/components/ui/button';

interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  hunks: ChangeHunk[];
}

interface ChangeHunk {
  oldStart: number;
  newStart: number;
  lines: ChangeLine[];
}

interface ChangeLine {
  type: 'added' | 'removed' | 'context';
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
  taskState?: AITaskState | null;
  prBranch?: string | null;
}

interface PRDiffResult {
  diff: string;
  has_changes: boolean;
  changed_files: string[];
}

type LoadingStep = 'initial' | 'fetching' | 'parsing' | 'complete';

export function DiffViewer({ task, isOpen, onClose, onDiscard, diffContent, workspacePath, taskState, prBranch }: DiffViewerProps) {
  const [parsedFiles, setParsedFiles] = useState<FileChange[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('initial');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const handleDiscard = async () => {
    setShowDiscardConfirm(false);
    if (!workspacePath) return;

    setDiscarding(true);
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        command: 'git',
        args: ['checkout', '--', '.'],
        cwd: workspacePath,
      });

      if (result.success) {
        onDiscard?.();
        onClose();
      } else {
        setError('Gagal membatalkan perubahan: ' + result.output);
      }
    } catch (err) {
      setError('Gagal membatalkan perubahan: ' + String(err));
    } finally {
      setDiscarding(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !task) return;

    const fetchDiff = async () => {
      if (diffContent) {
        setLoading(true);
        setLoadingStep('parsing');
        setLoadingMessage('Memproses perubahan...');
        parseDiff(diffContent);
        setLoading(false);
        return;
      }

      if (!workspacePath) {
        setError('Tidak ada workspace yang dipilih');
        setParsedFiles([]);
        return;
      }

      setLoading(true);
      setLoadingStep('initial');
      setLoadingMessage('Memulai...');
      setError(null);
      startTimeRef.current = Date.now();
      setElapsedTime(0);

      // Start elapsed time counter
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      try {
        if (prBranch || taskState?.prBranch) {
          const branch = prBranch || taskState!.prBranch;
          setLoadingStep('fetching');
          setLoadingMessage(`Mengambil diff dari branch: ${branch}...`);

          try {
            const prDiffResult = await invoke<PRDiffResult>('git_get_pr_diff', {
              cwd: workspacePath,
              branch: branch
            });

            if (prDiffResult.has_changes) {
              setLoadingStep('parsing');
              setLoadingMessage('Memproses perubahan...');
              parseDiff(prDiffResult.diff);
            } else {
              setParsedFiles([]);
              setError('Tidak ada perubahan di PR ini');
            }
          } catch (prErr) {
            setLoadingStep('fetching');
            setLoadingMessage('Mengambil perubahan lokal...');
            const unstagedResult = await invoke<GitDiffResult>('git_get_diff', { cwd: workspacePath });
            if (unstagedResult.has_changes) {
              parseDiff(unstagedResult.diff);
            } else {
              const stagedResult = await invoke<GitDiffResult>('git_get_staged_diff', { cwd: workspacePath });
              if (stagedResult.has_changes) {
                parseDiff(stagedResult.diff);
              } else {
                setParsedFiles([]);
                setError('Tidak ada perubahan untuk ditampilkan');
              }
            }
          }
        } else {
          setLoadingStep('fetching');
          setLoadingMessage('Mengambil perubahan...');
          const unstagedResult = await invoke<GitDiffResult>('git_get_diff', { cwd: workspacePath });

          if (unstagedResult.has_changes) {
            parseDiff(unstagedResult.diff);
          } else {
            const stagedResult = await invoke<GitDiffResult>('git_get_staged_diff', { cwd: workspacePath });

            if (stagedResult.has_changes) {
              parseDiff(stagedResult.diff);
            } else {
              setParsedFiles([]);
              setError('Tidak ada perubahan untuk ditampilkan');
            }
          }
        }
      } catch (err) {
        setError(`Gagal mengambil diff: ${err}`);
      } finally {
        setLoading(false);
        setLoadingStep('complete');
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    fetchDiff();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOpen, task, diffContent, workspacePath]);

  const parseDiff = (content: string) => {
    const files: FileChange[] = [];
    const fileRegex = /diff --git a\/(.+?) b\/(.+)/g;

    let match;
    const fileMatches: { path: string; start: number; end: number }[] = [];

    while ((match = fileRegex.exec(content)) !== null) {
      if (fileMatches.length > 0) {
        fileMatches[fileMatches.length - 1].end = match.index;
      }
      fileMatches.push({ path: match[1], start: match.index, end: content.length });
    }

    for (let i = 0; i < fileMatches.length; i++) {
      const { path, start, end } = fileMatches[i];
      const fileContent = content.slice(start, end);
      const fileChange: FileChange = {
        path,
        additions: 0,
        deletions: 0,
        hunks: [],
      };

      const lines = fileContent.split('\n');
      let currentHunk: ChangeHunk | null = null;

      for (const line of lines) {
        if (line.startsWith('@@')) {
          if (currentHunk) {
            fileChange.hunks.push(currentHunk);
          }
          const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          currentHunk = {
            oldStart: hunkMatch ? parseInt(hunkMatch[1]) : 0,
            newStart: hunkMatch ? parseInt(hunkMatch[2]) : 0,
            lines: [],
          };
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          fileChange.additions++;
          if (currentHunk) {
            currentHunk.lines.push({
              type: 'added',
              content: line.slice(1),
            });
          }
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          fileChange.deletions++;
          if (currentHunk) {
            currentHunk.lines.push({
              type: 'removed',
              content: line.slice(1),
            });
          }
        } else if (line.startsWith(' ') || (!line.startsWith('diff') && !line.startsWith('index') && !line.startsWith('---') && !line.startsWith('+++'))) {
          if (currentHunk && line.length > 1) {
            currentHunk.lines.push({
              type: 'context',
              content: line.slice(1) || ' ',
            });
          }
        }
      }

      if (currentHunk) {
        fileChange.hunks.push(currentHunk);
      }

      files.push(fileChange);
    }

    setParsedFiles(files);
    setExpandedFiles(new Set(files.map(f => f.path)));
  };

  const handleCopy = () => {
    const text = parsedFiles.map(file => {
      let output = `📄 ${file.path}\n`;
      output += `   ➕ ${file.additions} penambahan  ➖ ${file.deletions} penghapusan\n\n`;

      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added') {
            output += `+ ${line.content}\n`;
          } else if (line.type === 'removed') {
            output += `- ${line.content}\n`;
          }
        }
        output += '\n';
      }
      return output;
    }).join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFile = (path: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFiles(newExpanded);
  };

  const getTotalChanges = () => {
    const totalAdditions = parsedFiles.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = parsedFiles.reduce((sum, f) => sum + f.deletions, 0);
    return { additions: totalAdditions, deletions: totalDeletions, files: parsedFiles.length };
  };

  if (!isOpen || !task) return null;

  const { additions, deletions, files } = getTotalChanges();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            {loading ? (
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            ) : (
              <GitBranch className="w-5 h-5 text-[#0e639c]" />
            )}
            <div>
              <h3 className="text-sm font-semibold text-white font-geist">
                {task.title}
              </h3>
              {loading ? (
                <p className="text-xs text-blue-400 font-geist flex items-center gap-1">
                  {loadingMessage}
                  {elapsedTime > 0 && <span className="text-neutral-500">({elapsedTime}s)</span>}
                </p>
              ) : error ? (
                <p className="text-xs text-yellow-500 font-geist">{error}</p>
              ) : parsedFiles.length > 0 ? (
                <p className="text-xs text-neutral-500 font-geist">
                  {files} file diubah • {additions} penambahan • {deletions} penghapusan
                </p>
              ) : (
                <p className="text-xs text-neutral-500 font-geist">
                  Tidak ada perubahan
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {parsedFiles.length > 0 && (
              <div className="flex items-center bg-white/5 rounded-md p-0.5 mr-2">
                <Button
                  size="sm"
                  onClick={() => setViewMode('summary')}
                  className={viewMode === 'summary' ? 'bg-[#0e639c]' : 'bg-transparent'}
                >
                  Ringkasan
                </Button>
                <Button
                  size="sm"
                  onClick={() => setViewMode('detail')}
                  className={viewMode === 'detail' ? 'bg-[#0e639c]' : 'bg-transparent'}
                >
                  Detail
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowContext(!showContext)}
            >
              {showContext ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showContext ? 'Sembunyikan' : 'Tampilkan'} konteks
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={parsedFiles.length === 0}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Tersalin!' : 'Salin'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <LoadingState step={loadingStep} message={loadingMessage} elapsedTime={elapsedTime} />
          ) : parsedFiles.length > 0 ? (
            viewMode === 'summary' ? (
              <SummaryView parsedFiles={parsedFiles} expandedFiles={expandedFiles} toggleFile={toggleFile} />
            ) : (
              <DetailView
                parsedFiles={parsedFiles}
                expandedFiles={expandedFiles}
                toggleFile={toggleFile}
                showContext={showContext}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm font-medium">{error || 'Tidak ada perubahan'}</p>
              <p className="text-xs mt-1">
                {error ? 'Hubungi developer jika ini tidak sesuai' : 'Buat perubahan untuk melihatnya di sini'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {parsedFiles.length > 0 && (
          <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-neutral-500 font-geist">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {additions} penambahan
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {deletions} penghapusan
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {files} file
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setShowDiscardConfirm(true)}
                disabled={discarding}
                className="text-red-400 bg-red-500/10 hover:bg-red-500/20"
              >
                {discarding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Batalkan Semua
              </Button>
              <Button
                size="sm"
                onClick={onClose}
                className="bg-[#0e639c] hover:bg-[#1177bb]"
              >
                Tutup
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80">
          <div className="bg-[#1e1e1e] rounded-lg border border-red-500/30 shadow-2xl w-full max-w-sm">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-red-400 font-geist mb-2">Batalkan Perubahan?</h3>
              <p className="text-xs text-neutral-400 font-geist">
                Semua perubahan yang belum disimpan akan dikembalikan. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="px-4 py-3 border-t border-white/5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Batal
              </Button>
              <Button
                onClick={handleDiscard}
                disabled={discarding}
                className="bg-red-600 hover:bg-red-700"
              >
                {discarding && <Loader2 className="w-3 h-3 animate-spin" />}
                Ya, Batalkan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryView({
  parsedFiles,
  expandedFiles,
  toggleFile,
}: {
  parsedFiles: FileChange[];
  expandedFiles: Set<string>;
  toggleFile: (path: string) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      {parsedFiles.map((file) => (
        <div
          key={file.path}
          className="bg-[#252526] rounded-lg border border-white/5 overflow-hidden"
        >
          <Button
            variant="ghost"
            className="w-full justify-start h-auto py-3 px-4 rounded-none"
            onClick={() => toggleFile(file.path)}
          >
            <div className="flex items-center gap-3 w-full">
              {expandedFiles.has(file.path) ? (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-500" />
              )}
              <FileText className="w-4 h-4 text-[#0e639c]" />
              <span className="text-sm text-white font-medium font-geist">{file.path}</span>
              <div className="flex items-center gap-3 text-xs ml-auto">
                <span className="flex items-center gap-1 text-green-400">
                  <Plus className="w-3 h-3" />
                  {file.additions}
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <Minus className="w-3 h-3" />
                  {file.deletions}
                </span>
              </div>
            </div>
          </Button>

          {expandedFiles.has(file.path) && (
            <div className="px-4 py-3 border-t border-white/5 bg-[#1e1e1e]">
              <div className="space-y-2">
                {file.hunks.map((hunk, hunkIdx) => (
                  <div key={hunkIdx} className="space-y-1">
                    <div className="text-xs text-neutral-500 font-geist px-2">
                      Baris {hunk.oldStart} - {hunk.oldStart + hunk.lines.filter(l => l.type === 'removed').length + hunk.lines.filter(l => l.type === 'context').length}
                    </div>
                    {hunk.lines.map((line, lineIdx) => (
                      <div
                        key={lineIdx}
                        className={`
                          font-mono text-xs px-3 py-0.5 rounded
                          ${line.type === 'added' ? 'bg-green-500/10 text-green-300' : ''}
                          ${line.type === 'removed' ? 'bg-red-500/10 text-red-300' : ''}
                          ${line.type === 'context' ? 'text-neutral-400' : ''}
                        `}
                      >
                        <span className="inline-block w-4 text-neutral-600">
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        {line.content || ' '}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailView({
  parsedFiles,
  expandedFiles,
  toggleFile,
  showContext,
}: {
  parsedFiles: FileChange[];
  expandedFiles: Set<string>;
  toggleFile: (path: string) => void;
  showContext: boolean;
}) {
  return (
    <div className="font-mono text-xs">
      {parsedFiles.map((file) => (
        <div key={file.path}>
          <Button
            variant="ghost"
            className="w-full justify-start h-auto py-2 px-4 rounded-none bg-[#252526] hover:bg-[#2a2d2e] sticky top-0 z-10"
            onClick={() => toggleFile(file.path)}
          >
            <div className="flex items-center gap-3 w-full">
              {expandedFiles.has(file.path) ? (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-500" />
              )}
              <FileText className="w-4 h-4 text-[#0e639c]" />
              <span className="text-[#0e639c]">{file.path}</span>
              <span className="flex items-center gap-2 ml-auto text-xs">
                <span className="text-green-400">+{file.additions}</span>
                <span className="text-red-400">-{file.deletions}</span>
              </span>
            </div>
          </Button>

          {expandedFiles.has(file.path) && (
            <div>
              {file.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx}>
                  <div className="px-3 py-1 bg-[#1e1e1e] text-[#0e639c] border-b border-white/5">
                    @@ -{hunk.oldStart},... +{hunk.newStart},... @@
                  </div>
                  {hunk.lines.map((line, lineIdx) => {
                    if (!showContext && line.type === 'context') return null;

                    return (
                      <div
                        key={lineIdx}
                        className={`
                          flex px-0
                          ${line.type === 'added' ? 'bg-green-500/10' : ''}
                          ${line.type === 'removed' ? 'bg-red-500/10' : ''}
                          ${line.type === 'context' && !showContext ? 'hidden' : ''}
                        `}
                      >
                        <span className="w-12 text-right pr-3 py-0.5 text-neutral-600 select-none border-r border-white/5">
                          {line.oldLineNum || ''}
                        </span>
                        <span className="w-12 text-right pr-3 py-0.5 text-neutral-600 select-none border-r border-white/5">
                          {line.newLineNum || ''}
                        </span>
                        <span className="w-6 text-center py-0.5 text-neutral-600">
                          {line.type === 'added' && <span className="text-green-500">+</span>}
                          {line.type === 'removed' && <span className="text-red-500">-</span>}
                          {line.type === 'context' && <span className="text-neutral-600"> </span>}
                        </span>
                        <span
                          className={`
                            px-2 py-0.5 whitespace-pre
                            ${line.type === 'added' ? 'text-green-300' : ''}
                            ${line.type === 'removed' ? 'text-red-300' : ''}
                            ${line.type === 'context' ? 'text-neutral-300' : ''}
                          `}
                        >
                          {line.content || ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LoadingState({ 
  step, 
  message, 
  elapsedTime 
}: { 
  step: LoadingStep; 
  message: string; 
  elapsedTime: number 
}) {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} detik`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}d`;
  };

  const getStepIcon = () => {
    switch (step) {
      case 'initial':
        return <GitBranch className="w-6 h-6 text-blue-400 animate-pulse" />;
      case 'fetching':
        return <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />;
      case 'parsing':
        return <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />;
      default:
        return <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />;
    }
  };

  const getStepProgress = () => {
    switch (step) {
      case 'initial': return 25;
      case 'fetching': return 50;
      case 'parsing': return 75;
      default: return 100;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-[#1e1e1e]">
      <div className="w-full max-w-md bg-[#252526] rounded-xl p-8 border border-white/10 shadow-xl">
        <div className="flex items-center justify-center mb-6">
          {getStepIcon()}
        </div>
        
        <div className="text-center mb-4">
          <p className="text-white font-semibold font-geist text-lg mb-2">{message}</p>
          <p className="text-neutral-400 text-sm font-geist flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            {formatTime(elapsedTime)}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-neutral-800 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out relative"
            style={{ width: `${getStepProgress()}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* Step labels */}
        <div className="flex justify-between mt-3 text-xs text-neutral-500 font-geist">
          <span className={step === 'initial' ? 'text-blue-400' : ''}>Memulai</span>
          <span className={step === 'fetching' ? 'text-blue-400' : ''}>Mengambil Data</span>
          <span className={step === 'parsing' ? 'text-blue-400' : ''}>Memproses</span>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <div className={`w-3 h-3 rounded-full transition-all ${step === 'initial' ? 'bg-blue-400 scale-125' : 'bg-neutral-600'}`} />
          <div className={`w-3 h-3 rounded-full transition-all ${step === 'fetching' ? 'bg-blue-400 scale-125' : 'bg-neutral-600'}`} />
          <div className={`w-3 h-3 rounded-full transition-all ${step === 'parsing' ? 'bg-blue-400 scale-125' : 'bg-neutral-600'}`} />
        </div>

        {elapsedTime > 5 && (
          <div className="mt-6 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <p className="text-yellow-500 text-xs text-center font-geist">
              ⚡ Sedang mengambil banyak data dari remote...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
