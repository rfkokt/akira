import { useState, useEffect } from 'react'
import { X, MessageSquare, FileDiff, GitMerge, Loader2, Bot, AlertTriangle, Wand2 } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useWorkspaceStore, useAIChatStore, useTaskStore } from '@/store'
import { useConfigStore } from '@/store/configStore'
import type { Task } from '@/types'
import { Button } from '@/components/ui/button'
import { generateCodeReview } from '@/lib/commitMessage'

interface CodeReviewModalProps {
  task: Task
  isOpen: boolean
  onClose: () => void
  onViewDiff: (task: Task) => void
  onOpenChat: (task: Task) => void
  onComplete: (task: Task) => void
}

export function CodeReviewModal({ 
  task, 
  isOpen, 
  onClose,
  onViewDiff,
  onOpenChat,
  onComplete
}: CodeReviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [reviewScore, setReviewScore] = useState<number | null>(null)
  const [reviewMarkdown, setReviewMarkdown] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const { activeWorkspace } = useWorkspaceStore()
  const { taskStates, sendMessage } = useAIChatStore()
  const { moveTask } = useTaskStore()
  const config = useConfigStore((state) => state.config)

  useEffect(() => {
    if (!isOpen || !task || !activeWorkspace) return
    
    // reset state
    setReviewScore(null)
    setReviewMarkdown('')
    setErrorMsg(null)

    const fetchAndReview = async () => {
      setLoading(true)
      try {
        const taskState = taskStates[task.id];
        const featureBranch = task.pr_branch || task.merge_source_branch || taskState?.prBranch;
        
        if (!featureBranch) {
          setErrorMsg("Could not determine feature branch for this task.")
          setLoading(false)
          return
        }

        const mainCheck = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
          command: 'git',
          args: ['show-ref', '--verify', '--quiet', 'refs/heads/main'],
          cwd: activeWorkspace.folder_path,
        }).catch(() => ({ success: false, stdout: '' }));
        
        const baseBranch = mainCheck.success ? 'main' : 'master';

        const diffCmd = await invoke<{ success: boolean; stdout: string }>('run_shell_command', {
          command: 'git',
          args: ['diff', `${baseBranch}...${featureBranch}`],
          cwd: activeWorkspace.folder_path,
        });

        if (!diffCmd.success || !diffCmd.stdout.trim()) {
          setErrorMsg("No code changes found in this branch compared to main.")
          setLoading(false)
          return
        }

        // Send diff to Groq
        const groqApiKey = config?.groq_api_key || undefined;
        const { score, reviewMarkdown } = await generateCodeReview(diffCmd.stdout, groqApiKey)
        
        setReviewScore(score)
        setReviewMarkdown(reviewMarkdown)

      } catch (err) {
        console.error(err)
        setErrorMsg(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchAndReview()
  }, [isOpen, task, activeWorkspace, taskStates])

  if (!isOpen) return null

  const handleAutoFix = async () => {
    try {
      setLoading(true);
      const fixPrompt = `I got some Code Review feedback! Please implement the suggestions mentioned below to achieve a perfect 100/100 score on this branch:\n\n${reviewMarkdown}`;
      
      // Move task backward to "in-progress" so the AI engine can iterate on it
      await moveTask(task.id, 'in-progress');
      
      // Start the actual execution loop automatically
      await sendMessage(task.id, fixPrompt);

      // Transition UI
      onOpenChat(task);
      onClose();
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to start Auto-Fix pipeline.");
      setLoading(false);
    }
  }

  // Ring color logic
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-500 border-green-500'
    if (score >= 60) return 'text-amber-500 border-amber-500'
    return 'text-red-500 border-red-500'
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-app-overlay-dim backdrop-blur-[2px]">
      <div className="bg-app-panel rounded-xl border border-app-border shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-semibold text-white">AI Code Review Audit</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          <div className="mb-2">
            <label className="block text-xs text-neutral-500 mb-1">Target Task</label>
            <h2 className="text-lg font-medium text-white">{task.title}</h2>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm text-neutral-400">Analyzing git diff via Groq API...</p>
            </div>
          ) : errorMsg ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-200">{errorMsg}</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 items-start">
              
              {/* Score Circular Display */}
              {reviewScore !== null && (
                <div className="flex flex-col items-center shrink-0 w-32 shrink-0 pt-2">
                  <div className="relative flex items-center justify-center w-24 h-24 rounded-full border-[6px] border-app-border bg-app-surface-1">
                    <div className="absolute inset-0 rounded-full border-[6px] border-transparent" />
                    <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                      <circle
                        cx="42"
                        cy="42"
                        r="38"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="6"
                        strokeDasharray={238} // approx 2 * pi * 38
                        strokeDashoffset={238 - (238 * reviewScore) / 100}
                        className={getScoreColor(reviewScore).split(' ')[0]}
                      />
                    </svg>
                    <span className={`text-2xl font-bold ${getScoreColor(reviewScore).split(' ')[0]}`}>{reviewScore}</span>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mt-3">Quality Score</span>
                </div>
              )}

              {/* Markdown Review */}
              {reviewMarkdown && (
                <div className="flex-1 bg-gradient-to-br from-app-surface-2 to-app-surface-1 border border-app-border rounded-xl p-5 shadow-inner 
                    prose prose-invert prose-p:leading-snug prose-sm max-w-none 
                    prose-h3:text-purple-300 prose-h3:text-sm prose-h3:uppercase prose-h3:tracking-wider prose-h3:mt-0
                    prose-ul:my-2 prose-li:my-0.5 text-neutral-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {reviewMarkdown}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-app-border bg-app-surface-1 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onViewDiff(task)
                onClose()
              }}
              disabled={loading}
              className="border-neutral-700 bg-app-surface-3 hover:bg-neutral-800"
            >
              <FileDiff className="w-4 h-4 mr-2 text-neutral-400" />
              View Diff
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChat(task)
                onClose()
              }}
              disabled={loading}
              className="border-blue-900/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Discuss in Chat
            </Button>
            
            {reviewScore && reviewScore < 100 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoFix}
                disabled={loading}
                className="border-purple-900/50 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Auto-Fix Suggestions
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onComplete(task)
                onClose()
              }}
              disabled={loading || !!errorMsg}
              className="bg-green-600 hover:bg-green-700 text-white font-medium shadow-md shadow-green-900/20"
            >
              <GitMerge className="w-4 h-4 mr-2" />
              Merge Code
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
