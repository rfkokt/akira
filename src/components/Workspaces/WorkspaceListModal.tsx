import { useState, useMemo } from 'react'
import { Folder, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Workspace } from '@/store/workspaceStore' // wait, types often located in @/types

interface WorkspaceListModalProps {
  isOpen: boolean
  onClose: () => void
  workspaces: Workspace[]
  handleSelectWorkspace: (id: string) => void
}

export function WorkspaceListModal({
  isOpen,
  onClose,
  workspaces,
  handleSelectWorkspace
}: WorkspaceListModalProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter(w => 
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      w.folder_path.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery, workspaces])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-app-panel border border-app-border overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-app-border/50 bg-app-sidebar/40 shrink-0">
          <DialogTitle className="text-xl font-semibold text-app-text">All Workspaces</DialogTitle>
        </DialogHeader>

        <div className="p-4 shrink-0 border-b border-app-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workspaces by name or path..."
              className="pl-9 h-10 w-full"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="p-4 space-y-3">
            {filteredWorkspaces.length === 0 ? (
              <div className="text-center py-8 text-app-text-muted">
                No workspaces found matching "{searchQuery}"
              </div>
            ) : (
              filteredWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  onClick={() => handleSelectWorkspace(workspace.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                    workspace.is_active
                      ? 'bg-app-accent/15 text-app-accent hover:bg-app-accent/25 border border-app-accent/30'
                      : 'text-app-text hover:bg-app-surface-hover hover:text-white border border-transparent'
                  }`}
                >
                  <Folder className={`w-4 h-4 shrink-0 ${workspace.is_active ? 'text-app-accent' : 'text-neutral-500'}`} />
                  <span className="truncate text-sm font-medium">{workspace.name}</span>
                  {workspace.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-app-accent/20 rounded font-medium ml-auto shrink-0 uppercase tracking-wider">
                      Active
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
