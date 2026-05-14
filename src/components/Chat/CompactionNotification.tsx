import { Loader2 } from 'lucide-react';

interface CompactionNotificationProps {
  isCompacting: boolean;
}

/**
 * Inline notification displayed within the TaskChat message list
 * when a compaction_start event is received from Pi.
 * Shows a subtle animated indicator while context is being compressed.
 */
export function CompactionNotification({ isCompacting }: CompactionNotificationProps) {
  if (!isCompacting) return null;

  return (
    <div className="flex items-center justify-center py-2 px-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Compacting context…</span>
      </div>
    </div>
  );
}
