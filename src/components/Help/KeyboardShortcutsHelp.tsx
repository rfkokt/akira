import { Command, CornerDownLeft, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutGroup {
  category: string
  items: { keys: string; description: string }[]
}

const shortcuts: ShortcutGroup[] = [
  {
    category: 'Navigation',
    items: [
      { keys: '⌘1', description: 'Go to Tasks' },
      { keys: '⌘2', description: 'Go to Files' },
      { keys: '⌘3', description: 'Go to Settings' },
      { keys: '⌘`', description: 'Toggle Terminal' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: '⌘N', description: 'New Task' },
      { keys: '⌘E', description: 'Switch Workspace' },
      { keys: '⌘J', description: 'Toggle Chat Panel' },
      { keys: '⌘,', description: 'Open Settings' },
    ],
  },
  {
    category: 'Chat & Submit',
    items: [
      { keys: '⌘⏎', description: 'Submit message' },
      { keys: '⌘⇧⏎', description: 'Submit & Start task immediately' },
      { keys: '⏎', description: 'Submit (in task creator)' },
      { keys: '@', description: 'Reference file (@filename)' },
    ],
  },
  {
    category: 'Search',
    items: [
      { keys: '⌘F', description: 'Find File' },
      { keys: '⌘⇧F', description: 'Search in Files' },
      { keys: '⌘P', description: 'Quick Search' },
    ],
  },
  {
    category: 'Zoom',
    items: [
      { keys: '⌘+', description: 'Zoom In' },
      { keys: '⌘-', description: 'Zoom Out' },
      { keys: '⌘0', description: 'Reset Zoom' },
    ],
  },
  {
    category: 'Git',
    items: [
      { keys: 'Ctrl+⏎', description: 'Commit Changes' },
    ],
  },
]

function ShortcutKey({ keys }: { keys: string }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 px-2 py-1 bg-app-panel border border-app-border rounded text-xs font-mono text-white min-w-[60px] justify-center">
      {keys.split('').map((char, idx) => {
        if (char === '⌘') return <Command key={idx} className="w-3 h-3" />
        if (char === '⇧') return <span key={idx} className="text-[10px]">⇧</span>
        if (char === '⌥') return <span key={idx} className="text-[10px]">⌥</span>
        if (char === '⏎') return <CornerDownLeft key={idx} className="w-3 h-3" />
        if (char === '↑') return <ArrowUp key={idx} className="w-3 h-3" />
        if (char === '↓') return <ArrowDown key={idx} className="w-3 h-3" />
        if (char === '←') return <ArrowLeft key={idx} className="w-3 h-3" />
        if (char === '→') return <ArrowRight key={idx} className="w-3 h-3" />
        return <span key={idx}>{char}</span>
      })}
    </kbd>
  )
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 bg-app-panel border-app-border">
        <DialogHeader className="px-6 py-4 border-b border-app-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <Command className="w-5 h-5 text-app-accent" />
              Keyboard Shortcuts
            </DialogTitle>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-6 space-y-6">
            {shortcuts.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
                  {group.category}
                </h3>
                <div className="space-y-2">
                  {group.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-sm text-neutral-200">{item.description}</span>
                      <ShortcutKey keys={item.keys} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="pt-4 border-t border-app-border">
              <p className="text-xs text-neutral-500 text-center">
                Press <kbd className="px-1.5 py-0.5 bg-app-panel border border-app-border rounded text-[10px]">?</kbd> anytime to show this help
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
