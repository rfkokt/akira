import { useState, useMemo } from 'react'
import { Folder, ChevronRight, Terminal, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
  workspaces: any[] // will refine
  handleSelectWorkspace: (id: string) => void
  handleOpenInTerminal: (id: string, e: React.MouseEvent) => void
  deleteWorkspace: (id: string) => void
}

export function WorkspaceListModal({
  isOpen,
  onClose,
  workspaces,
  handleSelectWorkspace,
  handleOpenInTerminal,
  deleteWorkspace
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
                <Card
                  key={workspace.id}
                  className={`cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group backdrop-blur-md rounded-xl overflow-hidden ${
                    workspace.is_active
                      ? 'bg-app-accent-glow/20 border-app-accent shadow-[0_0_20px_var(--app-accent-glow)]'
                      : 'bg-app-sidebar/60 border-app-border hover:border-app-accent/50 hover:bg-app-panel'
                  }`}
                  onClick={() => handleSelectWorkspace(workspace.id)}
                >
                  <CardContent className="flex items-center gap-4 p-4 relative">
                    {workspace.is_active && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-app-accent shadow-[0_0_10px_var(--app-accent)]" />
                    )}
                    <div className="w-10 h-10 bg-app-bg rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner border border-app-border/30">
                      <Folder className={`w-5 h-5 ${workspace.is_active ? 'text-app-accent drop-shadow-[0_0_8px_var(--app-accent)]' : 'text-amber-400'}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0 pr-4">
                      <h3 className="text-sm font-medium text-app-text truncate mb-0.5">
                        {workspace.name}
                      </h3>
                      <p className="text-xs text-app-text-muted truncate mt-0.5">
                        {workspace.folder_path}
                      </p>
                    </div>

                    {workspace.is_active && (
                      <span className="text-xs px-2 py-0.5 bg-app-accent/20 text-app-accent rounded-md font-medium border border-app-accent/30 mr-2 shadow-[inset_0_0_10px_var(--app-accent-glow)]">
                        Active
                      </span>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-app-accent hover:bg-app-accent/10 h-8 w-8"
                      onClick={(e) => handleOpenInTerminal(workspace.id, e)}
                      title="Open in Terminal"
                    >
                      <Terminal className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteWorkspace(workspace.id)
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>

                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
