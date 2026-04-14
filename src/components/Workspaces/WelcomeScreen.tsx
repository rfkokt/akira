import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FolderOpen, Plus, Trash2, Folder, ChevronRight, Terminal } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useTerminalStore } from '@/store/terminalStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { WorkspaceListModal } from './WorkspaceListModal'

interface WelcomeScreenProps {
  onClose: () => void
}

export function WelcomeScreen({ onClose }: WelcomeScreenProps) {
  const { workspaces, createWorkspace, setActiveWorkspace, deleteWorkspace, loadWorkspaces } = useWorkspaceStore()
  const { createSession } = useTerminalStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [isCreating, setIsCreating] = useState(false)
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const handlePickFolder = async () => {
    try {
      const folder = await invoke<string | null>('pick_folder')
      if (folder) {
        setSelectedFolder(folder)
        if (!isNameManuallyEdited) {
          const folderName = folder.split('/').pop() || 'New Workspace'
          setNewWorkspaceName(folderName)
        }
      }
    } catch (error) {
      console.error('Failed to pick folder:', error)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !selectedFolder) return
    
    setIsCreating(true)
    try {
      await createWorkspace(newWorkspaceName.trim(), selectedFolder)
      setShowCreateDialog(false)
      setNewWorkspaceName('')
      setSelectedFolder('')
      setIsNameManuallyEdited(false)
      onClose()
    } catch (error) {
      console.error('Failed to create workspace:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleSelectWorkspace = async (id: string) => {
    await setActiveWorkspace(id)
    onClose()
  }

  const handleOpenInTerminal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const workspace = workspaces.find(w => w.id === id)
    if (workspace) {
      createSession(workspace.id, workspace.name, workspace.folder_path)
      await setActiveWorkspace(id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-app-bg flex items-center justify-center backdrop-blur-sm">
      <div className="w-[800px] max-h-[80vh] bg-app-panel border border-app-border/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-app-border/50 flex items-center justify-between bg-app-sidebar/40">
          <div>
            <h1 className="text-2xl font-semibold text-app-text">Welcome to Akira</h1>
            <p className="text-sm text-app-text-muted mt-1">
              AI-Powered Workspace & Task Manager
            </p>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-8">
            {workspaces.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-app-accent/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_var(--app-accent-glow)]">
                  <Folder className="w-12 h-12 text-app-accent" />
                </div>
                <h2 className="text-xl font-medium text-app-text mb-3">
                  No Workspaces Yet
                </h2>
                <p className="text-sm text-app-text-muted mb-8 max-w-md mx-auto leading-relaxed">
                  Create your first workspace by selecting a project folder. Each workspace represents a project with its own tasks and AI configuration.
                </p>
                <Button onClick={() => setShowCreateDialog(true)} size="lg">
                  <Plus className="w-5 h-5 mr-2" />
                  Create Workspace
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-widest">
                    Your Workspaces
                  </h2>
                  <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    New Workspace
                  </Button>
                </div>

                <div className="space-y-3">
                  {workspaces.slice(0, 3).map((workspace) => (
                    <Card
                      key={workspace.id}
                      className={`cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group backdrop-blur-md rounded-xl overflow-hidden ${
                        workspace.is_active
                          ? 'bg-app-accent-glow/20 border-app-accent shadow-[0_0_20px_var(--app-accent-glow)]'
                          : 'bg-app-sidebar/60 border-app-border hover:border-app-accent/50 hover:bg-app-panel'
                      }`}
                      onClick={() => handleSelectWorkspace(workspace.id)}
                    >
                      <CardContent className="flex items-center gap-4 p-5 relative">
                        {workspace.is_active && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-app-accent shadow-[0_0_10px_var(--app-accent)]" />
                        )}
                        <div className="w-12 h-12 bg-app-bg rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner border border-app-border/30">
                          <Folder className={`w-6 h-6 ${workspace.is_active ? 'text-app-accent drop-shadow-[0_0_8px_var(--app-accent)]' : 'text-amber-400'}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0 pr-4">
                          <h3 className="text-base font-medium text-app-text truncate mb-0.5">
                            {workspace.name}
                          </h3>
                          <p className="text-xs text-app-text-muted truncate">
                            {workspace.folder_path}
                          </p>
                        </div>

                        {workspace.is_active && (
                          <span className="text-xs px-2.5 py-1 bg-app-accent/20 text-app-accent rounded-md font-medium border border-app-accent/30 shadow-[inset_0_0_10px_var(--app-accent-glow)]">
                            Active
                          </span>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-app-accent hover:bg-app-accent/10"
                          onClick={(e) => handleOpenInTerminal(workspace.id, e)}
                          title="Open in Terminal"
                        >
                          <Terminal className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 hover:bg-red-400/10"
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
                  ))}
                  
                  {workspaces.length > 3 && (
                    <div className="pt-3 pb-1">
                      <Button 
                        variant="secondary" 
                        className="w-full bg-app-sidebar/60 border border-app-border/80 hover:bg-app-accent/10 hover:text-app-accent hover:border-app-accent/30 text-app-text-muted transition-all"
                        onClick={() => setIsModalOpen(true)}
                      >
                        <Folder className="w-4 h-4 mr-2 opacity-70" />
                        Load Recent & View All Workspaces ({workspaces.length})
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Select a project folder and give your workspace a name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-3">
              <Label htmlFor="folder" className="text-sm font-medium">Project Folder</Label>
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 bg-app-sidebar/50 border border-app-border rounded-lg text-sm text-app-text min-h-[40px] flex items-center overflow-hidden">
                  <span className="truncate block w-full">
                    {selectedFolder || 'No folder selected'}
                  </span>
                </div>
                <Button variant="secondary" onClick={handlePickFolder} className="shrink-0 w-full sm:w-auto">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Browse
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="name" className="text-sm font-medium">Workspace Name</Label>
              <Input
                id="name"
                value={newWorkspaceName}
                onChange={(e) => {
                  setNewWorkspaceName(e.target.value)
                  setIsNameManuallyEdited(true)
                }}
                placeholder="My Project"
                className="h-10"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreateDialog(false)
                setNewWorkspaceName('')
                setSelectedFolder('')
                setIsNameManuallyEdited(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              disabled={!newWorkspaceName.trim() || !selectedFolder || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkspaceListModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        workspaces={workspaces}
        handleSelectWorkspace={handleSelectWorkspace}
        handleOpenInTerminal={handleOpenInTerminal}
        deleteWorkspace={deleteWorkspace}
      />
    </div>
  )
}
