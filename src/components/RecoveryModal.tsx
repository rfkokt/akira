import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react'
import { getSavedRunningTask, clearSavedRunningTask } from '@/store/aiChatStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-yellow-500/10">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <DialogTitle>Unfinished Task Detected</DialogTitle>
          </div>
          <DialogDescription>
            You have a task that was interrupted. The task was running but the process was interrupted. You can resume it or cancel and start fresh.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTitle className="text-white">{savedTask.taskTitle}</AlertTitle>
          <AlertDescription className="text-neutral-500">
            Started {elapsedMinutes > 0 ? `${elapsedMinutes} min ago` : 'recently'}
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel}>
            <X className="w-4 h-4 mr-2" />
            Cancel Task
          </Button>
          <Button onClick={handleResume} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                Resume Task
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
