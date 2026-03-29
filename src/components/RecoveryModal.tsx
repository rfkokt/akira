import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react'
import { getSavedRunningTask, clearSavedRunningTask } from '@/store/aiChatStore'

interface RecoveryModalProps {
  onResume?: (taskId: string) => void
  onClose: () => void
}

export function RecoveryModal({ onResume, onClose }: RecoveryModalProps) {
  const [loading, setLoading] = useState(false)
  const [savedTask, setSavedTask] = useState<{ taskId: string; taskTitle: string; startedAt: number } | null>(null)

  useEffect(() => {
    const saved = getSavedRunningTask()
    setSavedTask(saved)
  }, [])

  const handleResume = async () => {
    if (!savedTask) return
    setLoading(true)
    clearSavedRunningTask()
    onResume?.(savedTask.taskId)
    onClose()
  }

  const handleCancel = () => {
    clearSavedRunningTask()
    onClose()
  }

  if (!savedTask) return null

  const elapsedMinutes = Math.floor((Date.now() - savedTask.startedAt) / 60000)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
      <div className="bg-[#1e1e1e] rounded-lg border border-yellow-500/30 shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full bg-yellow-500/10">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white font-geist">Unfinished Task Detected</h3>
              <p className="text-xs text-neutral-400 font-geist">You have a task that was interrupted</p>
            </div>
          </div>

          <div className="bg-[#252526] rounded-lg p-4 mb-4">
            <div className="text-sm text-white font-geist mb-1">{savedTask.taskTitle}</div>
            <div className="text-xs text-neutral-500 font-geist">
              Started {elapsedMinutes > 0 ? `${elapsedMinutes} min ago` : 'recently'}
            </div>
          </div>

          <div className="text-xs text-neutral-400 font-geist mb-4">
            The task was running but the process was interrupted. You can resume it or cancel and start fresh.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded text-sm font-medium text-neutral-400 hover:text-white font-geist transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancel Task
          </button>
          <button
            onClick={handleResume}
            disabled={loading}
            className="px-4 py-2 rounded text-sm font-medium text-white bg-[#0e639c] hover:bg-[#1177bb] font-geist transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Resume Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
