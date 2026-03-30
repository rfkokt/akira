import { useState } from 'react';
import { Bot, Play, CheckCircle, GitBranch, MessageSquare, FileDiff, X } from 'lucide-react';
import type { Task } from '@/types';
import { useEngineStore } from '@/store/engineStore';
import { Button } from '@/components/ui/button';

interface AIWorkflowPanelProps {
  task: Task;
  onClose: () => void;
  onStartAI: () => void;
  onViewDiff: () => void;
  onOpenChat: () => void;
  onComplete: () => void;
}

export function AIWorkflowPanel({ 
  task, 
  onClose, 
  onStartAI, 
  onViewDiff, 
  onOpenChat, 
  onComplete 
}: AIWorkflowPanelProps) {
  const { activeEngine } = useEngineStore();
  const [showGitFlow, setShowGitFlow] = useState(false);

  const getActionsByStatus = () => {
    switch (task.status) {
      case 'todo':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#1e1e1e] rounded-lg border border-white/5">
              <Bot className="w-8 h-8 text-[#0e639c]" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white font-geist">Start AI Workflow</h4>
                <p className="text-xs text-neutral-500 font-geist">
                  AI will analyze and implement this task
                </p>
              </div>
              <Button
                onClick={onStartAI}
                disabled={!activeEngine}
                className="bg-[#0e639c] hover:bg-[#1177bb]"
              >
                <Play className="w-4 h-4" />
                Start
              </Button>
            </div>
            {!activeEngine && (
              <p className="text-xs text-yellow-500 font-geist text-center">
                Please select an AI engine first
              </p>
            )}
          </div>
        );

      case 'in-progress':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#1e1e1e] rounded-lg border border-white/5">
              <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white font-geist">AI Working...</h4>
                <p className="text-xs text-neutral-500 font-geist">
                  AI is implementing changes
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenChat}
            >
              <MessageSquare className="w-4 h-4" />
              Open Chat
            </Button>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#1e1e1e] rounded-lg border border-white/5">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white font-geist">Ready for Review</h4>
                <p className="text-xs text-neutral-500 font-geist">
                  AI has completed the task
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={onViewDiff}
              >
                <FileDiff className="w-4 h-4" />
                View Diff
              </Button>
              <Button
                variant="outline"
                onClick={onOpenChat}
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </Button>
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => setShowGitFlow(true)}
            >
              <GitBranch className="w-4 h-4" />
              Complete & Push
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#252526] rounded-lg border border-white/10 shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white font-geist">
            AI Workflow: {task.title}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4">
          {getActionsByStatus()}
        </div>
      </div>

      {/* Git Push Flow Modal */}
      {showGitFlow && (
        <GitPushFlow 
          task={task}
          onClose={() => setShowGitFlow(false)}
          onComplete={() => {
            setShowGitFlow(false);
            onComplete();
          }}
        />
      )}
    </div>
  );
}

// Git Push Flow Component
interface GitPushFlowProps {
  task: Task;
  onClose: () => void;
  onComplete: () => void;
}

function GitPushFlow({ task, onClose, onComplete }: GitPushFlowProps) {
  const [step, setStep] = useState(1);
  const [tag, setTag] = useState('');
  const [commitMsg, setCommitMsg] = useState(`feat: ${task.title}`);

  const steps = [
    { id: 1, label: 'Stage Changes', description: 'Add modified files to staging area' },
    { id: 2, label: 'Commit', description: 'Create commit with message' },
    { id: 3, label: 'Tag', description: 'Add version tag' },
    { id: 4, label: 'Push', description: 'Push to remote repository' },
  ];

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-white/10 shadow-2xl w-full max-w-lg">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white font-geist">
            Git Workflow: Complete Task
          </h3>
        </div>

        <div className="p-4 space-y-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-geist ${
                  step > s.id ? 'bg-green-500 text-white' :
                  step === s.id ? 'bg-[#0e639c] text-white' :
                  'bg-white/10 text-neutral-500'
                }`}>
                  {step > s.id ? '✓' : s.id}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-px ${step > s.id ? 'bg-green-500' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Current Step Content */}
          <div className="bg-[#252526] rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-medium text-white font-geist mb-1">
              {steps[step - 1].label}
            </h4>
            <p className="text-xs text-neutral-500 font-geist mb-3">
              {steps[step - 1].description}
            </p>

            {step === 2 && (
              <div>
                <label className="block text-xs text-neutral-400 font-geist mb-1">Commit Message</label>
                <textarea
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist resize-none"
                  rows={2}
                />
              </div>
            )}

            {step === 3 && (
              <div>
                <label className="block text-xs text-neutral-400 font-geist mb-1">Version Tag</label>
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="v1.0.0"
                  className="w-full px-3 py-2 rounded text-sm bg-[#3c3c3c] text-white border border-white/10 focus:outline-none focus:border-[#0e639c] font-geist"
                />
              </div>
            )}

            {step === 4 && (
              <div className="text-xs font-geist text-neutral-400 space-y-1">
                <p>git add .</p>
                <p>git commit -m "{commitMsg}"</p>
                {tag && <p>git tag {tag}</p>}
                <p>git push origin main {tag && '--tags'}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              onClick={handleNext}
              className="bg-[#0e639c] hover:bg-[#1177bb]"
            >
              {step === 4 ? 'Complete' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
